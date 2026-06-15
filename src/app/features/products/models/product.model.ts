/**
 * Product entity exactly as returned by `GET /dashboard/products/{id}`
 * (and the `data[]` array in the paginated `/dashboard/products` listing).
 *
 * `imageUrl` is a server-relative path like `/Images/Products/<file>`.
 * Use `buildImageUrl()` from `../utils/product-image.util` to turn it
 * into an absolute URL for the `<img>` src.
 *
 * `profitRatePercent` and `categoryName` are server-computed read-only
 * fields — they're returned in responses but are NOT part of the write
 * payload. The form sends `categoryId`; the server resolves the name.
 */
export interface Product {
  id: number;
  name: string;
  description: string;
  purchasePrice: number;
  sellingPrice: number;
  /** Server-computed: ((selling − purchase) / purchase) × 100. */
  profitRatePercent: number;
  imageUrl: string | null;
  isActive: boolean;
  /** Optional — products without a category come back as `null`. */
  categoryId: number | null;
  /** Server-resolved display name of the category (may be `null`). */
  categoryName: string | null;
  createdAt: string;
}

/**
 * Plain input shape coming out of the form. The service serializes this
 * into multipart/form-data before posting.
 *
 *   - `image` is the picked File (or null = keep the existing image on edit
 *     / send no image on create).
 *   - `categoryId` is null when the user didn't pick one.
 */
export interface ProductFormInput {
  name: string;
  description: string;
  purchasePrice: number;
  sellingPrice: number;
  isActive: boolean;
  categoryId: number | null;
  image: File | null;
}
