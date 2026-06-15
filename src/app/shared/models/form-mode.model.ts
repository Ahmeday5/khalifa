/**
 * The three states any CRUD form can be in.
 *
 *   create — empty form, "Save" submits a POST
 *   edit   — pre-filled form, "Save" submits a PUT/PATCH
 *   view   — read-only display, no submit button
 */
export type FormMode = 'create' | 'edit' | 'view';

/** Returns a localized title like "إضافة عميل" / "تعديل عميل" / "تفاصيل عميل". */
export function formModeTitle(mode: FormMode, entityLabel: string): string {
  switch (mode) {
    case 'create': return `إضافة ${entityLabel}`;
    case 'edit':   return `تعديل ${entityLabel}`;
    case 'view':   return `تفاصيل ${entityLabel}`;
  }
}

/** Returns a localized submit-button label, or null when no submit button should render. */
export function formModeSubmitLabel(mode: FormMode): string | null {
  switch (mode) {
    case 'create': return 'إضافة';
    case 'edit':   return 'حفظ التعديلات';
    case 'view':   return null;
  }
}
