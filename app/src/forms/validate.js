// Form validation and helpers for the form engine (05 §4, task 18). Pure: no DOM.
// validateForm(schema, values, state) → { fieldId: message }. Messages are short sentences a 7th grader can act on.
import { FORMS } from '../config.js';
import { formatMoney } from '../finance/money.js';
import { monthLabel, moveDates } from '../util/dates.js';

/** Kinds that hold a value (the rest are display-only: computed, info, clauses, table). */
export const VALUE_KINDS = new Set(['text', 'textarea', 'number', 'currency', 'select', 'radio', 'checkbox', 'month',
  'phone', 'signature', 'initials', 'question']);

/** A made-up phone number in the fictional 555-01xx range: (808) 555-0123, 808-555-0123, 8085550123. */
export const PHONE_RE = /^\(?\d{3}\)?[\s.-]*555[\s.-]*01\d{2}$/;

const OKINA_LIKE = /[ʻ‘’'`]/g;
const stripMarks = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');

/** Name for comparing signatures: ʻokina/apostrophes and kahakō dropped, spaces collapsed, lowercase. */
export function normalizeName(s) {
  return stripMarks(String(s ?? '')).replace(OKINA_LIKE, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** True when a typed signature matches the character name (forgiving only about ʻokina, kahakō, case and spaces). */
export function sameName(typed, name) {
  const want = normalizeName(name);
  return want !== '' && normalizeName(typed) === want;
}

/** Initials from a name: first letter of every word and hyphen part, ʻokina skipped, kahakō dropped ("Keʻala Kahananui-Akana" → "KKA"). */
export function deriveInitials(name) {
  return String(name ?? '').split(/[\s\-‐–]+/)
    .map((part) => stripMarks(part.replace(OKINA_LIKE, '')).match(/\p{L}/u)?.[0] ?? '')
    .join('').toUpperCase();
}

/** True when typed initials match the expected ones (letters only, any case, dots and spaces ignored). */
export function initialsMatch(typed, expected) {
  const clean = (s) => stripMarks(String(s ?? '')).replace(/[^\p{L}]/gu, '').toUpperCase();
  return clean(expected) !== '' && clean(typed) === clean(expected);
}

/** The player's character name from state (signatures and initials check against it). */
export const characterName = (state) => state?.player?.characterName ?? '';

/**
 * The date on every signature (05 §2): the month before the home starts, so "December 2032" for a first home and e.g.
 * "February 2034" for a move in March 2034 (task 58). Read-only documents pass the agreement's own month.
 */
export function signDateLabel(state) {
  const mi = state?.life?.monthIndex ?? 0;
  return mi > 0 ? moveDates(mi).signLabel : FORMS.signDate;
}

/** Options as [{value, label}] (accepts plain strings). */
export function optionList(options) {
  return (options || []).map((o) => (typeof o === 'object' ? { value: String(o.value), label: o.label ?? String(o.value) } : { value: String(o), label: String(o) }));
}

/** Format a value for display: 'money' (whole dollars) | 'money-cents' | 'percent' (decimal rate) | 'month' | fn | text. */
export function formatValue(format, v) {
  if (v == null || v === '' || Number.isNaN(v)) return '—';
  if (typeof format === 'function') return String(format(v));
  if (format === 'money') return formatMoney(v);
  if (format === 'money-cents') return formatMoney(v, { showCents: true });
  if (format === 'percent') return `${Number((v * 100).toFixed(3))}%`;
  if (format === 'month') return monthLabel(v);
  return String(v);
}

/** A computed field's {value, text}: field.compute(values, state), formatted by field.format. A throwing compute shows "—". */
export function computeField(field, values = {}, state = null) {
  let value = null;
  try { value = field.compute ? field.compute(values, state) : field.value ?? null; } catch { value = null; }
  return { value, text: formatValue(field.format, value) };
}

/** Rows for a read-only table: field.rows is an array or (values, state) → array. */
export function tableRows(field, values = {}, state = null) {
  try { return (typeof field.rows === 'function' ? field.rows(values, state) : field.rows) || []; } catch { return []; }
}

/** A stored value as plain text for read-only views (option labels, money, months, Yes/No). */
export function displayValue(field, value) {
  if (value == null || value === '') return '—';
  switch (field.kind) {
    case 'currency': return typeof value === 'number' ? formatMoney(value, { showCents: value % 100 !== 0 }) : String(value);
    case 'month': return monthLabel(Number(value));
    case 'select': case 'radio': return optionList(field.options).find((o) => o.value === String(value))?.label ?? String(value);
    case 'checkbox': return value ? 'Yes' : 'No';
    case 'number': return typeof value === 'number' ? value.toLocaleString('en-US') : String(value);
    default: return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}

/** Every field in schema order (sections flattened). */
export function allFields(schema) {
  return (schema.sections || []).flatMap((s) => s.fields || []);
}

/** Fields that are showing: field.when(values, state) hides a field (and skips its validation) when false. */
export function visibleFields(schema, values = {}, state = null) {
  return allFields(schema).filter((f) => !f.when || f.when(values, state));
}

/** True when a field has nothing filled in yet. */
export function isEmpty(field, value) {
  switch (field.kind) {
    case 'checkbox': return value !== true;
    case 'initials': return !value || !Object.values(value).some((v) => String(v ?? '').trim());
    case 'question': return !value || value.choice == null;
    default: return value == null || (typeof value === 'string' && value.trim() === '');
  }
}

function requiredMessage(field, ctx) {
  if (field.requiredMessage) return field.requiredMessage;
  switch (field.kind) {
    case 'select': case 'radio': case 'month': return 'Pick one.';
    case 'checkbox': return 'Check this box to go on.';
    case 'signature': return `Sign by typing your full name: ${characterName(ctx.state) || 'your name'}.`;
    case 'initials': return `Initial every clause with ${deriveInitials(characterName(ctx.state)) || 'your initials'}.`;
    case 'question': return 'Answer this question.';
    case 'currency': return 'Enter an amount.';
    case 'phone': return 'Enter a phone number.';
    default: return 'Fill this in.';
  }
}

const listText = (nums) => (nums.length < 2 ? String(nums[0]) : `${nums.slice(0, -1).join(', ')} and ${nums.at(-1)}`);

/** Built-in checks for a kind (format, signature match, initials, question answered right). */
function kindMessage(field, value, ctx) {
  const name = characterName(ctx.state);
  switch (field.kind) {
    case 'number': return typeof value === 'number' ? null : 'Enter a number, like 12.';
    case 'currency': return Number.isInteger(value) ? null : 'Enter a dollar amount, like 1,250 or 1,250.00.';
    case 'phone': return PHONE_RE.test(String(value).trim()) ? null
      : `Use a made-up number in the 555-01xx range, like ${FORMS.phoneHint.replace('xx', '23')}.`;
    case 'signature': return !name || sameName(value, name) ? null : `Your signature must match your name: ${name}.`;
    case 'initials': {
      const want = deriveInitials(name);
      const bad = (field.clauses || []).map((c, i) => (initialsMatch(value?.[c.id], want) ? null : i + 1)).filter(Boolean);
      if (!bad.length) return null;
      return `${bad.length === 1 ? 'Clause' : 'Clauses'} ${listText(bad)} ${bad.length === 1 ? 'needs' : 'need'} your initials, ${want}.`;
    }
    case 'question': return value.correct ? null : 'Pick the right answer to go on. Read the explanation and try again.';
    default: return null;
  }
}

function rangeText(field, n) {
  if (field.kind === 'currency') return formatMoney(n, { showCents: n % 100 !== 0 });
  if (field.kind === 'month') return monthLabel(n);
  return n.toLocaleString('en-US');
}

/** Validate one field. Returns a message, or null when it's fine. Hidden/display-only fields are always fine. */
export function validateField(field, value, ctx = {}) {
  const { values = {}, state = null } = ctx;
  if (!VALUE_KINDS.has(field.kind)) return null;
  if (isEmpty(field, value)) return field.required ? requiredMessage(field, { values, state }) : null;
  const kindMsg = kindMessage(field, value, { values, state });
  if (kindMsg) return kindMsg;
  if (typeof value === 'string') {
    const len = value.trim().length;
    if (field.minLength != null && len < field.minLength) return `Use at least ${field.minLength} characters.`;
    if (field.maxLength != null && len > field.maxLength) return `Use ${field.maxLength} characters or fewer.`;
    if (field.pattern && !new RegExp(field.pattern).test(value.trim())) return field.patternMessage ?? 'Check the format and try again.';
  }
  if (typeof value === 'number') {
    if (field.min != null && value < field.min) return field.kind === 'month' ? `Pick ${rangeText(field, field.min)} or later.` : `Enter at least ${rangeText(field, field.min)}.`;
    if (field.max != null && value > field.max) return field.kind === 'month' ? `Pick ${rangeText(field, field.max)} or earlier.` : `Enter no more than ${rangeText(field, field.max)}.`;
  }
  if (field.validate) return field.validate(value, values, state) || null;
  return null;
}

/** Validate every visible field. Returns { fieldId: message } (empty object = valid). */
export function validateForm(schema, values = {}, state = null) {
  const errors = {};
  for (const f of visibleFields(schema, values, state)) {
    const msg = validateField(f, values[f.id], { values, state });
    if (msg) errors[f.id] = msg;
  }
  return errors;
}

/** Required-field progress for the "3 of 8 required done" line: { done, total }. */
export function requiredProgress(schema, values = {}, state = null) {
  const req = visibleFields(schema, values, state).filter((f) => f.required && VALUE_KINDS.has(f.kind));
  const done = req.filter((f) => !validateField(f, values[f.id], { values, state })).length;
  return { done, total: req.length };
}

/** Starting values: field.default (or a function of state) for every value field not already given. */
export function initialValues(schema, given = {}, state = null) {
  const out = {};
  for (const f of allFields(schema)) {
    if (!VALUE_KINDS.has(f.kind) || f.default === undefined) continue;
    out[f.id] = typeof f.default === 'function' ? f.default(state) : f.default;
  }
  return { ...out, ...given };
}
