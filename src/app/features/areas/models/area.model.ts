/**
 * Client area/region — a lightweight tag used by `dashboard-client.areaId`.
 * The API only tracks `name`; everything else is computed downstream.
 */
export interface Area {
  id: number;
  name: string;
}

/** POST /dashboard/areas */
export interface CreateAreaPayload {
  name: string;
}

/** PUT /dashboard/areas/{id} — same shape as create. */
export type UpdateAreaPayload = CreateAreaPayload;
