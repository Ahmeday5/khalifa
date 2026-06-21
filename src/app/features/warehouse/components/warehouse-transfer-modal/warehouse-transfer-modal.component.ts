import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { forkJoin, finalize, of, catchError } from 'rxjs';

import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { LookupItem } from '../../../../core/models/lookup.model';
import { DateArPipe } from '../../../../shared/pipes/date-ar.pipe';

import { WarehouseService } from '../../services/warehouse.service';
import { ProductsService } from '../../../products/services/products.service';
import {
  CreateWarehouseTransferResponse,
  WarehouseTransferDetail,
  WarehouseTransferItemResult,
} from '../../models/warehouse.model';

export type TransferModalMode = 'create' | 'view';

@Component({
  selector: 'app-warehouse-transfer-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ModalComponent,
    FormErrorComponent,
    SearchableSelectComponent,
    LoaderComponent,
    DateArPipe,
  ],
  templateUrl: './warehouse-transfer-modal.component.html',
})
export class WarehouseTransferModalComponent implements OnInit {
  // ── inputs ──
  readonly open = input.required<boolean>();
  readonly mode = input<TransferModalMode>('create');
  /** When mode === 'view', pass the transfer id to load. */
  readonly viewTransferId = input<number | null>(null);

  // ── outputs ──
  readonly closed = output<void>();
  readonly created = output<CreateWarehouseTransferResponse>();

  // ── deps ──
  private readonly fb = inject(FormBuilder);
  private readonly warehouseService = inject(WarehouseService);
  private readonly productsService = inject(ProductsService);
  private readonly toast = inject(ToastService);

  // ── UI state ──
  protected readonly loadingLookups = signal(false);
  protected readonly loadingDetail = signal(false);
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  // ── lookup data ──
  protected readonly warehouses = signal<LookupItem[]>([]);
  protected readonly products = signal<LookupItem[]>([]);

  // ── view mode detail ──
  protected readonly transferDetail = signal<WarehouseTransferDetail | null>(null);

  // ── derived options ──
  protected readonly warehouseOptions = computed<SearchableSelectOption[]>(() =>
    this.warehouses().map((w) => ({ value: w.id, label: w.name })),
  );
  protected readonly productOptions = computed<SearchableSelectOption[]>(() =>
    this.products().map((p) => ({ value: p.id, label: p.name })),
  );

  protected readonly isCreate = computed(() => this.mode() === 'create');

  // ── form ──
  protected readonly form = this.fb.nonNullable.group({
    fromWarehouseId: [null as number | null, [Validators.required]],
    toWarehouseId: [null as number | null, [Validators.required]],
    transferDate: [this.todayStr(), [Validators.required]],
    notes: [''],
    items: this.fb.array([this.createItemGroup()]),
  });

  get itemsArray(): FormArray {
    return this.form.get('items') as FormArray;
  }

  get itemGroups(): FormGroup[] {
    return this.itemsArray.controls as FormGroup[];
  }

  constructor() {
    effect(
      () => {
        if (!this.open()) return;
        this.serverError.set(null);
        this.submitting.set(false);
        this.transferDetail.set(null);

        if (this.mode() === 'view') {
          this.loadViewDetail();
        }
      },
      { allowSignalWrites: true },
    );
  }

  ngOnInit(): void {
    this.loadLookups();
  }

  // ─────────── data loaders ───────────

  private loadLookups(): void {
    this.loadingLookups.set(true);
    forkJoin({
      warehouses: this.warehouseService.lookup().pipe(catchError(() => of([] as LookupItem[]))),
      products: this.productsService.lookup().pipe(catchError(() => of([] as LookupItem[]))),
    })
      .pipe(finalize(() => this.loadingLookups.set(false)))
      .subscribe({
        next: (res) => {
          this.warehouses.set(res.warehouses);
          this.products.set(res.products);
        },
      });
  }

  private loadViewDetail(): void {
    const id = this.viewTransferId();
    if (!id) return;
    this.loadingDetail.set(true);
    this.warehouseService
      .getTransfer(id)
      .pipe(finalize(() => this.loadingDetail.set(false)))
      .subscribe({
        next: (detail) => this.transferDetail.set(detail),
        error: () => this.toast.error('تعذّر تحميل تفاصيل التحويل'),
      });
  }

  // ─────────── items management ───────────

  private createItemGroup(defaults?: { productId?: number; quantity?: number }): FormGroup {
    return this.fb.group({
      productId: [defaults?.productId ?? (null as number | null), [Validators.required]],
      quantity: [defaults?.quantity ?? 1, [Validators.required, Validators.min(1)]],
    });
  }

  protected addItem(): void {
    this.itemsArray.push(this.createItemGroup());
  }

  protected removeItem(index: number): void {
    if (this.itemsArray.length > 1) {
      this.itemsArray.removeAt(index);
    }
  }

  protected getItemControl(groupIndex: number, field: string): AbstractControl | null {
    return this.itemsArray.at(groupIndex)?.get(field) ?? null;
  }

  protected isItemInvalid(groupIndex: number, field: string): boolean {
    const ctrl = this.getItemControl(groupIndex, field);
    return !!ctrl && ctrl.invalid && (ctrl.dirty || ctrl.touched);
  }

  // ─────────── validation guard ───────────

  protected get sameWarehouseError(): boolean {
    const from = this.form.get('fromWarehouseId')?.value;
    const to = this.form.get('toWarehouseId')?.value;
    return !!(from && to && from === to);
  }

  // ─────────── submit ───────────

  protected submit(): void {
    if (this.submitting()) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.sameWarehouseError) {
      this.toast.error('المخزن المصدر والمخزن الوجهة يجب أن يكونا مختلفَين');
      return;
    }

    const raw = this.form.getRawValue();

    const validItems = raw.items.filter(
      (i) => i['productId'] && Number(i['quantity']) >= 1,
    );
    if (validItems.length === 0) {
      this.toast.error('أضف منتجًا واحدًا على الأقل للتحويل');
      return;
    }

    this.serverError.set(null);
    this.submitting.set(true);

    this.warehouseService
      .createTransfer({
        fromWarehouseId: Number(raw.fromWarehouseId),
        toWarehouseId: Number(raw.toWarehouseId),
        transferDate: new Date(raw.transferDate).toISOString(),
        notes: raw.notes?.trim() || undefined,
        items: validItems.map((i) => ({
          productId: Number(i['productId']),
          quantity: Number(i['quantity']),
        })),
      })
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: (res) => {
          this.toast.success(`تم التحويل بنجاح — رقم التحويل: ${res.transferId}`);
          this.resetForm();
          this.created.emit(res);
        },
        error: (err: ApiError) => {
          this.serverError.set(apiErrorToMessage(err, 'فشل في إتمام التحويل'));
        },
      });
  }

  protected close(): void {
    if (this.submitting()) return;
    this.resetForm();
    this.closed.emit();
  }

  // ─────────── helpers ───────────

  private resetForm(): void {
    this.itemsArray.clear({ emitEvent: false });
    this.itemsArray.push(this.createItemGroup(), { emitEvent: false });
    this.form.reset({
      fromWarehouseId: null,
      toWarehouseId: null,
      transferDate: this.todayStr(),
      notes: '',
    });
  }

  protected isInvalid(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!ctrl && ctrl.invalid && (ctrl.dirty || ctrl.touched);
  }

  protected warehouseName(id: number | null): string {
    if (!id) return '—';
    return this.warehouses().find((w) => w.id === id)?.name ?? String(id);
  }

  protected productName(id: number): string {
    return this.products().find((p) => p.id === id)?.name ?? `#${id}`;
  }

  protected itemResultTrack(_: number, item: WarehouseTransferItemResult): number {
    return item.productId;
  }

  private todayStr(): string {
    return new Date().toISOString().split('T')[0];
  }
}
