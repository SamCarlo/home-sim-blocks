// The home's identity for saves (13 §7, blocks task 18; split out of voxHome.js so seeds and state code can use it
// without loading the generators). Pure.
import { listings } from '../phases/design/houseModel.js';
import { hashString } from '../util/rng.js';

/** Stable JSON (sorted keys) so a homeKey never depends on property order. */
function stable(x) {
  if (Array.isArray(x)) return `[${x.map(stable).join(',')}]`;
  if (x && typeof x === 'object') return `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${stable(x[k])}`).join(',')}}`;
  return JSON.stringify(x ?? null);
}

/** The inputs that shape the home's blocks (13 §7): location, kind and the kind's own picks. Plants/animals don't. */
export function homeInputs(state) {
  const home = state.home;
  const base = { loc: home.locationId, kind: home.kind };
  if (home.kind === 'apartment' || home.kind === 'condo') {
    const b = home.building ?? {};
    return { ...base, seed: b.seed ?? 0, floor: b.floor ?? null, unit: b.unit ?? 0 };
  }
  if (home.kind === 'house') {
    const h = home.house ?? {};
    const l = listings(state)[h.listingIndex ?? 0] ?? {};
    return { ...base, seed: h.seed ?? 0, palette: h.palette ?? null, sqft: l.sqftTarget ?? null, bedrooms: l.bedrooms ?? null,
      beds: h.gardenBeds ?? 0, trees: h.fruitTrees ?? 0, coop: !!h.coop };
  }
  if (home.kind === 'shared') return { ...base, seed: home.shared?.seed ?? 0, room: home.shared?.roomId ?? null };
  return { ...base, bp: home.blueprint ?? null };
}

/** `${kind}:${hash}` of exactly the inputs that shape the home (13 §7); changes on a move or an upgrade. */
export function homeKeyFor(state) {
  return `${state.home.kind}:${hashString(stable(homeInputs(state))).toString(36)}`;
}
