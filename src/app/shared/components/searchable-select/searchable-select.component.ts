import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Optional,
  Self,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NgControl } from '@angular/forms';

export interface SearchableSelectOption {
  /** Bound form value. */
  value: number | string;
  /** Primary line shown in the list and the closed control. */
  label: string;
  /** Optional secondary line (e.g. phone number) — also matched by search. */
  hint?: string;
}

/**
 * Reactive-Forms-friendly single-select with a built-in client-side search
 * box — a drop-in replacement for a native `<select>` once the option list
 * grows past the point of comfortable scrolling (e.g. the client picker).
 *
 *   <app-searchable-select
 *     formControlName="clientId"
 *     [options]="clientOptions()"
 *     placeholder="اختر العميل"
 *     searchPlaceholder="ابحث بالاسم أو الجوال…"
 *   />
 *
 * Also works with `[ngModel]/(ngModelChange)` for the signal-driven pages.
 * Filtering is in-memory over the already-loaded `options` (the services now
 * drain every page via `fetchAllPages`), so typing never hits the network
 * and there is no debounce/race to reason about.
 *
 * Follows the project CVA convention (self-injected `NgControl`, no
 * `NG_VALUE_ACCESSOR` provider) so `is-invalid` styling can read the host
 * control state without the call-site wiring anything.
 */
@Component({
  selector: 'app-searchable-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './searchable-select.component.html',
  styleUrl: './searchable-select.component.scss',
})
export class SearchableSelectComponent implements ControlValueAccessor {
  readonly options = input<SearchableSelectOption[]>([]);
  readonly placeholder = input<string>('اختر…');
  readonly searchPlaceholder = input<string>('ابحث…');
  /**
   * Caller-driven disable (e.g. while the list is still loading). Combined
   * with the Reactive-Forms disabled state from `setDisabledState`, so the
   * control locks if *either* source asks for it.
   */
  readonly isDisabled = input<boolean>(false);

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly searchInput =
    viewChild<ElementRef<HTMLInputElement>>('searchBox');

  protected readonly open = signal(false);
  /** Reactive-Forms disabled state, fed by `setDisabledState`. */
  private readonly cvaDisabled = signal(false);
  protected readonly disabled = computed(
    () => this.cvaDisabled() || this.isDisabled(),
  );
  protected readonly term = signal('');
  /** Keyboard-highlighted row index within `filtered()`. */
  protected readonly activeIndex = signal(0);

  /** Selected value — synced via writeValue() and option clicks. */
  protected readonly value = signal<number | string | null>(null);

  private onChange: (val: number | string | null) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(@Self() @Optional() public ngControl: NgControl) {
    if (this.ngControl) this.ngControl.valueAccessor = this;
  }

  // ─────────── derived view state ───────────

  protected readonly selectedOption = computed(() => {
    const v = this.value();
    if (v === null || v === undefined || v === '') return null;
    return (
      this.options().find((o) => String(o.value) === String(v)) ?? null
    );
  });

  protected readonly filtered = computed(() => {
    const q = this.term().trim().toLowerCase();
    const all = this.options();
    if (!q) return all;
    return all.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.hint ?? '').toLowerCase().includes(q),
    );
  });

  protected isInvalid(): boolean {
    const c = this.ngControl?.control;
    return !!(c && c.invalid && (c.touched || c.dirty));
  }

  // ─────────── ControlValueAccessor ───────────

  writeValue(value: number | string | null): void {
    this.value.set(value ?? null);
  }
  registerOnChange(fn: (val: number | string | null) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.cvaDisabled.set(isDisabled);
  }

  // ─────────── interaction ───────────

  protected toggle(): void {
    if (this.disabled()) return;
    this.open() ? this.close() : this.openPanel();
  }

  private openPanel(): void {
    this.open.set(true);
    this.term.set('');
    this.activeIndex.set(this.currentSelectedIndex());
    // Defer so the panel exists before we focus the search box.
    queueMicrotask(() => this.searchInput()?.nativeElement.focus());
  }

  protected close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.onTouched();
  }

  protected select(opt: SearchableSelectOption): void {
    this.value.set(opt.value);
    this.onChange(opt.value);
    this.close();
  }

  protected clear(event: Event): void {
    event.stopPropagation();
    if (this.disabled()) return;
    this.value.set(null);
    this.onChange(null);
  }

  protected onSearch(event: Event): void {
    this.term.set((event.target as HTMLInputElement).value);
    this.activeIndex.set(0);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const rows = this.filtered();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.activeIndex.update((i) => Math.min(i + 1, rows.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.activeIndex.update((i) => Math.max(i - 1, 0));
        break;
      case 'Enter': {
        event.preventDefault();
        const opt = rows[this.activeIndex()];
        if (opt) this.select(opt);
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
    }
  }

  private currentSelectedIndex(): number {
    const sel = this.selectedOption();
    if (!sel) return 0;
    const i = this.options().findIndex(
      (o) => String(o.value) === String(sel.value),
    );
    return i < 0 ? 0 : i;
  }

  // Close when focus/click leaves the component.
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (
      this.open() &&
      !this.host.nativeElement.contains(event.target as Node)
    ) {
      this.close();
    }
  }
}
