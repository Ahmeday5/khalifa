import { Injectable, NgZone, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, defer, firstValueFrom, from, of, throwError } from 'rxjs';
import {
  catchError,
  delay,
  finalize,
  map,
  share,
  switchMap,
  tap,
} from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { ApiService } from './api.service';
import { StorageService } from './storage.service';
import { DeviceService } from './device.service';
import { ToastService } from './toast.service';
import { HttpCacheService } from './http-cache.service';
import {
  AuthResponseData,
  AuthTokens,
  LoginRequest,
  LogoutRequest,
  MePermissionsData,
  RefreshTokenRequest,
  User,
  UserRole,
} from '../models/auth.model';
import { ApiError } from '../models/api-response.model';
import { API_ENDPOINTS } from '../constants/api-endpoints.const';
import {
  ALL_PERMISSIONS,
  Permission,
  ROLE_PERMISSIONS,
} from '../constants/permissions.const';
import {
  withInlineHandling,
  withSkipAuth,
} from '../http/http-context.tokens';
import { getJwtExpiry } from '../utils/jwt.util';

const USER_KEY = 'taqseet_user';
/** Refresh this many ms BEFORE the access token actually expires. */
const REFRESH_BUFFER_MS = 60 * 1000;
/** Lower bound for the proactive refresh timer to avoid timer storms on edge cases. */
const MIN_REFRESH_DELAY_MS = 5_000;
/** Exponential backoff schedule for transient (network/5xx) refresh failures. */
const REFRESH_RETRY_BACKOFF_MS: readonly number[] = [5_000, 15_000, 45_000, 120_000];
/**
 * After a "reuse detected" error we wait briefly to let any winning tab's
 * storage write + BroadcastChannel message arrive, then re-read storage. If a
 * fresh token landed in that window the failure was a benign cross-tab race,
 * not a security event.
 */
const REUSE_RACE_RECHECK_DELAY_MS = 250;
const BROADCAST_CHANNEL_NAME = 'taqseet-auth';
/** Cross-tab/cross-process mutex name for the refresh-token round-trip. */
const REFRESH_LOCK_NAME = 'taqseet-auth-refresh';
/**
 * `setTimeout` stores its delay as a signed 32-bit integer — values above
 * 2^31-1 (~24.8 days) overflow and fire IMMEDIATELY. A long-lived access
 * token (e.g. months) would therefore trigger an instant-refresh loop,
 * which both hammers the backend and trips reuse-detection. We clamp to
 * just under the limit and re-arm on wake if the token is still safe.
 */
const MAX_SETTIMEOUT_DELAY_MS = 2_147_000_000;

/**
 * Statuses that prove the refresh token itself is invalid — anything else
 * (network, CORS, 5xx) is treated as transient and triggers a backoff
 * retry instead of a forced logout.
 */
const AUTH_FATAL_STATUSES: ReadonlySet<number> = new Set([400, 401, 403]);

type CrossTabMessage =
  | { type: 'session-updated'; from: string }
  | { type: 'logged-out'; from: string };

export interface LoginInput {
  email: string;
  password: string;
  rememberMe: boolean;
}

interface LogoutOptions {
  redirect?: boolean;
  callApi?: boolean;
  reason?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly storage = inject(StorageService);
  private readonly device = inject(DeviceService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly httpCache = inject(HttpCacheService);

  private readonly currentUserSignal = signal<User | null>(this.loadStoredUser());
  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = computed(() => !!this.currentUserSignal());

  /**
   * Set of permissions the current user holds. Kept as a derived signal so
   * directives / guards can subscribe reactively — when the user logs in
   * (or another tab updates the session) every gated UI element refreshes
   * without manual rewiring.
   */
  readonly permissionSet = computed<ReadonlySet<string>>(
    () => new Set(this.currentUserSignal()?.permissions ?? []),
  );

  /** Shared in-flight refresh — collapses concurrent callers in this tab. */
  private inflightRefresh: Observable<AuthTokens> | null = null;
  private refreshTimerId: ReturnType<typeof setTimeout> | null = null;
  private channel: BroadcastChannel | null = null;
  private hasScheduledLogoutToast = false;
  /** Consecutive transient refresh failures — drives backoff. Reset on success. */
  private refreshFailureStreak = 0;
  /**
   * Set once the session has been declared dead (server-rejected refresh,
   * missing token, etc). Pending callers that race past the logout are
   * short-circuited here so we don't trigger duplicate navigations
   * (which the Angular Router rejects with `InvalidStateError`).
   */
  private sessionDead = false;
  /** Per-tab id so we can ignore our own broadcasts. */
  private readonly tabId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  constructor() {
    this.initCrossTabSync();
    this.initVisibilityRecovery();
    if (this.isLoggedIn()) {
      this.scheduleProactiveRefresh();
    }
  }

  // ──────────────────────── public API ────────────────────────

  login(input: LoginInput): Observable<User> {
    const dev = this.device.getInfo();
    const payload: LoginRequest = {
      email: input.email.trim(),
      password: input.password,
      rememberMe: input.rememberMe,
      deviceInfo: dev.deviceInfo,
      deviceId: dev.deviceId,
    };

    return this.api
      .post<AuthResponseData>(API_ENDPOINTS.auth.login, payload, {
        context: withInlineHandling(withSkipAuth()),
      })
      .pipe(
        tap((data) => this.persistSession(data, true)),
        switchMap((data) => this.hydratePermissions(this.toUser(data)))
      );
  }

  /**
   * The login payload's permission list isn't guaranteed, so we follow up
   * with `GET /dashboard/auth/me/permissions` (the authoritative source) and
   * merge the role + permissions into the cached user. Best-effort: if the
   * call fails the login still succeeds with the login-derived user.
   */
  private hydratePermissions(baseUser: User): Observable<User> {
    return this.api
      .get<MePermissionsData>(API_ENDPOINTS.auth.permissions, {
        context: withInlineHandling(),
      })
      .pipe(
        map((data) => this.applyPermissions(baseUser, data)),
        catchError(() => of(baseUser))
      );
  }

  private applyPermissions(baseUser: User, data: MePermissionsData): User {
    const role = data?.role ? this.normalizeRole(data.role) : baseUser.role;
    const name = data?.userName?.trim() || baseUser.name;
    const merged: User = {
      ...baseUser,
      role,
      name,
      email: data?.email || baseUser.email,
      avatar: this.deriveAvatar(name),
      permissions: this.resolvePermissions(data?.permissions, role),
    };
    this.storage.setJson(USER_KEY, merged);
    this.currentUserSignal.set(merged);
    return merged;
  }

  logout(opts: LogoutOptions = {}): void {
    // Mark dead immediately so any concurrent 401/refresh attempts are
    // silently short-circuited — prevents spurious "session expired" toasts
    // on an intentional logout.
    this.sessionDead = true;

    const { redirect = true, callApi = true, reason } = opts;
    const refreshToken = this.getRefreshToken();

    if (callApi && refreshToken) {
      const payload: LogoutRequest = { refreshToken };
      // Fire-and-forget — never block redirect on the network roundtrip.
      this.api
        .post<unknown>(API_ENDPOINTS.auth.logout, payload, {
          context: withInlineHandling(),
        })
        .subscribe({ error: () => {} });
    }

    this.clearLocalSession();
    this.broadcast({ type: 'logged-out', from: this.tabId });

    if (reason) this.toast.warning(reason);
    if (redirect) this.navigateToLogin();
  }

  /**
   * Safe wrapper around `router.navigate(['/auth/login'])`. Skips the call
   * when we're already on the login route (avoids a redundant navigation
   * that the Router rejects with `InvalidStateError` when a previous
   * navigation is still resolving).
   */
  private navigateToLogin(): void {
    const url = this.router.url ?? '';
    if (url.startsWith('/auth/login')) return;
    this.router.navigate(['/auth/login']).catch(() => {
      /* Navigation rejected (e.g. concurrent navigation already in
       * progress) — the other navigation will land the user on the login
       * page, so swallowing here is correct. */
    });
  }

  /**
   * Issues a refresh-token request, serialized across **all tabs** via the Web
   * Locks API and collapsed across concurrent in-tab callers via shared
   * observable. The lock body re-reads storage first: if another tab already
   * rotated the token while we were waiting, we skip the network entirely.
   */
  refreshToken(): Observable<AuthTokens> {
    if (this.inflightRefresh) return this.inflightRefresh;

    // Session was already declared dead — don't try to refresh, and
    // crucially don't trigger another logout/redirect (the first one
    // already happened, the second one races Angular's navigation).
    if (this.sessionDead) {
      return throwError(() => this.makeAuthError('Session expired'));
    }

    // Race shortcut (no lock needed): another tab may have already refreshed
    // and the new tokens are sitting in storage right now.
    const fromAnotherTab = this.readFreshTokens();
    if (fromAnotherTab) {
      this.scheduleProactiveRefresh();
      return of(fromAnotherTab);
    }

    this.inflightRefresh = this.runUnderRefreshLock().pipe(
      finalize(() => {
        this.inflightRefresh = null;
      }),
      share()
    );

    return this.inflightRefresh;
  }

  getAccessToken(): string | null {
    return this.storage.get(environment.tokenKey);
  }

  getRefreshToken(): string | null {
    return this.storage.get(environment.refreshTokenKey);
  }

  isLoggedIn(): boolean {
    return !!this.getAccessToken() && !!this.getRefreshToken();
  }

  hasRole(role: UserRole): boolean {
    return this.currentUserSignal()?.role === role;
  }

  hasAnyRole(roles: ReadonlyArray<UserRole>): boolean {
    const current = this.currentUserSignal()?.role;
    return !!current && roles.includes(current);
  }

  /**
   * Returns true when the user holds **every** permission in the input.
   * Accepts a single permission or an array — array form is "all of".
   *
   * For "any of" semantics use {@link hasAnyPermission}.
   */
  hasPermission(permission: Permission | string | readonly string[]): boolean {
    const set = this.permissionSet();
    if (Array.isArray(permission)) {
      return permission.every((p) => set.has(p));
    }
    return set.has(permission as string);
  }

  /** Returns true when the user holds AT LEAST ONE of the given permissions. */
  hasAnyPermission(permissions: readonly string[]): boolean {
    if (permissions.length === 0) return true;
    const set = this.permissionSet();
    return permissions.some((p) => set.has(p));
  }

  // ──────────────────────── refresh pipeline ────────────────────────

  /**
   * Wraps the refresh round-trip in a Web Lock so only ONE tab in the entire
   * browser profile is in flight at a time. Inside the lock we re-check
   * storage — the tab that held the lock before us may have already rotated.
   */
  private runUnderRefreshLock(): Observable<AuthTokens> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;

    // Web Locks unsupported (older browsers, non-browser env) — fall back to
    // the in-tab guard only. This loses cross-tab safety but the runtime
    // already discounts that environment.
    if (!locks) return this.executeRefresh();

    return defer(() =>
      from(
        locks.request(REFRESH_LOCK_NAME, () => {
          // Inside the lock: did the previous holder already refresh?
          const fresh = this.readFreshTokens();
          if (fresh) {
            this.scheduleProactiveRefresh();
            return Promise.resolve(fresh);
          }
          // `locks.request` holds the lock until the returned promise settles,
          // so awaiting the observable here is exactly what we want.
          return firstValueFrom(this.executeRefresh());
        })
      ).pipe(
        catchError((err) => {
          // `navigator.locks.request` can reject with `InvalidStateError`
          // when the page is being unloaded (or the lock manager is in an
          // unrecoverable state). The request that triggered the refresh
          // is also being torn down, so propagating a quiet auth error is
          // the right call — nothing useful can act on it.
          if ((err as DOMException | undefined)?.name === 'InvalidStateError') {
            return throwError(() => this.makeAuthError('Refresh aborted'));
          }
          return throwError(() => err);
        })
      )
    );
  }

  /** The actual network call + post-processing. Always runs under a held lock. */
  private executeRefresh(): Observable<AuthTokens> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      this.scheduleSessionExpiredLogout();
      return throwError(() => this.makeAuthError('Missing refresh token'));
    }

    const dev = this.device.getInfo();
    const payload: RefreshTokenRequest = {
      refreshToken,
      deviceInfo: dev.deviceInfo,
      deviceId: dev.deviceId,
    };

    return this.api
      .post<AuthResponseData>(API_ENDPOINTS.auth.refresh, payload, {
        context: withInlineHandling(withSkipAuth()),
      })
      .pipe(
        // Persist + return the SAME tokens in one step. A 2xx refresh must
        // never be discarded: if the backend doesn't rotate the refresh
        // token (returns only a new access token) we keep the existing one
        // instead of throwing — otherwise the next attempt sends a token the
        // server already consumed and we get a self-inflicted 401 → logout.
        map((data) => this.persistSession(data, false)),
        catchError((err) => this.recoverOrFail(err))
      );
  }

  /**
   * Decides between three outcomes for a failed refresh:
   *
   *  1. Reuse-detected — could be either a race or a real attack. Wait a beat
   *     and re-read storage; if a fresher token landed, treat as race and
   *     succeed. Otherwise treat as fatal.
   *  2. Auth-fatal (400/401/403) — the server explicitly rejected us. Kill
   *     the session.
   *  3. Transient (network, CORS, 5xx) — server didn't disown the token, we
   *     just couldn't reach it. Backoff + retry; keep session alive.
   */
  private recoverOrFail(err: unknown): Observable<AuthTokens> {
    // Cheap pre-check: another tab may have already broadcasted a refresh by
    // the time the failure landed. Skip the wait when possible.
    const immediate = this.readFreshTokens();
    if (immediate) {
      this.refreshFailureStreak = 0;
      this.scheduleProactiveRefresh();
      return of(immediate);
    }

    if (this.isReuseDetected(err)) {
      return of(null).pipe(
        delay(REUSE_RACE_RECHECK_DELAY_MS),
        switchMap(() => {
          const recovered = this.readFreshTokens();
          if (recovered) {
            this.refreshFailureStreak = 0;
            this.scheduleProactiveRefresh();
            return of(recovered);
          }
          // Genuine reuse — token family is dead server-side, session is gone.
          this.scheduleSessionExpiredLogout();
          return throwError(() => err);
        })
      );
    }

    if (this.isAuthFatal(err)) {
      this.scheduleSessionExpiredLogout();
      return throwError(() => err);
    }

    this.scheduleRefreshRetry();
    return throwError(() => err);
  }

  /**
   * Server-signaled "your refresh token was already used". On this backend
   * the marker is the `details` field; we also tolerate older shapes where it
   * was buried in `message`.
   */
  private isReuseDetected(err: unknown): boolean {
    const body = (err as { error?: { details?: string; message?: string } } | null)?.error;
    const raw = (err as { raw?: { details?: string; message?: string } } | null)?.raw;
    const haystacks = [body?.details, body?.message, raw?.details, raw?.message]
      .filter((s): s is string => typeof s === 'string')
      .map((s) => s.toLowerCase());
    return haystacks.some((s) => s.includes('reuse'));
  }

  // ────────────────────── persistence ──────────────────────

  /**
   * @param updateUser whether to overwrite the cached user from this response.
   *   `true` for /login (full payload), `false` for /refresh (user fields can
   *   come back empty and would clobber the real values).
   */
  private persistSession(
    data: AuthResponseData,
    updateUser: boolean,
  ): AuthTokens {
    // On the refresh path, tolerate a backend that doesn't rotate the
    // refresh token: fall back to the one already in storage so a
    // successful 2xx is never thrown away. Login always returns both.
    const fallbackRefreshToken = updateUser ? null : this.getRefreshToken();
    const tokens = this.extractTokens(data, fallbackRefreshToken);
    this.storage.set(environment.tokenKey, tokens.accessToken);
    this.storage.set(environment.refreshTokenKey, tokens.refreshToken);

    if (updateUser && data.userId) {
      const user = this.toUser(data);
      this.storage.setJson(USER_KEY, user);
      this.currentUserSignal.set(user);
    } else if (!this.currentUserSignal()) {
      // Stale tab booting up after a previous refresh — rehydrate the user
      // we already have on disk so guards / role checks work immediately.
      const stored = this.loadStoredUser();
      if (stored) this.currentUserSignal.set(stored);
    }

    this.refreshFailureStreak = 0;
    this.sessionDead = false;
    this.broadcast({ type: 'session-updated', from: this.tabId });
    this.scheduleProactiveRefresh();
    return tokens;
  }

  private clearLocalSession(): void {
    this.storage.remove(environment.tokenKey);
    this.storage.remove(environment.refreshTokenKey);
    this.storage.remove(USER_KEY);
    this.currentUserSignal.set(null);
    this.cancelScheduledRefresh();
    this.inflightRefresh = null;
    this.refreshFailureStreak = 0;
    // Wipe the HTTP cache — leftover entries belong to the previous user
    // and would leak into the next session.
    this.httpCache.clear();
  }

  private loadStoredUser(): User | null {
    if (!this.getAccessToken() || !this.getRefreshToken()) return null;
    return this.storage.getJson<User>(USER_KEY);
  }

  // ────────────────────── mappers ──────────────────────

  /**
   * @param fallbackRefreshToken used only on the refresh path: when the
   *   backend returns a new access token but no rotated refresh token, we
   *   keep the existing one rather than failing the whole session. A missing
   *   **access** token on a 2xx response is the only unrecoverable case.
   */
  private extractTokens(
    data: AuthResponseData,
    fallbackRefreshToken?: string | null,
  ): AuthTokens {
    const accessToken = data?.accessToken;
    if (!accessToken) {
      throw new Error('Auth response missing access token');
    }
    const refreshToken = data?.refreshToken || fallbackRefreshToken || null;
    if (!refreshToken) {
      throw new Error('Auth response missing refresh token');
    }
    return {
      accessToken,
      refreshToken,
      expiresAt: this.resolveExpiry(accessToken, data.expiresAtUtc),
    };
  }

  private toUser(data: AuthResponseData): User {
    const userName =
      data.userName?.trim() ||
      data.email?.split('@')[0] ||
      'مستخدم';
    // Prefer the explicit `role` field; fall back to `userType` for legacy
    // payloads that only carried the coarse AppUser/Client partition.
    const role = this.normalizeRole(data.role ?? data.userType);
    return {
      id: data.userId,
      name: userName,
      email: data.email ?? '',
      role,
      avatar: this.deriveAvatar(userName),
      permissions: this.resolvePermissions(data.permissions, role),
    };
  }

  private normalizeRole(raw: string | null | undefined): UserRole {
    const map: Record<string, UserRole> = {
      admin: 'Admin',
      generalmanager: 'GeneralManager',
      supervisor: 'Supervisor',
      accountant: 'Accountant',
      representative: 'Representative',
      client: 'Client',
      // `userType: "AppUser"` is the coarse partition the backend used before
      // roles were exposed — treat it as the most-privileged role only when
      // the explicit `role` field is missing. Defaults to Client otherwise.
      appuser: 'Admin',
    };
    return map[(raw ?? '').trim().toLowerCase()] ?? 'Client';
  }

  /**
   * Resolves the effective permission list for a user.
   *
   *   1. If the backend explicitly returned `permissions`, trust them
   *      verbatim — only intersect with the known catalogue to drop unknown
   *      strings (defensive against typos or unreleased flags).
   *   2. Otherwise, derive the list from the static `ROLE_PERMISSIONS` map.
   *      This keeps the app usable when an older build of the backend
   *      omits the array.
   */
  private resolvePermissions(
    fromWire: ReadonlyArray<string> | null | undefined,
    role: UserRole,
  ): string[] {
    if (fromWire && fromWire.length > 0) {
      const known = new Set<string>(ALL_PERMISSIONS);
      return fromWire.filter((p) => known.has(p));
    }
    const fallback = ROLE_PERMISSIONS[role] as ReadonlyArray<Permission> | undefined;
    return fallback ? [...fallback] : [];
  }

  private deriveAvatar(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /**
   * Resolves the access-token expiry. The JWT `exp` claim is the source of
   * truth — `expiresAtUtc` is treated as a hint and ignored when it's the
   * .NET default value (`0001-01-01...`) which the backend returns on refresh.
   */
  private resolveExpiry(accessToken: string, hint: string): number {
    const fromJwt = getJwtExpiry(accessToken);
    if (fromJwt && fromJwt > Date.now()) return fromJwt;

    if (hint && !hint.startsWith('0001-')) {
      const parsed = Date.parse(hint);
      if (!Number.isNaN(parsed) && parsed > Date.now()) return parsed;
    }

    return Date.now() + 15 * 60 * 1000;
  }

  /** Returns stored tokens IFF the access token is still safely valid. */
  private readFreshTokens(): AuthTokens | null {
    const accessToken = this.getAccessToken();
    const refreshToken = this.getRefreshToken();
    if (!accessToken || !refreshToken) return null;

    const expiresAt = getJwtExpiry(accessToken);
    if (!expiresAt) return null;
    if (expiresAt - Date.now() <= REFRESH_BUFFER_MS) return null;

    return { accessToken, refreshToken, expiresAt };
  }

  // ────────────────────── proactive refresh ──────────────────────

  private scheduleProactiveRefresh(): void {
    this.cancelScheduledRefresh();

    const accessToken = this.getAccessToken();
    if (!accessToken) return;

    const expiresAt = getJwtExpiry(accessToken);
    if (!expiresAt) return;

    const remainingMs = expiresAt - Date.now() - REFRESH_BUFFER_MS;
    const delayMs = Math.max(
      MIN_REFRESH_DELAY_MS,
      Math.min(remainingMs, MAX_SETTIMEOUT_DELAY_MS)
    );

    this.zone.runOutsideAngular(() => {
      this.refreshTimerId = setTimeout(() => {
        this.zone.run(() => {
          if (!this.isLoggedIn()) return;
          // When we hit the setTimeout cap on a long-lived token, the
          // timer fires long before the token is anywhere near expiry —
          // just re-arm without touching the network.
          if (this.readFreshTokens()) {
            this.scheduleProactiveRefresh();
            return;
          }
          this.refreshToken().subscribe({ error: () => {} });
        });
      }, delayMs);
    });
  }

  private cancelScheduledRefresh(): void {
    if (this.refreshTimerId !== null) {
      clearTimeout(this.refreshTimerId);
      this.refreshTimerId = null;
    }
  }

  /**
   * Re-arm the refresh after a transient failure with exponential backoff
   * (5s → 15s → 45s → 120s, capped). The next user-driven 401 will also
   * retry on its own, so this is mostly a recovery net for idle tabs.
   */
  private scheduleRefreshRetry(): void {
    this.cancelScheduledRefresh();
    const idx = Math.min(this.refreshFailureStreak, REFRESH_RETRY_BACKOFF_MS.length - 1);
    const delayMs = REFRESH_RETRY_BACKOFF_MS[idx];
    this.refreshFailureStreak += 1;

    this.zone.runOutsideAngular(() => {
      this.refreshTimerId = setTimeout(() => {
        this.zone.run(() => {
          if (!this.isLoggedIn()) return;
          this.refreshToken().subscribe({ error: () => {} });
        });
      }, delayMs);
    });
  }

  /**
   * True only when the failure status proves the refresh token is dead.
   * Status 0 (network/CORS) and 5xx (server fault) are transient — the
   * server never said "your token is bad," it just couldn't be reached.
   */
  private isAuthFatal(err: unknown): boolean {
    const status = (err as { status?: number } | null)?.status ?? 0;
    return AUTH_FATAL_STATUSES.has(status);
  }

  // ────────────────────── visibility / sleep recovery ──────────────────────

  private initVisibilityRecovery(): void {
    if (typeof document === 'undefined') return;

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (!this.isLoggedIn()) return;

      const accessToken = this.getAccessToken();
      const expiresAt = accessToken ? getJwtExpiry(accessToken) : null;
      if (!expiresAt) return;

      if (expiresAt - Date.now() <= REFRESH_BUFFER_MS) {
        this.refreshToken().subscribe({ error: () => {} });
      } else {
        this.scheduleProactiveRefresh();
      }
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('pageshow', (e) => {
        if (!(e as PageTransitionEvent).persisted) return;
        if (this.isLoggedIn()) this.scheduleProactiveRefresh();
      });

      window.addEventListener('online', () => {
        if (!this.isLoggedIn()) return;
        const accessToken = this.getAccessToken();
        const expiresAt = accessToken ? getJwtExpiry(accessToken) : null;
        if (expiresAt && expiresAt - Date.now() <= REFRESH_BUFFER_MS) {
          this.refreshToken().subscribe({ error: () => {} });
        }
      });
    }
  }

  // ────────────────────── multi-tab sync ──────────────────────

  private initCrossTabSync(): void {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        this.channel.onmessage = (e) =>
          this.onCrossTabMessage(e.data as CrossTabMessage);
      } catch {
        this.channel = null;
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key !== environment.tokenKey) return;
        this.onCrossTabMessage({
          type: e.newValue ? 'session-updated' : 'logged-out',
          from: 'storage-event',
        });
      });
    }
  }

  private onCrossTabMessage(msg: CrossTabMessage): void {
    if (!msg || typeof msg !== 'object') return;
    // Ignore our own BroadcastChannel echoes (storage events never fire in
    // the originating tab so the 'storage-event' sentinel is always external).
    if (msg.from === this.tabId) return;

    if (msg.type === 'logged-out') {
      this.sessionDead = true;
      this.clearLocalSession();
      this.navigateToLogin();
      return;
    }

    if (msg.type === 'session-updated') {
      this.currentUserSignal.set(this.loadStoredUser());
      this.scheduleProactiveRefresh();
    }
  }

  private broadcast(msg: CrossTabMessage): void {
    try {
      this.channel?.postMessage(msg);
    } catch {
      /* channel closed — ignore */
    }
  }

  // ────────────────────── helpers ──────────────────────

  /**
   * Schedules the "session expired" toast + redirect on a microtask so that
   * the in-flight refresh observable has a chance to error its subscribers
   * first (otherwise the user sees the redirect before the toast).
   */
  private scheduleSessionExpiredLogout(): void {
    if (this.sessionDead || this.hasScheduledLogoutToast) return;
    this.sessionDead = true;
    this.hasScheduledLogoutToast = true;
    queueMicrotask(() => {
      this.hasScheduledLogoutToast = false;
      this.logout({
        redirect: true,
        callApi: false,
        reason: 'انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى',
      });
    });
  }

  private makeAuthError(message: string): ApiError {
    return { status: 401, message };
  }
}
