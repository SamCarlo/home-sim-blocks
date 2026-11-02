// Landmarks gallery (13 §3, homeblocks 08): `?dev=landmarks[&month=<n>&seed=<n>]` shows all 20 far volumes
// (world/genLandmarks.js genFar) in a 5 × 4 grid at scale 1 with a label under each. window.__landmarks = stats per key.
import { h, clear } from '../ui/dom.js';
import { getFlag } from './flags.js';
import { LANDMARKS } from '../data/enums.js';
import { LOCATIONS } from '../data/locations/index.js';
import { createVolume } from '../world/volume.js';
import { genFar } from '../world/genLandmarks.js';
import { FAR } from '../config.js';

const COLS = 5, GAP_X = 8, GAP_Y = 10;

/** Render the 20 far volumes into root. Returns a cleanup function. */
export async function mount(root) {
  delete document.body.dataset.ready;
  clear(root);
  const view = h('div', { class: 'dev-scene-view dev-landmarks-view' });
  const label = h('div', { class: 'dev-scene-label' }, 'Loading landmarks…');
  root.append(h('section', { class: 'dev-scene' }, view, label));
  const { createVoxelWorld } = await import('../three/voxel/engine.js');

  const seed = Number(getFlag('seed') ?? 1), monthIndex = Number(getFlag('month') ?? 6);
  const { x: W, y: H, z: D } = FAR.size, rows = Math.ceil(LANDMARKS.length / COLS);
  const tiles = LANDMARKS.map((key, i) => {
    const far = genFar({ location: { landmark: key }, seed, monthIndex });
    const col = i % COLS, row = Math.floor(i / COLS);
    const origin = { x: col * (W + GAP_X), y: (rows - 1 - row) * (H + GAP_Y), z: 0 };
    let filled = 0;
    for (const c of far.data) if (c) filled++;
    const place = LOCATIONS.find((l) => l.landmark === key);
    return { key, place: place?.name ?? '', origin, filled, entry: { volume: { size: far.size, data: far.data }, scale: 1, origin } };
  });
  window.__landmarks = Object.fromEntries(tiles.map((t) => [t.key, t.filled]));

  const world = await createVoxelWorld(view, { volume: createVolume({ x: 4, y: 4, z: 4 }), far: tiles.map((t) => t.entry) });
  if (!world) {
    label.textContent = 'WebGL is not available, so the landmarks cannot be shown.';
    document.body.dataset.ready = '1';
    return () => { delete document.body.dataset.ready; };
  }
  const totalW = COLS * W + (COLS - 1) * GAP_X, totalH = rows * (H + GAP_Y);
  const target = { x: totalW / 2, y: totalH / 2 - 6, z: D / 2 };
  world.controls.maxDistance = 1500; // the 4³ base volume would clamp the orbit to 10 blocks
  world.controls.target.set(target.x, target.y, target.z);
  world.camera.position.set(target.x, target.y + 70, target.z + 430);
  world.controls.update();

  const tags = tiles.map((t) => h('div', { class: 'dev-landmark-tag', style: 'position:absolute;transform:translate(-50%,0);'
    + 'font:600 12px/1.2 system-ui,sans-serif;color:#1d2530;background:#ffffffd9;padding:1px 6px;border-radius:4px;'
    + 'pointer-events:none;white-space:nowrap' }, `${t.key} · ${t.place}`));
  view.append(...tags);
  const place = () => {
    const r = world.renderer.domElement.getBoundingClientRect(), vr = view.getBoundingClientRect();
    tiles.forEach((t, i) => {
      const p = world.camera.position.clone().set(t.origin.x + W / 2, t.origin.y - 1, t.origin.z + D).project(world.camera);
      tags[i].style.left = `${r.left - vr.left + ((p.x + 1) / 2) * r.width}px`;
      tags[i].style.top = `${r.top - vr.top + ((1 - p.y) / 2) * r.height}px`;
    });
  };
  world.controls.addEventListener('change', place);
  world.requestRender();
  await world.firstFrame();
  place();
  const { calls, triangles } = world.info;
  label.textContent = `20 far volumes ${W} × ${H} × ${D} (scale 1 here, ${4} m per block in a world) · seed ${seed} · month ${monthIndex}`
    + ` · ${calls} draw calls · ${triangles} triangles`;
  document.body.dataset.ready = '1';
  return () => {
    world.controls.removeEventListener('change', place);
    world.dispose();
    delete document.body.dataset.ready;
  };
}
