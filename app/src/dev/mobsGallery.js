// Mobs gallery (13 §8, homeblocks 13): `?dev=mobs` shows the blocky character walking a square on a stone plaza and every
// animal kind (plus the black stray cat) idling on its own grass pad, with a second chicken wandering a grass yard.
// window.__mobs = triangles per mob (each must stay under VOX_MOBS.maxTriangles).
import { h, clear } from '../ui/dom.js';
import { createVolume, fillBox } from '../world/volume.js';
import { BLOCK } from '../world/blocks.js';
import { VOX_MOBS, LIFE } from '../config.js';

const id = (key) => BLOCK[key].id;
const PADS = [
  { name: 'chicken', kind: 'chicken' }, { name: 'cat', kind: 'cat' }, { name: 'dog', kind: 'dog' },
  { name: 'goat', kind: 'goat' }, { name: 'black cat', kind: 'cat', color: LIFE.autopilot.blackCatColor },
];

/** Render the gallery into root. Returns a cleanup function. */
export async function mount(root) {
  delete document.body.dataset.ready;
  clear(root);
  const view = h('div', { class: 'dev-scene-view dev-mobs-view' });
  const label = h('div', { class: 'dev-scene-label' }, 'Loading mobs…');
  root.append(h('section', { class: 'dev-scene' }, view, label));
  const [{ createVoxelWorld }, mobs, { triangleCount }, { characterColors }] = await Promise.all([
    import('../three/voxel/engine.js'), import('../three/voxel/mobs.js'), import('../three/propKit.js'), import('../three/character.js'),
  ]);

  // 22 × 6 × 16: stone-brick plaza, a grass yard for the wanderer, one 3 × 3 grass pad per animal along the front.
  const v = createVolume({ x: 22, y: 6, z: 16 });
  fillBox(v, { x0: 0, y0: 0, z0: 0, x1: 21, y1: 0, z1: 15 }, id('stone-brick'));
  const yard = { x0: 12, y0: 1, z0: 2, x1: 19, y1: 2, z1: 8 };
  fillBox(v, { ...yard, y0: 0, y1: 0 }, id('grass'));
  PADS.forEach((p, i) => { p.x = 3 + i * 4; p.z = 12; fillBox(v, { x0: p.x - 1, y0: 0, z0: 11, x1: p.x + 1, y1: 0, z1: 13 }, id('grass')); });

  const world = await createVoxelWorld(view, { volume: v });
  if (!world) {
    label.textContent = 'WebGL is not available, so the mobs cannot be shown.';
    document.body.dataset.ready = '1';
    return () => { delete document.body.dataset.ready; };
  }
  world.controls.maxDistance = 60;
  world.controls.target.set(11, 1, 9);
  world.camera.position.set(11, 8, 21.5);
  world.controls.update();

  const ch = mobs.createBlockCharacter(characterColors(3));
  ch.object.position.set(3, 1, 3);
  world.scene.add(ch.object);
  const animals = PADS.map((p) => {
    const a = mobs.createBlockAnimal(p.kind, p.color ? { color: p.color } : {});
    a.position.set(p.x + 0.5, 1, p.z + 0.5);
    a.rotation.y = 0.5;
    world.scene.add(a);
    return a;
  });
  const wanderer = mobs.createBlockAnimal('chicken', { color: '#b5703a' });
  wanderer.userData.wander(yard, { seed: 3 });
  world.scene.add(wanderer);

  const tris = { character: triangleCount(ch.object) };
  PADS.forEach((p, i) => { tris[p.name] = triangleCount(animals[i]); });
  window.__mobs = tris;
  const over = Object.entries(tris).filter(([, n]) => n >= VOX_MOBS.maxTriangles);

  let alive = true, raf = 0, last = performance.now(), t = 0;
  const square = [{ x: 3, y: 1, z: 8 }, { x: 8, y: 1, z: 8 }, { x: 8, y: 1, z: 3 }, { x: 3, y: 1, z: 3 }];
  (async () => { while (alive) await ch.walkTo(square); })();
  const frame = (now) => {
    if (!alive) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    t += dt;
    ch.update(dt);
    for (const a of [...animals, wanderer]) a.userData.idle(t);
    world.requestRender();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  await world.firstFrame();
  label.textContent = `Blocky character + ${PADS.length} animals · triangles: `
    + Object.entries(tris).map(([k, n]) => `${k} ${n}`).join(' · ')
    + (over.length ? ` · OVER ${VOX_MOBS.maxTriangles}: ${over.map(([k]) => k).join(', ')}` : ` (each < ${VOX_MOBS.maxTriangles})`);
  document.body.dataset.ready = '1';
  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    ch.setVisible(false);
    world.dispose();
    delete window.__mobs;
    delete document.body.dataset.ready;
  };
}
