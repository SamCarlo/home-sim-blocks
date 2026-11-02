// Block registry (13 §4, task 03). Pure: no DOM, three or network. One entry per id, textures are Kenney Voxel Pack
// (CC0) file names in app/vendor/kenney-voxel/; extra colors come from `tint` (multiplied over a light neutral texture).
//
// IDS ARE APPEND ONLY; NEVER RENUMBER (saves store ids). 0 = air, 1 = bedrock, then the base blocks in 13 §4 order,
// then the tinted style blocks (plaster, roof, trim per family in STYLE_FAMILIES order, each family's variants with
// their own palettes right after it). New blocks go at the END of the list, after the style blocks.
import { STYLE_FAMILIES } from '../data/enums.js';
import { STYLE_FAMILY_DATA } from '../data/styleFamilies.js';

/**
 * @typedef {{ id: number, key: string, label: string, faces: {top: string, side: string, bottom: string},
 *   tint: string|null, solid: boolean, transparent: boolean, emissive: number, placeable: boolean,
 *   group: 'ground'|'structure'|'nature'|'decor' }} BlockDef
 */

/** Light neutral textures the style tints sit on (snow ≈ white, birch bark ≈ light striped, reads as shingles). */
const PLASTER_TEX = 'snow.png';
const ROOF_TEX = 'trunk_white_side.png';

const f = (top, side = top, bottom = side) => ({ top, side, bottom });

// [key, label, faces, opts] in 13 §4 order. opts: tint, solid (true), transparent (false), emissive (0), placeable (true).
const BASE = [
  ['air', 'Air', f(''), { solid: false, transparent: true, placeable: false }],
  ['bedrock', 'Bedrock', f('greystone.png'), { tint: '#5a5a5a', placeable: false }],
  // Ground
  ['grass', 'Grass', f('grass_top.png', 'dirt_grass.png', 'dirt.png')],
  ['dirt', 'Dirt', f('dirt.png')],
  ['sand', 'Sand', f('sand.png')],
  ['red-sand', 'Red sand', f('redsand.png')],
  ['snow', 'Snow', f('snow.png', 'dirt_snow.png', 'dirt.png')],
  ['stone', 'Stone', f('stone.png')],
  ['gravel', 'Gravel', f('gravel_stone.png')],
  ['lava-rock', 'Lava rock', f('greystone.png'), { tint: '#4a4446' }],
  ['water', 'Water', f('water.png'), { solid: false, transparent: true }],
  ['ice', 'Ice', f('ice.png'), { transparent: true }],
  // Structure
  ['planks-light', 'Light planks', f('wood.png')],
  ['planks-dark', 'Dark planks', f('wood.png'), { tint: '#8a6a52' }],
  ['plaster', 'Plaster', f(PLASTER_TEX)],
  ['brick', 'Brick', f('brick_red.png')],
  ['stone-brick', 'Stone brick', f('brick_grey.png')],
  ['roof', 'Roof', f(ROOF_TEX), { tint: '#8a8680' }],
  ['glass', 'Glass', f('glass.png'), { transparent: true }],
  ['lit-glass', 'Lit window', f('cotton_tan.png'), { tint: '#ffe7a0', emissive: 1, placeable: false }],
  ['door-lower', 'Door (lower)', f('wood.png', 'trunk_mid.png', 'wood.png'), { solid: false, placeable: false }],
  ['door-upper', 'Door (upper)', f('wood.png', 'trunk_mid.png', 'wood.png'), { solid: false, placeable: false }],
  ['slab', 'Floor slab', f('cotton_tan.png'), { tint: '#e6dccb' }],
  ['concrete', 'Concrete', f('greysand.png')],
  ['metal', 'Metal', f(PLASTER_TEX), { tint: '#9aa6b0' }],
  // Nature
  ['trunk', 'Tree trunk', f('trunk_top.png', 'trunk_side.png', 'trunk_top.png')],
  ['leaves', 'Leaves', f('leaves_transparent.png'), { transparent: true }],
  ['leaves-wilted', 'Wilted leaves', f('leaves_orange_transparent.png'), { tint: '#b08a60', transparent: true }],
  ['palm-trunk', 'Palm trunk', f('trunk_white_top.png', 'trunk_white_side.png', 'trunk_white_top.png'), { tint: '#b89a74' }],
  ['palm-leaves', 'Palm leaves', f('leaves_transparent.png'), { tint: '#d8f0a0', transparent: true }],
  ['pine-leaves', 'Pine needles', f('leaves_transparent.png'), { tint: '#5a8a6a', transparent: true }],
  ['cactus', 'Cactus', f('cactus_top.png', 'cactus_side.png', 'cactus_inside.png'), { transparent: true }],
  ['flowers', 'Flowers', f('leaves_orange_transparent.png'), { tint: '#ff7080', solid: false, transparent: true }],
  ['crops', 'Crops', f('wheat_stage4.png'), { solid: false, transparent: true }],
  // Decor (furniture is blocks)
  ['bed', 'Bed', f('cotton_red.png', 'wood.png', 'wood.png')],
  ['table', 'Table', f('table.png', 'wood.png', 'wood.png')],
  ['chair', 'Chair', f('wood.png'), { tint: '#d8a878' }],
  ['counter', 'Counter', f('stone.png', 'wood_red.png', 'wood_red.png')],
  ['shelf', 'Shelf', f('wood.png', 'trunk_mid.png', 'wood.png')],
  ['lamp', 'Lamp', f('cotton_tan.png'), { tint: '#fff2c0', emissive: 1 }],
  ['rug-red', 'Red rug', f('cotton_red.png')],
  ['rug-blue', 'Blue rug', f('cotton_blue.png')],
  ['rug-green', 'Green rug', f('cotton_green.png')],
  ['rug-tan', 'Tan rug', f('cotton_tan.png')],
  ['catchment-tank', 'Catchment tank', f('cotton_green.png'), { tint: '#9ab8a8' }],
  ['solar-panel', 'Solar panel', f('cotton_blue.png', 'greysand.png', 'greysand.png'), { tint: '#4a5a80' }],
  ['fence', 'Fence', f('fence_wood.png'), { transparent: true }],
  ['coop', 'Coop', f('wood_red.png', 'fence_wood.png', 'wood_red.png')],
];

/** Group of each base key (13 §4 headings). */
const GROUP_OF = {};
const groupRanges = [['ground', 'bedrock', 'ice'], ['structure', 'planks-light', 'metal'], ['nature', 'trunk', 'crops'], ['decor', 'bed', 'coop']];
for (const [g, from, to] of groupRanges) {
  const a = BASE.findIndex((b) => b[0] === from), b = BASE.findIndex((x) => x[0] === to);
  for (let i = a; i <= b; i++) GROUP_OF[BASE[i][0]] = g;
}
GROUP_OF.air = 'ground';

/** Wall-material looks whose floor is wood planks; the rest get the floor slab. */
const WOOD_WALLS = new Set(['batten', 'shingle', 'siding', 'log']);

/** @type {BlockDef[]} every block, index = id */
export const BLOCKS = [];
/** @type {Record<string, BlockDef>} key → block */
export const BLOCK = {};

function add(key, label, faces, o = {}) {
  const b = { id: BLOCKS.length, key, label, faces, tint: o.tint ?? null, solid: o.solid ?? true,
    transparent: o.transparent ?? false, emissive: o.emissive ?? 0, placeable: o.placeable ?? true,
    group: o.group ?? GROUP_OF[key] };
  BLOCKS.push(b);
  BLOCK[key] = b;
  return b;
}

for (const [key, label, faces, o] of BASE) add(key, label, faces, o);

/** style set key ('miami-deco' or 'maritime:alaska') → {wall, roof, trim, floor} ids. */
const STYLE_SETS = {};

function addStyleSet(setKey, slug, label, palette, look) {
  // Tinted style blocks are reached through styleBlocks() (the hotbar puts the home's set first), so they are not
  // listed by placeableBlocks(); placing them is still allowed.
  const o = { group: 'structure', placeable: false };
  const wall = add(`plaster-${slug}`, `Plaster (${label})`, f(PLASTER_TEX), { ...o, tint: palette.wall });
  const roof = add(`roof-${slug}`, `Roof (${label})`, f(ROOF_TEX), { ...o, tint: palette.roof });
  const trim = add(`trim-${slug}`, `Trim (${label})`, f(PLASTER_TEX), { ...o, tint: palette.trim });
  const floor = WOOD_WALLS.has(look?.wallTex) ? BLOCK['planks-light'] : BLOCK.slab;
  STYLE_SETS[setKey] = Object.freeze({ wall: wall.id, roof: roof.id, trim: trim.id, floor: floor.id });
}

for (const key of STYLE_FAMILIES) {
  const fam = STYLE_FAMILY_DATA[key];
  addStyleSet(key, key, fam.label, fam.palettes[0], fam.look);
  for (const [vKey, v] of Object.entries(fam.variants || {})) {
    if (v.palettes) addStyleSet(`${key}:${vKey}`, `${key}-${vKey}`, v.label, v.palettes[0], { ...fam.look, ...(v.look || {}) });
  }
}

// Appended after the style blocks (homeblocks 06): ʻōhiʻa canopy with red lehua blossoms.
add('lehua-leaves', 'ʻŌhiʻa leaves', f('leaves_orange_transparent.png'), { tint: '#e0484a', transparent: true, group: 'nature' });
// Appended (homeblocks 07): the street.
add('asphalt', 'Asphalt', f('greystone.png'), { tint: '#4a4c52', group: 'structure' });
add('road-paint', 'Road paint', f(PLASTER_TEX), { tint: '#f2d25a', group: 'structure', placeable: false });
add('mailbox', 'Mailbox', f(PLASTER_TEX, 'greysand.png', PLASTER_TEX), { tint: '#5a6a7e', group: 'decor' });

for (const b of BLOCKS) Object.freeze(b);
Object.freeze(BLOCKS);
Object.freeze(BLOCK);

const SOLID = Uint8Array.from(BLOCKS, (b) => (b.solid ? 1 : 0));
const TRANSPARENT = Uint8Array.from(BLOCKS, (b) => (b.transparent ? 1 : 0));

/** The block for id, or undefined for an unknown id. */
export function blockById(id) {
  return BLOCKS[id];
}

/** True when id blocks movement (unknown ids count as not solid). */
export function isSolid(id) {
  return SOLID[id] === 1;
}

/** True when the faces behind id show through (air, glass, water, leaves …); unknown ids count as transparent. */
export function isTransparent(id) {
  return id >= TRANSPARENT.length || TRANSPARENT[id] === 1;
}

/** Base blocks a student may pick for the hotbar (the home's tinted style set comes from styleBlocks). */
export function placeableBlocks() {
  return BLOCKS.filter((b) => b.placeable);
}

/**
 * Block ids for a style family's wall (plaster), roof, trim and floor: palette 0 of the family, or of the variant when
 * the variant brings its own palettes (maritime:alaska). Throws on an unknown family.
 */
export function styleBlocks(styleKey, variant = null) {
  const set = (variant && STYLE_SETS[`${styleKey}:${variant}`]) || STYLE_SETS[styleKey];
  if (!set) throw new Error(`unknown style family "${styleKey}"`);
  return set;
}

/** Every Kenney texture file the registry uses (for the vendor check, tests and texture preloading). */
export function textureFiles() {
  const s = new Set();
  for (const b of BLOCKS) for (const t of Object.values(b.faces)) if (t) s.add(t);
  return [...s].sort();
}
