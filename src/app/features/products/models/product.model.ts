/**
 * نوع العمولة المربوطة بالمنتج:
 *   - None        : لا عمولة (الافتراضي)
 *   - Percentage  : نسبة مئوية من سعر البيع
 *   - FixedAmount : مبلغ ثابت لكل وحدة مباعة
 */
export type CommissionType = 'None' | 'Percentage' | 'FixedAmount';

export const COMMISSION_TYPE_LABELS: Record<CommissionType, string> = {
  None: 'بدون عمولة',
  Percentage: 'نسبة مئوية %',
  FixedAmount: 'مبلغ ثابت ج.م',
};

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
  /** سعر البيع بالتقسيط ربع سنوي. */
  quarterlySellingPrice: number;
  /** سعر البيع بالتقسيط نصف سنوي. */
  semiAnnualSellingPrice: number;
  /** سعر البيع بالتقسيط سنوي. */
  annualSellingPrice: number;
  imageUrl: string | null;
  isActive: boolean;
  /** Optional — products without a category come back as `null`. */
  categoryId: number | null;
  /** Server-resolved display name of the category (may be `null`). */
  categoryName: string | null;
  createdAt: string;
  /** نوع عمولة المنتج — None إذا لم يُعيَّن. */
  commissionType: CommissionType;
  /** قيمة العمولة: نسبة (0–100) أو مبلغ ثابت، حسب commissionType. */
  commissionValue: number;
}

/**
 * Plain input shape coming out of the form. The service serializes this
 * into multipart/form-data before posting.
 *
 *   - `image` is the picked File (or null = keep the existing image on edit
 *     / send no image on create).
 *   - `categoryId` is null when the user didn't pick one.
 *   - `commissionValue` is only relevant when commissionType ≠ None.
 */
export interface ProductFormInput {
  name: string;
  description: string;
  purchasePrice: number;
  quarterlySellingPrice: number;
  semiAnnualSellingPrice: number;
  annualSellingPrice: number;
  isActive: boolean;
  categoryId: number | null;
  image: File | null;
  commissionType: CommissionType;
  commissionValue: number;
}
