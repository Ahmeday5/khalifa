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
  /** Client's home/mailing area (list `areaName`) — printed as "المنطقة" in the header. */
  clientAddress?:      string | null;
  clientRegion?:       string | null;
  clientOccupation?:   string | null;
  /** Building / عمارة — printed as "المبنى". */
  clientBuilding?:     string | null;
  /** Floor — printed as "الدور". Falls back to `clientDepartment` if empty. */
  clientFloor?:        string | null;
  /** Apartment/department — legacy fallback for `clientFloor`. */
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

  /**
   * Builds the per-installment schedule when the caller has no exact
   * server-side schedule to hand over (e.g. right after creating a
   * contract). The last row absorbs whatever remainder doesn't divide
   * evenly across `installmentsCount`, mirroring the server's
   * `adjustLastInstallmentForRemainder` math — so "نظام التقسيط" reflects
   * reality even when the last installment differs from the rest.
   */
  private buildSchedule(data: ContractSlipData): InstallmentSlipRow[] {
    const rows: InstallmentSlipRow[] = [];
    const base = new Date(data.firstInstallmentDate);
    const step = this.freqMonths(data.paymentFrequency);
    const lastAmount = Math.round(
      data.totalAmount - data.installmentAmount * (data.installmentsCount - 1),
    );
    for (let i = 0; i < data.installmentsCount; i++) {
      const d = new Date(base);
      d.setMonth(d.getMonth() + i * step);
      const isLast = i === data.installmentsCount - 1;
      rows.push({
        sequence: i + 1,
        dueDate: d.toISOString(),
        amount: isLast ? lastAmount : data.installmentAmount,
      });
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
    // One slip per A4 page — the slip itself keeps its fixed 20.5cm × 9.5cm
    // footprint and margins; the rest of each sheet is left blank on purpose.
    const installmentPlan = this.describePlan(schedule);
    const pages = schedule
      .map((inst) => `<div class="page">${this.buildSlip(data, inst, schedule, installmentPlan)}</div>`)
      .join('\n');

    return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>إيصالات أقساط — ${esc(data.clientName)}</title>
  <style>${STYLES}</style>
</head>
<body>${pages}</body>
</html>`;
  }

  /**
   * "نظام التقسيط" label built from the real per-installment amounts rather
   * than the flat contract fields — so a remainder-adjusted last installment
   * (e.g. 5 × 200 + 1 × 180) shows correctly instead of implying every
   * installment is the same size.
   */
  private describePlan(schedule: InstallmentSlipRow[]): string {
    const groups: { amount: number; count: number }[] = [];
    for (const row of schedule) {
      const last = groups[groups.length - 1];
      const amount = Math.round(row.amount);
      if (last && last.amount === amount) {
        last.count++;
      } else {
        groups.push({ amount, count: 1 });
      }
    }
    return groups
      .map((g) => `${g.count} × ${this.fmtMoney(g.amount)} ج.م`)
      .join(' + ');
  }

  private buildSlip(
    data: ContractSlipData,
    inst: InstallmentSlipRow,
    schedule: InstallmentSlipRow[],
    installmentPlan: string,
  ): string {
    const total = schedule.length;
    const paidSoFar = schedule
      .slice(0, inst.sequence)
      .reduce((sum, row) => sum + row.amount, 0);
    const remainingAfter = Math.max(0, Math.round(data.totalAmount - paidSoFar));
    const productLines = data.productLines
      .map((p) => (p.quantity > 1 ? `${esc(p.name)} × ${p.quantity}` : esc(p.name)));
    const productText = productLines.join('، ') || '—';
    const productFontSize = this.autoFontSize(productText, {
      base: 12.5, floor: 8, shrinkPer100Chars: 1.4,
    });
    const nameFontSize = this.autoFontSize(data.clientName, {
      base: 11.5, floor: 8.5, shrinkPer100Chars: 2.2,
    });

    const contractCode = esc(data.contractCode ?? '—');
    const receiptNo = `${inst.sequence} / ${total}`;
    const amountWords = `${amountToArabicWords(inst.amount)} فقط`;

    const floorDept = data.clientFloor && data.clientFloor.trim() ? data.clientFloor : (data.clientDepartment ?? '');

    return `
<div class="slip">

  <!-- ═══ HEADER ═══ -->
  <div class="hdr">
    <div class="hdr-badge">
      <span class="hdr-badge-l">رقم الإيصال / القسط</span>
      <span class="hdr-badge-v">${esc(receiptNo)}</span>
    </div>
    <div class="hdr-badge hdr-badge-area">
      <span class="hdr-badge-l">المنطقة</span>
      <span class="hdr-badge-v hdr-badge-v-area">${esc(data.clientAddress ?? '—')}</span>
    </div>
    <div class="hdr-brand">
      <div class="brand-name">${esc(COMPANY_NAME)}</div>
    </div>
  </div><!-- /.hdr -->

  <!-- ═══ BODY: 3 columns ═══ -->
  <div class="body3">

    <!-- RIGHT: بيانات العميل -->
    <div class="col col-client">
      <div class="col-hdr">بيانات العميل</div>
      <div class="col-body">
        <div class="fld"><span class="fld-l">كود العميل:</span><span class="fld-v">${esc(data.clientCode ?? '—')}</span></div>
        <div class="fld"><span class="fld-l">الاسم الكامل:</span><span class="fld-v fld-bold" style="font-size:${nameFontSize}pt">${esc(data.clientName)}</span></div>
        <div class="fld"><span class="fld-l">رقم الهاتف:</span><span class="fld-v fld-ltr">${esc(data.clientPhone) || '—'}</span></div>
        <div class="fld"><span class="fld-l">جهة العمل:</span><span class="fld-v">${esc(data.clientRegion ?? '—')}</span></div>
        <div class="fld"><span class="fld-l">المهنة:</span><span class="fld-v">${esc(data.clientOccupation ?? '—')}</span></div>
        <div class="fld"><span class="fld-l">المبنى:</span><span class="fld-v">${esc(data.clientBuilding ?? '—')}</span></div>
        <div class="fld"><span class="fld-l">الدور:</span><span class="fld-v">${esc(floorDept || '—')}</span></div>
        <div class="fld"><span class="fld-l">القسم:</span><span class="fld-v"></span></div>
      </div>
    </div>

    <!-- MIDDLE: تفاصيل المنتج والقسط -->
    <div class="col col-product">
      <div class="col-hdr">تفاصيل المنتج والقسط</div>
      <div class="col-body">
        <div class="pd-product" style="font-size:${productFontSize}pt">${productText}</div>

        <div class="pd-due">
          <div class="pd-due-l">مبلغ القسط المستحق هذا الشهر</div>
          <div class="pd-due-v">${this.fmtMoney(inst.amount)} ج.م</div>
          <div class="pd-due-words">مبلغ وقدره: ${esc(amountWords)}</div>
        </div>

        <div class="fld fld-collect"><span class="fld-l">يحصل في تاريخ:</span><span class="fld-v fld-big">${this.fmtDate(inst.dueDate)}</span></div>
      </div>
    </div>

    <!-- LEFT: تفاصيل العقد -->
    <div class="col col-contract">
      <div class="col-hdr">تفاصيل العقد</div>
      <div class="col-body">
        <div class="fld"><span class="fld-l">كود العقد:</span><span class="fld-v fld-bold">${contractCode}</span></div>
        <div class="fld"><span class="fld-l">إجمالي العقد:</span><span class="fld-v fld-bold">${this.fmtMoney(data.totalAmount)}</span></div>
        <div class="fld"><span class="fld-l">المقدم:</span><span class="fld-v">${this.fmtMoney(data.downPayment)}</span></div>
        <div class="fld"><span class="fld-l">نظام التقسيط:</span><span class="fld-v">${esc(installmentPlan)}</span></div>
        <div class="fld"><span class="fld-l">تاريخ البيع:</span><span class="fld-v">${this.fmtDate(data.dateOfSale)}</span></div>
        <div class="fld"><span class="fld-l">بداية الأقساط:</span><span class="fld-v">${this.fmtDate(data.firstInstallmentDate)}</span></div>

        <div class="pd-remaining">
          <div class="pd-remaining-l">المبلغ المتبقي بعد هذا الإيصال</div>
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

  /**
   * Scales a field's font size down as its text grows, so a long client
   * name or a multi-item product list shrinks to fit its fixed-height box
   * instead of overflowing — and short values keep the full base size.
   */
  private autoFontSize(
    text: string,
    opts: { base: number; floor: number; shrinkPer100Chars: number },
  ): number {
    const shrink = (text.length / 100) * opts.shrinkPer100Chars;
    return Math.max(opts.floor, Math.round((opts.base - shrink) * 10) / 10);
  }
}

// ─── Arabic amount-in-words ───────────────────────────────────────────────────
//
// Converts a pound amount to Egyptian-Arabic words, e.g. 3250 →
// "ثلاثة آلاف ومئتان وخمسون جنيها مصريا". Piastres (fractional part) are
// appended as "... وقرشا" / "... وقرشين" / "... قرشا" when present.

const ONES = [
  '', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
];
const ONES_FEM = [
  '', 'إحدى', 'اثنتا', 'ثلاث', 'أربع', 'خمس', 'ست', 'سبع', 'ثمان', 'تسع',
];
const TEENS = [
  'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر',
  'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر',
];
const TENS = [
  '', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون',
];

function twoDigitsToWords(n: number, feminine: boolean): string {
  if (n === 0) return '';
  if (n < 10) return feminine ? ONES_FEM[n] : ONES[n];
  if (n < 20) return TEENS[n - 10];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  const onesWord = feminine ? ONES_FEM[ones] : ONES[ones];
  return ones === 0 ? TENS[tens] : `${onesWord} و${TENS[tens]}`;
}

function threeDigitsToWords(n: number, feminine: boolean): string {
  if (n === 0) return '';
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  const hundredsWords = ['', 'مئة', 'مئتان', 'ثلاثمئة', 'أربعمئة', 'خمسمئة', 'ستمئة', 'سبعمئة', 'ثمانمئة', 'تسعمئة'];
  const hundredWord = hundredsWords[hundred];
  const restWord = twoDigitsToWords(rest, feminine);
  if (!hundredWord) return restWord;
  return restWord ? `${hundredWord} و${restWord}` : hundredWord;
}

/** One scale step (thousands/millions) rendered with correct singular/dual/plural agreement. */
function scaleGroupToWords(n: number, singular: string, dual: string, plural: string): string {
  if (n === 1) return singular;
  if (n === 2) return dual;
  if (n >= 3 && n <= 10) return `${threeDigitsToWords(n, false)} ${plural}`;
  return `${threeDigitsToWords(n, false)} ${singular}`;
}

function integerToWords(n: number): string {
  if (n === 0) return 'صفر';

  const millions   = Math.floor(n / 1_000_000);
  const thousands   = Math.floor((n % 1_000_000) / 1000);
  const remainder   = n % 1000;

  const parts: string[] = [];
  if (millions > 0) parts.push(scaleGroupToWords(millions, 'مليون', 'مليونان', 'ملايين'));
  if (thousands > 0) parts.push(scaleGroupToWords(thousands, 'ألف', 'ألفان', 'آلاف'));
  if (remainder > 0) parts.push(threeDigitsToWords(remainder, false));

  return parts.join(' و');
}

function amountToArabicWords(amount: number): string {
  const pounds = Math.floor(Math.abs(amount));
  const piastres = Math.round((Math.abs(amount) - pounds) * 100);

  const poundsWord = integerToWords(pounds);
  const poundsUnit = pounds === 1 ? 'جنيه مصري' : pounds === 2 ? 'جنيهان مصريان' : 'جنيها مصريا';
  let result = `${poundsWord} ${poundsUnit}`;

  if (piastres > 0) {
    const piastresWord = integerToWords(piastres);
    const piastresUnit = piastres === 1 ? 'قرشا' : piastres === 2 ? 'قرشين' : 'قرشا';
    result += ` و${piastresWord} ${piastresUnit}`;
  }

  return result;
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
// Slip footprint is fixed at 205mm × 95mm (20.5cm × 9.5cm) — one slip per
// printed A4 page, centered with a real @page margin on every side so the
// printer's own hardware margin never clips the header.

const STYLES = `
@page {
  size: A4 portrait;
  /* A genuine top/bottom margin (not just page padding) — this reserves
     space before the printer's own unprintable edge, which is what was
     clipping the company name at the top of the slip. Left/right centers
     the 205mm slip on the 210mm sheet. */
  margin: 15mm 2.5mm;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  background: #fff;
  color: #0D1829;
  font-family: "Segoe UI", Tahoma, Cairo, "Noto Sans Arabic", Arial, sans-serif;
  font-size: 10.5pt;
  line-height: 1.25;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  color-adjust: exact;
}

/* ══ Each .page is one printed A4 sheet holding exactly one slip ══ */
.page {
  page-break-after: always;
  break-after: page;
}
.page:last-child { page-break-after: avoid; break-after: avoid; }

/* One slip = 205mm × 95mm (20.5cm × 9.5cm). */
.slip {
  width: 205mm;
  height: 95mm;
  display: flex;
  flex-direction: column;
  border: 1.5px solid #0C2340;
  overflow: hidden;
  background: #fff;
  flex-shrink: 0;
}

/* ══════════════════════════════════════════
   HEADER — light neutral background, dark text
══════════════════════════════════════════ */
.hdr {
  display: flex;
  align-items: stretch;
  background: #F1F3F6;
  border-bottom: 1.5px solid #C9A84C;
  flex-shrink: 0;
}

.hdr-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  background: #fff;
  border: 1.5px solid #0C2340;
  border-radius: 5px;
  margin: 5px 8px;
  padding: 3px 10px;
  flex-shrink: 0;
}

.hdr-badge-l {
  font-size: 9.5pt;
  font-weight: 700;
  color: #0D1829;
  white-space: nowrap;
}

.hdr-badge-v {
  font-size: 17pt;
  font-weight: 900;
  color: #0D1829;
}

.hdr-badge-area {
  padding: 5px 10px;
  min-width: 40mm;
}

.hdr-badge-v-area {
  font-size: 10pt;
  max-width: 55mm;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

.hdr-brand {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #fff;
  border: 1.5px solid #0C2340;
  border-radius: 5px;
  margin: 5px 8px 5px 0;
  padding: 3px 6px;
  min-width: 0;
  max-width: 82mm;
}

.brand-name {
  font-size: 9.5pt;
  font-weight: 900;
  color: #0D1829;
  letter-spacing: 0;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  font-size: 10.5pt;
  font-weight: 700;
  text-align: center;
  padding: 3px 6px;
  letter-spacing: .2px;
}

.col-body {
  flex: 1;
  padding: 4px 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-height: 0;
}

/* ── field rows (shared) ── */
.fld {
  display: flex;
  align-items: baseline;
  gap: 5px;
  border-bottom: 0.5px dotted #D8DEE9;
  padding-bottom: 2px;
}

.fld-l {
  font-size: 10pt;
  font-weight: 700;
  color: #0D1829;
  white-space: nowrap;
  flex-shrink: 0;
}

.fld-v {
  font-size: 11.5pt;
  font-weight: 600;
  color: #0D1829;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.fld-bold { font-weight: 900; }
.fld-ltr { direction: ltr; text-align: right; unicode-bidi: embed; }
.fld-big { font-size: 14pt; font-weight: 900; }

/* ── client column ── */
.col-client .fld-v { font-size: 11pt; }

/* ── product column ──
   .pd-product flex-grows to absorb whatever space the due/collect blocks
   below don't need, so a 5+ item product list gets real room instead of
   a fixed box — its font size is also set inline per-slip (see
   ContractSlipsPrintService.autoFontSize) so long lists shrink to fit. */
.pd-product {
  flex: 1;
  font-weight: 700;
  color: #0D1829;
  border: 0.5px solid #D8DEE9;
  border-radius: 3px;
  padding: 4px 7px;
  overflow: hidden;
  line-height: 1.3;
}

.pd-due {
  background: #FBF3DF;
  border: 1px solid #C9A84C;
  border-radius: 4px;
  padding: 3px 7px;
  text-align: center;
  margin-top: 3px;
  flex-shrink: 0;
}

.pd-due-l {
  font-size: 10pt;
  font-weight: 700;
  color: #0D1829;
}

.pd-due-v {
  font-size: 19pt;
  font-weight: 900;
  color: #0D1829;
  line-height: 1.25;
  margin-top: 2px;
}

.pd-due-words {
  font-size: 10pt;
  font-weight: 600;
  color: #0D1829;
  margin-top: 3px;
  min-height: 8mm;
  line-height: 1.25;
}

.fld-collect { margin-top: auto; padding-top: 4px; }

/* ── contract column ── */
.pd-remaining {
  margin-top: auto;
  background: #EEF2F7;
  border: 1px solid #0C2340;
  border-radius: 4px;
  padding: 4px 7px;
  text-align: center;
}

.pd-remaining-l {
  font-size: 10pt;
  font-weight: 700;
  color: #0D1829;
}

.pd-remaining-v {
  font-size: 17pt;
  font-weight: 900;
  color: #0D1829;
  margin-top: 2px;
}

/* ══════════════════════════════════════════
   FOOTER — light neutral background, dark text
══════════════════════════════════════════ */
.ftr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #F1F3F6;
  border-top: 1.5px solid #C9A84C;
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
  font-size: 10pt;
  font-weight: 700;
  color: #0D1829;
}

.ftr-v {
  font-size: 11pt;
  font-weight: 700;
  color: #0D1829;
  overflow: hidden;
  text-overflow: ellipsis;
}
`;
