import { Injectable } from '@angular/core';

/** رقم التواصل مع الشركة — ثابت في كل الإيصالات */
const COMPANY_PHONE = '01129912187';

export interface ContractSlipData {
  contractId:          number;
  dateOfSale:          string;
  // Client
  clientName:          string;
  clientPhone:         string;
  clientAddress?:      string | null;
  clientRegion?:       string | null;
  clientOccupation?:   string | null;
  // Representative
  repName?:            string | null;
  repPhone?:           string | null;
  // Products (may be multiple)
  productLines:        { name: string; quantity: number }[];
  // Financial
  totalAmount:         number;
  downPayment:         number;
  installmentAmount:   number;
  installmentsCount:   number;
  firstInstallmentDate: string;
  paymentFrequency:    string;
  notes?:              string | null;
}

export interface InstallmentSlipRow {
  sequence: number;
  dueDate:  string;
  amount:   number;
}

/**
 * Generates one landscape A5 voucher per installment — exact replica of the
 * physical Khalifa receipt. Uses a hidden iframe so print styles are fully
 * isolated from the dashboard chrome.
 */
@Injectable({ providedIn: 'root' })
export class ContractSlipsPrintService {

  printSlips(data: ContractSlipData): void {
    const schedule = this.buildSchedule(data);
    const html     = this.buildDocument(data, schedule);
    this.renderAndPrint(html);
  }

  // ─── also accept raw API schedule (from /details endpoint) ───────────────

  printSlipsWithSchedule(
    data:     ContractSlipData,
    schedule: InstallmentSlipRow[],
  ): void {
    const html = this.buildDocument(data, schedule);
    this.renderAndPrint(html);
  }

  // ─────────────── schedule builder (fallback when API not available) ───────

  private buildSchedule(data: ContractSlipData): InstallmentSlipRow[] {
    const rows: InstallmentSlipRow[] = [];
    const base = new Date(data.firstInstallmentDate);
    const step = this.freqMonths(data.paymentFrequency);
    for (let i = 0; i < data.installmentsCount; i++) {
      const d = new Date(base);
      d.setMonth(d.getMonth() + i * step);
      rows.push({ sequence: i + 1, dueDate: d.toISOString(), amount: data.installmentAmount });
    }
    return rows;
  }

  private freqMonths(freq: string): number {
    switch (freq) {
      case 'SemiAnnual': return 6;
      case 'Annual':     return 12;
      default:           return 3;
    }
  }

  // ─────────────── HTML document ───────────────────────────────────────────

  private buildDocument(data: ContractSlipData, schedule: InstallmentSlipRow[]): string {
    const slips = schedule.map((inst) => this.buildSlip(data, inst, schedule.length)).join('\n');
    return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>إيصالات أقساط — ${esc(data.clientName)}</title>
  <style>${STYLES}</style>
</head>
<body>${slips}</body>
</html>`;
  }

  private buildSlip(data: ContractSlipData, inst: InstallmentSlipRow, total: number): string {
    const remainingAfter = Math.max(0, Math.round(data.installmentAmount * (total - inst.sequence)));
    const productText    = data.productLines
      .map(p => p.quantity > 1 ? `عدد ${p.quantity} ${esc(p.name)}` : esc(p.name))
      .join(' / ') || '—';
    const region         = esc(data.clientRegion ?? data.clientAddress ?? '—');

    return `
<div class="slip">

  <!-- ═══ HEADER BAND ═══ -->
  <div class="hdr">

    <!-- Right: Logo + Brand -->
    <div class="hdr-brand">
      <div class="logo-wrap">
        <div class="logo-circle">خ</div>
        <div class="logo-dots"><span></span><span></span><span></span></div>
      </div>
      <div>
        <div class="brand-name">شركة الخليفة</div>
        <div class="brand-sub">للمفروشات والأدوات المنزلية</div>
      </div>
    </div>

    <!-- Center: Code + Region -->
    <div class="hdr-meta">
      <div class="meta-row">
        <span class="meta-lbl">الكود</span>
        <span class="meta-val">${esc(String(data.contractId))}</span>
      </div>
      <div class="meta-row">
        <span class="meta-lbl">المنطقة</span>
        <span class="meta-val">${region}</span>
      </div>
    </div>

    <!-- Right-Center: Financials -->
    <div class="hdr-fin">
      <div class="fin-row">
        <span class="fin-lbl">الإجمالي</span>
        <span class="fin-val">${this.fmtMoney(data.totalAmount)}</span>
      </div>
      <div class="fin-row">
        <span class="fin-lbl">المقدم</span>
        <span class="fin-val">${this.fmtMoney(data.downPayment)}</span>
      </div>
      <div class="fin-row">
        <span class="fin-lbl">الأقساط</span>
        <span class="fin-val">${esc(String(total))} × ${this.fmtMoney(data.installmentAmount)}</span>
      </div>
    </div>

    <!-- Left: Sequence Badge -->
    <div class="seq-badge">
      <div class="seq-num">${inst.sequence}</div>
      <div class="seq-slash">من</div>
      <div class="seq-total">${total}</div>
    </div>

  </div>

  <!-- ═══ BODY TABLE ═══ -->
  <table class="body-tbl">

    <tr>
      <td class="lbl-cell">الاسم</td>
      <td class="val-cell name-val bold">${esc(data.clientName)}</td>
      <td class="lbl-cell">الموبايل</td>
      <td class="val-cell ltr">${esc(data.clientPhone)}</td>
    </tr>

    <tr>
      <td class="lbl-cell">العمل</td>
      <td class="val-cell">${esc(data.clientOccupation ?? '—')}</td>
      <td class="lbl-cell">الوظيفة</td>
      <td class="val-cell">—</td>
    </tr>

    <tr class="row-inst">
      <td class="lbl-cell">قيمة القسط</td>
      <td class="val-cell inst-val">${this.fmtMoney(inst.amount)} جنيهاً فقط لا غير</td>
      <td class="lbl-cell">المبلغ المتبقي بعد القسط الحالي</td>
      <td class="val-cell rem-val">${this.fmtMoney(remainingAfter)}</td>
    </tr>

    <tr>
      <td class="lbl-cell">المنتج</td>
      <td class="val-cell bold" colspan="3">${productText}</td>
    </tr>

    <tr class="row-dates">
      <td class="lbl-cell">يحصل في</td>
      <td class="val-cell date-val bold ltr">${this.fmtDate(inst.dueDate)}</td>
      <td class="lbl-cell">تاريخ البيع</td>
      <td class="val-cell ltr">${this.fmtDate(data.dateOfSale)}</td>
    </tr>

    <tr>
      <td class="lbl-cell">المندوب</td>
      <td class="val-cell bold">${esc(data.repName ?? '—')}</td>
      <td class="lbl-cell">تاريخ بداية الأقساط</td>
      <td class="val-cell ltr">${this.fmtDate(data.firstInstallmentDate)}</td>
    </tr>

    <tr class="row-contact">
      <td class="lbl-cell">موبايل المندوب</td>
      <td class="val-cell ltr bold">${esc(data.repPhone ?? '—')}</td>
      <td class="lbl-cell">للتواصل مع الشركة</td>
      <td class="val-cell ltr bold">${esc(COMPANY_PHONE)}</td>
    </tr>

  </table>

</div>`;
  }

  // ─────────────── print runner ─────────────────────────────────────────────

  private renderAndPrint(html: string): void {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('title', 'طباعة الأقساط');
    // Landscape A5 = 210 × 148 mm
    iframe.style.cssText = [
      'position:fixed', 'left:-9999px', 'top:0',
      'width:210mm', 'height:148mm',
      'border:0', 'opacity:0', 'pointer-events:none', 'z-index:-1',
    ].join(';');
    document.body.appendChild(iframe);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      setTimeout(() => iframe.remove(), 0);
    };

    iframe.onload = () => {
      const win = iframe.contentWindow;
      const doc = iframe.contentDocument;
      if (!win || !doc) { cleanup(); return; }

      win.addEventListener('afterprint', cleanup, { once: true });

      const df = doc as Document & { fonts?: { ready: Promise<unknown> } };
      Promise.resolve(df.fonts?.ready ?? Promise.resolve()).then(() => {
        win.requestAnimationFrame(() => {
          void doc.body.offsetHeight;
          win.requestAnimationFrame(() => {
            try { win.focus(); win.print(); } catch { /* noop */ }
            setTimeout(cleanup, 60_000);
          });
        });
      });
    };

    iframe.srcdoc = html;
  }

  // ─────────────── helpers ──────────────────────────────────────────────────

  private fmtDate(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}/${mm}/${dd}`;
  }

  private fmtMoney(n: number): string {
    return Math.round(n).toLocaleString('ar-EG');
  }
}

// ─────────────── HTML escaper ─────────────────────────────────────────────────

function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─────────────── Stylesheet (landscape A5, exact Khalifa receipt layout) ─────

const STYLES = `
@page {
  size: A5 landscape;
  margin: 5mm 7mm 5mm 7mm;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  background: #fff;
  color: #0D1829;
  font-family: 'Cairo', 'Segoe UI', Tahoma, 'Noto Sans Arabic', Arial, sans-serif;
  font-size: 8.5pt;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ── One slip per page ── */
.slip {
  width: 100%;
  page-break-after: always;
  break-after: page;
  border: 2px solid #0C2340;
  border-radius: 5px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 133mm;
  background: #FAFAF7;
}
.slip:last-child {
  page-break-after: avoid;
  break-after: avoid;
}

/* ══════════════════════════════════════════
   HEADER BAND
══════════════════════════════════════════ */
.hdr {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: stretch;
  background: #0C2340;
  color: #fff;
  min-height: 34mm;
  border-bottom: 3px solid #0A1D33;
}

/* ── Right: Brand ── */
.hdr-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px 8px 10px;
  border-left: 1px solid rgba(255,255,255,.15);
}

.logo-wrap {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.logo-circle {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2.5px solid rgba(255,255,255,.5);
  background: rgba(255,255,255,.08);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15pt;
  font-weight: 900;
  line-height: 1;
}

.logo-dots { display: flex; gap: 3px; }
.logo-dots span {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgba(255,255,255,.35);
}

.brand-name {
  font-size: 18pt;
  font-weight: 900;
  letter-spacing: .4px;
  line-height: 1.05;
  white-space: nowrap;
}
.brand-sub {
  font-size: 7pt;
  opacity: .65;
  margin-top: 3px;
  letter-spacing: .2px;
}

/* ── Center: Code + Region ── */
.hdr-meta {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 7px;
  padding: 8px 16px;
  border-left: 1px solid rgba(255,255,255,.15);
}

.meta-row { display: flex; align-items: baseline; gap: 8px; }
.meta-lbl { font-size: 7pt; opacity: .55; white-space: nowrap; min-width: 36px; }
.meta-val { font-size: 10pt; font-weight: 700; letter-spacing: .2px; }

/* ── Right-Center: Financials ── */
.hdr-fin {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  border-left: 1px solid rgba(255,255,255,.15);
}

.fin-row { display: flex; align-items: baseline; gap: 8px; }
.fin-lbl { font-size: 7pt; opacity: .55; white-space: nowrap; min-width: 44px; }
.fin-val { font-size: 10pt; font-weight: 700; white-space: nowrap; direction: ltr; text-align: left; }

/* ── Left: Sequence Badge ── */
.seq-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,.08);
  border-left: 2px solid rgba(255,255,255,.12);
  padding: 8px 16px;
  min-width: 52px;
  text-align: center;
}
.seq-num  { font-size: 22pt; font-weight: 900; line-height: 1; }
.seq-slash { font-size: 7pt; opacity: .5; margin-top: 1px; }
.seq-total { font-size: 9pt; font-weight: 700; opacity: .75; }

/* ══════════════════════════════════════════
   BODY TABLE
══════════════════════════════════════════ */
.body-tbl {
  width: 100%;
  border-collapse: collapse;
  flex: 1;
}

.body-tbl tr { border-bottom: 1px solid #D1D8E4; }
.body-tbl tr:last-child { border-bottom: none; }
.body-tbl tr:nth-child(even) .val-cell { background: #F5F7FB; }

/* Special row tints */
.row-inst   .lbl-cell { background: #FEF9EE !important; }
.row-inst   .val-cell { background: #FFFDF5 !important; }
.row-dates  .lbl-cell { background: #EFF4FC !important; }
.row-dates  .val-cell { background: #F5F8FD !important; }
.row-contact .lbl-cell { background: #EEF2F8 !important; }
.row-contact .val-cell { background: #F4F7FA !important; }

/* Label cells */
.lbl-cell {
  background: #EDF0F7;
  color: #4B5775;
  font-size: 7pt;
  font-weight: 700;
  padding: 5px 8px;
  white-space: nowrap;
  border-left: 1px solid #D1D8E4;
  vertical-align: middle;
  width: 13%;
  letter-spacing: .15px;
}

/* Value cells */
.val-cell {
  color: #0D1829;
  font-size: 9pt;
  padding: 5px 9px;
  border-left: 1px solid #D1D8E4;
  vertical-align: middle;
}

.body-tbl td:last-child { border-left: none; }

/* Value modifiers */
.bold     { font-weight: 700; }
.ltr      { direction: ltr; text-align: right; unicode-bidi: embed; }
.name-val { font-size: 10.5pt; font-weight: 700; color: #0C2340; }
.inst-val { font-size: 10pt; font-weight: 900; color: #92400E; letter-spacing: .1px; }
.rem-val  { font-size: 10pt; font-weight: 700; color: #0C2340; }
.date-val { font-size: 9.5pt; font-weight: 700; color: #0C2340; }
`;
