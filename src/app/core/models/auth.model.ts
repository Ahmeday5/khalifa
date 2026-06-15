/**
 * Roles as returned by the backend (case-sensitive). Match the values in
 * `GET /dashboard/app-users/roles`.
 */
export type UserRole =
  | 'Admin'
  | 'GeneralManager'
  | 'Supervisor'
  | 'Accountant'
  | 'Representative'
  | 'Client';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
  permissions: string[];
}

/** Local, normalized token bundle used everywhere inside the app. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Millisecond epoch — sourced from the JWT `exp` claim. */
  expiresAt: number;
}

// ─────────── Wire shapes (must match backend exactly) ───────────

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe: boolean;
  deviceInfo: string;
  deviceId: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
  deviceInfo: string;
  deviceId: string;
}

export interface LogoutRequest {
  refreshToken: string;
}

/**
 * Shape returned in the `data` field for /auth/login and /auth/refresh-token.
 * On refresh, user fields may come back empty — never overwrite the cached
 * user with an empty payload.
 */
export interface AuthResponseData {
  accessToken: string;
  refreshToken: string;
  userType: string;
  userId: string;
  email: string | null;
  userName: string | null;
  /**
   * The user's role name (e.g. `"Admin"`). Distinct from `userType` which
   * has historically been used as a coarse "AppUser" / "Client" partition.
   * `role` is the source of truth for the role-policy table.
   */
  role?: string | null;
  /** Flat array of permission strings (e.g. `"Treasury.FullAccess"`). */
  permissions?: ReadonlyArray<string> | null;
  /** ISO date — may be `0001-01-01T00:00:00` on refresh. JWT `exp` is the source of truth. */
  expiresAtUtc: string;
}

/**
 * `data` shape of `GET /dashboard/auth/me/permissions` — the authoritative
 * role + permission set for the currently authenticated user. Fetched right
 * after login because the login payload's permission list isn't guaranteed.
 */
export interface MePermissionsData {
  userId: string;
  userName: string | null;
  email: string | null;
  role: string | null;
  permissions: ReadonlyArray<string> | null;
}
