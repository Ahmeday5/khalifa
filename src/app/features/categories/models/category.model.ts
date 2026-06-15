/**
 * Product category — a lightweight tag used to group catalog items.
 * The API only tracks `name`; everything else is computed downstream.
 */
export interface Category {
  id: number;
  name: string;
}

/** POST /dashboard/categories */
export interface CreateCategoryPayload {
  name: string;
}

/** PUT /dashboard/categories/{id} — same shape as create. */
export type UpdateCategoryPayload = CreateCategoryPayload;
