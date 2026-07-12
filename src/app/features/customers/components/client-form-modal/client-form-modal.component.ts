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
import { CustomersService } from '../../services/customers.service';
import { AreaSelectComponent } from '../../../areas/components/area-select/area-select.component';
import {
  CreateClientPayload,
  CreatedClient,
  DashboardClient,
  UpdateClientPayload,
} from '../../models/dashboard-client.model';

/** Egyptian mobile: 010 / 011 / 012 / 015 + 8 digits. */
const EG_PHONE = /^01[0125][0-9]{8}$/;
/** Egyptian national id: exactly 14 digits. */
const EG_NATIONAL_ID = /^[0-9]{14}$/;

@Component({
  selector: 'app-client-form-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ModalComponent,
    FormErrorComponent,
    AreaSelectComponent,
  ],
  templateUrl: './client-form-modal.component.html',
})
export class ClientFormModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();
  /** When set, the modal switches to edit mode for that client. */
  readonly client = input<DashboardClient | null>(null);

  // ── outputs ──
  readonly closed = output<void>();
  readonly saved = output<CreatedClient>();

  // ── deps ──
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(CustomersService);
  private readonly toast = inject(ToastService);

  // ── template-bound state ──
  protected readonly isEdit = computed(() => this.client() !== null);
  protected readonly submitting = signal(false);
  protected readonly loadingDetail = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly sameAsPhone = signal(true);

  // ── form ──
  protected readonly form = this.fb.nonNullable.group({
    fullName:       ['', [Validators.required, Validators.minLength(3)]],
    nationalId:     ['', [Validators.pattern(EG_NATIONAL_ID)]],
    areaId:         this.fb.control<number | null>(null, [Validators.required]),
    phoneNumber:    ['', [Validators.required, Validators.pattern(EG_PHONE)]],
    whatsappNumber: ['', [Validators.required, Validators.pattern(EG_PHONE)]],
    // ── extended profile ──
    clientCode:     [''],
    region:         [''],
    occupation:     [''],
    building:       [''],
    floor:          [''],
    department:     [''],
  });

  constructor() {
    effect(
      () => {
        if (!this.open()) return;
        this.serverError.set(null);
        this.submitting.set(false);

        const target = this.client();
        if (target) {
          this.enterEditMode(target);
        } else {
          this.enterCreateMode();
        }
      },
      { allowSignalWrites: true },
    );
  }

  // ─────────────── template handlers ───────────────

  protected onSameAsPhoneChange(checked: boolean): void {
    this.sameAsPhone.set(checked);
    this.applyWhatsappSync(checked);
  }

  protected onPhoneInput(value: string): void {
    if (this.sameAsPhone()) {
      this.form.controls.whatsappNumber.setValue(value);
    }
  }

  protected async pickContact(): Promise<void> {
    if (!('contacts' in navigator)) {
      this.toast.error('هذه الميزة تتطلب كروم على أندرويد مع HTTPS');
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contacts = await (navigator as any).contacts.select(['tel'], { multiple: false });
      const raw: string = contacts?.[0]?.tel?.[0] ?? '';
      if (!raw) return;
      const cleaned = raw.replace(/[\s\-().]/g, '');
      this.form.controls.phoneNumber.setValue(cleaned);
      this.form.controls.phoneNumber.markAsDirty();
      this.form.controls.phoneNumber.markAsTouched();
      this.onPhoneInput(cleaned);
    } catch {
      // User cancelled
    }
  }

  protected onSubmit(): void {
    if (this.submitting() || this.loadingDetail()) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.serverError.set(null);
    this.submitting.set(true);

    const target = this.client();
    const request$ = target
      ? this.service.updateClient(target.id, this.toUpdatePayload())
      : this.service.createClient(this.toCreatePayload());

    request$.subscribe({
      next: (client) => {
        this.submitting.set(false);
        this.toast.success(
          target
            ? `تم تعديل بيانات العميل "${client.fullName}" بنجاح`
            : `تم إضافة العميل "${client.fullName}" بنجاح`,
        );
        this.saved.emit(client);
      },
      error: (err: ApiError) => {
        this.submitting.set(false);
        this.serverError.set(
          err.message ||
            (target ? 'تعذّر تعديل بيانات العميل' : 'تعذّر إضافة العميل'),
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

  /** Create mode — blank form, whatsapp synced to phone. */
  private enterCreateMode(): void {
    this.loadingDetail.set(false);
    this.sameAsPhone.set(true);
    this.form.reset({
      fullName: '',
      nationalId: '',
      areaId: null,
      phoneNumber: '',
      whatsappNumber: '',
      clientCode: '',
      region: '',
      occupation: '',
      building: '',
      floor: '',
      department: '',
    });
    this.applyWhatsappSync(true);
  }

  /**
   * Edit mode — pre-fills with what the list row already carries, then pulls
   * the full record (nationalId / whatsapp / extended) from the server.
   */
  private enterEditMode(row: DashboardClient): void {
    this.sameAsPhone.set(false);
    this.form.controls.whatsappNumber.enable({ emitEvent: false });
    this.form.reset({
      fullName: row.fullName,
      nationalId: '',
      areaId: row.areaId,
      phoneNumber: row.phoneNumber,
      whatsappNumber: '',
      clientCode: '',
      region: '',
      occupation: '',
      building: '',
      floor: '',
      department: '',
    });

    this.loadingDetail.set(true);
    this.service.getClient(row.id).subscribe({
      next: (full) => {
        this.loadingDetail.set(false);
        this.form.patchValue({
          fullName:       full.fullName,
          nationalId:     full.nationalId ?? '',
          areaId:         full.areaId,
          phoneNumber:    full.phoneNumber,
          whatsappNumber: full.whatsappNumber ?? '',
          clientCode:     full.clientCode ?? '',
          region:         full.region ?? '',
          occupation:     full.occupation ?? '',
          building:       full.building ?? '',
          floor:          full.floor ?? '',
          department:     full.department ?? '',
        });
        const synced =
          !!full.whatsappNumber && full.whatsappNumber === full.phoneNumber;
        this.sameAsPhone.set(synced);
        this.applyWhatsappSync(synced);
      },
      error: () => {
        this.loadingDetail.set(false);
      },
    });
  }

  /**
   * When "same as phone" is on, the whatsapp number mirrors the phone and
   * its own field is disabled (kept valid by copying the value across).
   */
  private applyWhatsappSync(sync: boolean): void {
    const wa = this.form.controls.whatsappNumber;
    if (sync) {
      wa.setValue(this.form.controls.phoneNumber.value);
      wa.disable({ emitEvent: false });
    } else {
      wa.enable({ emitEvent: false });
    }
  }

  private toCreatePayload(): CreateClientPayload {
    const raw = this.form.getRawValue();
    const payload: CreateClientPayload = {
      fullName:       raw.fullName.trim(),
      nationalId:     raw.nationalId.trim(),
      areaId:         raw.areaId!,
      phoneNumber:    raw.phoneNumber.trim(),
      whatsappNumber: this.resolvedWhatsapp(),
    };
    this.applyExtended(payload, raw);
    return payload;
  }

  private toUpdatePayload(): UpdateClientPayload {
    const raw = this.form.getRawValue();
    const payload: UpdateClientPayload = {
      fullName:       raw.fullName.trim(),
      nationalId:     raw.nationalId.trim(),
      areaId:         raw.areaId!,
      phoneNumber:    raw.phoneNumber.trim(),
      whatsappNumber: this.resolvedWhatsapp(),
    };
    this.applyExtended(payload, raw);
    return payload;
  }

  private applyExtended(
    target: CreateClientPayload | UpdateClientPayload,
    raw: ReturnType<typeof this.form.getRawValue>,
  ): void {
    target.clientCode  = raw.clientCode.trim();
    target.region      = raw.region.trim();
    target.occupation  = raw.occupation.trim();
    target.building    = raw.building.trim();
    target.floor       = raw.floor.trim();
    target.department  = raw.department.trim();
  }

  private resolvedWhatsapp(): string {
    const raw = this.form.getRawValue();
    return (this.sameAsPhone() ? raw.phoneNumber : raw.whatsappNumber).trim();
  }
}
