import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { CustomersService } from '../../services/customers.service';
import {
  CreatedClient,
  DashboardClient,
  DashboardClientRating,
  DashboardClientStatus,
} from '../../models/dashboard-client.model';
import {
  BadgeComponent,
  BadgeType,
} from '../../../../shared/components/badge/badge.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { DateArPipe } from '../../../../shared/pipes/date-ar.pipe';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';
import { HttpCacheService } from '../../../../core/services/http-cache.service';
import { onInvalidate } from '../../../../core/utils/auto-refresh.util';
import { HasPermissionDirective } from '../../../../shared/directives/has-permission.directive';
import { ClientFormModalComponent } from '../../components/client-form-modal/client-form-modal.component';
import { DirectContractModalComponent } from '../../components/direct-contract-modal/direct-contract-modal.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { PERMISSIONS } from '../../../../core/constants/permissions.const';
import { PrintService } from '../../../../core/services/print.service';
import { map } from 'rxjs/operators';
import { fetchAllPages } from '../../../../core/utils/api-list.util';

const DEFAULT_PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

@Component({
  selector: 'app-customers-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BadgeComponent,
    PaginationComponent,
    CurrencyArPipe,
    DateArPipe,
    HasPermissionDirective,
    ClientFormModalComponent,
    DirectContractModalComponent,
    ModalComponent,
  ],
  templateUrl: './customers-list.component.html',
  styleUrl: './customers-list.component.scss',
})
export class CustomersListComponent {
  private readonly service = inject(CustomersService);
  private readonly toast = inject(ToastService);
  private readonly cache = inject(HttpCacheService);
  private readonly printer = inject(PrintService);

  protected readonly isPrinting = signal(false);

  /** Exposed so the template can gate write actions with `*appHasPermission`. */
  protected readonly PERMS = PERMISSIONS;

  // ── data ──
  protected readonly clients = signal<DashboardClient[]>([]);
  protected readonly overdueClientsCount = signal(0);
  protected readonly loading = signal(false);

  // ── filters ──
  protected readonly searchTerm = signal('');
  protected readonly onlyOverdue = signal(false);
  protected readonly pageIndex = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);

  // ── server pagination meta ──
  protected readonly count = signal(0);
  protected readonly totalPages = signal(0);

  // ── view client modal ──
  protected readonly showViewClient = signal(false);
  protected readonly viewClientData = signal<CreatedClient | null>(null);
  protected readonly loadingViewClient = signal(false);

  // ── modal ──
  protected readonly showForm = signal(false);
  /** Non-null when the form modal is open in edit mode. */
  protected readonly editTarget = signal<DashboardClient | null>(null);

  // ── direct contract modal ──
  protected readonly showDirectContract = signal(false);

  // ── derived ──
  protected readonly hasFilters = computed(
    () => this.searchTerm().length > 0 || this.onlyOverdue(),
  );

  // Single observed tuple; any change triggers a debounced refetch.
  private readonly fetchTrigger = computed(() => ({
    search: this.searchTerm().trim(),
    onlyOverdue: this.onlyOverdue(),
    pageIndex: this.pageIndex(),
    pageSize: this.pageSize(),
  }));

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const trigger = this.fetchTrigger();
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(
        () => this.fetch(trigger),
        SEARCH_DEBOUNCE_MS,
      );
    });

    // Refetch whenever any client-related cache key is invalidated
    // (e.g. another tab recorded a payment).
    onInvalidate(this.cache, 'client', () => this.refresh());
  }

  // ─────────── data loaders ───────────

  private fetch(
    trigger: {
      search: string;
      onlyOverdue: boolean;
      pageIndex: number;
      pageSize: number;
    },
    force = false,
  ): void {
    this.loading.set(true);
    const query = {
      search: trigger.search,
      clientCode: trigger.search,
      onlyOverdue: trigger.onlyOverdue,
      pageIndex: trigger.pageIndex,
      pageSize: trigger.pageSize,
    };
    const stream$ = force
      ? this.service.refreshDashboard(query)
      : this.service.listDashboard(query);

    stream$.subscribe({
      next: (res) => {
        const page = res?.clients;
        this.clients.set(page?.data ?? []);
        this.count.set(page?.count ?? 0);
        this.totalPages.set(page?.totalPages ?? 0);
        this.overdueClientsCount.set(res?.overdueClientsCount ?? 0);
        this.loading.set(false);
      },
      error: (err: ApiError) => {
        this.clients.set([]);
        this.count.set(0);
        this.totalPages.set(0);
        this.overdueClientsCount.set(0);
        this.loading.set(false);
        this.toast.error(err?.message || 'تعذّر تحميل العملاء');
      },
    });
  }

  protected refresh(): void {
    this.fetch(this.fetchTrigger(), true);
  }

  /**
   * Exports every client matching the active search/overdue filter — paging
   * through the dashboard endpoint server-side so the printed list isn't
   * truncated to the current visible page.
   */
  protected printClients(): void {
    if (this.isPrinting()) return;
    this.isPrinting.set(true);
    const search = this.searchTerm().trim();
    const onlyOverdue = this.onlyOverdue();

    fetchAllPages<DashboardClient>((pageIndex, pageSize) =>
      this.service
        .refreshDashboard({ search, clientCode: search, onlyOverdue, pageIndex, pageSize })
        .pipe(map((r) => r.clients)),
    ).subscribe({
      next: (rows) => {
        this.isPrinting.set(false);
        const meta: Array<{ label: string; value: string }> = [];
        if (search) meta.push({ label: 'بحث', value: search });
        if (onlyOverdue) meta.push({ label: 'الفلتر', value: 'المتأخرون فقط' });

        this.printer.print<DashboardClient>({
          title: 'قائمة العملاء',
          subtitle: 'كشف عملاء النظام والتزاماتهم',
          meta,
          orientation: 'landscape',
          columns: [
            { key: 'id',                  header: '#',              align: 'center', width: '46px' },
            { key: 'fullName',            header: 'الاسم',          align: 'start',  bold: true },
            { key: 'phoneNumber',         header: 'الهاتف',         align: 'start' },
            { key: 'goods',               header: 'المشتريات',      align: 'start' },
            { key: 'installmentProgress', header: 'تقدّم السداد',   align: 'center' },
            { key: 'installmentAmount',   header: 'قيمة القسط',     align: 'end',    format: 'currency' },
            {
              key: 'paymentFrequency',
              header: 'الدورية',
              align: 'center',
              format: (v) => this.paymentFrequencyLabel(v as string | null),
            },
            { key: 'totalContractAmount', header: 'إجمالي العقد',  align: 'end', format: 'currency' },
            { key: 'remainingAmount',     header: 'المتبقي',        align: 'end', format: 'currency', bold: true },
            { key: 'rating',              header: 'التقييم',        align: 'center' },
            {
              key: 'status',
              header: 'الحالة',
              align: 'center',
              format: (v) => this.statusLabel(v as DashboardClientStatus),
            },
          ],
          rows,
        });
      },
      error: () => {
        this.isPrinting.set(false);
        this.toast.error('تعذر تجهيز ملف الطباعة');
      },
    });
  }

  // ─────────── filter handlers ───────────

  protected onSearch(value: string): void {
    this.searchTerm.set(value);
    if (this.pageIndex() !== 1) this.pageIndex.set(1);
  }

  protected clearSearch(): void {
    if (!this.searchTerm()) return;
    this.searchTerm.set('');
    this.pageIndex.set(1);
  }

  protected toggleOnlyOverdue(value: boolean): void {
    this.onlyOverdue.set(value);
    if (this.pageIndex() !== 1) this.pageIndex.set(1);
  }

  protected clearAllFilters(): void {
    this.searchTerm.set('');
    this.onlyOverdue.set(false);
    this.pageIndex.set(1);
  }

  protected onPageChange(page: number): void {
    this.pageIndex.set(page);
  }

  protected onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.pageIndex.set(1);
  }

  // ─────────── view client ───────────

  protected openViewClient(id: number): void {
    this.showViewClient.set(true);
    this.viewClientData.set(null);
    this.loadingViewClient.set(true);
    this.service.getClient(id).subscribe({
      next: (c) => {
        this.viewClientData.set(c);
        this.loadingViewClient.set(false);
      },
      error: () => {
        this.loadingViewClient.set(false);
        this.toast.error('تعذّر تحميل بيانات العميل');
      },
    });
  }

  protected closeViewClient(): void {
    this.showViewClient.set(false);
  }

  protected printClientCard(): void {
    const c = this.viewClientData();
    if (!c) return;

    const fields: Array<{ label: string; value: string }> = [
      { label: '#',                  value: String(c.id) },
      { label: 'الاسم الكامل',       value: c.fullName },
      { label: 'الهاتف',             value: c.phoneNumber },
      { label: 'واتساب',             value: c.whatsappNumber },
      { label: 'البريد الإلكتروني',  value: c.email || '—' },
      { label: 'الرقم القومي',       value: c.nationalId || '—' },
      { label: 'العنوان',            value: c.address || '—' },
    ];
    if (c.clientCode)  fields.push({ label: 'كود العميل',     value: c.clientCode });
    if (c.region)      fields.push({ label: 'المنطقة / الحي', value: c.region });
    if (c.occupation)  fields.push({ label: 'المهنة',          value: c.occupation });
    if (c.building)    fields.push({ label: 'المبنى',          value: c.building });
    if (c.floor)       fields.push({ label: 'الدور',           value: c.floor });
    if (c.department)  fields.push({ label: 'الشقة / القسم',   value: c.department });

    this.printer.print<{ label: string; value: string }>({
      title: `بيانات العميل — ${c.fullName}`,
      subtitle: c.clientCode ? `كود: ${c.clientCode}` : undefined,
      orientation: 'landscape',
      columns: [
        { key: 'label', header: 'البيان',  align: 'start', bold: true, width: '180px' },
        { key: 'value', header: 'القيمة',  align: 'start' },
      ],
      rows: fields,
    });
  }

  // ─────────── modal ───────────

  protected openCreate(): void {
    this.editTarget.set(null);
    this.showForm.set(true);
  }

  protected openEdit(client: DashboardClient): void {
    this.editTarget.set(client);
    this.showForm.set(true);
  }

  protected closeForm(): void {
    this.showForm.set(false);
    this.editTarget.set(null);
  }

  protected onSaved(): void {
    const wasEdit = this.editTarget() !== null;
    this.closeForm();
    if (!wasEdit && this.pageIndex() !== 1) this.pageIndex.set(1);
    else this.refresh();
  }

  protected openDirectContract(): void {
    this.showDirectContract.set(true);
  }

  protected closeDirectContract(): void {
    this.showDirectContract.set(false);
  }

  protected onDirectContractCreated(): void {
    this.showDirectContract.set(false);
    // Jump to page 1 so the new contract's client is visible
    if (this.pageIndex() !== 1) this.pageIndex.set(1);
    else this.refresh();
  }

  // ─────────── view helpers ───────────

  protected statusLabel(status: DashboardClientStatus): string {
    const map: Record<DashboardClientStatus, string> = {
      New: 'جديد',
      OnTrack: 'منتظم',
      OneOverdue: 'متأخر قسط',
      MultipleOverdue: 'متأخر',
    };
    return map[status] ?? status;
  }

  protected statusBadge(status: DashboardClientStatus): BadgeType {
    const map: Record<DashboardClientStatus, BadgeType> = {
      New: 'info',
      OnTrack: 'ok',
      OneOverdue: 'warn',
      MultipleOverdue: 'bad',
    };
    return map[status] ?? 'info';
  }

  protected ratingLabel(rating: DashboardClientRating): string {
    const map: Record<DashboardClientRating, string> = {
      A: 'ممتاز',
      B: 'جيد',
      C: 'متوسط',
      D: 'ضعيف',
    };
    return map[rating];
  }

  protected paymentFrequencyLabel(freq: string | null): string {
    if (!freq) return '—';
    const map: Record<string, string> = {
      Monthly: 'شهري',
      Weekly: 'أسبوعي',
      Quarterly: 'ربع سنوي',
      SemiAnnual: 'نصف سنوي',
      SemiAnnually: 'نصف سنوي',
      Annual: 'سنوي',
      Annually: 'سنوي',
    };
    return map[freq] ?? freq;
  }

  /** Parse "3/12" → 25 (% complete). Returns 0 when shape is unexpected. */
  protected progressPercent(progress: string | null): number {
    if (!progress) return 0;
    const [paid, total] = progress.split('/').map((n) => Number(n));
    if (!Number.isFinite(paid) || !Number.isFinite(total) || total <= 0)
      return 0;
    return Math.min(100, Math.round((paid / total) * 100));
  }

  protected progressColor(status: DashboardClientStatus): string {
    const map: Record<DashboardClientStatus, string> = {
      New: 'var(--bl)',
      OnTrack: 'var(--gr)',
      OneOverdue: 'var(--am)',
      MultipleOverdue: 'var(--re)',
    };
    return map[status] ?? 'var(--bl)';
  }

  protected openWhatsApp(phone: string | null): void {
    if (!phone) {
      this.toast.error('رقم الهاتف غير متوفر');
      return;
    }

    // remove spaces, dashes, parentheses...etc
    let normalized = phone.replace(/\D/g, '');

    // Convert Egyptian local format to international
    // 01012345678 -> 201012345678
    if (normalized.startsWith('0')) {
      normalized = `2${normalized}`;
    }

    // sanity check
    if (normalized.length < 11) {
      this.toast.error('رقم الهاتف غير صالح');
      return;
    }

    const url = `https://wa.me/${normalized}`;

    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
