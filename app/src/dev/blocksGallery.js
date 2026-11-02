// `?dev=blocks` (13 §4, task homeblocks 03): every block in world/blocks.js as a small textured, tinted cube with its
// label underneath. `&night=1` (or the Night button) dims the lights so emissive blocks (lit glass, lamps) glow.
// One WebGL canvas behind a CSS grid; each cube is placed at its grid cell with an orthographic, pixel-unit camera.
// `window.__blocks = {count, textures, night}` once drawn.
import { h, clear } from '../ui/dom.js';
import { getFlag } from './flags.js';
import { BLOCKS, textureFiles } from '../world/blocks.js';

const TEX_URL = new URL('../../vendor/kenney-voxel/', import.meta.url);
const CUBE = 44; // cube edge in px

/** Render the blocks gallery into root. Returns a cleanup function. */
export async function mount(root) {
  delete document.body.dataset.ready;
  clear(root);
  const blocks = BLOCKS.slice(1); // skip air
  let night = getFlag('night') === '1';

  const toggle = h('button', { type: 'button', style: { font: '600 14px system-ui, sans-serif', padding: '6px 14px', borderRadius: '6px',
    border: '1px solid #c8d0dc', background: '#f4f6fa', color: '#1a2230', cursor: 'pointer' }, onClick: () => setNight(!night) }, '');
  const head = h('header', { style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px',
    color: '#f4f6fa', font: '600 15px system-ui, sans-serif' } },
  h('span', null, `Blocks · ${blocks.length} (Kenney Voxel Pack, CC0)`), toggle);
  const cells = blocks.map((b) => h('div', { style: { display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
    alignItems: 'center', minHeight: '0' } },
  h('span', { style: { font: '11px/1.2 system-ui, sans-serif', color: '#f4f6fa', textAlign: 'center',
    textShadow: '0 1px 2px #000', padding: '0 2px', overflow: 'hidden', maxWidth: '100%' } }, `${b.id} ${b.label}`)));
  const grid = h('div', { style: { position: 'absolute', inset: '44px 0 0 0', display: 'grid',
    gridTemplateColumns: 'repeat(14, 1fr)', gridAutoRows: '1fr', padding: '4px 8px 8px' } }, cells);
  const view = h('div', { class: 'dev-scene-view' });
  root.append(h('section', { class: 'dev-scene' }, view, h('div', { style: { position: 'absolute', inset: '0 0 auto 0' } }, head), grid));

  const THREE = await import('three');
  const w = view.clientWidth || innerWidth, ht = view.clientHeight || innerHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, ht);
  view.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, w, 0, -ht, -500, 500);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(0.4, 1, 0.7);
  scene.add(hemi, sun);

  const loader = new THREE.TextureLoader();
  const tex = {};
  await Promise.all(textureFiles().map(async (f) => {
    const t = await loader.loadAsync(new URL(f, TEX_URL).href);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    tex[f] = t;
  }));

  const geo = new THREE.BoxGeometry(CUBE, CUBE, CUBE);
  const mats = [];
  const matFor = (b, file) => {
    const color = new THREE.Color(b.tint || '#ffffff');
    const m = new THREE.MeshLambertMaterial({ map: tex[file], color, transparent: b.transparent, alphaTest: b.transparent ? 0.05 : 0,
      side: b.transparent ? THREE.DoubleSide : THREE.FrontSide, emissive: b.emissive ? color : 0x000000,
      emissiveMap: b.emissive ? tex[file] : null, emissiveIntensity: 0 });
    m.userData.emissive = b.emissive;
    mats.push(m);
    return m;
  };
  const meshes = blocks.map((b) => {
    const { top, side, bottom } = b.faces;
    const s = matFor(b, side);
    // BoxGeometry material order: +x, -x, +y, -y, +z, -z.
    const mesh = new THREE.Mesh(geo, [s, s, matFor(b, top), matFor(b, bottom), s, s]);
    mesh.rotation.set(0.5, -0.7, 0, 'XYZ');
    scene.add(mesh);
    return mesh;
  });

  const layout = () => {
    const vr = view.getBoundingClientRect();
    blocks.forEach((b, i) => {
      const r = cells[i].getBoundingClientRect();
      const x = r.left - vr.left + r.width / 2, y = r.top - vr.top + (r.height - 16) / 2;
      meshes[i].position.set(x, -y, 0);
    });
  };

  function setNight(on) {
    night = on;
    scene.background = new THREE.Color(on ? 0x0a1024 : 0x7fb8dc);
    hemi.intensity = on ? 0.18 : 1.6;
    sun.intensity = on ? 0.1 : 1.6;
    for (const m of mats) m.emissiveIntensity = on ? m.userData.emissive : 0;
    toggle.textContent = on ? 'Day' : 'Night';
    renderer.render(scene, camera);
    if (window.__blocks) window.__blocks.night = on;
  }

  layout();
  setNight(night);
  const onResize = () => {
    const nw = view.clientWidth, nh = view.clientHeight;
    renderer.setSize(nw, nh);
    Object.assign(camera, { right: nw, bottom: -nh });
    camera.updateProjectionMatrix();
    layout();
    renderer.render(scene, camera);
  };
  addEventListener('resize', onResize);
  window.__blocks = { count: blocks.length, textures: Object.keys(tex).length, night };
  document.body.dataset.ready = '1';

  return () => {
    removeEventListener('resize', onResize);
    geo.dispose();
    for (const m of mats) m.dispose();
    for (const t of Object.values(tex)) t.dispose();
    renderer.dispose();
    delete window.__blocks;
    delete document.body.dataset.ready;
  };
}
