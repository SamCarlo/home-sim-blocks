// Block registry (13 §4, task homeblocks 03).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BLOCKS, BLOCK, blockById, isSolid, isTransparent, placeableBlocks, styleBlocks, textureFiles } from '../../app/src/world/blocks.js';
import { STYLE_FAMILIES } from '../../app/src/data/enums.js';
import { STYLE_FAMILY_DATA } from '../../app/src/data/styleFamilies.js';

const VENDOR = fileURLToPath(new URL('../../app/vendor/kenney-voxel/', import.meta.url));

test('ids are unique, dense and match their index; keys are unique', () => {
  BLOCKS.forEach((b, i) => assert.equal(b.id, i));
  assert.equal(new Set(BLOCKS.map((b) => b.key)).size, BLOCKS.length);
  assert.ok(BLOCKS.length <= 255, 'ids must fit a Uint8 volume');
  for (const b of BLOCKS) assert.equal(BLOCK[b.key], b);
});

test('known ids never change (saves store ids: append only)', () => {
  const snap = { air: 0, bedrock: 1, grass: 2, dirt: 3, stone: 7, 'lava-rock': 9, water: 10, 'planks-light': 12,
    plaster: 14, glass: 18, 'lit-glass': 19, 'door-lower': 20, trunk: 25, leaves: 26, 'leaves-wilted': 27, bed: 34,
    lamp: 39, coop: 47, 'plaster-hawaii-plantation': 48, 'roof-hawaii-plantation': 49, 'trim-hawaii-plantation': 50,
    'plaster-maritime-alaska': 84, 'trim-plains-ranch': 98 };
  for (const [key, id] of Object.entries(snap)) assert.equal(BLOCK[key]?.id, id, key);
});

test('every entry has the 13 §4 shape', () => {
  const keys = ['emissive', 'faces', 'group', 'id', 'key', 'label', 'placeable', 'solid', 'tint', 'transparent'];
  for (const b of BLOCKS) {
    assert.deepEqual(Object.keys(b).sort(), keys, b.key);
    assert.deepEqual(Object.keys(b.faces).sort(), ['bottom', 'side', 'top']);
    assert.ok(['ground', 'structure', 'nature', 'decor'].includes(b.group), b.key);
    assert.ok(b.tint === null || /^#[0-9a-f]{6}$/i.test(b.tint), b.key);
    assert.ok(b.emissive >= 0 && b.emissive <= 1);
  }
});

test('every face texture exists in app/vendor/kenney-voxel/', () => {
  const files = textureFiles();
  assert.ok(files.length > 10);
  for (const b of BLOCKS.slice(1)) for (const t of Object.values(b.faces)) assert.ok(t, `${b.key} has an empty face`);
  for (const t of files) assert.ok(fs.existsSync(VENDOR + t), `missing ${t}`);
  assert.ok(fs.existsSync(VENDOR + 'License.txt'));
  assert.match(fs.readFileSync(VENDOR + 'License.txt', 'utf8'), /CC0/);
});

test('flags: solid / transparent / emissive', () => {
  assert.equal(isSolid(BLOCK.air.id), false);
  assert.equal(isSolid(BLOCK.stone.id), true);
  assert.equal(isSolid(BLOCK.water.id), false);
  assert.equal(isTransparent(BLOCK.air.id), true);
  assert.equal(isTransparent(BLOCK.glass.id), true);
  assert.equal(isTransparent(BLOCK.leaves.id), true);
  assert.equal(isTransparent(BLOCK.brick.id), false);
  assert.equal(isTransparent(999), true);
  assert.equal(BLOCK['lit-glass'].emissive, 1);
  assert.equal(BLOCK.lamp.emissive, 1);
  assert.equal(blockById(BLOCK.grass.id).key, 'grass');
  assert.equal(blockById(9999), undefined);
});

test('placeableBlocks excludes air, bedrock, lit glass, doors and the tinted style sets', () => {
  const keys = placeableBlocks().map((b) => b.key);
  for (const k of ['air', 'bedrock', 'lit-glass', 'door-lower', 'door-upper', 'plaster-miami-deco']) assert.ok(!keys.includes(k), k);
  for (const k of ['grass', 'plaster', 'glass', 'planks-light', 'bed', 'flowers']) assert.ok(keys.includes(k), k);
});

test('every style family (and variant) resolves to tinted blocks from its palette', () => {
  for (const key of STYLE_FAMILIES) {
    const s = styleBlocks(key);
    const pal = STYLE_FAMILY_DATA[key].palettes[0];
    assert.equal(blockById(s.wall).tint, pal.wall, key);
    assert.equal(blockById(s.roof).tint, pal.roof, key);
    assert.equal(blockById(s.trim).tint, pal.trim, key);
    assert.ok([BLOCK['planks-light'].id, BLOCK.slab.id].includes(s.floor));
    for (const v of Object.keys(STYLE_FAMILY_DATA[key].variants || {})) assert.ok(styleBlocks(key, v).wall > 0);
  }
  const alaska = styleBlocks('maritime', 'alaska');
  assert.notEqual(alaska.wall, styleBlocks('maritime').wall);
  assert.equal(blockById(alaska.wall).tint, STYLE_FAMILY_DATA.maritime.variants.alaska.palettes[0].wall);
  assert.equal(styleBlocks('desert-southwest', 'hillside').wall, styleBlocks('desert-southwest').wall);
  assert.throws(() => styleBlocks('nowhere'));
});
