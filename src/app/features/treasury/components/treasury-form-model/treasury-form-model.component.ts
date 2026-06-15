import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select.component';
import {
  FormMode,
  formModeSubmitLabel,
  formModeTitle,
} from '../../../../shared/models/form-mode.model';
import { ApiError } from '../../../../core/models/api-response.model';
import { LookupItem } from '../../../../core/models/lookup.model';
import { ToastService } from '../../../../core/services/toast.service';
import { RepsService } from '../../../reps/services/reps.service';
import {
  CreateTreasuryPayload,
  Treasury,
  UpdateTreasuryPayload,
} from '../../models/treasury.model';
import { TreasuryService } from '../../services/treasury.service';
import { TreasuryType } from '../../enums/treasury-type.enum';
import { TREASURY_TYPE_OPTIONS } from '../../constants/treasury-type-labels';

/**
 * Add / edit dialog for a Treasury.
 *
 *   <app-treasury-form-model
 *     [open]="modalOpen()"
 *     [mode]="modalMode()"
 *     [treasury]="modalTreasury()"
 *     (closed)="closeModal()"
 *     (saved)="onSaved($event)" />
 *
 * Notes:
 *   - `initialBalance` is only sent on CREATE — the API doesn't accept it
 *     on PUT (current balance is server-managed).
 *   - The form fully resets every time `open` flips to true, so reopening
 *     the modal in a different mode never shows stale data from the
 *     previous session.
 */
@Component({
  selector: 'app-treasury-form-model',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    ModalComponent,
    FormErrorComponent,
    SearchableSelectComponent,
  ],
  templateUrl: './treasury-form-model.component.html',
  styleUrl: './treasury-form-model.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TreasuryFormModelComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();
  readonly mode = input.required<FormMode>();
  readonly treasury = input<Treasury | null>(null);

  // ── outputs ──
  readonly closed = output<void>();
  readonly saved = output<Treasury>();

  // ── deps ──
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(TreasuryService);
  private readonly toast = inject(ToastService);
  private readonly repsService = inject(RepsService);
  private readonly destroyRef = inject(DestroyRef);

  // ── reactive state (template-bound — must be signals) ──
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);
  /** Mirrors the `type` control so the template can react to its changes. */
  protected readonly selectedType = signal<TreasuryType>(TreasuryType.Main);
  protected readonly representatives = signal<LookupItem[]>([]);
  protected readonly repsLoading = signal(false);
  private repsLoaded = false;

  // ── derived ──
  protected readonly isView = computed(() => this.mode() === 'view');
  protected readonly isCreate = computed(() => this.mode() === 'create');
  /** A sub-representative treasury must be linked to a representative. */
  protected readonly isSubRepresentative = computed(
    () => this.selectedType() === TreasuryType.SubRepresentative,
  );
  protected readonly representativeOptions = computed<SearchableSelectOption[]>(
    () =>
      this.representatives().map((r) => ({ value: r.id, label: r.name })),
  );
  protected readonly title = computed(() =>
    formModeTitle(this.mode(), 'خزينة'),
  );
  protected readonly submitLabel = computed(() =>
    formModeSubmitLabel(this.mode()),
  );

  protected readonly typeOptions = TREASURY_TYPE_OPTIONS;

  // ── form ──
  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    initialBalance: [0, [Validators.required, Validators.min(0)]],
    type: [TreasuryType.Main, [Validators.required]],
    isActive: [true, [Validators.required]],
    representativeId: this.fb.nonNullable.control<number | null>(null),
  });

  constructor() {
    // Keep `selectedType` + the conditional `representativeId` validator in
    // sync whenever the user switches the treasury type.
    this.form.controls.type.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((type) => this.onTypeChanged(type));

    effect(
      () => {
        if (!this.open()) return;

        this.serverError.set(null);
        this.submitting.set(false);
        this.loadRepresentatives();
        this.applyModeRules();
        this.resetFormToInputs();
      },
      { allowSignalWrites: true },
    );
  }

  // ─────────────── public template handlers ───────────────

  protected onSubmit(): void {
    if (this.isView() || this.submitting()) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const isCreate = this.isCreate();

    this.serverError.set(null);
    this.submitting.set(true);

    const stream = isCreate
      ? this.service.create(this.toCreatePayload(raw))
      : this.service.update(this.treasury()!.id, this.toUpdatePayload(raw));

    stream.subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.toast.success(
          isCreate ? 'تم إضافة الخزينة بنجاح' : 'تم حفظ التعديلات',
        );
        this.saved.emit(res);
      },
      error: (err: ApiError) => {
        this.submitting.set(false);
        this.serverError.set(err.message);
      },
    });
  }

  protected close(): void {
    if (this.submitting()) return;
    this.closed.emit();
  }

  protected isInvalid(field: keyof typeof this.form.controls): boolean {
    const ctrl = this.form.controls[field];
    return ctrl.invalid && (ctrl.dirty || ctrl.touched);
  }

  // ─────────────── internals ───────────────

  /**
   * Reacts to a type change: mirrors it into `selectedType` and toggles the
   * `representativeId` requirement. Leaving the sub-rep type clears the
   * previously-selected representative so a stale id is never submitted.
   */
  private onTypeChanged(type: TreasuryType): void {
    this.selectedType.set(type);

    const rep = this.form.controls.representativeId;
    if (type === TreasuryType.SubRepresentative) {
      rep.setValidators([Validators.required]);
    } else {
      rep.clearValidators();
      rep.setValue(null, { emitEvent: false });
    }
    rep.updateValueAndValidity({ emitEvent: false });
  }

  /** Loads the representatives picker once (lazily, on first open). */
  private loadRepresentatives(): void {
    if (this.repsLoaded) return;
    this.repsLoaded = true;
    this.repsLoading.set(true);
    this.repsService
      .lookup()
      .pipe(catchError(() => of([] as LookupItem[])))
      .subscribe((items) => {
        this.representatives.set(items);
        this.repsLoading.set(false);
      });
  }

  /** Disable the whole form in view mode; otherwise enable it. */
  private applyModeRules(): void {
    if (this.isView()) {
      this.form.disable({ emitEvent: false });
      return;
    }
    this.form.enable({ emitEvent: false });

    // initialBalance is only meaningful on create.
    const ib = this.form.controls.initialBalance;
    if (this.isCreate()) {
      ib.enable({ emitEvent: false });
    } else {
      ib.disable({ emitEvent: false });
    }
  }

  /**
   * Hydrate the form from the input treasury (edit/view) or reset to
   * sensible defaults (create). Always called after `applyModeRules`
   * so disabled controls stay disabled.
   */
  private resetFormToInputs(): void {
    const t = this.treasury();
    if (t && !this.isCreate()) {
      this.form.reset({
        name: t.name,
        initialBalance: t.currentBalance,
        type: t.type,
        isActive: t.isActive,
        representativeId: t.representativeId ?? null,
      });
      this.onTypeChanged(t.type);
      return;
    }

    this.form.reset({
      name: '',
      initialBalance: 0,
      type: TreasuryType.Main,
      isActive: true,
      representativeId: null,
    });
    this.onTypeChanged(TreasuryType.Main);
  }

  // ─────────── payload builders ───────────

  private toCreatePayload(raw: {
    name: string;
    initialBalance: number;
    type: TreasuryType;
    isActive: boolean;
    representativeId: number | null;
  }): CreateTreasuryPayload {
    return {
      name: raw.name.trim(),
      initialBalance: Number(raw.initialBalance) || 0,
      type: raw.type,
      isActive: raw.isActive,
      representativeId: this.resolveRepresentativeId(raw),
    };
  }

  private toUpdatePayload(raw: {
    name: string;
    type: TreasuryType;
    isActive: boolean;
    representativeId: number | null;
  }): UpdateTreasuryPayload {
    return {
      name: raw.name.trim(),
      type: raw.type,
      isActive: raw.isActive,
      representativeId: this.resolveRepresentativeId(raw),
    };
  }

  /** Only sub-representative treasuries carry a representative id. */
  private resolveRepresentativeId(raw: {
    type: TreasuryType;
    representativeId: number | null;
  }): number | null {
    return raw.type === TreasuryType.SubRepresentative
      ? (raw.representativeId ?? null)
      : null;
  }
}
