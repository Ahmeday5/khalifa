/**
 * Minimal client-side JWT helpers.
 *
 * NOTE: this only DECODES the payload — it does NOT verify the signature.
 * Verification is the server's job. We use the payload locally only to read
 * the `exp` claim so we can schedule a proactive refresh.
 */

export interface JwtPayload {
  exp?: number;
  iat?: number;
  nbf?: number;
  iss?: string;
  aud?: string | string[];
  sub?: string;
  [claim: string]: unknown;
}

export function decodeJwt<T extends JwtPayload = JwtPayload>(token: string): T | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);

    const json = decodeURIComponent(
      atob(b64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/** Returns the JWT expiry as a millisecond epoch, or `null` if the claim is missing/invalid. */
export function getJwtExpiry(token: string): number | null {
  const payload = decodeJwt(token);
  if (!payload?.exp || typeof payload.exp !== 'number') return null;
  return payload.exp * 1000;
}

/** True when the token will expire within `bufferMs` from now (default 0 = "already expired"). */
export function isJwtExpired(token: string, bufferMs = 0): boolean {
  const expiresAt = getJwtExpiry(token);
  if (!expiresAt) return true;
  return expiresAt - Date.now() <= bufferMs;
}
