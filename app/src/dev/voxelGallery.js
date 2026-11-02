// `?dev=voxel` (13 §2, §11, blocks task 05): the voxel adapter (three/voxel/engine.js) showing a pure test volume.
// Default: 64 × 32 × 64 with ground, a hollow plank house (door, glass and lit windows, roof), a tree and a pond.
// `&full=1`: a flat 128 × 96 × 128 world (the 13 §11 budget check). `&t=<hours>` time of day (12). `&far=1` adds a
// far-scenery stepped hill (16 × 10 × 8 at scale 4) behind the world.
// Click breaks the block under the pointer, shift-click places light planks on the face (proves edits through pick).
// `window.__voxel = {world, calls, triangles, chunks, edits}` once the first frame is drawn.
import { h, clear } from '../ui/dom.js';
import { getFlag } from './flags.js';
import { BLOCK } from '../world/blocks.js';
import { createVolume, fillBox, hollowBox, column } from '../world/volume.js';

const id = (key) => BLOCK[key].id;

/** The 64 × 32 × 64 test world: ground top at y = 7. */
export function testVolume() {
  const v = createVolume({ x: 64, y: 32, z: 64 });
  fillBox(v, { x0: 0, y0: 0, z0: 0, x1: 63, y1: 0, z1: 63 }, id('bedrock'));
  fillBox(v, { x0: 0, y0: 1, z0: 0, x1: 63, y1: 3, z1: 63 }, id('stone'));
  fillBox(v, { x0: 0, y0: 4, z0: 0, x1: 63, y1: 6, z1: 63 }, id('dirt'));
  fillBox(v, { x0: 0, y0: 7, z0: 0, x1: 63, y1: 7, z1: 63 }, id('grass'));
  // House: 11 × 9 footprint, slab floor at y 7, walls y 8–11, flat roof y 12 with a 1-block overhang.
  hollowBox(v, { x0: 22, y0: 7, z0: 22, x1: 32, y1: 12, z1: 30 }, id('planks-light'), { floorId: id('slab'), ceilId: 0 });
  fillBox(v, { x0: 21, y0: 12, z0: 21, x1: 33, y1: 12, z1: 31 }, id('roof'));
  fillBox(v, { x0: 27, y0: 8, z0: 30, x1: 27, y1: 9, z1: 30 }, 0);                       // door opening (street side)
  fillBox(v, { x0: 24, y0: 9, z0: 30, x1: 25, y1: 10, z1: 30 }, id('glass'));            // front windows
  fillBox(v, { x0: 29, y0: 9, z0: 30, x1: 30, y1: 10, z1: 30 }, id('lit-glass'));
  fillBox(v, { x0: 32, y0: 9, z0: 25, x1: 32, y1: 10, z1: 27 }, id('glass'));            // east window
  fillBox(v, { x0: 22, y0: 8, z0: 22, x1: 22, y1: 11, z1: 22 }, id('brick'));            // corner posts
  fillBox(v, { x0: 32, y0: 8, z0: 22, x1: 32, y1: 11, z1: 22 }, id('brick'));
  // Tree.
  fillBox(v, { x0: 41, y0: 11, z0: 37, x1: 45, y1: 13, z1: 41 }, id('leaves'));
  fillBox(v, { x0: 42, y0: 14, z0: 38, x1: 44, y1: 14, z1: 40 }, id('leaves'));
  column(v, 43, 39, 8, 12, id('trunk'));
  // Pond, sand rim.
  fillBox(v, { x0: 8, y0: 7, z0: 38, x1: 18, y1: 7, z1: 48 }, id('sand'));
  fillBox(v, { x0: 9, y0: 5, z0: 39, x1: 17, y1: 7, z1: 47 }, id('water'));
  // Path to the door.
  fillBox(v, { x0: 27, y0: 7, z0: 31, x1: 27, y1: 7, z1: 40 }, id('gravel'));
  return v;
}

/** A flat 128 × 96 × 128 world (ground top at y 24) for the 13 §11 budget check. */
function flatVolume() {
  const v = createVolume({ x: 128, y: 96, z: 128 });
  fillBox(v, { x0: 0, y0: 0, z0: 0, x1: 127, y1: 0, z1: 127 }, id('bedrock'));
  fillBox(v, { x0: 0, y0: 1, z0: 0, x1: 127, y1: 19, z1: 127 }, id('stone'));
  fillBox(v, { x0: 0, y0: 20, z0: 0, x1: 127, y1: 23, z1: 127 }, id('dirt'));
  fillBox(v, { x0: 0, y0: 24, z0: 0, x1: 127, y1: 24, z1: 127 }, id('grass'));
  return v;
}

/** A small stepped stone hill for the far volume (one far block = 4 m). */
function farHill() {
  const v = createVolume({ x: 16, y: 10, z: 8 });
  for (let k = 0; k < 8; k++) fillBox(v, { x0: k, y0: 0, z0: 0, x1: 15 - k, y1: k + 2, z1: 7 }, id(k > 5 ? 'snow' : 'stone'));
  return v;
}

/** Render the voxel adapter gallery into root. Returns a cleanup function. */
export async function mount(root) {
  delete document.body.dataset.ready;
  clear(root);
  const full = getFlag('full') === '1';
  const view = h('div', { class: 'dev-scene-view' });
  const label = h('div', { class: 'dev-scene-label' }, 'Loading block world…');
  root.append(h('section', { class: 'dev-scene' }, view, label));

  const { createVoxelWorld } = await import('../three/voxel/engine.js');
  const volume = full ? flatVolume() : testVolume();
  const far = getFlag('far') === '1' ? { volume: farHill(), scale: 4, origin: { x: volume.size.x / 2 - 32, y: 0, z: -40 } } : null;
  const world = await createVoxelWorld(view, { volume, far, timeOfDay: Number(getFlag('t') ?? 12) });
  if (!world) {
    label.textContent = 'WebGL is not available, so the block world cannot be shown.';
    document.body.dataset.ready = '1';
    return () => { delete document.body.dataset.ready; };
  }
  if (full) world.setOrbit({ target: { x: 64, y: 24, z: 64 }, distance: 190 });
  else world.setOrbit({ target: { x: 30, y: 9, z: 30 }, distance: 34 });

  let edits = 0;
  const show = () => {
    const { calls, triangles, chunks } = world.info;
    label.textContent = `Block world ${volume.size.x} × ${volume.size.y} × ${volume.size.z} · ${chunks} chunks · ${calls} draw calls · ${triangles} triangles · ${edits} edits · click breaks, shift-click places`;
  };
  const wrapSet = world.setBlock;
  world.setBlock = (x, y, z, b) => {
    const ok = wrapSet(x, y, z, b);
    if (ok) { edits++; world.firstFrame().then(show); }
    return ok;
  };

  // Click (not a drag) → break or place through pick.
  const canvas = world.renderer.domElement;
  let down = null;
  const onDown = (e) => { down = [e.clientX, e.clientY]; };
  const onUp = (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
    const r = canvas.getBoundingClientRect();
    const hit = world.pick(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    if (!hit) return;
    if (e.shiftKey) world.setBlock(hit.x + hit.normal[0], hit.y + hit.normal[1], hit.z + hit.normal[2], id('planks-light'));
    else if (hit.id !== id('bedrock')) world.setBlock(hit.x, hit.y, hit.z, 0);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);

  await world.firstFrame();
  show();
  window.__voxel = {
    world,
    get calls() { return world.info.calls; },
    get triangles() { return world.info.triangles; },
    get chunks() { return world.info.chunks; },
    get edits() { return edits; },
  };
  document.body.dataset.ready = '1';

  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
    world.dispose();
    delete window.__voxel;
    delete document.body.dataset.ready;
  };
}
