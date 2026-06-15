/**
 * Snapshot of the company's financial position at a single point in time,
 * exactly as returned by `GET /dashboard/financial-separation`.
 *
 *   - `treasury`            cash + bank balances
 *   - `receivables`         what clients still owe
 *   - `payables`            what we still owe suppliers
 *   - `inventoryValue`      cost of goods on hand
 *   - `netFinancialPosition` (treasury + receivables + inventoryValue) − payables
 */
export interface FinancialSeparation {
  treasury: number;
  receivables: number;
  payables: number;
  inventoryValue: number;
  netFinancialPosition: number;
}
