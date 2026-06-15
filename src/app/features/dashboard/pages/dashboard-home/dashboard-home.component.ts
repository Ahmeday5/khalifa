import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DashboardService } from '../../services/dashboard.service';
import {
  ClientRating,
  DueInstallmentDto,
  HomeSummaryDto,
  ProfitMonthDto,
  TopClientDto,
} from '../../models/dashboard.model';
import { FinancialService } from '../../services/financial.service';
import { FinancialSeparation } from '../../models/financial.model';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { HttpCacheService } from '../../../../core/services/http-cache.service';
import { onInvalidate } from '../../../../core/utils/auto-refresh.util';
import {
  BadgeComponent,
  BadgeType,
} from '../../../../shared/components/badge/badge.component';
import { HasPermissionDirective } from '../../../../shared/directives/has-permission.directive';
import { PERMISSIONS } from '../../../../core/constants/permissions.const';
@Component({
  selector: 'app-dashboard-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CurrencyArPipe,
    BadgeComponent,
    DecimalPipe,
    HasPermissionDirective,
  ],
  templateUrl: './dashboard-home.component.html',
  styleUrl: './dashboard-home.component.scss',
})
export class DashboardHomeComponent implements OnInit {
  private readonly dashService = inject(DashboardService);
  private readonly financialService = inject(FinancialService);
  private readonly cache = inject(HttpCacheService);

  /** Exposed so the template can gate write actions with `*appHasPermission`. */
  protected readonly PERMS = PERMISSIONS;

  // ── live home widgets ──
  protected readonly profitMonths = signal<ProfitMonthDto[]>([]);
  protected readonly topClients = signal<TopClientDto[]>([]);
  protected readonly dueInstallments = signal<DueInstallmentDto[]>([]);

  // ── financial-separation block ──
  protected readonly financial = signal<FinancialSeparation | null>(null);
  protected readonly financialLoading = signal(false);
  protected readonly summary = signal<HomeSummaryDto | null>(null);
  protected readonly summaryLoading = signal(false);

  /**
   * Always includes 0 so the baseline is the zero line.
   * range is at least 1 to prevent division by zero.
   */
  private readonly profitRange = computed(() => {
    const months = this.profitMonths();
    if (!months.length) return { min: 0, max: 1, range: 1 };
    const values = months.map((m) => m.profitAmount);
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const min = Math.min(dataMin, 0);
    const max = Math.max(dataMax, 0);
    const range = max - min || 1;
    return { min, max, range };
  });

  private readonly maxProfit = computed(() => this.profitRange().max);

  /** Last entry in the array — the API orders them oldest-to-newest. */
  protected readonly currentMonth = computed(() => {
    const months = this.profitMonths();
    return months.length ? months[months.length - 1] : null;
  });

  /** Second-to-last entry, for the month-over-month comparison strip. */
  protected readonly previousMonth = computed(() => {
    const months = this.profitMonths();
    return months.length > 1 ? months[months.length - 2] : null;
  });

  protected readonly profitDeltaPct = computed(() => {
    const cur = this.currentMonth();
    const prev = this.previousMonth();
    if (!cur || !prev || !prev.profitAmount) return null;
    return ((cur.profitAmount - prev.profitAmount) / prev.profitAmount) * 100;
  });

  protected readonly profitGridTicks = computed(() => {
    const { min, max } = this.profitRange();
    return [1, 0.75, 0.5, 0.25, 0].map((r) => min + (max - min) * r);
  });

  /** Y position (in SVG viewBox units) of the zero baseline. */
  protected readonly zeroLineY = computed(() => {
    const { min, range } = this.profitRange();
    const innerH = this.CHART_VB_H - this.CHART_PAD_TOP - this.CHART_PAD_BOTTOM;
    const ratio = (0 - min) / range;
    return this.CHART_PAD_TOP + innerH * (1 - ratio);
  });

  /** True when the data contains at least one negative value — drives the zero-line. */
  protected readonly hasNegative = computed(() => this.profitRange().min < 0);

  /* ──────────────────────────────────────────────────────────────
     SVG chart geometry. The viewBox is fixed at 600×200 so the path
     scales to whatever pixel width the SCSS gives the canvas.
     Internal padding keeps the line off the edges of the plot area.
     ────────────────────────────────────────────────────────────── */
  private readonly CHART_VB_W = 600;
  private readonly CHART_VB_H = 200;
  private readonly CHART_PAD_X = 24;
  private readonly CHART_PAD_TOP = 18;
  private readonly CHART_PAD_BOTTOM = 22;

  protected readonly chartViewBox = `0 0 ${this.CHART_VB_W} ${this.CHART_VB_H}`;

  /**
   * Pixel-space points (within the viewBox) for each month — used to draw
   * the line, the area, the dots and to anchor the value labels in HTML
   * (overlaid via percentage coordinates).
   */
  protected readonly chartPoints = computed<
    Array<{
      x: number;
      y: number;
      xPct: number;
      yPct: number;
      month: string;
      value: number;
      formatted: string;
    }>
  >(() => {
    const months = this.profitMonths();
    if (!months.length) return [];
    const { min, range } = this.profitRange();
    const innerW = this.CHART_VB_W - this.CHART_PAD_X * 2;
    const innerH =
      this.CHART_VB_H - this.CHART_PAD_TOP - this.CHART_PAD_BOTTOM;
    const stepX =
      months.length === 1 ? 0 : innerW / (months.length - 1);

    return months.map((m, i) => {
      const x = this.CHART_PAD_X + stepX * i;
      const ratio = (m.profitAmount - min) / range;
      const y = this.CHART_PAD_TOP + innerH * (1 - ratio);
      return {
        x,
        y,
        xPct: (x / this.CHART_VB_W) * 100,
        yPct: (y / this.CHART_VB_H) * 100,
        month: m.month,
        value: m.profitAmount,
        formatted: m.formattedProfit,
      };
    });
  });

  /** Smooth Catmull-Rom-ish curve path through the data points. */
  protected readonly chartLinePath = computed<string>(() => {
    const pts = this.chartPoints();
    if (pts.length === 0) return '';
    if (pts.length === 1) {
      const { x, y } = pts[0];
      return `M ${x} ${y}`;
    }
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? p2;
      // Cardinal-spline control points (tension ≈ 0.2 for a gentle curve).
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
  });

  /** Same curve, closed at the bottom to produce a filled area. */
  protected readonly chartAreaPath = computed<string>(() => {
    const pts = this.chartPoints();
    if (pts.length === 0) return '';
    const line = this.chartLinePath();
    const baseY = this.CHART_VB_H - this.CHART_PAD_BOTTOM;
    const lastX = pts[pts.length - 1].x;
    const firstX = pts[0].x;
    return `${line} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
  });

  readonly totalAssets = computed(() => {
    const f = this.financial();
    if (!f) return 0;
    return (f.treasury ?? 0) + (f.receivables ?? 0) + (f.inventoryValue ?? 0);
  });

  readonly coverageRatio = computed(() => {
    const f = this.financial();
    if (!f || !f.payables) return null;
    return this.totalAssets() / f.payables;
  });

  constructor() {
    onInvalidate(this.cache, 'treasur', () => this.loadFinancial(true));
    onInvalidate(this.cache, 'invoice', () => this.loadFinancial(true));
    onInvalidate(this.cache, 'payment', () => this.loadFinancial(true));
    onInvalidate(this.cache, 'contract', () => this.loadHomeWidgets(true));
    onInvalidate(this.cache, 'client', () => this.loadHomeWidgets(true));
    onInvalidate(this.cache, 'installment', () => this.loadHomeWidgets(true));
    onInvalidate(this.cache, 'payment', () => this.loadHomeWidgets(true));
    onInvalidate(this.cache, 'payment', () => this.loadSummary(true));
    onInvalidate(this.cache, 'contract', () => this.loadSummary(true));
    onInvalidate(this.cache, 'invoice', () => this.loadSummary(true));
    onInvalidate(this.cache, 'client', () => this.loadSummary(true));
  }

  ngOnInit(): void {
    this.loadFinancial(false);
    this.loadHomeWidgets(false);
    this.loadSummary(false);
  }

  private loadSummary(force: boolean): void {
    this.summaryLoading.set(true);
    const stream$ = force
      ? this.dashService.refreshHomeSummary()
      : this.dashService.homeSummary();

    stream$.subscribe({
      next: (res) => {
        this.summary.set(res);
        this.summaryLoading.set(false);
      },
      error: () => {
        this.summaryLoading.set(false);
      },
    });
  }

  private loadFinancial(force: boolean): void {
    this.financialLoading.set(true);
    const stream$ = force
      ? this.financialService.refreshSeparation()
      : this.financialService.separation();
    stream$.subscribe({
      next: (f) => {
        this.financial.set(f);
        this.financialLoading.set(false);
      },
      error: () => {
        this.financialLoading.set(false);
      },
    });
  }

  private loadHomeWidgets(force: boolean): void {
    const profits$ = force
      ? this.dashService.refreshProfitsLast6Months()
      : this.dashService.profitsLast6Months();
    const clients$ = force
      ? this.dashService.refreshTopClientsThisMonth()
      : this.dashService.topClientsThisMonth();
    const installments$ = force
      ? this.dashService.refreshInstallmentsDueThisWeek()
      : this.dashService.installmentsDueThisWeek();

    profits$.subscribe({
      next: (rows) => this.profitMonths.set(rows),
      error: () => {},
    });
    clients$.subscribe({
      next: (rows) => this.topClients.set(rows),
      error: () => {},
    });
    installments$.subscribe({
      next: (rows) => this.dueInstallments.set(rows),
      error: () => {},
    });
  }

  protected refreshFinancial(): void {
    this.loadFinancial(true);
  }

  /** The last month returned by the API is "this month" — we highlight it differently. */
  protected isCurrentMonth(index: number): boolean {
    return index === this.profitMonths().length - 1;
  }

  protected ratingBadge(rating: ClientRating): BadgeType {
    switch ((rating ?? '').toUpperCase()) {
      case 'A':
        return 'ok';
      case 'B':
        return 'warn';
      case 'C':
      case 'D':
        return 'bad';
      default:
        return 'info';
    }
  }

  protected formatProfitTick(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}م`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
    return String(Math.round(n));
  }

  protected statusBadge(status: string): BadgeType {
    const s = (status ?? '').trim();
    if (s.includes('متأخر')) return 'bad';
    if (s.includes('قريب')) return 'warn';
    if (s.includes('منتظم')) return 'ok';
    return 'info';
  }
}
