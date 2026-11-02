// Year in review (09 §11, task 47), shown after every December (stage 'review', already in the new January): the
// year's totals, net worth at the start and now, the best and worst month, a wellbeing sparkline per domain, the 12 §7
// counselor line, and an optional reflection saved to `life.reflections` for the teacher (monthFlow.finishReview).
import { h } from '../../ui/dom.js';
import { formatMoney } from '../../util/format.js';
import { yearMonth, monthName } from '../../util/dates.js';
import { LIFE } from '../../config.js';
import { WELLBEING_DOMAINS } from '../../life/monthFlow.js';
import { yearReview, sparkPoints } from '../../life/monthReport.js';

const NS = 'http://www.w3.org/2000/svg';
const SPARK_W = 120, SPARK_H = 28;
export const COUNSELOR_LINE = 'If real life ever feels like too much, talk to someone you trust, like a school counselor.';
export const REFLECTION_PROMPT = 'What would you do differently next year?';

function svg(tag, attrs, ...kids) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  n.append(...kids);
  return n;
}

/** One domain's sparkline: a 2px line in the domain's color, a dot at the end, a hover title per month. */
export function spark(key, label, values, months) {
  const pts = sparkPoints(values, SPARK_W, SPARK_H).split(' ').map((p) => p.split(',').map(Number));
  const end = pts.at(-1) ?? [0, 0];
  const el = svg('svg', { class: 'life-yr-spark', viewBox: `0 0 ${SPARK_W} ${SPARK_H}`, width: SPARK_W, height: SPARK_H,
    role: 'img', 'aria-label': `${label} from ${values[0]} to ${values.at(-1)}` },
  svg('line', { class: 'life-yr-mid', x1: 0, x2: SPARK_W, y1: SPARK_H / 2, y2: SPARK_H / 2 }),
  svg('polyline', { points: sparkPoints(values, SPARK_W, SPARK_H), fill: 'none', stroke: `var(--wb-${key})`,
    'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
  svg('circle', { cx: end[0], cy: end[1], r: 3, fill: `var(--wb-${key})` }),
  ...pts.map(([x], i) => svg('rect', { class: 'life-yr-hit', x: x - 4, y: 0, width: 8, height: SPARK_H, fill: 'transparent' },
    svg('title', {}, `${i === 0 ? 'Start' : months[i - 1]}: ${values[i]}`))));
  return el;
}

/** The review panel for the year that just ended. `onContinue(text)` saves the reflection and moves on. → Node[] */
export function renderYearReview(state, { onContinue }) {
  const mi = state.life.monthIndex;
  const year = yearMonth(mi - 1).year;
  const y = yearReview(state.life.history, year);
  const months = state.life.history.filter((m) => yearMonth(m.monthIndex).year === year)
    .map((m) => m.result?.label ?? '');
  const nwChange = y.netWorthEndCents - y.netWorthStartCents;
  const box = h('textarea', { class: 'life-yr-text', id: 'life-yr-text', rows: 2, maxlength: LIFE.reflectionMax,
    placeholder: 'Optional. Your teacher can read this.' });
  const stat = (k, label, value) => h('div', { class: 'life-yr-stat', dataset: { stat: k } },
    h('span', { class: 'life-yr-k' }, label), h('span', { class: 'life-yr-v' }, value));
  return [
    h('p', { class: 'life-eyebrow' }, `Year in review · ${year}`),
    h('h1', { class: 'life-title' }, `Your ${year} in review`),
    h('p', { class: 'life-recap' }, `You lived ${y.months} month${y.months === 1 ? '' : 's'} on your own. Here’s how the year added up.`),
    h('div', { class: 'life-yr-stats' },
      stat('in', 'Money in', formatMoney(y.incomeCents)),
      stat('out', 'Money out', formatMoney(y.expenseCents)),
      stat('kept', y.netCents >= 0 ? 'You kept' : 'Short by', formatMoney(Math.abs(y.netCents))),
      stat('nw', 'Net worth', formatMoney(y.netWorthEndCents))),
    h('ul', { class: 'life-sum-list', role: 'list' },
      h('li', { dataset: { month: 'nw' } }, `Net worth went ${nwChange >= 0 ? 'up' : 'down'} ${formatMoney(Math.abs(nwChange))}, `
        + `from ${formatMoney(y.netWorthStartCents)} to ${formatMoney(y.netWorthEndCents)}.`),
      y.best ? h('li', { dataset: { month: 'best' } }, `Best month: ${y.best.label} (${y.best.netCents >= 0 ? 'kept' : 'short'} ${formatMoney(Math.abs(y.best.netCents))}).`) : null,
      y.worst ? h('li', { dataset: { month: 'worst' } }, `Hardest month: ${y.worst.label} (${y.worst.netCents >= 0 ? 'kept' : 'short'} ${formatMoney(Math.abs(y.worst.netCents))}).`) : null),
    h('section', { class: 'life-sum-sec', dataset: { sec: 'trend' } },
      h('h2', { class: 'life-sum-h' }, 'Wellbeing over the year'),
      h('ul', { class: 'life-yr-trends', role: 'list' }, ...WELLBEING_DOMAINS.map(({ key, label }) => {
        const v = y.trends[key] ?? [];
        return h('li', { dataset: { domain: key } }, h('span', { class: 'life-yr-tlabel' }, label),
          v.length ? spark(key, label, v, months) : h('span', null, '–'),
          h('span', { class: 'life-yr-tnums' }, v.length ? `${v[0]} → ${v.at(-1)}` : ''));
      }))),
    h('p', { class: 'life-yr-care' }, COUNSELOR_LINE),
    h('div', { class: 'life-yr-reflect' },
      h('label', { class: 'life-yr-q', for: 'life-yr-text' }, REFLECTION_PROMPT),
      box),
    h('div', { class: 'life-plan-foot' },
      h('button', { class: 'btn btn-primary btn-lg life-go', type: 'button', onClick: () => onContinue(box.value) },
        `Continue to ${monthName(mi)}`)),
  ];
}
