import { Injectable } from '@angular/core';

const COMPANY_PHONE  = '01129912187';
const COMPANY_PHONE2 = '01111446789';
const COMPANY_CITY   = 'القاهرة - العباسية';

export interface ContractSlipData {
  contractId:          number;
  dateOfSale:          string;
  clientName:          string;
  clientPhone:         string;
  clientCode?:         string | null;
  clientAddress?:      string | null;
  clientRegion?:       string | null;
  clientOccupation?:   string | null;
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

  // ─── HTML document ───────────────────────────────────────────────────────────

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
      .join(' + ') || '—';
    const region  = esc(data.clientRegion  ?? '—');
    const code    = esc(data.clientCode    ?? String(data.contractId));
    const repName = esc(data.repName       ?? '—');
    const repPhone= esc(data.repPhone      ?? '—');

    return `
<div class="slip">

  <!-- ═══ HEADER ═══ -->
  <div class="hdr">

    <!-- RIGHT: Logo + Brand -->
    <div class="hdr-brand">
      <div class="logo-box">
        <svg class="logo-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- House outline -->
          <path d="M8 30L32 10L56 30V56H40V42H24V56H8V30Z" stroke="#C9A84C" stroke-width="3" fill="none"/>
          <!-- Door -->
          <rect x="26" y="42" width="12" height="14" rx="1" stroke="#C9A84C" stroke-width="2" fill="none"/>
          <!-- Window left -->
          <rect x="12" y="34" width="8" height="7" rx="1" fill="#C9A84C" opacity=".7"/>
          <!-- Window right -->
          <rect x="44" y="34" width="8" height="7" rx="1" fill="#C9A84C" opacity=".7"/>
          <!-- Sofa seat -->
          <rect x="18" y="44" width="28" height="7" rx="2" stroke="#C9A84C" stroke-width="1.5" fill="none"/>
          <!-- Sofa back -->
          <rect x="16" y="40" width="32" height="5" rx="2" stroke="#C9A84C" stroke-width="1.5" fill="none"/>
          <!-- Sofa legs -->
          <line x1="20" y1="51" x2="20" y2="54" stroke="#C9A84C" stroke-width="1.5"/>
          <line x1="44" y1="51" x2="44" y2="54" stroke="#C9A84C" stroke-width="1.5"/>
        </svg>
      </div>
      <div class="brand-text">
        <div class="brand-name">شركة الخليفة</div>
        <div class="brand-sub">للمفروشات والأدوات المنزلية</div>
      </div>
    </div>

    <!-- CENTER: Title -->
    <div class="hdr-title">
      <div class="title-line">
        <span class="title-dash">—</span>
        <span class="title-text">إيصال قبض</span>
        <span class="title-dash">—</span>
      </div>
    </div>

    <!-- LEFT: Receipt data box -->
    <div class="hdr-data">
      <div class="data-label">بيانات الايصال</div>
      <div class="data-grid">
        <span class="dg-k">الكود</span>
        <span class="dg-sep"></span>
        <span class="dg-k">الاجمالي</span>
        <span class="dg-v">${code}</span>
        <span class="dg-sep"></span>
        <span class="dg-v">${this.fmtMoney(data.totalAmount)}</span>
        <span class="dg-k">المنطقة</span>
        <span class="dg-sep"></span>
        <span class="dg-k">${total} قسط</span>
        <span class="dg-v">${region}</span>
        <span class="dg-sep"></span>
        <span class="dg-v">${this.fmtMoney(data.installmentAmount)}</span>
      </div>
    </div>

  </div><!-- /.hdr -->

  <!-- ═══ CLIENT INFO ═══ -->
  <div class="client-section">

    <!-- Clipboard icon column -->
    <div class="clip-col">
      <svg class="clip-svg" viewBox="0 0 40 52" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="8" width="32" height="40" rx="3" fill="#0C2340"/>
        <rect x="4" y="8" width="32" height="40" rx="3" stroke="#C9A84C" stroke-width="1.5"/>
        <rect x="13" y="2" width="14" height="10" rx="2" fill="#C9A84C"/>
        <rect x="13" y="2" width="14" height="10" rx="2" stroke="#0C2340" stroke-width="1"/>
        <circle cx="20" cy="7" r="2" fill="#0C2340"/>
        <!-- checkmark -->
        <path d="M11 28l5 5 10-10" stroke="#C9A84C" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>

    <!-- Client table -->
    <table class="client-tbl">
      <tr>
        <td class="ct-hdr">الاسم</td>
        <td class="ct-val ct-bold ct-name">${esc(data.clientName)}</td>
        <td class="ct-hdr">الموبايل</td>
        <td class="ct-val ct-ltr">${esc(data.clientPhone) || '—'}</td>
      </tr>
      <tr>
        <td class="ct-hdr">العنوان</td>
        <td class="ct-val">${esc(data.clientAddress ?? '—')}</td>
        <td class="ct-hdr">الوظيفة</td>
        <td class="ct-val">${esc(data.clientOccupation ?? '—')}</td>
      </tr>
      <tr>
        <td class="ct-hdr">العمل</td>
        <td class="ct-val">${esc(data.clientRegion ?? '—')}</td>
        <td class="ct-hdr">قيمة القسط</td>
        <td class="ct-val ct-inst">${this.fmtMoney(inst.amount)}</td>
      </tr>
    </table>

  </div><!-- /.client-section -->

  <!-- ═══ PRODUCT / PAYMENT ═══ -->
  <table class="prod-tbl">
    <thead>
      <tr>
        <th class="pt-hdr">المنتج</th>
        <th class="pt-hdr">طريقة السداد</th>
        <th class="pt-hdr">قيمة القسط</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="pt-product">${productText}</td>
        <td class="pt-method">المبلغ فقط لا غير</td>
        <td class="pt-amount">
          <span class="amt-value">${this.fmtMoney(inst.amount)} جنيه</span>
          <div class="amt-remaining">
            المبلغ المتبقي بعد القسط الحالي
            <br>
            <span class="amt-rem-val">${this.fmtMoney(remainingAfter)} جنيه</span>
          </div>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- ═══ FOOTER INFO ═══ -->
  <div class="footer-info">

    <!-- RIGHT: Sale date + first installment -->
    <div class="fi-col fi-dates">
      <div class="fi-col-hdr">
        <svg class="fi-icon" viewBox="0 0 20 20" fill="none">
          <rect x="2" y="3" width="16" height="15" rx="2" stroke="currentColor" stroke-width="1.5"/>
          <path d="M2 7h16" stroke="currentColor" stroke-width="1.5"/>
          <rect x="6" y="1" width="2" height="4" rx="1" fill="currentColor"/>
          <rect x="12" y="1" width="2" height="4" rx="1" fill="currentColor"/>
        </svg>
        تاريخ البيع
      </div>
      <div class="fi-value">${this.fmtDate(data.dateOfSale)}</div>
      <div class="fi-col-hdr fi-mt">
        <svg class="fi-icon" viewBox="0 0 20 20" fill="none">
          <rect x="2" y="3" width="16" height="15" rx="2" stroke="currentColor" stroke-width="1.5"/>
          <path d="M2 7h16" stroke="currentColor" stroke-width="1.5"/>
          <rect x="6" y="1" width="2" height="4" rx="1" fill="currentColor"/>
          <rect x="12" y="1" width="2" height="4" rx="1" fill="currentColor"/>
        </svg>
        تاريخ بداية الأقساط
      </div>
      <div class="fi-value">${this.fmtDate(data.firstInstallmentDate)}</div>
    </div>

    <!-- CENTER: Representative -->
    <div class="fi-col fi-rep">
      <div class="fi-col-hdr">
        <svg class="fi-icon" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="6" r="3.5" stroke="currentColor" stroke-width="1.5"/>
          <path d="M3 17c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        يحصل في
      </div>
      <div class="fi-row">
        <span class="fi-label">المندوب</span>
        <span class="fi-val-text">${repName}</span>
      </div>
      <div class="fi-row">
        <span class="fi-label">الموبايل</span>
        <span class="fi-val-text fi-ltr">${repPhone}</span>
      </div>
    </div>

    <!-- LEFT: Company contact -->
    <div class="fi-col fi-company">
      <div class="fi-col-hdr">
        <svg class="fi-icon" viewBox="0 0 20 20" fill="none">
          <path d="M2 5a2 2 0 012-2h2.5a1 1 0 01.95.684l1 3a1 1 0 01-.275 1.05l-1.3 1.3a9.042 9.042 0 004.096 4.096l1.3-1.3a1 1 0 011.05-.275l3 1a1 1 0 01.684.95V16a2 2 0 01-2 2C7.164 18 2 12.836 2 6.5 2 5.672 2 5 2 5z" stroke="currentColor" stroke-width="1.3"/>
        </svg>
        للتواصل مع الشركة
      </div>
      <div class="fi-row">
        <span class="fi-label">موبايل المندوب</span>
        <span class="fi-val-text fi-ltr">${esc(COMPANY_PHONE)}</span>
      </div>
    </div>

  </div><!-- /.footer-info -->

  <!-- ═══ BOTTOM BAR ═══ -->
  <div class="bottom-bar">
    <span class="bb-item">
      <svg class="bb-icon" viewBox="0 0 16 16" fill="none">
        <path d="M1 4a1.5 1.5 0 011.5-1.5h1.8a.75.75 0 01.713.513l.75 2.25a.75.75 0 01-.206.788L4.62 7.3a6.78 6.78 0 003.075 3.075l1.25-.975a.75.75 0 01.788-.206l2.25.75a.75.75 0 01.513.713V12.5A1.5 1.5 0 0111 14C5.477 14 1 9.523 1 4z" stroke="currentColor" stroke-width="1.2"/>
      </svg>
      ${esc(COMPANY_PHONE)}
    </span>
    <span class="bb-sep">|</span>
    <span class="bb-item">
      <svg class="bb-icon" viewBox="0 0 16 16" fill="none">
        <path d="M1 4a1.5 1.5 0 011.5-1.5h1.8a.75.75 0 01.713.513l.75 2.25a.75.75 0 01-.206.788L4.62 7.3a6.78 6.78 0 003.075 3.075l1.25-.975a.75.75 0 01.788-.206l2.25.75a.75.75 0 01.513.713V12.5A1.5 1.5 0 0111 14C5.477 14 1 9.523 1 4z" stroke="currentColor" stroke-width="1.2"/>
      </svg>
      ${esc(COMPANY_PHONE2)}
    </span>
    <span class="bb-sep">|</span>
    <span class="bb-item">
      <svg class="bb-icon" viewBox="0 0 16 16" fill="none">
        <path d="M8 1C5.24 1 3 3.24 3 6c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5zm0 6.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" stroke="currentColor" stroke-width="1.2"/>
      </svg>
      ${esc(COMPANY_CITY)}
    </span>
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
      'width:297mm', 'height:210mm',
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

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');

@page {
  size: A4 landscape;
  margin: 6mm 8mm 6mm 8mm;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  background: #fff;
  color: #0D1829;
  font-family: 'Cairo', 'Segoe UI', Tahoma, 'Noto Sans Arabic', Arial, sans-serif;
  font-size: 9pt;
  line-height: 1.45;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  color-adjust: exact;
}

/* ══ One slip per page ══ */
.slip {
  width: 100%;
  display: flex;
  flex-direction: column;
  page-break-after: always;
  break-after: page;
  border: 2.5px solid #0C2340;
  border-radius: 6px;
  overflow: hidden;
  min-height: 192mm;
  background: #fff;
}
.slip:last-child { page-break-after: avoid; break-after: avoid; }

/* ══════════════════════════════════════════
   HEADER
══════════════════════════════════════════ */
.hdr {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: stretch;
  background: #0C2340;
  color: #fff;
  min-height: 36mm;
}

/* ── Brand (right) ── */
.hdr-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px 10px 12px;
  border-left: 1px solid rgba(201,168,76,.25);
}

.logo-box {
  width: 56px;
  height: 56px;
  border: 2px solid #C9A84C;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(201,168,76,.08);
  flex-shrink: 0;
}

.logo-svg { width: 44px; height: 44px; }

.brand-text { display: flex; flex-direction: column; }

.brand-name {
  font-size: 20pt;
  font-weight: 900;
  color: #fff;
  letter-spacing: .3px;
  line-height: 1.1;
  white-space: nowrap;
}

.brand-sub {
  font-size: 7.5pt;
  color: #C9A84C;
  margin-top: 2px;
  letter-spacing: .2px;
  white-space: nowrap;
}

/* ── Title (center) ── */
.hdr-title {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 20px;
}

.title-line {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-text {
  font-size: 22pt;
  font-weight: 900;
  color: #fff;
  letter-spacing: 1px;
  white-space: nowrap;
}

.title-dash {
  font-size: 16pt;
  color: #C9A84C;
  font-weight: 400;
  opacity: .9;
}

/* ── Receipt data box (left) ── */
.hdr-data {
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(201,168,76,.25);
  min-width: 140px;
}

.data-label {
  background: #0A1D33;
  color: #C9A84C;
  font-size: 8pt;
  font-weight: 700;
  text-align: center;
  padding: 5px 12px;
  border-bottom: 1px solid rgba(201,168,76,.3);
  letter-spacing: .3px;
}

.data-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 2px 1fr;
  grid-template-rows: auto auto;
  padding: 6px 10px;
  gap: 3px 6px;
  align-content: center;
}

.dg-k {
  font-size: 7.5pt;
  color: rgba(255,255,255,.55);
  white-space: nowrap;
  align-self: end;
}

.dg-sep {
  background: rgba(255,255,255,.15);
  width: 1px;
  align-self: stretch;
  margin: 2px 0;
}

.dg-v {
  font-size: 9.5pt;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  align-self: start;
}

/* ══════════════════════════════════════════
   CLIENT INFO
══════════════════════════════════════════ */
.client-section {
  display: flex;
  align-items: stretch;
  border-bottom: 1.5px solid #C9A84C;
}

.clip-col {
  background: #0C2340;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 14px;
  border-left: 1.5px solid #C9A84C;
  flex-shrink: 0;
  width: 52px;
}

.clip-svg { width: 32px; height: 42px; }

.client-tbl {
  width: 100%;
  border-collapse: collapse;
}

.client-tbl tr {
  border-bottom: 1px solid #D8DEE9;
}

.client-tbl tr:last-child { border-bottom: none; }

.ct-hdr {
  background: #0C2340;
  color: #C9A84C;
  font-size: 8pt;
  font-weight: 700;
  padding: 6px 10px;
  white-space: nowrap;
  width: 10%;
  border-left: 1px solid rgba(201,168,76,.25);
  vertical-align: middle;
  letter-spacing: .2px;
}

.ct-val {
  background: #fff;
  color: #0D1829;
  font-size: 9pt;
  padding: 6px 12px;
  border-left: 1px solid #D8DEE9;
  vertical-align: middle;
  width: 28%;
}

.ct-val:last-child { border-left: none; }

.ct-bold { font-weight: 700; }
.ct-name { font-size: 10.5pt; font-weight: 900; color: #0C2340; }
.ct-ltr  { direction: ltr; text-align: right; unicode-bidi: embed; }
.ct-inst { font-size: 11pt; font-weight: 900; color: #B45309; }

/* ══════════════════════════════════════════
   PRODUCT / PAYMENT TABLE
══════════════════════════════════════════ */
.prod-tbl {
  width: 100%;
  border-collapse: collapse;
  border-bottom: 1.5px solid #C9A84C;
}

.pt-hdr {
  background: #0C2340;
  color: #C9A84C;
  font-size: 8.5pt;
  font-weight: 700;
  padding: 6px 12px;
  text-align: center;
  border-left: 1px solid rgba(201,168,76,.25);
  letter-spacing: .2px;
}

.pt-hdr:last-child { border-left: none; }

.pt-product {
  padding: 8px 14px;
  font-size: 10pt;
  font-weight: 700;
  color: #0C2340;
  border-left: 1px solid #D8DEE9;
  vertical-align: middle;
  width: 45%;
}

.pt-method {
  padding: 8px 14px;
  font-size: 9.5pt;
  font-weight: 700;
  color: #374151;
  text-align: center;
  border-left: 1px solid #D8DEE9;
  vertical-align: middle;
  width: 25%;
}

.pt-amount {
  padding: 8px 14px;
  text-align: center;
  vertical-align: middle;
  width: 30%;
}

.amt-value {
  display: block;
  font-size: 12pt;
  font-weight: 900;
  color: #B45309;
  line-height: 1.2;
}

.amt-remaining {
  margin-top: 4px;
  font-size: 7.5pt;
  color: #6B7280;
  line-height: 1.3;
}

.amt-rem-val {
  display: block;
  font-size: 11pt;
  font-weight: 900;
  color: #B45309;
  margin-top: 1px;
}

/* ══════════════════════════════════════════
   FOOTER INFO (3 columns)
══════════════════════════════════════════ */
.footer-info {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  flex: 1;
  border-bottom: 1.5px solid #C9A84C;
}

.fi-col {
  padding: 10px 14px;
  border-left: 1px solid #D8DEE9;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fi-col:last-child { border-left: none; }

.fi-dates { border-left: none; }

.fi-col-hdr {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 8.5pt;
  font-weight: 700;
  color: #fff;
  background: #0C2340;
  padding: 4px 8px;
  border-radius: 4px;
  width: fit-content;
}

.fi-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  stroke: #C9A84C;
}

.fi-value {
  font-size: 10pt;
  font-weight: 700;
  color: #0C2340;
  direction: ltr;
  text-align: right;
  padding-right: 4px;
}

.fi-mt { margin-top: 4px; }

.fi-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.fi-label {
  font-size: 7.5pt;
  color: #6B7280;
  white-space: nowrap;
  min-width: 52px;
}

.fi-val-text {
  font-size: 9.5pt;
  font-weight: 700;
  color: #0C2340;
}

.fi-ltr {
  direction: ltr;
  unicode-bidi: embed;
}

/* ══════════════════════════════════════════
   BOTTOM BAR
══════════════════════════════════════════ */
.bottom-bar {
  background: #0C2340;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 7px 16px;
  font-size: 8.5pt;
  font-weight: 600;
}

.bb-item {
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
  direction: ltr;
}

.bb-icon {
  width: 13px;
  height: 13px;
  stroke: #C9A84C;
  flex-shrink: 0;
}

.bb-sep {
  color: rgba(201,168,76,.4);
  font-size: 10pt;
}
`;
