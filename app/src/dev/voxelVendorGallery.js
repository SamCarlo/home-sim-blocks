// `?dev=voxel-vendor` (13 §2, task 02): proves the vendored block engine (app/vendor/voxel/, vyse12138/minecraft-threejs,
// MIT) runs in our harness. Builds a ≈32×16×32 patch with the engine's own worker generator and its placeholder-color
// materials, under an orbit camera. `window.__voxel = {calls, triangles, chunks, blocks}` once the first frame is drawn.
import { h, clear } from '../ui/dom.js';

const SIZE = 32;      // one engine chunk of 32 × 32 columns (distance 0)
const SEED = 0.4242;  // fixed noise seeds so the shot is stable (the engine defaults to Math.random)

/** Render the voxel vendor gallery into root. Returns a cleanup function. */
export async function mount(root) {
  delete document.body.dataset.ready;
  clear(root);
  const view = h('div', { class: 'dev-scene-view' });
  const label = h('div', { class: 'dev-scene-label' }, 'Loading block engine…');
  root.append(h('section', { class: 'dev-scene' }, view, label));

  const [THREE, { OrbitControls }, { default: Terrain }] = await Promise.all([
    import('three'), import('three/addons/controls/OrbitControls.js'), import('../../vendor/voxel/terrain/index.js')]);

  const w = view.clientWidth || innerWidth, ht = view.clientHeight || innerHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, ht);
  view.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x556644, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(40, 80, 20);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(50, w / ht, 0.1, 500);
  camera.position.set(SIZE / 2 + 26, 54, SIZE / 2 + 30);

  // The engine: distance 0 + chunkSize 32 → one chunk spanning x, z ∈ [0, 32). Surface y ≈ 30 ± 8, trees above.
  const terrain = new Terrain(scene, camera);
  terrain.distance = 0;
  terrain.chunkSize = SIZE;
  terrain.maxCount = (terrain.distance * terrain.chunkSize * 2 + terrain.chunkSize) ** 2 + 500;
  const n = terrain.noise;
  Object.assign(n, { seed: SEED, stoneSeed: SEED * 0.4, coalSeed: SEED * 0.5, treeSeed: SEED * 0.7, leafSeed: SEED * 0.8 });
  scene.remove(terrain.cloud);
  terrain.initBlocks();

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(SIZE / 2, 30, SIZE / 2);
  controls.enableDamping = true;
  controls.update();

  let stopped = false;
  const generated = new Promise((resolve) => terrain.generateWorker.addEventListener('message', resolve, { once: true }));
  terrain.generate();
  await generated;
  if (stopped) return () => {};

  renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
  renderer.render(scene, camera);
  // The engine sizes each InstancedMesh as maxCount × a fractional factor and draws every slot (empty ones are
  // zero matrices), so three reports a fractional triangle count; round it.
  const blocks = terrain.blocksCount.reduce((a, b) => a + b, 0);
  const calls = renderer.info.render.calls, triangles = Math.round(renderer.info.render.triangles);
  window.__voxel = { calls, triangles, chunks: 1, blocks };
  label.textContent = `Block engine (vyse12138/minecraft-threejs, MIT) · ${blocks} blocks · ${calls} draw calls · ${triangles} triangles`;
  document.body.dataset.ready = '1';

  return () => {
    stopped = true;
    renderer.setAnimationLoop(null);
    terrain.generateWorker.terminate();
    controls.dispose();
    renderer.dispose();
    delete window.__voxel;
    delete document.body.dataset.ready;
  };
}
