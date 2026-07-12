export interface Contract {
  id: string;
  customerName: string;
  nationalId: string;
  phone: string;
  address: string;
  contractDate: string;
  productDesc: string;
  serialNumber: string;
  costPrice: number;
  cashPrice: number;
  downPayment: number;
  profitRate: number;
  profitAmount: number;
  totalAmount: number;
  installmentAmount: number;
  installmentsCount: number;
  period: string;
  firstInstallmentDate: string;
  repName: string;
  witnessName: string;
  notes: string;
}

export interface ContractFormData {
  customerId: string;
  productDesc: string;
  cashPrice: number;
  downPayment: number;
  profitRate: number;
  installmentsCount: number;
  period: string;
  witnessName: string;
}

// ─────────────────────────────────────────────────────────────────
//  Live API: POST /dashboard/contracts
// ─────────────────────────────────────────────────────────────────

/** Backend PaymentFrequency — Quarterly / SemiAnnual / Annual only. */
export type ContractPaymentFrequency = 'Quarterly' | 'SemiAnnual' | 'Annual';

export type ContractStatus =
  | 'Active'
  | 'Completed'
  | 'Defaulted'
  | 'Cancelled';

// ─── item shapes ───

/** Wire payload for a single line-item in a contract. */
export interface ContractItemPayload {
  productId: number;
  warehouseId: number;
  quantity: number;
}

/** Form-level item (nullable ids before the user selects a value). */
export interface ContractItemFormState {
  productId: number | null;
  warehouseId: number | null;
  quantity: number;
}

// ─── create ───

/**
 * Payload for `POST /dashboard/contracts`.
 *
 * IMPORTANT — `representativeId`: omit entirely when no rep is selected.
 * Use `buildCreateContractPayload()` to assemble the body safely.
 */
export interface CreateContractPayload {
  clientId: number;
  items: ContractItemPayload[];
  /** ISO datetime (date of sale). */
  dateOfSale: string;
  cashPrice: number;
  downPayment: number;
  /** 0..100 */
  profitRate: number;
  installmentsCount: number;
  installmentAmount: number;
  paymentFrequency: ContractPaymentFrequency;
  /** ISO datetime — first installment due date. */
  firstInstallmentDate: string;
  treasuryId: number;
  /** Omit when no representative is attached — do NOT send 0 or null. */
  representativeId?: number;
  notes?: string;
  /** Contract code — user-entered, unique per contract. Omit when blank. */
  code?: string;
}

/** Response shape from `POST /dashboard/contracts`. */
export interface CreatedContract {
  id: number;
  clientId: number;
  items?: ContractItemPayload[];
  dateOfSale: string;
  cashPrice: number;
  downPayment: number;
  profitRate: number;
  installmentsCount: number;
  installmentAmount: number;
  paymentFrequency: ContractPaymentFrequency;
  firstInstallmentDate: string;
  status: ContractStatus;
  representativeId: number | null;
  representativeCommission: number;
  notes: string | null;
  /** Contract code — `null` for contracts created before this field existed. */
  code: string | null;
}

/**
 * Form-state shape consumed by the contract UI. `representativeId` is
 * kept nullable so the select can bind to it; builder strips it when absent.
 */
export interface ContractFormState {
  clientId: number | null;
  items: ContractItemFormState[];
  dateOfSale: string;
  cashPrice: number;
  downPayment: number;
  profitRate: number;
  installmentsCount: number;
  installmentAmount: number;
  paymentFrequency: ContractPaymentFrequency;
  firstInstallmentDate: string;
  treasuryId: number | null;
  representativeId: number | null;
  notes?: string;
  /** Contract code — user-entered, unique per contract. */
  code?: string;
}

/** Build `POST /dashboard/contracts` body from form state. */
export function buildCreateContractPayload(
  form: ContractFormState,
): CreateContractPayload {
  const payload: CreateContractPayload = {
    clientId: Number(form.clientId),
    items: form.items
      .filter((i) => i.productId && i.warehouseId && Number(i.quantity) >= 1)
      .map((i) => ({
        productId: Number(i.productId),
        warehouseId: Number(i.warehouseId),
        quantity: Number(i.quantity),
      })),
    dateOfSale: form.dateOfSale,
    cashPrice: form.cashPrice,
    downPayment: form.downPayment,
    profitRate: form.profitRate,
    installmentsCount: form.installmentsCount,
    installmentAmount: form.installmentAmount,
    paymentFrequency: form.paymentFrequency,
    firstInstallmentDate: form.firstInstallmentDate,
    treasuryId: Number(form.treasuryId),
  };

  if (form.representativeId && form.representativeId > 0) {
    payload.representativeId = form.representativeId;
  }

  const trimmedNotes = form.notes?.trim();
  if (trimmedNotes) payload.notes = trimmedNotes;

  const trimmedCode = form.code?.trim();
  if (trimmedCode) payload.code = trimmedCode;

  return payload;
}

// ─── update ───

/** Payload for `PUT /dashboard/contracts/{id}`. */
export interface UpdateContractPayload {
  clientId: number;
  items: ContractItemPayload[];
  dateOfSale: string;
  cashPrice: number;
  downPayment: number;
  profitRate: number;
  installmentsCount: number;
  installmentAmount: number;
  paymentFrequency: ContractPaymentFrequency;
  firstInstallmentDate: string;
  treasuryId: number;
  representativeId?: number;
  notes?: string;
  code?: string;
}

/** Form-state shape for the edit page — identical to ContractFormState. */
export type UpdateContractFormState = ContractFormState;

/** Build `PUT /dashboard/contracts/{id}` body. */
export function buildUpdateContractPayload(
  form: UpdateContractFormState,
): UpdateContractPayload {
  return buildCreateContractPayload(form) as UpdateContractPayload;
}

// ─────────────────────────────────────────────────────────────────
//  Live API: POST /dashboard/contracts/direct
// ─────────────────────────────────────────────────────────────────

/** One free-text product line in a direct contract. */
export interface DirectContractItemPayload {
  productName: string;
  quantity: number;
  unitPurchasePrice: number;
}

/** Form-level item (string ids before validation). */
export interface DirectContractItemFormState {
  productName: string;
  quantity: number;
  unitPurchasePrice: number;
}

/**
 * Payload for `POST /dashboard/contracts/direct`.
 * Supports multiple free-text product lines — no warehouse / inventory link.
 */
export interface CreateDirectContractPayload {
  clientId: number;
  items: DirectContractItemPayload[];
  dateOfSale: string;
  cashPrice: number;
  downPayment: number;
  profitRate: number;
  installmentsCount: number;
  installmentAmount: number;
  paymentFrequency: ContractPaymentFrequency;
  firstInstallmentDate: string;
  treasuryId: number;
  representativeId?: number;
  notes?: string;
  /** Contract code — user-entered, unique per contract. Omit when blank. */
  code?: string;
}

/** Response shape from `POST /dashboard/contracts/direct`. */
export interface CreatedDirectContract {
  id: number;
  clientId: number;
  items: DirectContractItemPayload[];
  dateOfSale: string;
  cashPrice: number;
  downPayment: number;
  profitRate: number;
  installmentsCount: number;
  installmentAmount: number;
  paymentFrequency: ContractPaymentFrequency;
  firstInstallmentDate: string;
  status: ContractStatus;
  representativeId: number | null;
  representativeCommission: number;
  notes: string | null;
  /** Contract code — `null` for contracts created before this field existed. */
  code: string | null;
}
