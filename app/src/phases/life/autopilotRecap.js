// The year fast-forward's recap (task 58, stage 'autopilot'): what the months on autopilot added up to (the same
// totals and wellbeing sparklines as the year in review, over the run's months), why it stopped early if it did, the
// black cat that moved in, and an optional reflection (life/autopilot.js finishAutopilot).
import { h } from '../../ui/dom.js';
import { formatMoney } from '../../util/format.js';
import { monthLabel, monthName } from '../../util/dates.js';
import { LIFE } from '../../config.js';
import { WELLBEING_DOMAINS } from '../../life/monthFlow.js';
import { rangeReview } from '../../life/monthReport.js';
import { spark, COUNSELOR_LINE } from './yearReview.js';

export const AUTOPILOT_PROMPT = 'Now that you’ve seen a whole stretch of months, what would you change?';

/** Why the run ended early, in words, or null. */
export function stopText(run) {
  if (run.stoppedReason === 'missed-housing') {
    return `It stopped after ${monthName(run.toMonth)} because you missed a housing payment. Miss three in a row and you lose `
      + 'your home. Change your plan, find a cheaper place, or both.';
  }
  return null;
}

/** The recap panel. `onContinue(text)` saves the reflection and goes to the next month's welcome. → Node[] */
export function renderAutopilotRecap(state, { onContinue }) {
  const run = state.life.current?.autopilot ?? { fromMonth: 0, toMonth: 0, monthsLived: 0 };
  const y = rangeReview(state.life.history, run.fromMonth, run.toMonth);
  const months = state.life.history.filter((m) => m.monthIndex >= run.fromMonth && m.monthIndex <= run.toMonth)
    .map((m) => m.result?.label ?? '');
  const nwChange = y.netWorthEndCents - y.netWorthStartCents;
  const cat = (state.home?.animals ?? []).find((a) => a.id === run.cat?.id);
  const stopped = stopText(run);
  const box = h('textarea', { class: 'life-yr-text', id: 'life-ap-text', rows: 2, maxlength: LIFE.reflectionMax,
    placeholder: 'Optional. Your teacher can read this.' });
  const stat = (k, label, value) => h('div', { class: 'life-yr-stat', dataset: { stat: k } },
    h('span', { class: 'life-yr-k' }, label), h('span', { class: 'life-yr-v' }, value));
  const span = run.monthsLived === 1 ? monthLabel(run.fromMonth) : `${monthLabel(run.fromMonth)} – ${monthLabel(run.toMonth)}`;
  return [
    h('p', { class: 'life-eyebrow' }, `On autopilot · ${span}`),
    h('h1', { class: 'life-title' }, run.monthsLived === 12 ? 'A year on autopilot' : `${run.monthsLived} month${run.monthsLived === 1 ? '' : 's'} on autopilot`),
    h('p', { class: 'life-recap' }, `You lived the same routine every day for ${run.monthsLived} month${run.monthsLived === 1 ? '' : 's'}. `
      + 'Your plants and animals were looked after. Here’s how it added up.'),
    stopped ? h('div', { class: 'life-notice', dataset: { level: 'first' }, role: 'status' }, h('p', null, stopped)) : null,
    h('div', { class: 'life-yr-stats' },
      stat('in', 'Money in', formatMoney(y.incomeCents)),
      stat('out', 'Money out', formatMoney(y.expenseCents)),
      stat('kept', y.netCents >= 0 ? 'You kept' : 'Short by', formatMoney(Math.abs(y.netCents))),
      stat('nw', 'Net worth', formatMoney(y.netWorthEndCents))),
    h('ul', { class: 'life-sum-list', role: 'list' },
      h('li', { dataset: { month: 'nw' } }, `Net worth went ${nwChange >= 0 ? 'up' : 'down'} ${formatMoney(Math.abs(nwChange))}, `
        + `from ${formatMoney(y.netWorthStartCents)} to ${formatMoney(y.netWorthEndCents)}.`),
      y.best && y.months > 1 ? h('li', { dataset: { month: 'best' } }, `Best month: ${y.best.label} (${y.best.netCents >= 0 ? 'kept' : 'short'} ${formatMoney(Math.abs(y.best.netCents))}).`) : null,
      y.worst && y.months > 1 ? h('li', { dataset: { month: 'worst' } }, `Hardest month: ${y.worst.label} (${y.worst.netCents >= 0 ? 'kept' : 'short'} ${formatMoney(Math.abs(y.worst.netCents))}).`) : null),
    cat ? h('p', { class: 'life-ap-cat', dataset: { cat: cat.id } },
      `A black cat named ${cat.name} wandered in and decided to stay. Strays like ${cat.name} find their own food.`) : null,
    h('section', { class: 'life-sum-sec', dataset: { sec: 'trend' } },
      h('h2', { class: 'life-sum-h' }, 'Wellbeing over these months'),
      h('ul', { class: 'life-yr-trends', role: 'list' }, ...WELLBEING_DOMAINS.map(({ key, label }) => {
        const v = y.trends[key] ?? [];
        return h('li', { dataset: { domain: key } }, h('span', { class: 'life-yr-tlabel' }, label),
          v.length ? spark(key, label, v, months) : h('span', null, '–'),
          h('span', { class: 'life-yr-tnums' }, v.length ? `${v[0]} → ${v.at(-1)}` : ''));
      }))),
    h('p', { class: 'life-yr-care' }, COUNSELOR_LINE),
    h('div', { class: 'life-yr-reflect' },
      h('label', { class: 'life-yr-q', for: 'life-ap-text' }, AUTOPILOT_PROMPT),
      box),
    h('div', { class: 'life-plan-foot' },
      h('button', { class: 'btn btn-primary btn-lg life-go', type: 'button', onClick: () => onContinue(box.value) },
        `Continue to ${monthName(state.life.monthIndex)}`)),
  ];
}
