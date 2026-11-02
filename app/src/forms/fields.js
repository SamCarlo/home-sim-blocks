// Field kinds for the form engine (05 §4, task 18). Student text only ever goes in via value/textContent.
// Value kinds: render(field, io) → { node, focus, label: 'for' | 'own' } and view(field, value, ctx) → Node (read-only).
//   io = { inputId, describedBy, value (at render), current() (latest), set(v), blur(), state }.
// Display kinds: display(field, ctx) → { node, refresh(values) }; the same in edit and read-only modes.
import { h } from '../ui/dom.js';
import { FORMS } from '../config.js';
import { dollarsToCents, formatMoney } from '../finance/money.js';
import { monthLabel } from '../util/dates.js';
import { characterName, signDateLabel, computeField, deriveInitials, displayValue, formatValue, optionList, tableRows } from './validate.js';

const text = (v) => h('span', { class: 'fm-value-text' }, v);

/** A plain input that stores what was typed (parse turns the raw string into the stored value). */
function inputKind({ type = 'text', inputmode, parse = (raw) => raw, show = (v) => v ?? '', onBlurFormat } = {}) {
  return {
    render(f, io) {
      const input = h('input', { type, id: io.inputId, class: 'input', value: show(io.value), inputmode, autocomplete: 'off',
        'aria-describedby': io.describedBy, 'aria-required': f.required ? 'true' : null,
        maxlength: f.maxLength ?? null, placeholder: f.placeholder ?? null });
      input.addEventListener('input', () => io.set(parse(input.value)));
      input.addEventListener('blur', () => {
        if (onBlurFormat && typeof io.current() === 'number') input.value = onBlurFormat(io.current());
        io.blur();
      });
      return { node: f.prefix ? h('span', { class: 'fm-affix' }, h('span', { class: 'fm-prefix', 'aria-hidden': 'true' }, f.prefix), input) : input,
        focus: input, label: 'for' };
    },
    view: (f, v) => text(displayValue(f, v)),
  };
}

const parseNumber = (raw) => {
  const s = raw.trim().replace(/,/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : raw;
};
const parseCents = (raw) => (raw.trim() ? dollarsToCents(raw) ?? raw : null);
const centsText = (c) => (typeof c === 'number' ? formatMoney(c, { showCents: c % 100 !== 0 }).replace('$', '') : c ?? '');

function choiceView(f, v) { return text(displayValue(f, v)); }

/** One select (used by 'select' and 'month'). */
function selectKind(optionsOf, toValue) {
  return {
    render(f, io) {
      const opts = optionsOf(f);
      const sel = h('select', { id: io.inputId, 'aria-describedby': io.describedBy, 'aria-required': f.required ? 'true' : null },
        h('option', { value: '' }, f.placeholder ?? 'Choose…'),
        opts.map((o) => h('option', { value: o.value, selected: String(io.value ?? '') === o.value }, o.label)));
      sel.addEventListener('change', () => { io.set(sel.value === '' ? null : toValue(sel.value)); io.blur(); });
      sel.addEventListener('blur', io.blur);
      return { node: sel, focus: sel, label: 'for' };
    },
    view: choiceView,
  };
}

const monthOptions = (f) => {
  const out = [];
  for (let m = f.from ?? 0; m <= (f.to ?? 11); m++) out.push({ value: String(m), label: monthLabel(m) });
  return out;
};

/** A legend-titled group; the engine adds hint and error after it. */
function group(f, io, ...children) {
  return h('fieldset', { class: 'fm-group', 'aria-describedby': io.describedBy },
    h('legend', { class: 'fm-legend' }, f.label, f.required ? h('span', { class: 'fm-req', 'aria-hidden': 'true' }, ' *') : null),
    ...children);
}

/** The value kinds. */
export const VALUE_FIELDS = {
  text: inputKind(),
  phone: { ...inputKind({ type: 'tel' }) },
  number: inputKind({ inputmode: 'numeric', parse: parseNumber }),
  currency: inputKind({ inputmode: 'decimal', parse: parseCents, show: centsText, onBlurFormat: centsText }),
  textarea: {
    render(f, io) {
      const ta = h('textarea', { id: io.inputId, rows: f.rows ?? 3, 'aria-describedby': io.describedBy,
        'aria-required': f.required ? 'true' : null, maxlength: f.maxLength ?? null });
      ta.value = io.value ?? '';
      ta.addEventListener('input', () => io.set(ta.value));
      ta.addEventListener('blur', io.blur);
      return { node: ta, focus: ta, label: 'for' };
    },
    view: (f, v) => h('div', { class: 'fm-value-text fm-pre' }, v ?? '—'),
  },
  select: selectKind((f) => optionList(f.options), (v) => v),
  month: selectKind(monthOptions, Number),
  radio: {
    render(f, io) {
      const inputs = optionList(f.options).map((o, i) => {
        const input = h('input', { type: 'radio', name: io.inputId, id: `${io.inputId}-${i}`, value: o.value,
          checked: String(io.value ?? '') === o.value, 'aria-describedby': io.describedBy });
        input.addEventListener('change', () => { io.set(o.value); io.blur(); });
        return h('label', { class: 'fm-choice', for: input.id }, input, h('span', null, o.label));
      });
      const node = group(f, io, h('div', { class: 'fm-choices' }, inputs));
      return { node, focus: () => node.querySelector('input:checked') || node.querySelector('input'), label: 'own' };
    },
    view: choiceView,
  },
  checkbox: {
    render(f, io) {
      const input = h('input', { type: 'checkbox', id: io.inputId, checked: io.value === true, 'aria-describedby': io.describedBy,
        'aria-required': f.required ? 'true' : null });
      input.addEventListener('change', () => { io.set(input.checked); io.blur(); });
      const node = h('label', { class: 'fm-check', for: io.inputId }, input,
        h('span', null, f.label, f.required ? h('span', { class: 'fm-req', 'aria-hidden': 'true' }, ' *') : null));
      return { node, focus: input, label: 'own' };
    },
    view: (f, v) => h('span', { class: 'fm-value-text' }, v ? '✓ ' : '✕ Not checked: ', f.label),
  },
  signature: {
    render(f, io) {
      const input = h('input', { type: 'text', id: io.inputId, class: 'input fm-sig-input', value: io.value ?? '', autocomplete: 'off',
        spellcheck: 'false', 'aria-describedby': io.describedBy, 'aria-required': f.required ? 'true' : null });
      input.addEventListener('input', () => io.set(input.value));
      input.addEventListener('blur', io.blur);
      const node = h('div', { class: 'fm-sig' }, input,
        h('div', { class: 'fm-sig-meta' }, h('span', null, 'Signature'), h('span', null, `Date: ${signDateLabel(io.state)}`)));
      return { node, focus: input, label: 'for' };
    },
    view: (f, v, ctx) => h('div', { class: 'fm-sig is-signed' }, h('span', { class: 'fm-sig-ink' }, v || '—'),
      h('div', { class: 'fm-sig-meta' }, h('span', null, 'Signature'), h('span', null, `Date: ${signDateLabel(ctx?.state)}`))),
  },
  initials: {
    render(f, io) {
      const want = deriveInitials(characterName(io.state));
      const items = (f.clauses || []).map((c, i) => {
        const id = `${io.inputId}-${c.id}`;
        const input = h('input', { type: 'text', id, class: 'input fm-init-input', value: io.value?.[c.id] ?? '', autocomplete: 'off',
          maxlength: FORMS.initialsMax, 'aria-describedby': io.describedBy, 'aria-label': `Initials for clause ${i + 1}` });
        input.addEventListener('input', () => io.set({ ...(io.current() || {}), [c.id]: input.value }));
        input.addEventListener('blur', (e) => { if (!e.relatedTarget?.classList?.contains('fm-init-input')) io.blur(); });
        return h('li', { class: 'fm-clause' }, h('span', { class: 'fm-clause-text' }, c.text), input);
      });
      const node = group(f, io, want ? h('p', { class: 'fm-init-yours muted' }, `Your initials: ${want}`) : null,
        h('ol', { class: 'fm-clauses' }, items));
      return { node, focus: () => node.querySelector('.fm-init-input'), label: 'own' };
    },
    view: (f, v) => h('ol', { class: 'fm-clauses is-readonly' }, (f.clauses || []).map((c) => h('li', { class: 'fm-clause' },
      h('span', { class: 'fm-clause-text' }, c.text), h('span', { class: 'fm-init-box' }, v?.[c.id] || '—')))),
  },
  question: {
    render(f, io) {
      const choices = optionList(f.choices);
      const feedback = h('div', { class: 'fm-q-feedback', 'aria-live': 'polite' });
      const radios = choices.map((o, i) => h('input', { type: 'radio', name: io.inputId, id: `${io.inputId}-${i}`, value: o.value,
        'aria-describedby': io.describedBy }));
      const check = h('button', { type: 'button', class: 'btn btn-secondary btn-small fm-q-check' }, 'Check answer');
      const paint = () => {
        const v = io.current() || {};
        const wrong = new Set(v.wrong || []);
        radios.forEach((r) => {
          r.checked = v.correct ? r.value === v.choice : false;
          r.disabled = !!v.correct || wrong.has(r.value);
          r.closest('label')?.classList.toggle('is-wrong', wrong.has(r.value));
          r.closest('label')?.classList.toggle('is-right', !!v.correct && r.value === v.choice);
        });
        check.disabled = !!v.correct;
      };
      check.addEventListener('click', () => {
        const picked = radios.find((r) => r.checked)?.value;
        if (picked == null) { feedback.textContent = 'Pick an answer first.'; return; }
        const prev = io.current() || {};
        const tries = (prev.tries || 0) + 1;
        const correct = picked === String(f.answer);
        const why = (f.choices || []).find((c) => typeof c === 'object' && String(c.value) === picked)?.why;
        io.set({ choice: picked, tries, correct, firstTry: correct && tries === 1, wrong: correct ? prev.wrong || [] : [...(prev.wrong || []), picked] });
        feedback.className = `fm-q-feedback ${correct ? 'is-right' : 'is-wrong'}`;
        feedback.replaceChildren(h('strong', null, correct ? '✓ Correct. ' : '✕ Not quite. '),
          correct ? (f.explanation ?? '') : `${why ?? f.hintOnWrong ?? f.explanation ?? ''} Try again.`);
        paint();
        io.blur();
        if (!correct) radios.find((r) => !r.disabled)?.focus();
      });
      const node = group(f, io,
        h('div', { class: 'fm-choices' }, radios.map((r, i) => h('label', { class: 'fm-choice', for: r.id }, r, h('span', null, choices[i].label)))),
        h('div', { class: 'fm-q-actions' }, check), feedback);
      paint();
      if (io.value?.correct) {
        feedback.className = 'fm-q-feedback is-right';
        feedback.replaceChildren(h('strong', null, '✓ Correct. '), f.explanation ?? '');
      }
      return { node, focus: () => radios.find((r) => !r.disabled) || check, label: 'own' };
    },
    view(f, v) {
      const label = optionList(f.choices).find((o) => o.value === String(v?.choice))?.label;
      return h('div', { class: 'fm-value-text' }, h('div', null, label ? `Answer: ${label}` : 'Not answered'),
        v?.correct ? h('div', { class: 'muted small' }, v.firstTry ? '✓ Right on the first try' : `✓ Right after ${v.tries} tries`) : null);
    },
  },
};

/** The display-only kinds. */
export const DISPLAY_FIELDS = {
  computed(f, ctx) {
    const out = h('output', { class: 'fm-output', id: `${ctx.uid}-${f.id}`, 'aria-labelledby': `${ctx.uid}-${f.id}-label` });
    const node = h('div', { class: `fm-field fm-computed${f.width === 'half' ? ' fm-half' : ''}` },
      h('span', { class: 'fm-label', id: `${ctx.uid}-${f.id}-label` }, f.label), out,
      f.hint ? h('p', { class: 'hint' }, f.hint) : null);
    const refresh = (values) => { out.textContent = computeField(f, values, ctx.state).text; };
    return { node, refresh };
  },
  info(f) {
    const paras = Array.isArray(f.text) ? f.text : [f.text];
    return { node: h('div', { class: `fm-info fm-info-${f.tone ?? 'note'}`, role: f.tone === 'warn' ? 'note' : null },
      f.label ? h('h4', null, f.label) : null, paras.filter(Boolean).map((p) => h('p', null, p))) };
  },
  clauses(f) {
    return { node: h('div', { class: 'fm-field' }, f.label ? h('h4', null, f.label) : null,
      h('ol', { class: 'fm-clauses is-readonly' }, (f.items || []).map((c) => h('li', { class: 'fm-clause' },
        h('span', { class: 'fm-clause-text' }, typeof c === 'string' ? c : c.text))))) };
  },
  table(f, ctx) {
    const body = h('tbody');
    const cols = f.columns || [];
    const node = h('div', { class: 'fm-field fm-table-wrap' }, h('table', { class: 'fm-table' },
      f.label ? h('caption', null, f.label) : null,
      h('thead', null, h('tr', null, cols.map((c) => h('th', { scope: 'col', class: c.align === 'right' ? 'num' : null }, c.label)))),
      body));
    const refresh = (values) => body.replaceChildren(...tableRows(f, values, ctx.state).map((row) => h('tr', null,
      cols.map((c, i) => h(i === 0 ? 'th' : 'td', { scope: i === 0 ? 'row' : null, class: c.align === 'right' ? 'num' : null },
        formatValue(c.format, row[c.key]))))));
    return { node, refresh };
  },
};
