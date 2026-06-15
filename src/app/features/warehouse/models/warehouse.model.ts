export type StockAlertLevel = 'critical' | 'low' | 'ok';
export type AlertSeverity   = 'out' | 'critical' | 'low' | 'ok';

/**
 * Warehouse entity exactly as returned by `GET /dashboard/warehouses`.
 * No separate "view" DTO — the API shape *is* the view model.
 *
 * The four collection fields are returned as empty arrays today; typed as
 * optional unknown[] so they can be specialized later without breaking
 * existing call-sites.
 */
export interface Warehouse {
  id: number;
  name: string;
  location: string;
  isActive: boolean;
  createdAt: string;
  inventoryBalances?: unknown[];
  inventoryTransactions?: unknown[];
  contracts?: unknown[];
  supplierPurchaseInvoices?: unknown[];
}

/** POST /dashboard/warehouses */
export interface CreateWarehousePayload {
  name: string;
  location: string;
  isActive: boolean;
}

/** PUT /dashboard/warehouses/{id} */
export interface UpdateWarehousePayload {
  name: string;
  location: string;
  isActive: boolean;
}

export interface WarehouseItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  unitCost: number;
  alertLevel: StockAlertLevel;
  lastUpdated: string;
}

// ─────────────────────────────────────────────────────────────────
//  Live API: GET /dashboard/inventory/alerts[?level=…]
//  Per-product stock status with per-warehouse breakdown.
// ─────────────────────────────────────────────────────────────────

/**
 * Backend-classified stock levels. Order matches the visual urgency
 * ladder (red → orange → yellow → green) used across the alerts UI.
 *
 *   OutOfStock      — totalQuantity = 0
 *   Critical        — 1..2  (< 3)
 *   NeedsMonitoring — 3..4  (< 5)
 *   Sufficient      — ≥ 5
 */
export type InventoryAlertLevel =
  | 'OutOfStock'
  | 'Critical'
  | 'NeedsMonitoring'
  | 'Sufficient';

export interface InventoryAlertWarehouseBreakdown {
  warehouseId: number;
  warehouseName: string;
  quantity: number;
}

export interface InventoryAlertItem {
  productId: number;
  productName: string;
  totalQuantity: number;
  level: InventoryAlertLevel;
  warehouseBreakdown: InventoryAlertWarehouseBreakdown[];
}

export interface InventoryAlertSummary {
  outOfStockCount: number;
  criticalCount: number;
  monitoringCount: number;
}

export interface InventoryAlertsResponse {
  summary: InventoryAlertSummary;
  alerts: InventoryAlertItem[];
}

export interface InventoryAlertsQuery {
  level?: InventoryAlertLevel;
}

export interface WarehouseLocation {
  id: string;
  name: string;
  city: string;
  colorVar: string;
  purchased: number;
  sold: number;
  available: number;
  capacity: number;
  totalValue: number;
  profit: number;
}

export interface WarehouseDetailItem {
  id: string;
  warehouseId: string;
  name: string;
  sku: string;
  category: string;
  serialStart: string;
  serialEnd: string;
  qty: number;
  unitCost: number;
  unitPrice: number;
}

// ─────────────────────────────────────────────────────────────────
//  Live API: GET /dashboard/warehouses/summary
//  Returns the warehouse list enriched with aggregated stock + value.
// ─────────────────────────────────────────────────────────────────

export interface WarehouseSummary {
  id: number;
  name: string;
  location: string;
  isActive: boolean;
  /** Backend-provided localized status label (e.g. "نشط" / "متوقف"). */
  status: string;
  purchasedQuantity: number;
  soldQuantity: number;
  availableQuantity: number;
  /** Total cost of items currently held (purchase price × quantity). */
  purchaseValue: number;
  totalProfit: number;
  /** 0 → 100. */
  soldPercent: number;
  needsRestock: boolean;
}

// ─────────────────────────────────────────────────────────────────
//  Live API: GET /dashboard/warehouses/inventory?warehouseId=…
//  Per-warehouse, per-product inventory rows (paginated + searchable).
// ─────────────────────────────────────────────────────────────────

export interface WarehouseInventoryItem {
  productId: number;
  productName: string;
  warehouseId: number;
  warehouseName: string;
  purchasedQuantity: number;
  soldQuantity: number;
  availableQuantity: number;
  purchasePrice: number;
  sellingPrice: number;
  marginPercent: number;
  /** Comma-separated string or `null` when not tracked. */
  totalProfit: number;
}

export interface WarehouseInventoryQuery {
  warehouseId: number;
  pageIndex?: number;
  pageSize?: number;
  search?: string;
}
