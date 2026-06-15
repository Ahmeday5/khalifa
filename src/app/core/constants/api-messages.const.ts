/**
 * Central Arabic translation layer for backend (English) messages.
 *
 * The API returns its `message` field in English ("Shareholder created
 * successfully.", "Cannot delete … because it is linked to …"). We never want
 * that English text to reach the user, but we also must NOT discard meaningful
 * errors (e.g. delete-constraint failures that explain *why* an action was
 * blocked). This module maps each known backend message to a clear Arabic
 * equivalent.
 *
 * Resolution order (see `translateApiMessage`):
 *   1. exact dictionary match (case-/period-insensitive)
 *   2. first matching regex pattern (covers parameterized messages)
 *   3. `null` — caller decides the fallback
 *
 * Adding a new mapping: drop the exact English string into `EXACT_MESSAGES`,
 * or add a `{ test, ar }` rule to `MESSAGE_PATTERNS` for anything dynamic.
 */

/** True when the string contains at least one Arabic letter. */
export function containsArabic(text: string): boolean {
  return /[؀-ۿ]/.test(text);
}

/** Lowercase, collapse whitespace, strip surrounding quotes and trailing punctuation. */
function normalize(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[.!]+$/g, '')
    .toLowerCase();
}

/**
 * Exact matches — keys are already `normalize()`d (lowercase, no trailing
 * period). Prefer these for fixed, unambiguous server strings.
 */
const EXACT_MESSAGES: Record<string, string> = {
  success: 'تمت العملية بنجاح',
  // CRUD — shareholders
  'shareholder created successfully': 'تمت إضافة المساهم بنجاح',
  'shareholder updated successfully': 'تم حفظ تعديلات المساهم',
  'shareholder deleted successfully': 'تم حذف المساهم بنجاح',
  // Auth
  'invalid credentials': 'بيانات الدخول غير صحيحة',
  'invalid email or password': 'بيانات الدخول غير صحيحة',
  unauthorized: 'يلزم تسجيل الدخول للمتابعة',
  forbidden: 'ليس لديك صلاحية للقيام بهذا الإجراء',
};

interface MessagePattern {
  readonly test: RegExp;
  /** Receives the regex match so dynamic fragments can be reused if needed. */
  readonly ar: (match: RegExpMatchArray) => string;
}

/**
 * Clear, actionable message for relational (foreign-key) constraint failures —
 * the backend can't tell us *which* records are linked, so we explain the cause
 * and the fix in plain Arabic instead of leaking "Foreign Key constraint".
 */
const LINKED_RECORDS_AR =
  'لا يمكن حذف هذا العنصر لارتباطه بسجلات أخرى في النظام. يجب حذف أو فكّ ارتباط هذه السجلات أولاً ثم إعادة المحاولة.';

/**
 * Regex rules for parameterized / family-of messages. Order matters — the
 * first match wins, so list the most specific rules first.
 */
const MESSAGE_PATTERNS: readonly MessagePattern[] = [
  // ── relational / delete constraints (keep the "linked records" meaning) ──
  // Duplicate-key first: it's a *unique* constraint (already-exists), not an FK.
  {
    test: /unique\s+(?:key\s+)?constraint|duplicate\s+(?:key|entry|value)/i,
    ar: () => 'لا يمكن الحفظ لوجود قيمة مكرّرة بالفعل في النظام.',
  },
  // Foreign-key / referential integrity — incl. the backend's mixed Arabic line
  // "… بسبب ارتباط البيانات (Foreign Key constraint)".
  {
    test: /foreign[\s_]*key|fk[\s_]*constraint|referential|integrity\s+constraint|\bconstraint\b|ارتباط\s+البيانات|مرتبط(?:ة)?\s+ب/i,
    ar: () => LINKED_RECORDS_AR,
  },
  {
    test: /cannot\s+(?:be\s+)?delet|can'?t\s+(?:be\s+)?delet|unable\s+to\s+delet/i,
    ar: () => LINKED_RECORDS_AR,
  },
  {
    test: /(?:is|are)\s+(?:linked|associated|related|referenced|connected|in\s+use)|\bhas\s+(?:related|associated|linked|existing|dependent)\b|still\s+(?:has|in\s+use|referenced)|in\s+use\s+by/i,
    ar: () => LINKED_RECORDS_AR,
  },

  // ── existence / duplication ──
  { test: /already\s+exist/i, ar: () => 'هذا العنصر موجود بالفعل' },
  { test: /\bnot\s+found\b/i, ar: () => 'العنصر المطلوب غير موجود' },
  { test: /does\s+not\s+exist/i, ar: () => 'العنصر المطلوب غير موجود' },

  // ── shareholder capital / profit capitalisation (more specific than the
  //    generic balance rules below, so they must come first) ──
  {
    test: /accrued\s+profit|مساهم.*أرباح\s+مستحق|cannot\s+delete.*accrued|has\s+(?:pending|unsettled|accrued)\s+profit/i,
    ar: () =>
      'لا يمكن حذف المساهم لوجود أرباح مستحقة غير مُسوَّاة. قم بتسوية أرباحه أو رسملتها أولاً.',
  },
  {
    test: /(?:amount|value).*exceed.*profit|exceed(?:s|ed)?\s+(?:the\s+)?available\s+profit|more\s+than\s+(?:the\s+)?available\s+profit|profit.*(?:is\s+)?(?:insufficient|not\s+enough)/i,
    ar: () => 'المبلغ يتجاوز الأرباح المتاحة لهذا المساهم.',
  },
  {
    test: /no\s+(?:accrued\s+)?profits?\s+to\s+capitaliz|nothing\s+to\s+capitaliz|capitaliz.*zero|zero.*capitaliz/i,
    ar: () => 'لا توجد أرباح مستحقة للرسملة حاليًا.',
  },
  {
    test: /(?:profits?|representative|delegate)\s+treasur(?:y|ies)|treasury\s+(?:type\s+)?(?:is\s+)?not\s+(?:allowed|permitted|valid)|cannot\s+(?:use|select)\s+(?:this\s+)?treasury/i,
    ar: () =>
      'لا يمكن استخدام هذه الخزينة في حركة رأس المال؛ اختر خزينة نقدية عادية (ليست خزينة أرباح أو خزينة مندوبين).',
  },

  // ── balances / amounts ──
  {
    test: /amount\s+exceeds\s+the\s+remaining\s+balance/i,
    ar: (match) => {
      const num = match[0].match(/[\d,]+\.?\d*/)?.[0];
      return num
        ? `المبلغ يتجاوز الرصيد المتبقي للفاتورة (${num} ج.م).`
        : 'المبلغ يتجاوز الرصيد المتبقي للفاتورة.';
    },
  },
  {
    test: /insufficient\s+(?:funds|balance)/i,
    ar: () => 'الرصيد غير كافٍ لإتمام العملية',
  },
  {
    test: /(?:balance|amount).*(?:exceed|not\s+enough|too\s+(?:low|small))/i,
    ar: () => 'المبلغ غير صالح أو يتجاوز الرصيد المتاح',
  },

  // ── auth ──
  { test: /invalid\s+(?:credential|password|email)/i, ar: () => 'بيانات الدخول غير صحيحة' },
  { test: /\b(?:un)?authoriz|not\s+authenticated/i, ar: () => 'يلزم تسجيل الدخول للمتابعة' },
  { test: /\bforbidden\b|access\s+denied|not\s+allowed|no\s+permission/i, ar: () => 'ليس لديك صلاحية للقيام بهذا الإجراء' },

  // ── generic validation ──
  { test: /\bis\s+required\b/i, ar: () => 'بعض الحقول المطلوبة غير مكتملة' },
  { test: /\b(?:invalid|bad)\s+(?:request|data|input|value)/i, ar: () => 'البيانات المُدخلة غير صحيحة' },
  { test: /validation\s+(?:failed|error)/i, ar: () => 'فشل التحقق من صحة البيانات' },

  // ── generic failure (catch-all for bare "Operation failed", "Request failed") ──
  {
    test: /operation\s+failed|request\s+failed|something\s+went\s+wrong|an?\s+error\s+occurred/i,
    ar: () => 'تعذّر إتمام العملية، يرجى المحاولة مرة أخرى.',
  },

  // ── CRUD success families (bonus — most success toasts use Arabic literals) ──
  { test: /\bcreated\s+successfully\b/i, ar: () => 'تمت الإضافة بنجاح' },
  { test: /\bupdated\s+successfully\b/i, ar: () => 'تم حفظ التعديلات بنجاح' },
  { test: /\bdeleted\s+successfully\b/i, ar: () => 'تم الحذف بنجاح' },
  { test: /\b(?:saved|completed|done)\s+successfully\b/i, ar: () => 'تمت العملية بنجاح' },
];

/**
 * Translate a backend message to Arabic.
 *
 * @returns the Arabic translation, or `null` when no mapping is known (the
 *          caller then falls back to a status-based generic).
 */
export function translateApiMessage(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const key = normalize(raw);
  if (!key) return null;

  const exact = EXACT_MESSAGES[key];
  if (exact) return exact;

  const trimmed = raw.trim();
  for (const { test, ar } of MESSAGE_PATTERNS) {
    const match = trimmed.match(test);
    if (match) return ar(match);
  }

  return null;
}
