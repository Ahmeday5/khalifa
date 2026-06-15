import { environment } from '../../../../environments/environment';

/**
 * Image-related helpers for the Products feature.
 *
 * The backend returns server-relative URLs (e.g. `/Images/Products/abc.jpg`).
 * To render those, we need to prefix them with the API host — but NOT the
 * `/api/` segment. Here we extract the host once at module load and reuse it.
 */

/** Origin of the API server, e.g. `https://amantheone.runasp.net`. */
const API_ORIGIN: string = (() => {
  try {
    return new URL(environment.apiUrl).origin;
  } catch {
    // Fallback: strip trailing `/api/...` from the configured URL.
    return environment.apiUrl.replace(/\/api\/?.*$/i, '');
  }
})();

/**
 * Turn a server-relative image path into an absolute URL the browser can fetch.
 *
 *   buildImageUrl('/Images/Products/abc.jpg')
 *     → 'https://amantheone.runasp.net/Images/Products/abc.jpg'
 *
 * Returns `null` when no image is set so callers can render a placeholder.
 * Already-absolute URLs (http://, https://) pass through unchanged so
 * external CDN URLs keep working if the backend ever switches to one.
 */
export function buildImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_ORIGIN}${normalized}`;
}

// ── client-side image validation ──

export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const PRODUCT_IMAGE_ACCEPT = 'image/png,image/jpeg,image/jpg,image/webp,image/gif';
const ALLOWED_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

export interface ImageValidation {
  ok: boolean;
  /** Localized error message ready for display. `null` when `ok === true`. */
  error: string | null;
}

/**
 * Validates a picked file against size + MIME-type constraints. Returns a
 * structured result so the caller can both display a message and decide
 * whether to load a preview.
 */
export function validateProductImage(file: File): ImageValidation {
  if (!ALLOWED_TYPES.has(file.type)) {
    return {
      ok: false,
      error: 'صيغة الصورة غير مدعومة — استخدم PNG / JPG / WebP / GIF',
    };
  }
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
    return {
      ok: false,
      error: 'حجم الصورة يجب ألا يتجاوز 5 ميجابايت',
    };
  }
  return { ok: true, error: null };
}
