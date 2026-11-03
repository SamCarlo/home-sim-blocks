// The voxel home contract (13 §6, homeblocks 12). Pure: one call turns a save into the whole near world (terrain →
// neighborhood → the home → furniture → plants) plus the far scenery, with everything the life view (task 14) and
// Explore (task 16) need. The life view only uses this contract, never the generators directly.
import { BLOCK } from './blocks.js';
import { createVolume, clone, get, set, coords } from './volume.js';
import { genTerrain } from './genTerrain.js';
import { genNeighborhood, worldSizeFor } from './genNeighborhood.js';
import { genFar } from './genLandmarks.js';
import { voxHouse } from './voxHouse.js';
import { voxBuilding, buildingWorldSize } from './voxBuilding.js';
import { voxBlueprint } from './voxBlueprint.js';
import { furnish } from './voxInteriors.js';
import { walkSearch } from './walk.js';
import { byId } from '../data/locations/index.js';
import { planBuilding } from '../phases/design/buildingPlan.js';
import { planHouse } from '../phases/design/housePlan.js';
import { listings } from '../phases/design/houseModel.js';
import { SHARED_BEDROOMS, sharedOptions } from '../phases/design/sharedModel.js';
import { seedFor } from '../util/rng.js';
import { VOX_INTERIORS as VI, WORLD } from '../config.js';

const ID = (k) => BLOCK[k].id;

export { homeInputs, homeKeyFor } from './homeKey.js';
import { homeKeyFor, siteKeyFor } from './homeKey.js';

/** The shared-house bedroom that is the student's: the bedroom whose side of the house best matches the room's `side`. */
function sharedRoom(state, rooms, door) {
  const opt = sharedOptions(state)[state.home.shared?.houseIndex ?? 0];
  const side = opt?.rooms.find((r) => r.id === state.home.shared?.roomId)?.side ?? { x: 0, z: 1 };
  const beds = rooms.filter((r) => r.type === 'bedroom' || r.type === 'den');
  if (!beds.length) return rooms[0];
  const ground = Math.min(...rooms.map((r) => r.box.y0));
  const score = (r) => {
    const cx = (r.box.x0 + r.box.x1) / 2 - door.x, cz = (r.box.z0 + r.box.z1) / 2 - (door.z - 6);
    return side.x * cx + side.z * cz + (side.up ? (r.box.y0 > ground ? 100 : 0) : (r.box.y0 > ground ? -5 : 0));
  };
  return beds.reduce((a, b) => (score(b) > score(a) ? b : a));
}

/** Pots at plant spots (fanned out like the 3D view), crops in beds. → [{id, kind, x, y, z}] */
function placePlants(v, home, spots) {
  const out = [];
  if (!spots.length) return out;
  const plants = home.plants ?? [];
  const beds = plants.filter((p) => p.kind === 'garden-bed');
  plants.forEach((p, i) => {
    if (p.kind === 'garden-bed') {
      const s = spots[beds.indexOf(p) % spots.length];
      if (get(v, s.x, s.y, s.z) === 0) set(v, s.x, s.y, s.z, ID('crops'));
      out.push({ id: p.id, kind: p.kind, ...s });
    } else if (p.kind === 'potted') {
      const s = spots[i % spots.length], x = s.x + Math.floor(i / spots.length) * VI.potSpacing;
      if (get(v, x, s.y, s.z) === 0 && p.alive !== false) set(v, x, s.y, s.z, ID('potted-plant'));
      out.push({ id: p.id, kind: p.kind, x, y: s.y, z: s.z });
    } else out.push({ id: p.id, kind: p.kind, ...spots[i % spots.length] }); // fruit trees are drawn by the generator
  });
  return out;
}

const boxOf = (cells, y0, y1) => ({ x0: Math.min(...cells.map((c) => c.x)), x1: Math.max(...cells.map((c) => c.x)),
  z0: Math.min(...cells.map((c) => c.z)), z1: Math.max(...cells.map((c) => c.z)), y0, y1 });
const inBox = (b, c) => c.x >= b.x0 && c.x <= b.x1 && c.y >= b.y0 && c.y <= b.y1 && c.z >= b.z0 && c.z <= b.z1;

/** Explore spawn: the first standing cell inside the home reached walking in from `door`, facing on into the room. */
function spawnFrom(v, door, homeBoxes, bounds) {
  const reach = walkSearch(v, door, { bounds });
  for (const [i, prev] of reach) {
    const c = coords(v, i);
    if (!homeBoxes.some((b) => inBox(b, c))) continue;
    const p = prev >= 0 ? coords(v, prev) : door;
    const dx = c.x - p.x, dz = c.z - p.z;
    return { x: c.x, y: c.y, z: c.z, yaw: Math.atan2(-dx, -dz) }; // yaw 0 looks toward −z (three.js camera)
  }
  return { ...door, yaw: 0 };
}

/**
 * voxHome(state, {season?, monthIndex?}) → the 13 §6 contract `{volume, far, homeKey, door, exit, path, spawn, plantSpots,
 * animalSpots, windows, property, unit, info {blocks, homeBlocks, kind, ms, ...}}` plus `rooms`, `plants`, `furniture`.
 * `monthIndex` (or a numeric `season`) picks snow; default the save's life month. `spawn.yaw` 0 looks toward −z.
 */
export function voxHome(state, { season = null, monthIndex = null } = {}) {
  const t0 = Date.now();
  const home = state.home;
  const location = byId[home.locationId];
  if (!location) throw new Error(`voxHome: unknown location ${home.locationId}`);
  const kind = home.kind;
  const month = monthIndex ?? (typeof season === 'number' ? season : season?.monthIndex) ?? state.life?.monthIndex ?? 0;
  const homeKey = homeKeyFor(state);
  const seed = seedFor(state.meta?.seed ?? 0, 'world', siteKeyFor(state)); // stable through upgrades (task 20)
  const style = { styleKey: location.styleFamily, variant: location.styleVariant };
  const isUnit = kind === 'apartment' || kind === 'condo';
  const bplan = isUnit ? planBuilding({ style: location.styleFamily, variant: location.styleVariant, seed: home.building?.seed ?? 0,
    kind, settlement: location.settlement }) : null;
  const volume = createVolume(bplan ? buildingWorldSize(location, kind, bplan) : worldSizeFor(location, kind === 'build' ? 'house' : kind));
  genTerrain(volume, { location, monthIndex: month, seed });
  genNeighborhood(volume, { location, seed, homeKind: kind === 'build' ? 'house' : kind });
  const before = clone(volume);

  let g, rooms, unit = null, homeBox;
  if (isUnit) {
    g = voxBuilding(volume, { plan: bplan, floor: home.building?.floor ?? null, unit: home.building?.unit ?? 0, seed });
    rooms = g.unitRooms;
    unit = g.unit;
    homeBox = { ...g.info.box, y0: WORLD.groundY, y1: g.info.top };
  } else if (kind === 'house' || kind === 'shared') {
    const listing = kind === 'house' ? listings(state)[home.house?.listingIndex ?? 0] : null;
    const plan = planHouse({ style: location.styleFamily, styleVariant: location.styleVariant, variant: kind,
      seed: kind === 'house' ? home.house?.seed ?? 0 : home.shared?.seed ?? 0, palette: kind === 'house' ? home.house?.palette ?? null : null,
      sqft: listing?.sqftTarget ?? null, bedrooms: kind === 'shared' ? SHARED_BEDROOMS : listing?.bedrooms ?? null });
    const extras = kind === 'house' ? { gardenBeds: home.house?.gardenBeds ?? 0, fruitTrees: home.house?.fruitTrees ?? 0, coop: !!home.house?.coop } : {};
    g = voxHouse(volume, { plan, extras, seed });
    rooms = g.rooms;
    if (kind === 'shared') { const r = sharedRoom(state, rooms, g.door); unit = { ...r.box }; }
  } else {
    g = voxBlueprint(volume, { bp: home.blueprint, ...style, seed });
    rooms = g.rooms;
  }
  if (!homeBox) homeBox = g.lotBox;

  const keep = [...g.plantSpots, ...g.animalSpots];
  const furniture = furnish(volume, rooms, { styleKey: location.styleFamily, seed, keep });
  const plants = placePlants(volume, home, g.plantSpots);

  // Property (13 §9): renters their unit/room, condo owners unit + balcony, house and build owners the whole lot.
  let property;
  if (kind === 'house' || kind === 'build') property = [g.lotBox];
  else {
    property = [unit];
    if (kind === 'condo' && bplan.features.balconies && bplan.form !== 'townhomes' && g.plantSpots.some((c) => !inBox(unit, c))) {
      const out = g.plantSpots.filter((c) => !inBox(unit, c));
      property.push(boxOf(out, unit.y0, unit.y1));
    }
  }
  const lot = g.lotBox;
  const bounds = { x0: lot.x0 - 1, x1: lot.x1 + 1, z0: lot.z0 - 1, z1: lot.z1 + 4, y0: lot.y0, y1: volume.size.y - 1 };
  const spawn = spawnFrom(volume, g.door, unit ? [unit] : rooms.map((r) => r.box), bounds);
  // The door cell (outside) is on the property for houses; renters and owners of units also own the step outside it.
  if (!property.some((b) => inBox(b, g.door))) property.push({ x0: g.door.x, x1: g.door.x, y0: g.door.y, y1: g.door.y + 1, z0: g.door.z, z1: g.door.z });

  const f = genFar({ location, seed, monthIndex: month, worldSize: volume.size });
  let blocks = 0, homeBlocks = 0;
  for (let i = 0; i < volume.data.length; i++) {
    if (volume.data[i]) blocks++;
    if (volume.data[i] !== before.data[i]) homeBlocks++;
  }
  return {
    volume, far: { size: f.size, data: f.data, origin: f.origin, scale: f.scale, key: f.key }, homeKey,
    door: g.door, exit: g.exit, path: g.path, spawn, plantSpots: g.plantSpots, animalSpots: g.animalSpots, windows: g.windows,
    property, unit, rooms, plants, furniture,
    info: { blocks, homeBlocks, kind, monthIndex: month, homeBox, rooms: rooms.length, pieces: furniture.pieces.length, ms: Date.now() - t0 },
  };
}
