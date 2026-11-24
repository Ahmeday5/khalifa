/**
 * Client number ("رقم العميل").
 *
 * The client number IS the server-assigned sequential identity (`id`):
 * it is unique, never reused, generated atomically by the database on
 * creation, and therefore safe under concurrent inserts — something a
 * client-side "next number" computation can never guarantee.
 *
 * Every screen and printout must render the client number through this
 * helper (or `ClientNumberPipe`) so the format stays identical everywhere.
 */

/** Placeholder rendered when a client number is not available yet. */
export const CLIENT_NUMBER_PLACEHOLDER = '—';

export function formatClientNumber(id: number | null | undefined): string {
  return typeof id === 'number' && Number.isFinite(id) && id > 0
    ? String(id)
    : CLIENT_NUMBER_PLACEHOLDER;
}
