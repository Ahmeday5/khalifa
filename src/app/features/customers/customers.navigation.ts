import { Params } from '@angular/router';

/**
 * Navigation contract for the customers feature.
 *
 * Keeps deep-link URLs and query-param names in one place so producers
 * (e.g. the clients list "contracts" action) and consumers (the statement
 * page) can never drift apart.
 */

/** Absolute route of the client statement page (the client's contracts). */
export const CLIENT_STATEMENT_ROUTE = '/customers/statement';

/** Query param that pre-selects a client on the statement page. */
export const CLIENT_ID_QUERY_PARAM = 'clientId';

/** Query params that open the statement page on a given client. */
export function clientStatementQueryParams(clientId: number): Params {
  return { [CLIENT_ID_QUERY_PARAM]: clientId };
}

/**
 * Parses the raw `clientId` query param. Anything that is not a positive
 * integer (missing, empty, tampered) resolves to `null` — i.e. "no client".
 */
export function parseClientIdParam(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}
