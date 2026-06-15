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
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';

import { VouchersService } from '../../services/vouchers.service';
import { CreateVoucherPayload, VoucherDto } from '../../models/voucher.model';
import { RelatedPartyType, VoucherType } from '../../enums/voucher.enums';
import {
  RELATED_PARTY_TYPE_OPTIONS,
  VOUCHER_TYPE_OPTIONS,
} from '../../constants/voucher-labels';

import { TreasuryService } from '../../../treasury/services/treasury.service';
import { LookupItem } from '../../../../core/models/lookup.model';
import { CustomersService } from '../../../customers/services/customers.service';
import { SuppliersService } from '../../../suppliers/services/suppliers.service';

/** A pickable party (client or supplier) for the related-party select. */
interface PartyOption {
  id: number;
  name: string;
}

/**
 * Create-voucher modal (receipt / payment).
 *
 * The `type` and `relatedPartyType` selects are driven by the exact same
 * option tables the list/detail views render from, so wire values always
 * match the display enums. `relatedPartyId` is contextual: clients for a
 * `Customer` party, suppliers for a `Supplier`, and omitted for `Other`.
 */
@Component({
  selector: 'app-voucher-form-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ModalComponent, FormErrorComponent],
  templateUrl: './voucher-form-modal.component.html',
})
export class VoucherFormModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();

  // ── outputs ──
  readonly closed = output<void>();
  readonly saved = output<VoucherDto>();

  // ── deps ──
  private readonly fb = inject(FormBuilder);
  private readonly svc = inject(VouchersService);
  private readonly treasuryService = inject(TreasuryService);
  private readonly customersService = inject(CustomersService);
  private readonly suppliersService = inject(SuppliersService);
  private readonly toast = inject(ToastService);

  // ── option tables (shared with the display) ──
  protected readonly typeOptions = VOUCHER_TYPE_OPTIONS;
  protected readonly partyTypeOptions = RELATED_PARTY_TYPE_OPTIONS;

  // ── template-bound state ──
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly treasuries = signal<LookupItem[]>([]);
  protected readonly clients = signal<PartyOption[]>([]);
  protected readonly suppliers = signal<PartyOption[]>([]);
  protected readonly partyLoading = signal(false);
  /** Mirrors the relatedPartyType control so the party list is reactive. */
  protected readonly partyType = signal<RelatedPartyType>(
    RelatedPartyType.Customer,
  );

  /** Lookup is already active-only + role-scoped server-side. */
  protected readonly activeTreasuries = computed(() => this.treasuries());

  protected readonly needsParty = computed(
    () => this.partyType() !== RelatedPartyType.Other,
  );

  protected readonly partyList = computed<PartyOption[]>(() => {
    switch (this.partyType()) {
      case RelatedPartyType.Customer:
        return this.clients();
      case RelatedPartyType.Supplier:
        return this.suppliers();
      default:
        return [];
    }
  });

  // ── form ──
  protected readonly form = this.fb.nonNullable.group({
    type: [VoucherType.Receipt, [Validators.required]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    treasuryId: [0, [Validators.required, Validators.min(1)]],
    date: [this.todayISO(), [Validators.required]],
    relatedPartyType: [RelatedPartyType.Customer, [Validators.required]],
    relatedPartyId: [0, [Validators.required, Validators.min(1)]],
    notes: [''],
  });

  constructor() {
    effect(
      () => {
        if (!this.open()) return;
        this.serverError.set(null);
        this.submitting.set(false);
        this.partyType.set(RelatedPartyType.Customer);
        this.form.reset({
          type: VoucherType.Receipt,
          amount: 0,
          treasuryId: 0,
          date: this.todayISO(),
          relatedPartyType: RelatedPartyType.Customer,
          relatedPartyId: 0,
          notes: '',
        });
        this.loadTreasuries();
        this.loadParties(RelatedPartyType.Customer);
      },
      { allowSignalWrites: true },
    );
  }

  // ─────────────── template handlers ───────────────

  protected onPartyTypeChange(value: string): void {
    const next = value as RelatedPartyType;
    this.partyType.set(next);
    this.form.controls.relatedPartyId.setValue(0);

    const idCtrl = this.form.controls.relatedPartyId;
    if (next === RelatedPartyType.Other) {
      idCtrl.clearValidators();
    } else {
      idCtrl.setValidators([Validators.required, Validators.min(1)]);
      this.loadParties(next);
    }
    idCtrl.updateValueAndValidity();
  }

  protected onSubmit(): void {
    if (this.submitting()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.serverError.set(null);
    this.submitting.set(true);

    this.svc.create(this.toPayload()).subscribe({
      next: (voucher) => {
        this.submitting.set(false);
        this.toast.success(`تم إنشاء ${voucher.voucherNumber}`);
        this.saved.emit(voucher);
      },
      error: (err: ApiError) => {
        this.submitting.set(false);
        this.serverError.set(err.message || 'تعذّر إنشاء السند');
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

  private loadTreasuries(): void {
    this.treasuryService.lookup().subscribe({
      next: (list) => this.treasuries.set(list ?? []),
      error: () => this.treasuries.set([]),
    });
  }

  /** Lazily fetches the party list for the chosen type (once each). */
  private loadParties(type: RelatedPartyType): void {
    if (type === RelatedPartyType.Customer && this.clients().length === 0) {
      this.partyLoading.set(true);
      this.customersService.listAllClients().subscribe({
        next: (list) => {
          this.clients.set(
            list.map((c) => ({ id: c.id, name: c.fullName })),
          );
          this.partyLoading.set(false);
        },
        error: () => {
          this.clients.set([]);
          this.partyLoading.set(false);
        },
      });
      return;
    }

    if (type === RelatedPartyType.Supplier && this.suppliers().length === 0) {
      this.partyLoading.set(true);
      this.suppliersService.listAll().subscribe({
        next: (list) => {
          this.suppliers.set(
            list.map((s) => ({ id: s.id, name: s.fullName })),
          );
          this.partyLoading.set(false);
        },
        error: () => {
          this.suppliers.set([]);
          this.partyLoading.set(false);
        },
      });
    }
  }

  private toPayload(): CreateVoucherPayload {
    const raw = this.form.getRawValue();
    const isOther = raw.relatedPartyType === RelatedPartyType.Other;
    return {
      type: raw.type,
      amount: Number(raw.amount) || 0,
      treasuryId: Number(raw.treasuryId),
      date: raw.date,
      relatedPartyType: raw.relatedPartyType,
      relatedPartyId: isOther ? null : Number(raw.relatedPartyId) || null,
      notes: (raw.notes ?? '').trim(),
    };
  }

  private todayISO(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
