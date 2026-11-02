// The plan table's numbers (04 §5): region groups → rows → cells, each with its cost, status and metrics. Pure.
import { FINANCE } from '../config.js';
import { LOCATIONS, REGION_LABELS, DATA_VERSION } from '../data/locations/index.js';
import { REGIONS } from '../data/enums.js';
import { HOME_TYPE_LIST } from '../data/homeTypes.js';
import { cellMetrics } from '../data/metrics.js';
import { cellCost, tableAssumptions } from './costs.js';
import { classify } from './affordability.js';
import { pendingMoveOutCents } from '../life/relocation.js';

/**
 * Cash for planning (02 §2): checking + savings, in cents. While a Phase 4 student looks for a new place (task 58) it
 * also counts what moving out will bring or cost (the sale or deposit, minus fees), since that settles on approval.
 */
export function cashOf(state) {
  return (state.finances.checkingCents || 0) + (state.finances.savingsCents || 0) + pendingMoveOutCents(state);
}

// Costs and metrics never depend on the player, so they're built once per data version; only colors are per player.
let base = null;
let memo = null;

function baseCells() {
  if (base?.version === DATA_VERSION) return base.cells;
  const cells = new Map();
  for (const loc of LOCATIONS) {
    for (const t of HOME_TYPE_LIST) {
      cells.set(`${loc.id}|${t.id}`, { cost: cellCost(loc, t.id, FINANCE), metrics: cellMetrics(loc, t.id) });
    }
  }
  base = { version: DATA_VERSION, cells };
  return cells;
}

/**
 * buildGrid(state) → { incomeCents, cashCents, assumptions, groups: [{region, label, rows: [{location, cells:
 * [{locationId, homeTypeId, cost, status, metrics}]}]}] }. Memoized on income, cash and DATA_VERSION (same object back).
 */
export function buildGrid(state) {
  const incomeCents = state.player.netMonthlyIncomeCents;
  const cashCents = cashOf(state);
  const key = `${incomeCents}|${cashCents}|${DATA_VERSION}`;
  if (memo?.key === key) return memo.grid;
  const cells = baseCells();
  const groups = REGIONS.map((region) => ({
    region,
    label: REGION_LABELS[region],
    rows: LOCATIONS.filter((l) => l.region === region).map((location) => ({
      location,
      cells: HOME_TYPE_LIST.map((t) => {
        const { cost, metrics } = cells.get(`${location.id}|${t.id}`);
        return { locationId: location.id, homeTypeId: t.id, cost, status: classify(cost, { cashCents, incomeCents }), metrics };
      }),
    })),
  }));
  const grid = { incomeCents, cashCents, assumptions: tableAssumptions(FINANCE), groups };
  memo = { key, grid };
  return grid;
}

/** Every cell of a grid as a flat list, in table order. */
export function gridCells(grid) {
  return grid.groups.flatMap((g) => g.rows.flatMap((r) => r.cells));
}
