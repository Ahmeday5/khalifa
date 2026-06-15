import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';
import { WarehouseService } from '../../../warehouse/services/warehouse.service';
import { TreasuryService } from '../../../treasury/services/treasury.service';
import { LookupItem } from '../../../../core/models/lookup.model';
import {
  ClientOrder,
  ConvertToContractPayload,
} from '../../models/catalog.model';
import { CatalogService } from '../../services/catalog.service';
import { RepsService } from '../../../reps/services/reps.service';

@Component({
  selector: 'app-convert-to-contract-modal',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    ModalComponent,
    FormErrorComponent,
    CurrencyArPipe,
  ],
  templateUrl: './convert-to-contract-modal.component.html',
  styleUrl: './convert-to-contract-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConvertToContractModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();
  readonly order = input<ClientOrder | null>(null);

  // ── outputs ──
  readonly closed = output<void>();
  readonly converted = output<ClientOrder>();

  // ── deps ──
  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly warehouseService = inject(WarehouseService);
  private readonly treasuryService = inject(TreasuryService);
  private readonly toast = inject(ToastService);
  private readonly repService = inject(RepsService);

  // ── reactive state ──
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly warehouses = signal<LookupItem[]>([]);
  protected readonly treasuries = signal<LookupItem[]>([]);
  protected readonly loadingRefs = signal(false);
  // ── data ──
  protected readonly reps = signal<LookupItem[]>([]);

  // Lookups are already active-only + role-scoped server-side.
  protected readonly activeWarehouses = computed(() => this.warehouses());
  protected readonly activeTreasuries = computed(() => this.treasuries());

  protected readonly title = 'تحويل الطلب إلى عقد';

  // ── form ──
  protected readonly form = this.fb.nonNullable.group({
    warehouseId: [0, [Validators.required, Validators.min(1)]],
    treasuryId: [0, [Validators.required, Validators.min(1)]],
    representativeId: [0],
    dateOfSale: ['', [Validators.required]],
    firstInstallmentDate: ['', [Validators.required]],
    notes: [''],
  });

  constructor() {
    effect(
      () => {
        if (!this.open()) return;

        this.serverError.set(null);
        this.submitting.set(false);
        this.resetFormDefaults();
        this.loadRefsIfNeeded();
      },
      { allowSignalWrites: true },
    );
  }

  // ─────────────── public template handlers ───────────────

  protected onSubmit(): void {
    if (this.submitting()) return;

    const order = this.order();
    if (!order) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const payload: ConvertToContractPayload = {
      warehouseId: Number(raw.warehouseId),
      treasuryId: Number(raw.treasuryId),
      representativeId: raw.representativeId
        ? Number(raw.representativeId)
        : undefined,
      dateOfSale: raw.dateOfSale,
      firstInstallmentDate: raw.firstInstallmentDate,
      notes: raw.notes?.trim() ?? '',
    };

    this.serverError.set(null);
    this.submitting.set(true);

    this.catalogService
      .convertClientOrderToContract(order.id, payload)
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.toast.success(`تم تحويل طلب ${order.clientName} إلى عقد بنجاح`);
          this.converted.emit(order);
        },
        error: (err: ApiError) => {
          this.submitting.set(false);
          this.serverError.set(
            err.message || 'حدث خطأ أثناء تحويل الطلب — حاول مرة أخرى',
          );
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

  private resetFormDefaults(): void {
    const today = this.toDateInput(new Date());
    const inOneMonth = this.toDateInput(this.addMonths(new Date(), 1));
    this.form.reset({
      warehouseId: 0,
      treasuryId: 0,
      representativeId: 0,
      dateOfSale: today,
      firstInstallmentDate: inOneMonth,
      notes: '',
    });
  }

  private loadRefsIfNeeded(): void {
    if (this.warehouses().length > 0 && this.treasuries().length > 0) return;

    this.loadingRefs.set(true);
    this.warehouseService.lookup().subscribe({
      next: (list) => this.warehouses.set(list ?? []),
      error: () => this.warehouses.set([]),
    });
    this.treasuryService.lookup().subscribe({
      next: (list) => {
        this.treasuries.set(list ?? []);
        this.loadingRefs.set(false);
      },
      error: () => {
        this.treasuries.set([]);
        this.loadingRefs.set(false);
      },
    });
    this.repService.lookup().subscribe({
      next: (list) => {
        this.reps.set(list ?? []);
        this.loadingRefs.set(false);
      },
      error: () => {
        this.reps.set([]);
        this.loadingRefs.set(false);
      },
    });
  }

  private toDateInput(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  private addMonths(d: Date, months: number): Date {
    const next = new Date(d);
    next.setMonth(next.getMonth() + months);
    return next;
  }
}
