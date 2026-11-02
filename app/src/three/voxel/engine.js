// Voxel world adapter (13 §2, §3, §11, blocks task 05). Browser only, load with import(). The rest of the game hands
// this a pure volume (world/volume.js) and gets a rendered, editable world back; nothing else touches the vendored
// engine. The vendored vyse12138 engine is a surface-heightmap InstancedMesh engine with no dense volume, so its
// terrain generator and persistence are not used at all: the world is meshed here by world/mesher.js (exposed faces
// only, 32 × 32-column chunks, one mesh per chunk per pass). Its Control/Player are for Explore (later tasks).
//
// Materials: one texture atlas (canvas) of every Kenney tile the registry uses, nearest up close, mipmapped far off, tints as vertex colors,
// passes opaque / cutout (alpha test) / blend (water, ice) / glow (emissiveMap = map, lit at night).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { textureFiles } from '../../world/blocks.js';
import { get as getCell, set as setCell, inBounds } from '../../world/volume.js';
import { PASSES, blockTables, meshChunk, raycast } from '../../world/mesher.js';
import { FAR } from '../../config.js';

const TEX_URL = new URL('../../../vendor/kenney-voxel/', import.meta.url);
const TILE = 128;  // Kenney tile size in px
const CHUNK = 32;  // chunk width in columns (x and z); chunks span the full height

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Load every registry texture into one atlas canvas (tile index = textureFiles() order). */
async function loadAtlas(files, cols, rows) {
  const canvas = document.createElement('canvas');
  canvas.width = cols * TILE;
  canvas.height = rows * TILE;
  const ctx = canvas.getContext('2d');
  await Promise.all(files.map(async (f, i) => {
    const img = new Image();
    img.src = new URL(f, TEX_URL).href;
    await img.decode();
    ctx.drawImage(img, (i % cols) * TILE, Math.floor(i / cols) * TILE, TILE, TILE);
  }));
  const tex = new THREE.CanvasTexture(canvas);
  Object.assign(tex, { colorSpace: THREE.SRGBColorSpace, magFilter: THREE.NearestFilter,
    minFilter: THREE.LinearMipmapLinearFilter, anisotropy: 4 }); // mipmaps stop distance moiré; slight tile bleed far off
  return tex;
}

function makeMaterials(atlas) {
  const base = { map: atlas, vertexColors: true };
  return [
    new THREE.MeshLambertMaterial({ ...base }),
    new THREE.MeshLambertMaterial({ ...base, alphaTest: 0.5, side: THREE.DoubleSide }),
    new THREE.MeshLambertMaterial({ ...base, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    new THREE.MeshLambertMaterial({ ...base, emissive: 0xffffff, emissiveMap: atlas, emissiveIntensity: 0 }),
  ];
}

function geometryOf(part) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(part.colors, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(part.uvs, 2));
  g.setIndex(new THREE.BufferAttribute(part.indices, 1));
  g.computeBoundingSphere();
  return g;
}

/** 0 at midnight … 1 at noon (timeOfDay in hours). */
const daylightAt = (h) => THREE.MathUtils.clamp(0.5 - 0.5 * Math.cos(((h % 24) / 24) * Math.PI * 2) * 1.6, 0, 1);

/**
 * Render volume `opts.volume` in container. Options: `far` {volume, scale, origin {x, y, z}} or a list of them (meshed per
 * pass, scaled at origin; the blend pass at FAR.plumeOpacity), `timeOfDay` hours (12). Resolves to {scene, camera, renderer, controls, setBlock, getBlock, pick, setOrbit,
 * setTimeOfDay, info {calls, triangles, chunks}, requestRender, firstFrame, dispose}, or null without WebGL.
 */
export async function createVoxelWorld(container, { volume, far = null, timeOfDay = 12 } = {}) {
  if (!webglAvailable()) return null;
  const files = textureFiles();
  const tables = blockTables(files);
  const atlas = await loadAtlas(files, tables.cols, tables.rows);
  const mats = makeMaterials(atlas);

  const renderer = new THREE.WebGLRenderer({ antialias: (window.devicePixelRatio || 1) <= 1.5, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.width = canvas.style.height = '100%';
  container.append(canvas);

  const scene = new THREE.Scene();
  const { x: X, y: Y, z: Z } = volume.size;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a66, 1.5);
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(0.5, 1, 0.35);
  scene.add(hemi, sun);

  // Chunks: key cx,cz → {group, dirty}
  const NX = Math.ceil(X / CHUNK), NZ = Math.ceil(Z / CHUNK);
  const chunks = Array.from({ length: NX * NZ }, () => ({ meshes: [], dirty: true }));
  const world = new THREE.Group();
  scene.add(world);
  function buildChunk(ci) {
    const ch = chunks[ci], cx = ci % NX, cz = Math.floor(ci / NX);
    for (const m of ch.meshes) { world.remove(m); m.geometry.dispose(); }
    ch.meshes = [];
    meshChunk(volume, tables, { x0: cx * CHUNK, z0: cz * CHUNK, x1: (cx + 1) * CHUNK, z1: (cz + 1) * CHUNK })
      .forEach((part, p) => {
        if (!part.faces) return;
        const m = new THREE.Mesh(geometryOf(part), mats[p]);
        m.name = `chunk-${cx}-${cz}-${PASSES[p]}`;
        m.matrixAutoUpdate = false;
        if (p === 2) m.renderOrder = 1;
        ch.meshes.push(m);
        world.add(m);
      });
    ch.dirty = false;
  }
  const rebuildDirty = () => chunks.forEach((ch, i) => { if (ch.dirty) buildChunk(i); });

  // Far scenery (13 §3): one entry or a list (the landmarks gallery shows 20), meshed per pass so plumes stay translucent.
  const farGroup = new THREE.Group();
  farGroup.name = 'far';
  const farBlend = mats[2].clone();
  farBlend.opacity = FAR.plumeOpacity;
  for (const f of [far].flat()) {
    if (!f?.volume) continue;
    meshChunk(f.volume, tables).forEach((part, p) => {
      if (!part.faces) return;
      const m = new THREE.Mesh(geometryOf(part), p === 2 ? farBlend : mats[p]);
      m.name = `far-${PASSES[p]}`;
      m.scale.setScalar(f.scale ?? 4);
      m.position.set(f.origin?.x ?? 0, f.origin?.y ?? 0, f.origin?.z ?? 0);
      if (p === 2) m.renderOrder = 1;
      farGroup.add(m);
    });
  }
  scene.add(farGroup);

  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.1, maxPolarAngle: Math.PI * 0.49, minDistance: 4,
    maxDistance: Math.max(X, Z) * 2.5 });

  let disposed = false, pending = 0;
  const api = {
    scene, camera, renderer, controls, volume, info: { calls: 0, triangles: 0, chunks: chunks.length },
    requestRender, setTimeOfDay,
    /** Block id at a cell (air outside the volume). */
    getBlock: (x, y, z) => getCell(volume, x, y, z),
    /** Set a cell and remesh its chunk (and the neighbor chunk on a chunk edge). Returns false outside the volume. */
    setBlock(x, y, z, id) {
      if (!inBounds(volume, x, y, z) || !setCell(volume, x, y, z, id)) return false;
      const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
      const mark = (a, b) => { if (a >= 0 && a < NX && b >= 0 && b < NZ) chunks[a + NX * b].dirty = true; };
      mark(cx, cz);
      if (x % CHUNK === 0) mark(cx - 1, cz);
      if (x % CHUNK === CHUNK - 1) mark(cx + 1, cz);
      if (z % CHUNK === 0) mark(cx, cz - 1);
      if (z % CHUNK === CHUNK - 1) mark(cx, cz + 1);
      requestRender();
      return true;
    },
    /** The block under normalized device coords (−1…1) → {x, y, z, normal, id} or null. */
    pick(ndcX, ndcY) {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const { origin: o, direction: d } = ray.ray;
      const hit = raycast(volume, [o.x, o.y, o.z], [d.x, d.y, d.z], camera.far);
      return hit && { x: hit.x, y: hit.y, z: hit.z, normal: hit.normal, id: hit.id };
    },
    /** Point the orbit camera at target {x, y, z} from `distance` blocks, keeping the view direction. */
    setOrbit({ target, distance } = {}) {
      const dir = camera.position.clone().sub(controls.target).normalize();
      if (target) controls.target.set(target.x, target.y, target.z);
      if (distance) camera.position.copy(controls.target).addScaledVector(dir, distance);
      else camera.position.copy(controls.target).addScaledVector(dir, camera.position.distanceTo(controls.target));
      controls.update();
      requestRender();
    },
    /** Free every geometry, material, texture and the renderer. */
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(pending);
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => o.geometry?.dispose());
      mats.forEach((m) => m.dispose());
      farBlend.dispose();
      farGroup.traverse((o) => o.geometry?.dispose());
      atlas.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };

  function renderNow() {
    pending = 0;
    if (disposed) return;
    rebuildDirty();
    controls.update(); // damping keeps firing 'change' until it settles
    renderer.render(scene, camera);
    api.info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, chunks: chunks.length };
  }
  /** Render on the next frame (coalesced). */
  function requestRender() {
    if (!pending && !disposed) pending = requestAnimationFrame(renderNow);
  }
  /** Day/night lighting: hours 0–24; emissive blocks glow as daylight fades. */
  function setTimeOfDay(h) {
    const day = daylightAt(h);
    hemi.intensity = 0.15 + 1.35 * day;
    sun.intensity = 0.1 + 1.7 * day;
    mats[3].emissiveIntensity = 1 - day;
    scene.background = new THREE.Color(0x0a1024).lerp(new THREE.Color(0x87c4e8), day);
    requestRender();
  }
  controls.addEventListener('change', requestRender);

  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    requestRender();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  /** Render one frame now and resolve with info (galleries call it before setting ready). */
  api.firstFrame = () => new Promise((resolve) => requestAnimationFrame(() => { renderNow(); resolve(api.info); }));

  controls.target.set(X / 2, Math.min(Y, 26), Z / 2);
  camera.position.set(X / 2 + X * 0.55, Math.min(Y, 26) + X * 0.5, Z / 2 + Z * 0.75);
  controls.update();
  setTimeOfDay(timeOfDay);
  resize();
  return api;
}
