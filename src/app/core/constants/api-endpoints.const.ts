/**
 * Single source of truth for backend endpoints.
 *
 * Paths are relative to `environment.apiUrl` (the ApiService prepends the
 * base and strips any leading slash so both forms work).
 */
export const API_ENDPOINTS = {
  auth: {
    login: 'dashboard/auth/login',
    logout: 'auth/logout',
    refresh: 'auth/refresh-token',
    me: 'dashboard/auth/me',
    /** Authoritative role + permission set for the logged-in user. */
    permissions: 'dashboard/auth/me/permissions',
  },
  appUsers: {
    base: 'dashboard/app-users',
    byId: (id: string) => `dashboard/app-users/${encodeURIComponent(id)}`,
    roles: 'dashboard/app-users/roles',
  },
  treasuries: {
    base: 'dashboard/treasuries',
    byId: (id: number) => `dashboard/treasuries/${id}`,
    transfers: 'dashboard/treasuries/transfers',
    operations: 'dashboard/treasuries/operations',
    monthlyProfits: 'dashboard/treasuries/monthly-profits',
    /** Lightweight `{id,name}` list for pickers (role-scoped server-side). */
    lookup: 'dashboard/treasuries/lookup',
  },
  subAccounts: {
    base: 'dashboard/sub-accounts',
    byId: (id: number) => `dashboard/sub-accounts/${id}`,
    /** POST: add a receipt/payment voucher to a given sub-account. */
    vouchers: (id: number) => `dashboard/sub-accounts/${id}/vouchers`,
    /** GET (paged): every voucher across all sub-accounts — search + type + subAccount filters. */
    allVouchers: 'dashboard/sub-accounts/vouchers',
    /** GET (paged): a single sub-account's full ledger (account header + vouchers page). */
    statement: (id: number) => `dashboard/sub-accounts/${id}/statement`,
  },
  shareholders: {
    base: 'dashboard/shareholders',
    byId: (id: number) => `dashboard/shareholders/${id}`,
    /** POST: execute a profit distribution across all shareholders. */
    profitSettlement: 'dashboard/shareholders/profit-settlement',
    /** GET: preview the pending distribution + the profits treasury to draw from. */
    profitSettlementPreview: 'dashboard/shareholders/profit-settlement/preview',
    /** GET (paged): history of executed profit settlements. */
    profitSettlements: 'dashboard/shareholders/profit-settlements',
    profitSettlementById: (id: number) =>
      `dashboard/shareholders/profit-settlements/${id}`,
    /** POST: roll part of one shareholder's accrued profit into their capital. */
    capitalizeProfit: (id: number) =>
      `dashboard/shareholders/${id}/capitalize-profit`,
    /** POST a deposit/withdrawal · GET (paged) the capital-movement ledger. */
    capitalTransactions: (id: number) =>
      `dashboard/shareholders/${id}/capital-transactions`,
    /** POST: roll every shareholder's accrued profit into their capital in one shot. */
    capitalizeAllProfits: 'dashboard/shareholders/capitalize-all-profits',
    /** GET (paged): full ledger for one shareholder — capital + profit movements. */
    statement: (id: number) => `dashboard/shareholders/${id}/statement`,
    /** GET (paged): company profit treasury ledger — all received/paid entries. */
    companyProfitStatement: 'dashboard/company-profit-statement',
  },
  warehouses: {
    base: 'dashboard/warehouses',
    byId: (id: number) => `dashboard/warehouses/${id}`,
    summary: 'dashboard/warehouses/summary',
    inventory: 'dashboard/warehouses/inventory',
    /** Lightweight `{id,name}` list for pickers (role-scoped server-side). */
    lookup: 'dashboard/warehouses/lookup',
    /** POST: create a warehouse-to-warehouse stock transfer. GET: paginated transfer history. */
    transfers: 'dashboard/warehouses/transfers',
    /** GET: full detail of one transfer (includes items). */
    transferById: (id: number) => `dashboard/warehouses/transfers/${id}`,
  },
  products: {
    base: 'dashboard/products',
    byId: (id: number) => `dashboard/products/${id}`,
    /** Lightweight `{id,name}` list for pickers. */
    lookup: 'dashboard/products/lookup',
  },
  categories: {
    base: 'dashboard/categories',
    byId: (id: number) => `dashboard/categories/${id}`,
  },
  suppliers: {
    base: 'dashboard/suppliers',
    byId: (id: number) => `dashboard/suppliers/${id}`,
    statement: (id: number) => `dashboard/suppliers/${id}/statement`,
    /** Lightweight `{id,name}` list for the supplier picker (role-scoped server-side). */
    lookup: 'dashboard/suppliers/lookup',
    /** POST: record a direct payment (not tied to an invoice) for a supplier. */
    payments: (id: number) => `dashboard/suppliers/${id}/payments`,
  },
  purchaseInvoices: {
    base: 'dashboard/supplier-purchase-invoices',
    byId: (id: number) => `dashboard/supplier-purchase-invoices/${id}`,
    summary: 'dashboard/supplier-purchase-invoices/summary',
    confirm: (id: number) =>
      `dashboard/supplier-purchase-invoices/${id}/confirm`,
    /** POST: record a (partial or full) payment against a non-Draft invoice. */
    payments: (id: number) =>
      `dashboard/supplier-purchase-invoices/${id}/payments`,
    /** POST: return / cancel a purchase invoice (only when no payments have been recorded). */
    return: (id: number) =>
      `dashboard/supplier-purchase-invoices/${id}/return`,
  },
  dashboard: {
    summary: 'dashboard/summary',
    homeSummary: 'dashboard/home-summary',
    vouchers: 'dashboard/vouchers',
    expenses: 'dashboard/expenses',
    /** DELETE: permanently remove a single voucher by id. */
    voucherById: (id: number) => `dashboard/vouchers/${id}`,
  },
  charts: {
    profitsLast6Months: 'dashboard/charts/profits-last-6-months',
  },
  installments: {
    dueThisWeek: 'dashboard/installments/due-this-week',
    /**
     * Records a payment against an open installment contract.
     * Note: this endpoint is mounted at the API root (no /dashboard prefix).
     */
    pay: 'installments/pay',
  },
  clientOrders: {
    base: 'dashboard/client-orders',
    reject: (id: number) => `dashboard/client-orders/${id}/reject`,
    convertToContract: (id: number) =>
      `dashboard/client-orders/${id}/convert-to-contract`,
  },
  clients: {
    base: 'dashboard/clients',
    byId: (id: number) => `dashboard/clients/${id}`,
    topThisMonth: 'dashboard/clients/top-this-month',
    contracts: (id: number) => `dashboard/clients/${id}/contracts`,
  },
  inventory: {
    alerts: 'dashboard/inventory/alerts',
  },
  financial: {
    separation: 'dashboard/financial-separation',
  },
  representatives: {
    base: 'dashboard/representatives',
    byId: (id: number) => `dashboard/representatives/${id}`,
    /** Per-representative sub-treasury balances + accumulated commission. */
    subTreasuries: 'dashboard/representatives/sub-treasuries',
    /** Lightweight `{id,name}` list for pickers (role-scoped server-side). */
    lookup: 'dashboard/representatives/lookup',
    /** Admin: full account statement for a given representative. */
    statement: (id: number) => `dashboard/representatives/${id}/statement`,
    /** Representative: own account statement (forbidden for admins). */
    myStatement: 'dashboard/representatives/me/statement',
    /** Admin: pay (part of) a representative's outstanding commission. */
    commissionPayout: (id: number) =>
      `dashboard/representatives/${id}/commission-payout`,
    /** Admin: paginated history of commission payouts. */
    commissionPayouts: 'dashboard/representatives/commission-payouts',
    /** Admin: paginated list of requests submitted by representatives. */
    requests: 'dashboard/representative-requests',
  },
  contracts: {
    base: 'dashboard/contracts',
    byId: (id: number) => `dashboard/contracts/${id}`,
    details: (id: number) => `dashboard/contracts/${id}/details`,
    /** POST: create a direct installment contract (free-text product, no warehouse). */
    direct: 'dashboard/contracts/direct',
    /** PUT: update an existing direct contract. */
    directById: (id: number) => `dashboard/contracts/direct/${id}`,
    /** POST: return / cancel a contract (only when no installments have been paid). */
    return: (id: number) => `dashboard/contracts/${id}/return`,
  },
} as const;
