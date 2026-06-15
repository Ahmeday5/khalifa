import { InventoryAlertLevel } from '../models/warehouse.model';

/**
 * Visual + textual metadata for each stock-level severity. Centralized
 * here so the alerts page, the cards, the filter chips and the empty
 * states all stay in lock-step when a label or color needs to change.
 */
export interface InventoryLevelMeta {
  /** Localized label shown on chips, headings and cards. */
  label: string;
  /** Short prose used on the card subtitle (e.g. "أقل من 3 وحدات"). */
  rangeLabel: string;
  /**
   * Short token used to build SCSS class names — keep alphanumeric, no
   * spaces, so it slots into selectors like `.iva-card--re`.
   */
  tone: 're' | 'or' | 'am' | 'gr';
  /** Bootstrap-style emoji/symbol used on the card icon. */
  icon: string;
}

export const INVENTORY_LEVEL_META: Readonly<
  Record<InventoryAlertLevel, InventoryLevelMeta>
> = {
  OutOfStock: {
    label: 'نفد المخزون',
    rangeLabel: 'صفر وحدات — طلب فوري',
    tone: 're',
    icon: '⛔',
  },
  Critical: {
    label: 'حرج',
    rangeLabel: 'أقل من 3 وحدات',
    tone: 'or',
    icon: '⚠️',
  },
  NeedsMonitoring: {
    label: 'يحتاج مراقبة',
    rangeLabel: 'أقل من 5 وحدات',
    tone: 'am',
    icon: '👁️',
  },
  Sufficient: {
    label: 'كافٍ',
    rangeLabel: '5 وحدات أو أكثر',
    tone: 'gr',
    icon: '✓',
  },
};

/**
 * Display order across the filter chips. Matches the visual urgency
 * ladder (red → orange → yellow → green) — never alphabetical.
 */
export const INVENTORY_LEVEL_ORDER: readonly InventoryAlertLevel[] = [
  'OutOfStock',
  'Critical',
  'NeedsMonitoring',
  'Sufficient',
];
