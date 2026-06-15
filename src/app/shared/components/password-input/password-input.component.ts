import {
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  HostBinding,
  inject,
  input,
  Optional,
  Self,
  signal,
} from '@angular/core';
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
  NgControl,
} from '@angular/forms';

/**
 * Reactive-Forms-friendly password input with a built-in show/hide toggle.
 *
 *   <app-password-input
 *     formControlName="password"
 *     placeholder="••••••••"
 *     autocomplete="new-password"
 *   />
 *
 * Implements ControlValueAccessor so it plugs into reactive forms exactly
 * like a native input — the parent never has to wire a custom binding.
 *
 * `is-invalid` styling is read from the bound NgControl and applied
 * automatically when the control is invalid + (touched || dirty), so the
 * markup at the call-site stays minimal.
 */
@Component({
  selector: 'app-password-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './password-input.component.html',
  styleUrl: './password-input.component.scss',
})
export class PasswordInputComponent implements ControlValueAccessor {
  readonly placeholder = input<string>('');
  readonly autocomplete = input<string>('current-password');

  protected readonly visible = signal(false);
  protected readonly disabled = signal(false);

  /** Local copy of the value — synced via writeValue() and (input). */
  protected value: string = '';

  /** ControlValueAccessor callbacks — assigned by Angular forms. */
  private onChange: (val: string) => void = () => {};
  private onTouched: () => void = () => {};

  // ─────────── reflect form state from the bound NgControl ───────────
  // Self-injection of NgControl gives us access to the host directive's
  // status without forcing the consumer to pipe it through.
  constructor(@Self() @Optional() public ngControl: NgControl) {
    if (this.ngControl) {
      this.ngControl.valueAccessor = this;
    }
  }

  @HostBinding('class.is-invalid-host')
  protected get hostInvalid(): boolean {
    return this.isInvalid();
  }

  protected isInvalid(): boolean {
    const c = this.ngControl?.control;
    if (!c) return false;
    return !!(c.invalid && (c.touched || c.dirty));
  }

  // ─────────── ControlValueAccessor ───────────

  writeValue(value: string | null): void {
    this.value = value ?? '';
  }
  registerOnChange(fn: (val: string) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  // ─────────── handlers ───────────

  protected onInput(event: Event): void {
    const v = (event.target as HTMLInputElement).value;
    this.value = v;
    this.onChange(v);
  }

  protected onBlur(): void {
    this.onTouched();
  }

  protected toggle(): void {
    if (this.disabled()) return;
    this.visible.update((v) => !v);
  }
}
