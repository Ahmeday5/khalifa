import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

/**
 * Describes one column in a printable table.
 * `key` can either pick a property off the row or compute a value from the row.
 */
export interface PrintColumn<T> {
  readonly key: keyof T | ((row: T) => unknown);
  readonly header: string;
  readonly align?: 'start' | 'center' | 'end';
  /** CSS width hint (e.g. `'120px'`, `'12%'`). Otherwise auto. */
  readonly width?: string;
  /**
   * Either a named formatter (consistent with the app's pipes) or a custom
   * function. Custom functions receive the resolved value and the row.
   */
  readonly format?:
    | 'currency'
    | 'date'
    | 'shortDate'
    | 'percent'
    | 'number'
    | ((value: unknown, row: T) => string);
  /** Visual emphasis — use sparingly (totals, identifiers). */
  readonly bold?: boolean;
}

/** A `label: value` pair shown in the report header (filters, date range, …). */
export interface PrintMetaItem {
  readonly label: string;
  readonly value: string;
}

/** Optional totals row appended below the table body. */
export interface PrintTotals {
  /** Label cell text (defaults to "الإجمالي"). */
  readonly label?: string;
  /** Spans applied to the label cell (defaults to 1). */
  readonly labelColSpan?: number;
  /**
   * Cells after the label. Each entry's index maps 1-to-1 against the columns
   * starting at `labelColSpan`. Use `null` for an empty cell.
   */
  readonly cells: ReadonlyArray<string | null>;
}

export interface PrintConfig<T> {
  readonly title: string;
  readonly subtitle?: string;
  readonly columns: ReadonlyArray<PrintColumn<T>>;
  readonly rows: ReadonlyArray<T>;
  readonly meta?: ReadonlyArray<PrintMetaItem>;
  readonly totals?: PrintTotals;
  readonly orientation?: 'portrait' | 'landscape';
  /** Override the default empty-state line ("لا توجد بيانات للطباعة."). */
  readonly emptyMessage?: string;
  /** Show "إجمالي السجلات: N" under the title. Defaults to true. */
  readonly showRowCount?: boolean;
}

/**
 * Generates a professional A4 PDF-ready document for any tabular report.
 *
 * Implementation note: we render into a hidden iframe and invoke the browser's
 * native print pipeline. This avoids shipping a JS PDF library (smaller
 * bundle, no Arabic-font embedding cost) and keeps the screen styles isolated
 * from print styles — fixes the long-standing "page bleeds dashboard chrome"
 * and "only first page renders" bugs that the per-component `@media print`
 * blocks suffered from.
 */
@Injectable({ providedIn: 'root' })
export class PrintService {
  private readonly auth = inject(AuthService);
  private readonly months = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ];

  /**
   * Builds the report document, opens a hidden iframe, prints it, then
   * cleans up. Returns when the print dialog has been dispatched (or
   * immediately rejected if the browser blocks it — e.g. third-party
   * iframe restrictions).
   */
  print<T>(config: PrintConfig<T>): void {
    const html = this.buildDocument(config);
    const orientation = config.orientation ?? 'portrait';
    // A4 minus typical printer margins. The iframe must lay out content at
    // the *printable* width of the target page — otherwise the table flows
    // in the wrong width, the browser measures the content height against
    // the wrong page height, and pagination falls apart (the symptom: the
    // PDF only shows page 1 even though every row is in the markup).
    const widthMm = orientation === 'landscape' ? 297 : 210;
    const heightMm = orientation === 'landscape' ? 210 : 297;

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('title', 'تجهيز الطباعة');
    iframe.style.cssText = [
      'position:fixed',
      'left:-10000px',
      'top:0',
      `width:${widthMm}mm`,
      `height:${heightMm}mm`,
      'border:0',
      'opacity:0',
      'pointer-events:none',
      'z-index:-1',
    ].join(';');
    document.body.appendChild(iframe);

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      // Defer one tick so the print job dispatches before we yank the iframe.
      setTimeout(() => iframe.remove(), 0);
    };

    iframe.onload = () => {
      const win = iframe.contentWindow;
      const doc = iframe.contentDocument;
      if (!win || !doc) {
        cleanup();
        return;
      }
      // Some browsers (Chrome) restore focus to opener after print closes —
      // listen for that to clean up, with a long fallback timer for browsers
      // that don't fire `afterprint` inside the iframe.
      win.addEventListener('afterprint', cleanup, { once: true });

      // Wait for fonts to be ready (so glyph metrics are final), then for
      // two animation frames + a layout read so the table has been fully
      // measured against the A4 viewport. Chrome will otherwise snapshot
      // the document mid-layout and emit a single-page PDF even when every
      // row is in the markup.
      const docWithFonts = doc as Document & {
        fonts?: { ready: Promise<unknown> };
      };
      const fontsReady = docWithFonts.fonts?.ready ?? Promise.resolve();

      Promise.resolve(fontsReady).then(() => {
        win.requestAnimationFrame(() => {
          // Force one layout pass so the page-break boxes are committed.
          void doc.body.offsetHeight;
          win.requestAnimationFrame(() => {
            try {
              win.focus();
              win.print();
            } catch {
              /* silently fall through to fallback cleanup */
            }
            // Fallback in case the browser never fires `afterprint`.
            setTimeout(cleanup, 60_000);
          });
        });
      });
    };

    // Use `srcdoc` (no document.write, no cross-origin concerns):
    // the iframe inherits about:srcdoc and the content is treated as trusted
    // HTML we just generated. All row data is HTML-escaped via `esc()`.
    iframe.srcdoc = html;
  }

  // ─────────────────────── private: document assembly ───────────────────────

  private buildDocument<T>(config: PrintConfig<T>): string {
    const {
      title,
      subtitle,
      columns,
      rows,
      meta,
      totals,
      orientation = 'portrait',
      emptyMessage = 'لا توجد بيانات للطباعة.',
      showRowCount = true,
    } = config;

    const user = this.auth.currentUser();
    const generatedAt = this.formatDateTime(new Date());

    const headerBlock = `
      <header class="rpt-header">
        <div class="rpt-brand">
          <div class="rpt-brand-name">${esc(environment.appName)}</div>
          <div class="rpt-brand-version">${esc('إصدار ' + environment.appVersion)}</div>
        </div>
        <div class="rpt-title-block">
          <h1 class="rpt-title">${esc(title)}</h1>
          ${subtitle ? `<p class="rpt-subtitle">${esc(subtitle)}</p>` : ''}
        </div>
      </header>`;

    const metaItems: PrintMetaItem[] = [
      { label: 'تاريخ الطباعة', value: generatedAt },
      ...(user ? [{ label: 'المستخدم', value: user.name }] : []),
      ...(showRowCount ? [{ label: 'إجمالي السجلات', value: String(rows.length) }] : []),
      ...(meta ?? []),
    ];

    const metaBlock = metaItems.length > 0
      ? `<section class="rpt-meta">
          ${metaItems
            .map(
              (m) => `
                <div class="rpt-meta-item">
                  <span class="rpt-meta-label">${esc(m.label)}</span>
                  <span class="rpt-meta-value">${esc(m.value)}</span>
                </div>`,
            )
            .join('')}
        </section>`
      : '';

    const tableBlock = rows.length === 0
      ? `<div class="rpt-empty">${esc(emptyMessage)}</div>`
      : this.buildTable(columns, rows, totals);

    return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>${esc(title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>${this.styles(orientation)}</style>
</head>
<body>
  <main class="rpt">
    ${headerBlock}
    ${metaBlock}
    ${tableBlock}
    <footer class="rpt-footer">
      <span>${esc(environment.appName)} — ${esc(title)}</span>
      <span>${esc(generatedAt)}</span>
    </footer>
  </main>
</body>
</html>`;
  }

  private buildTable<T>(
    columns: ReadonlyArray<PrintColumn<T>>,
    rows: ReadonlyArray<T>,
    totals: PrintTotals | undefined,
  ): string {
    const head = `
      <thead>
        <tr>
          ${columns
            .map(
              (c) => `
                <th class="ta-${c.align ?? 'start'}"${c.width ? ` style="width:${esc(c.width)}"` : ''}>
                  ${esc(c.header)}
                </th>`,
            )
            .join('')}
        </tr>
      </thead>`;

    const body = `
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>
                ${columns
                  .map((c) => {
                    const raw = this.resolveValue(c, row);
                    const text = this.formatValue(c, raw, row);
                    return `<td class="ta-${c.align ?? 'start'}${c.bold ? ' td-bold' : ''}">${esc(text)}</td>`;
                  })
                  .join('')}
              </tr>`,
          )
          .join('')}
      </tbody>`;

    const foot = totals ? this.buildTotalsRow(columns.length, totals) : '';

    return `<table class="rpt-table">${head}${body}${foot}</table>`;
  }

  private buildTotalsRow(columnCount: number, totals: PrintTotals): string {
    const labelSpan = Math.max(1, totals.labelColSpan ?? 1);
    const remaining = columnCount - labelSpan;
    const cells = totals.cells.slice(0, remaining);
    const padding = Array.from({ length: Math.max(0, remaining - cells.length) }, () => '');
    const allCells = [...cells, ...padding]
      .map((v) => `<td class="ta-end td-bold">${esc(v ?? '')}</td>`)
      .join('');
    return `
      <tfoot>
        <tr class="rpt-totals">
          <td class="td-bold" colspan="${labelSpan}">${esc(totals.label ?? 'الإجمالي')}</td>
          ${allCells}
        </tr>
      </tfoot>`;
  }

  // ─────────────────────── private: formatters ───────────────────────

  private resolveValue<T>(col: PrintColumn<T>, row: T): unknown {
    return typeof col.key === 'function'
      ? col.key(row)
      : (row as Record<string, unknown>)[col.key as string];
  }

  private formatValue<T>(col: PrintColumn<T>, raw: unknown, row: T): string {
    if (typeof col.format === 'function') return col.format(raw, row);
    if (raw === null || raw === undefined || raw === '') return '—';

    switch (col.format) {
      case 'currency':  return this.formatCurrency(raw);
      case 'date':      return this.formatDate(raw, 'long');
      case 'shortDate': return this.formatDate(raw, 'short');
      case 'percent':   return this.formatPercent(raw);
      case 'number':    return this.formatNumber(raw);
      default:          return String(raw);
    }
  }

  private formatCurrency(raw: unknown): string {
    const n = Number(raw);
    if (!Number.isFinite(n)) return '—';
    return `${Math.round(n).toLocaleString('ar-EG')} ${environment.currency}`;
  }

  private formatNumber(raw: unknown): string {
    const n = Number(raw);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('ar-EG');
  }

  private formatPercent(raw: unknown): string {
    const n = Number(raw);
    if (!Number.isFinite(n)) return '—';
    return `${n}%`;
  }

  private formatDate(raw: unknown, kind: 'short' | 'long'): string {
    const date = raw instanceof Date ? raw : new Date(String(raw));
    if (isNaN(date.getTime())) return '—';
    const d = date.getDate();
    const m = this.months[date.getMonth()];
    const y = date.getFullYear();
    return kind === 'short'
      ? `${d}/${date.getMonth() + 1}/${y}`
      : `${d} ${m} ${y}`;
  }

  private formatDateTime(date: Date): string {
    const d = this.formatDate(date, 'short');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${d} — ${hh}:${mm}`;
  }

  // ─────────────────────── private: print stylesheet ───────────────────────

  private styles(orientation: 'portrait' | 'landscape'): string {
    return `
      @page {
        size: A4 ${orientation};
        margin: 14mm 12mm 16mm 12mm;
        @bottom-center {
          content: "صفحة " counter(page) " من " counter(pages);
          font-family: "Segoe UI", Tahoma, Arial, sans-serif;
          font-size: 8.5pt;
          color: #6b7280;
        }
      }
      *, *::before, *::after { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        background: #fff;
        color: #111827;
        font-family: "Segoe UI", Tahoma, Cairo, "Noto Sans Arabic", Arial, sans-serif;
        font-size: 11pt;
        line-height: 1.45;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .rpt { padding: 0; }

      /* Header */
      .rpt-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        border-bottom: 2px solid #0f3a6b;
        padding-bottom: 10px;
        margin-bottom: 12px;
      }
      .rpt-brand {
        text-align: start;
        color: #0f3a6b;
      }
      .rpt-brand-name {
        font-size: 16pt;
        font-weight: 800;
        letter-spacing: .2px;
      }
      .rpt-brand-version {
        font-size: 8.5pt;
        color: #6b7280;
        margin-top: 2px;
      }
      .rpt-title-block { text-align: end; }
      .rpt-title {
        margin: 0;
        font-size: 15pt;
        font-weight: 700;
        color: #111827;
      }
      .rpt-subtitle {
        margin: 4px 0 0 0;
        font-size: 9.5pt;
        color: #6b7280;
      }

      /* Meta strip */
      .rpt-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 18px;
        padding: 8px 12px;
        background: #f4f6fa;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        margin-bottom: 14px;
        font-size: 9pt;
      }
      .rpt-meta-item { display: inline-flex; gap: 6px; }
      .rpt-meta-label { color: #6b7280; font-weight: 600; }
      .rpt-meta-value { color: #111827; font-weight: 700; }

      /* Table */
      .rpt-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: auto;
        font-size: 9.5pt;
      }
      .rpt-table thead {
        /* Repeat header on every printed page. */
        display: table-header-group;
      }
      .rpt-table tfoot {
        display: table-footer-group;
      }
      .rpt-table th, .rpt-table td {
        border: 1px solid #d1d5db;
        padding: 6px 8px;
        vertical-align: middle;
        word-wrap: break-word;
      }
      .rpt-table th {
        background: #0f3a6b;
        color: #fff;
        font-weight: 700;
        font-size: 9pt;
      }
      .rpt-table tbody tr {
        /* Don't split a row across two pages. */
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .rpt-table tbody tr:nth-child(even) td { background: #fafbfc; }
      .rpt-totals td {
        background: #eef2f7 !important;
        border-top: 2px solid #0f3a6b;
        font-weight: 700;
      }

      .td-bold { font-weight: 700; }
      .ta-start  { text-align: start; }
      .ta-center { text-align: center; }
      .ta-end    { text-align: end; }

      /* Empty state */
      .rpt-empty {
        padding: 40px 12px;
        text-align: center;
        color: #6b7280;
        border: 1px dashed #d1d5db;
        border-radius: 6px;
      }

      /* Document-end footer (page numbers are emitted by the @page
         margin-box defined at the top of this stylesheet). */
      .rpt-footer {
        margin-top: 16px;
        padding-top: 8px;
        border-top: 1px solid #e5e7eb;
        display: flex;
        justify-content: space-between;
        font-size: 8.5pt;
        color: #6b7280;
      }
    `;
  }
}

/**
 * Minimal HTML escaper. We control the markup template; only dynamic values
 * pass through here. Covers the five characters that change parser state.
 */
function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
