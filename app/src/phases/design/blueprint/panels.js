// Blueprint side panels (07 §5, task 40; browser DOM): roof and exterior, the yard, the budget bar with its itemized
// breakdown, and the checks list. Each takes the blueprint and a `commit(nextBp)` callback and returns an element.
import { h } from '../../../ui/dom.js';
import { formatMoney } from '../../../util/format.js';
import { BLUEPRINT } from '../../../config.js';
import { section } from '../pickerParts.js';
import { needsCatchment, needsSolarWaterHeater } from './cost.js';
import { PLACEABLE, YARD_KINDS, addYardItem, hasFence, setFence, yardCount } from './yard.js';

const ROOF_MATERIALS = Object.keys(BLUEPRINT.cost.roofFactor);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function select(label, key, value, options, onChange) {
  return h('label', { class: 'bp-field' }, h('span', null, label),
    h('select', { dataset: { focusKey: key }, onChange: (e) => onChange(e.target.value) },
      options.map(([v, text]) => h('option', { value: v, selected: v === value }, text))));
}

function swatches(label, key, value, colors, onPick) {
  return h('div', { class: 'bp-field' }, h('span', null, label),
    h('div', { class: 'bp-swatches', role: 'radiogroup', 'aria-label': label }, colors.map((c, i) => h('button', {
      class: `bp-color${c === value ? ' is-on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(c === value),
      'aria-label': `${label} color ${i + 1}`, style: `background:${c}`, dataset: { focusKey: `${key}-${i}` }, onClick: () => onPick(c) }))));
}

/** Roof (style, material, color) and exterior (siding, wall color, trim). Colors: the style family's plus a small set. */
export function outsidePanel(bp, { palette = null }, commit) {
  const roof = (patch) => commit({ ...bp, roof: { ...bp.roof, ...patch } });
  const ext = (patch) => commit({ ...bp, exterior: { ...bp.exterior, ...patch } });
  const uniq = (list) => [...new Set(list.filter(Boolean))];
  const factor = (f) => (f === 1 ? 'base price' : f < 1 ? `${Math.round((1 - f) * 100)}% cheaper` : `${Math.round((f - 1) * 100)}% more`);
  return h('div', null,
    section('Roof',
      select('Style', 'roof-style', bp.roof.style, BLUEPRINT.roofStyles.map((s) => [s, cap(s)]), (v) => roof({ style: v })),
      select('Material', 'roof-mat', bp.roof.material, ROOF_MATERIALS.map((m) => [m, `${cap(m)} (${factor(BLUEPRINT.cost.roofFactor[m])})`]), (v) => roof({ material: v })),
      swatches('Roof', 'roof-color', bp.roof.color, uniq([palette?.roof, ...BLUEPRINT.roofColors]), (c) => roof({ color: c }))),
    section('Outside walls',
      select('Siding', 'siding', bp.exterior.siding, BLUEPRINT.sidings.map((s) => [s, `${cap(BLUEPRINT.cost.sidingLabel[s])} (${factor(BLUEPRINT.cost.sidingFactor[s])})`]), (v) => ext({ siding: v })),
      swatches('Walls', 'wall-color', bp.exterior.color, uniq([palette?.wall, ...BLUEPRINT.wallColors]), (c) => ext({ color: c })),
      swatches('Trim', 'trim-color', bp.exterior.trim, uniq([palette?.trim, ...BLUEPRINT.trimColors]), (c) => ext({ trim: c }))));
}

/** The yard: add items (each lands at a free spot and can be dragged), the fence, solar, catchment, solar water heater. */
export function yardPanel(bp, { location, included = {} }, commit) {
  const K = YARD_KINDS;
  const price = (k) => (K[k].cents ? formatMoney(K[k].cents) : `${formatMoney(K[k].perSqft)}/sq ft`);
  const swhRequired = needsSolarWaterHeater(location);
  const catchReq = needsCatchment(location);
  const gal = BLUEPRINT.catchmentSizes;
  return h('div', null,
    section('Add to the yard',
      h('div', { class: 'bp-yard-grid' }, PLACEABLE.map((k) => h('button', { class: `btn btn-secondary btn-small bp-add-yard bp-add-${k}`, type: 'button',
        dataset: { focusKey: `yard-${k}` }, onClick: () => commit(addYardItem(bp, k)) },
      `+ ${K[k].label}`, h('small', null, `${price(k)}${yardCount(bp, k) ? ` · ${yardCount(bp, k)} placed` : ''}`)))),
      h('p', { class: 'muted bp-help' }, 'New items land in a free spot. Drag them where you want; select one and press Delete to remove it.'),
      h('label', { class: 'bp-check-row' }, h('input', { type: 'checkbox', class: 'bp-fence-toggle', checked: hasFence(bp), dataset: { focusKey: 'fence' },
        onChange: (e) => commit(setFence(bp, e.target.checked)) }), `Fence around the yard (${formatMoney(K.fence.perFt)} a foot)`)),
    section('Energy and water',
      select(`Solar panels${included.solarKw ? ` (${included.solarKw} kW already paid in site utilities)` : ''}`, 'solar', String(bp.solarKw),
        Array.from({ length: BLUEPRINT.maxSolarKw + 1 }, (_, kw) => [String(kw), kw ? `${kw} kW` : 'None']), (v) => commit({ ...bp, solarKw: Number(v) })),
      select(`Catchment tank${catchReq ? ' (required: no county water)' : ''}`, 'catchment', String(bp.catchmentGallons),
        gal.map((g) => [String(g), g ? `${g.toLocaleString('en-US')} gal` : 'None']), (v) => commit({ ...bp, catchmentGallons: Number(v) })),
      included.catchmentGallons ? h('p', { class: 'muted bp-help' }, `Your site-utilities choice already paid for ${included.catchmentGallons.toLocaleString('en-US')} gal.`) : null,
      h('label', { class: 'bp-check-row' }, h('input', { type: 'checkbox', class: 'bp-swh', checked: swhRequired || bp.solarWaterHeater,
        disabled: swhRequired, dataset: { focusKey: 'swh' }, onChange: (e) => commit({ ...bp, solarWaterHeater: e.target.checked }) }),
      `Solar water heater (${formatMoney(BLUEPRINT.cost.solarWaterHeaterCents)})${swhRequired ? ': required on new houses in Hawaiʻi' : ''}`)));
}

/** The budget bar (red when over) and the itemized breakdown. */
export function budgetPanel(cost, budgetCents) {
  if (!cost) return null;
  const over = budgetCents != null && cost.totalCents > budgetCents;
  const pct = budgetCents ? Math.min(100, (cost.totalCents / budgetCents) * 100) : 0;
  const left = budgetCents != null ? budgetCents - cost.totalCents : null;
  return section('Cost vs budget',
    h('div', { class: `bp-budget${over ? ' is-over' : ''}` },
      h('div', { class: 'bp-budget-nums' }, h('strong', null, formatMoney(cost.totalCents)),
        budgetCents != null ? h('span', null, ` of ${formatMoney(budgetCents)}`) : null),
      h('div', { class: 'bp-bar', role: 'meter', 'aria-label': 'Budget used', 'aria-valuemin': '0', 'aria-valuemax': String(budgetCents ?? 0),
        'aria-valuenow': String(cost.totalCents) }, h('span', { style: `width:${pct.toFixed(1)}%` })),
      left != null ? h('p', { class: 'bp-budget-left' }, over ? `${formatMoney(-left)} over budget` : `${formatMoney(left)} left`) : null),
    h('details', { class: 'bp-breakdown' }, h('summary', null, 'See every line'),
      h('table', null, h('tbody', null, cost.lines.map((l) => h('tr', null,
        h('td', null, l.label, h('small', null, l.detail)), h('td', { class: 'num' }, formatMoney(l.cents))))))));
}

/** Errors (block Move in) then warnings. */
export function checksPanel(result) {
  const items = [...result.errors.map((e) => ['error', e]), ...result.warnings.map((w) => ['warn', w])];
  return section('Checks', items.length
    ? h('ul', { class: 'bp-checks' }, items.map(([tone, it]) => h('li', { class: `bp-check is-${tone}` }, it.message)))
    : h('p', { class: 'bp-check is-ok' }, 'Everything checks out.'));
}

/** Upgrade mode (blocks task 21): renovation cost lines (work + permit), the total and the cash left. */
export function renovationPanel(quote, after) {
  return section('Renovation cost',
    h('div', { class: `bp-budget bp-reno${after.ok ? '' : ' is-over'}` },
      h('div', { class: 'bp-budget-nums' }, h('strong', null, formatMoney(quote.deltaCents)), h('span', null, ' from checking and savings')),
      h('table', { class: 'bp-reno-lines' }, h('tbody', null, quote.lines.map((l) => h('tr', null,
        h('td', null, l.label, h('small', null, l.detail)), h('td', { class: 'num' }, formatMoney(l.cents)))))),
      h('p', { class: 'bp-budget-left' }, after.ok ? `Cash after: ${formatMoney(after.leftCents)}${after.low ? ' (that is very little left)' : ''}`
        : `${formatMoney(-after.leftCents)} more than your cash`)),
    h('p', { class: 'muted bp-help' }, `Your house now: ${formatMoney(quote.oldCents)}. New plan: ${formatMoney(quote.newCents)}. Taking things out refunds nothing.`));
}
