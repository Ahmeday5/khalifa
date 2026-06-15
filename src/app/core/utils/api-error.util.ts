import { ApiError } from '../models/api-response.model';
import {
  containsArabic,
  translateApiMessage,
} from '../constants/api-messages.const';

/**
 * Turns an `ApiError` (already normalized by `errorInterceptor`) into a
 * user-facing message. Prefers backend field errors when present so the
 * user sees the actual rule that failed instead of a generic "فشل العملية".
 *
 * Usage:
 *
 *   error: (err: ApiError) =>
 *     this.toast.error(apiErrorToMessage(err, 'فشل إنشاء العقد')),
 *
 * - Field errors take precedence — they're the most actionable.
 * - Falls back to `err.message` (set by the interceptor from
 *   `body.message || body.error || body.detail || body.title`).
 * - Falls back to the caller's fallback only when both are missing
 *   (e.g. a `0` status with no usable hint).
 */
export function apiErrorToMessage(
  err: ApiError | undefined | null,
  fallback: string,
): string {
  if (!err) return fallback;

  // Field errors are the most actionable, but the backend writes them in
  // English — translate, keep if already Arabic, else fall back.
  const fieldMessage = formatFieldErrors(err.fieldErrors);
  if (fieldMessage) {
    return (
      translateApiMessage(fieldMessage) ??
      (containsArabic(fieldMessage) ? fieldMessage : null) ??
      fallback
    );
  }

  // `err.message` is already Arabic-resolved by the error interceptor.
  return err.message?.trim() || fallback;
}

/**
 * Flattens `{ field: string[] | string }` validation errors into a single
 * Arabic-friendly line. Returns null when there are no field errors so
 * the caller can fall through to the message/fallback chain.
 */
function formatFieldErrors(
  fieldErrors: ApiError['fieldErrors'],
): string | null {
  if (!fieldErrors) return null;
  const parts: string[] = [];
  for (const value of Object.values(fieldErrors)) {
    if (Array.isArray(value)) parts.push(...value.filter(Boolean));
    else if (typeof value === 'string' && value.trim()) parts.push(value);
  }
  if (parts.length === 0) return null;
  return parts.join(' — ');
}
