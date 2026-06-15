import { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * Maps a control's first failing validator into a localized Arabic message.
 *
 * Use via `<app-form-error [control]="form.controls.email" label="البريد الإلكتروني" />`
 * or directly: `firstError(ctrl, 'الحقل')`.
 *
 * Order matters — `required` is checked first so an empty field never gets
 * a "wrong format" message.
 */
export function firstError(
  control: AbstractControl | null | undefined,
  label: string,
  custom?: Record<string, (e: unknown) => string>,
): string | null {
  if (!control) return null;
  if (!(control.dirty || control.touched)) return null;
  if (!control.errors) return null;

  return resolveMessage(control.errors, label, custom);
}

/** Same as `firstError` but ignores touched/dirty — useful for forced display. */
export function firstErrorAlways(
  control: AbstractControl | null | undefined,
  label: string,
  custom?: Record<string, (e: unknown) => string>,
): string | null {
  if (!control?.errors) return null;
  return resolveMessage(control.errors, label, custom);
}

function resolveMessage(
  errors: ValidationErrors,
  label: string,
  custom?: Record<string, (e: unknown) => string>,
): string {
  // Custom keys always win.
  if (custom) {
    for (const key of Object.keys(custom)) {
      if (errors[key] !== undefined) return custom[key](errors[key]);
    }
  }

  if (errors['required'] !== undefined) {
    return `${label} مطلوب`;
  }
  if (errors['email'] !== undefined) {
    return `صيغة ${label} غير صحيحة`;
  }
  if (errors['minlength']) {
    const req = errors['minlength'].requiredLength;
    return `${label} يجب ألا يقل عن ${req} ${req <= 10 ? 'أحرف' : 'حرف'}`;
  }
  if (errors['maxlength']) {
    const req = errors['maxlength'].requiredLength;
    return `${label} يجب ألا يزيد عن ${req} ${req <= 10 ? 'أحرف' : 'حرف'}`;
  }
  if (errors['min'] !== undefined) {
    return `${label} يجب أن يكون ${errors['min'].min} أو أكثر`;
  }
  if (errors['max'] !== undefined) {
    return `${label} يجب أن يكون ${errors['max'].max} أو أقل`;
  }
  if (errors['pattern'] !== undefined) {
    return `${label} غير صحيح`;
  }
  if (errors['mismatch'] !== undefined) {
    return `${label} غير متطابق`;
  }

  // Unknown validator — show the raw key as a graceful fallback.
  const firstKey = Object.keys(errors)[0];
  const value = errors[firstKey];
  if (typeof value === 'string') return value;
  return `${label} غير صحيح`;
}
