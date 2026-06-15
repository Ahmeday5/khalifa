/**
 * Date helpers — every component re-implementing
 * `new Date().toISOString().split('T')[0]` should call `todayIsoDate()`
 * instead. Centralizing also makes timezone behavior reviewable in one
 * place: we deliberately use local-day components so the value mirrors
 * what the user sees in their browser's date picker (the splitting trick
 * was returning UTC, which was wrong by a day for users east of UTC).
 */

/** Today as `YYYY-MM-DD` in the user's local timezone — suitable for `<input type="date">`. */
export function todayIsoDate(): string {
  return toIsoDate(new Date());
}

/** N months from today, same day-of-month, as `YYYY-MM-DD`. */
export function plusMonthsIsoDate(months: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return toIsoDate(d);
}

/** Formats any `Date` as `YYYY-MM-DD` using local components. */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** True when `value` parses to a real Date. */
export function isValidIsoDate(value: string | null | undefined): boolean {
  if (!value) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}
