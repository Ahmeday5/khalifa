import { Injectable } from '@angular/core';

const COMPANY_NAME = 'شركة الخليفة للأدوات المنزلية والمفروشات';
const COMPANY_PHONE = '01129912187';

export interface ContractSlipData {
  contractId:          number;
  /** Contract code — `null`/absent for legacy contracts created before this field existed. */
  contractCode?:       string | null;
  dateOfSale:          string;
  clientName:          string;
  clientPhone:         string;
  clientCode?:         string | null;
  /** Client's home/mailing area label (list `areaName`) — kept for backward compat, unused by the new slip. */
  clientAddress?:      string | null;
  clientRegion?:       string | null;
  clientOccupation?:   string | null;
  /** Building / عمارة — printed as "العنوان (المبنى)". */
  clientBuilding?:     string | null;
  /** Floor — combined with `clientDepartment` into "الدور / الشقة". */
  clientFloor?:        string | null;
  /** Apartment/department — combined with `clientFloor` into "الدور / الشقة". */
  clientDepartment?:   string | null;
  repName?:            string | null;
  repPhone?:           string | null;
  productLines:        { name: string; quantity: number }[];
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

const FREQ_LABELS: Record<string, string> = {
  Monthly: 'شهري',
  Weekly: 'أسبوعي',
  Quarterly: 'ربع سنوي',
  SemiAnnual: 'نصف سنوي',
  SemiAnnually: 'نصف سنوي',
  Annual: 'سنوي',
  Annually: 'سنوي',
};

@Injectable({ providedIn: 'root' })
export class ContractSlipsPrintService {

  printSlips(data: ContractSlipData): void {
    const schedule = this.buildSchedule(data);
    this.renderAndPrint(this.buildDocument(data, schedule));
  }

  printSlipsWithSchedule(data: ContractSlipData, schedule: InstallmentSlipRow[]): void {
    this.renderAndPrint(this.buildDocument(data, schedule));
  }

  // ─── schedule builder ────────────────────────────────────────────────────────

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
      case 'SemiAnnual':
      case 'SemiAnnually': return 6;
      case 'Annual':
      case 'Annually':     return 12;
      case 'Monthly':      return 1;
      default:             return 3;
    }
  }

  // ─── HTML document ───────────────────────────────────────────────────────────

  private buildDocument(data: ContractSlipData, schedule: InstallmentSlipRow[]): string {
    const slips = schedule
      .map((inst) => this.buildSlip(data, inst, schedule.length))
      .join('\n');
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
    const remainingAfter = Math.max(
      0,
      Math.round(data.totalAmount - data.installmentAmount * inst.sequence),
    );
    const productText = data.productLines
      .map((p) => (p.quantity > 1 ? `${esc(p.name)} × ${p.quantity}` : esc(p.name)))
      .join('، ') || '—';

    const contractCode = esc(data.contractCode ?? '—');
    const receiptNo = `${inst.sequence} / ${total}`;

    const floorDept = [data.clientFloor, data.clientDepartment]
      .filter((v) => v && v.trim())
      .join(' / ');

    return `
<div class="slip">

  <!-- ═══ HEADER ═══ -->
  <div class="hdr">
    <div class="hdr-badge">
      <span class="hdr-badge-l">رقم الإيصال / القسط</span>
      <span class="hdr-badge-v">${esc(receiptNo)}</span>
    </div>
    <div class="hdr-brand">
      <div class="brand-name">${esc(COMPANY_NAME)}</div>
      <div class="brand-code">
        <span class="brand-code-l">كود العقد</span>
        <span class="brand-code-v">${contractCode}</span>
      </div>
    </div>
  </div><!-- /.hdr -->

  <!-- ═══ BODY: 3 columns ═══ -->
  <div class="body3">

    <!-- RIGHT: بيانات العميل -->
    <div class="col col-client">
      <div class="col-hdr">بيانات العميل</div>
      <div class="col-body">
        <div class="fld"><span class="fld-l">كود العميل:</span><span class="fld-v">${esc(data.clientCode ?? '—')}</span></div>
        <div class="fld"><span class="fld-l">الاسم الكامل:</span><span class="fld-v fld-bold">${esc(data.clientName)}</span></div>
        <div class="fld"><span class="fld-l">رقم الهاتف:</span><span class="fld-v fld-ltr">${esc(data.clientPhone) || '—'}</span></div>
        <div class="fld"><span class="fld-l">جهة العمل:</span><span class="fld-v">${esc(data.clientRegion ?? '—')}</span></div>
        <div class="fld"><span class="fld-l">الوظيفة:</span><span class="fld-v">${esc(data.clientOccupation ?? '—')}</span></div>
        <div class="fld"><span class="fld-l">العنوان (المبنى):</span><span class="fld-v">${esc(data.clientBuilding ?? '—')}</span></div>
        <div class="fld"><span class="fld-l">الدور / الشقة:</span><span class="fld-v">${esc(floorDept || '—')}</span></div>
      </div>
    </div>

    <!-- MIDDLE: تفاصيل المنتج والقسط -->
    <div class="col col-product">
      <div class="col-hdr">تفاصيل المنتج والقسط</div>
      <div class="col-body">
        <div class="pd-label">تفاصيل / بيان المنتج:</div>
        <div class="pd-product">${productText}</div>

        <div class="pd-due">
          <div class="pd-due-l">مبلغ القسط المستحق هذا الشهر</div>
          <div class="pd-due-v">${this.fmtMoney(inst.amount)} ج.م</div>
          <div class="pd-due-words">فقط وقدره: ......................................</div>
        </div>

        <div class="fld fld-collect"><span class="fld-l">يحصل في تاريخ:</span><span class="fld-v">${this.fmtDate(inst.dueDate)}</span></div>
      </div>
    </div>

    <!-- LEFT: تفاصيل العقد -->
    <div class="col col-contract">
      <div class="col-hdr">تفاصيل العقد</div>
      <div class="col-body">
        <div class="fld"><span class="fld-l">إجمالي العقد:</span><span class="fld-v fld-bold">${this.fmtMoney(data.totalAmount)}</span></div>
        <div class="fld"><span class="fld-l">المقدم:</span><span class="fld-v">${this.fmtMoney(data.downPayment)}</span></div>
        <div class="fld"><span class="fld-l">نظام التقسيط:</span><span class="fld-v">${this.freqLabel(data.paymentFrequency)}</span></div>
        <div class="fld"><span class="fld-l">تاريخ البيع:</span><span class="fld-v">${this.fmtDate(data.dateOfSale)}</span></div>
        <div class="fld"><span class="fld-l">بداية الأقساط:</span><span class="fld-v">${this.fmtDate(data.firstInstallmentDate)}</span></div>

        <div class="pd-remaining">
          <div class="pd-remaining-l">المبلغ المتبقي بعد الإيصال</div>
          <div class="pd-remaining-v">${this.fmtMoney(remainingAfter)} ج.م</div>
        </div>
      </div>
    </div>

  </div><!-- /.body3 -->

  <!-- ═══ FOOTER ═══ -->
  <div class="ftr">
    <div class="ftr-item ftr-service">
      <span class="ftr-l">خدمة العملاء</span>
      <span class="ftr-v fld-ltr">${esc(COMPANY_PHONE)}</span>
    </div>
    <div class="ftr-item">
      <span class="ftr-l">هاتف المندوب:</span>
      <span class="ftr-v fld-ltr">${esc(data.repPhone ?? '—')}</span>
    </div>
    <div class="ftr-item">
      <span class="ftr-l">اسم المندوب:</span>
      <span class="ftr-v">${esc(data.repName ?? '—')}</span>
    </div>
  </div>

</div><!-- /.slip -->`;
  }

  // ─── print runner ─────────────────────────────────────────────────────────────

  private renderAndPrint(html: string): void {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('title', 'طباعة الأقساط');
    iframe.style.cssText = [
      'position:fixed', 'left:-9999px', 'top:0',
      'width:210mm', 'height:297mm',
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

  // ─── helpers ──────────────────────────────────────────────────────────────────

  private freqLabel(freq: string): string {
    return FREQ_LABELS[freq] ?? freq;
  }

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

// ─── HTML escaper ─────────────────────────────────────────────────────────────

function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Stylesheet ───────────────────────────────────────────────────────────────
//
// Slip footprint is fixed at 95mm × 205mm — exactly one third of an A4
// portrait sheet (210mm × 297mm, minus a hairline margin) — so three slips
// stack per printed page with no gaps and no manual cutting guesswork.

const STYLES = `
@page {
  size: A4 portrait;
  margin: 0;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  background: #fff;
  color: #0D1829;
  font-family: "Segoe UI", Tahoma, Cairo, "Noto Sans Arabic", Arial, sans-serif;
  font-size: 8pt;
  line-height: 1.35;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  color-adjust: exact;
}

/* ══ One slip = 95mm × 205mm, three per A4 portrait page ══ */
.slip {
  width: 205mm;
  height: 95mm;
  /* Printed on a portrait sheet turned so the slip's long edge (205mm)
     runs across the 210mm page width, and its short edge (95mm) stacks
     three-high down the 297mm page height (3 × 95mm = 285mm ≤ 297mm). */
  display: flex;
  flex-direction: column;
  page-break-after: always;
  break-after: page;
  border: 1.5px solid #0C2340;
  overflow: hidden;
  background: #fff;
}
.slip:last-child { page-break-after: avoid; break-after: avoid; }

/* ══════════════════════════════════════════
   HEADER
══════════════════════════════════════════ */
.hdr {
  display: flex;
  align-items: stretch;
  background: #0C2340;
  flex-shrink: 0;
}

.hdr-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  background: #fff;
  border: 1.5px solid #0C2340;
  border-radius: 5px;
  margin: 7px 0 7px 10px;
  padding: 5px 14px;
  flex-shrink: 0;
}

.hdr-badge-l {
  font-size: 7pt;
  font-weight: 700;
  color: #0C2340;
  white-space: nowrap;
}

.hdr-badge-v {
  font-size: 13pt;
  font-weight: 900;
  color: #B45309;
}

.hdr-brand {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 10px;
}

.brand-name {
  font-size: 15pt;
  font-weight: 900;
  color: #fff;
  letter-spacing: .2px;
  text-align: center;
  white-space: nowrap;
}

.brand-code {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.brand-code-l {
  font-size: 7.5pt;
  font-weight: 600;
  color: #C9A84C;
}

.brand-code-v {
  font-size: 10.5pt;
  font-weight: 900;
  color: #fff;
}

/* ══════════════════════════════════════════
   BODY — 3 columns
══════════════════════════════════════════ */
.body3 {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  min-height: 0;
}

.col {
  display: flex;
  flex-direction: column;
  border-left: 1px solid #C9A84C;
  min-width: 0;
}
.col:last-child { border-left: none; }

.col-hdr {
  background: #0C2340;
  color: #fff;
  font-size: 7.5pt;
  font-weight: 700;
  text-align: center;
  padding: 3px 6px;
  letter-spacing: .2px;
}

.col-body {
  flex: 1;
  padding: 7px 10px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-height: 0;
}

/* ── field rows (shared) ── */
.fld {
  display: flex;
  align-items: baseline;
  gap: 5px;
  border-bottom: 0.5px dotted #D8DEE9;
  padding-bottom: 3px;
}

.fld-l {
  font-size: 7.5pt;
  font-weight: 700;
  color: #6B7280;
  white-space: nowrap;
  flex-shrink: 0;
}

.fld-v {
  font-size: 9pt;
  font-weight: 600;
  color: #0D1829;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.fld-bold { font-weight: 900; color: #0C2340; }
.fld-ltr { direction: ltr; text-align: right; unicode-bidi: embed; }

/* ── client column ── */
.col-client .fld-v { font-size: 8.5pt; }

/* ── product column ── */
.pd-label {
  font-size: 7.5pt;
  font-weight: 700;
  color: #6B7280;
}

.pd-product {
  font-size: 9.5pt;
  font-weight: 700;
  color: #0C2340;
  border: 0.5px solid #D8DEE9;
  border-radius: 3px;
  padding: 6px 8px;
  min-height: 18mm;
  flex-shrink: 0;
}

.pd-due {
  background: #FBF3DF;
  border: 1px solid #C9A84C;
  border-radius: 4px;
  padding: 6px 8px;
  text-align: center;
  margin-top: 4px;
}

.pd-due-l {
  font-size: 7.5pt;
  font-weight: 700;
  color: #7A5B10;
}

.pd-due-v {
  font-size: 15pt;
  font-weight: 900;
  color: #B45309;
  line-height: 1.3;
  margin-top: 2px;
}

.pd-due-words {
  font-size: 6.5pt;
  color: #8A8578;
  margin-top: 3px;
}

.fld-collect { margin-top: auto; padding-top: 6px; }

/* ── contract column ── */
.pd-remaining {
  margin-top: auto;
  background: #EEF2F7;
  border: 1px solid #0C2340;
  border-radius: 4px;
  padding: 6px 8px;
  text-align: center;
}

.pd-remaining-l {
  font-size: 7.5pt;
  font-weight: 700;
  color: #374151;
}

.pd-remaining-v {
  font-size: 13.5pt;
  font-weight: 900;
  color: #0C2340;
  margin-top: 2px;
}

/* ══════════════════════════════════════════
   FOOTER
══════════════════════════════════════════ */
.ftr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #0A1D33;
  padding: 5px 12px;
  gap: 10px;
  flex-shrink: 0;
}

.ftr-item {
  display: flex;
  align-items: baseline;
  gap: 5px;
  white-space: nowrap;
  overflow: hidden;
}

.ftr-service { flex-shrink: 0; }

.ftr-l {
  font-size: 7.5pt;
  font-weight: 700;
  color: #C9A84C;
}

.ftr-v {
  font-size: 8.5pt;
  font-weight: 700;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
}
`;
