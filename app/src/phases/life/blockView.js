// The Phase 4 block view (13 §8, homeblocks 14). Browser only, loads three lazily. Builds the student's world through the
// voxHome contract (13 §6), renders it with the voxel adapter, lights it with the classic sky (sky dome, sun, moon,
// palettes from sky.js) and adds the blocky character and animals (mobs.js). Returns the same handle as lifeView.js, so
// lifeScreen, animation.js and careButton.js drive either one. Returns null when WebGL is unavailable.
import { h } from '../../ui/dom.js';
import { LIFE3D, BLOCK_VIEW } from '../../config.js';
import { BLOCK } from '../../world/blocks.js';
import { seedFor } from '../../util/rng.js';

const ID = (k) => BLOCK[k].id;
const ids = (s) => [...(s.home?.plants ?? []), ...(s.home?.animals ?? [])].map((x) => x.id).join(',');
const snowKey = (isSnow, loc, mi) => (isSnow(loc, mi) ? 'snow' : 'clear');

/** createBlockView(container, {state}) → Promise<{scene, home, info, refreshNight, setLiving, syncHome, firstFrame, dispose}> | null. */
export async function createBlockView(container, { state }) {
  const [THREE, { voxHome }, { createVoxelWorld }, mobs, { createSky }, { characterColors }, { byId }, { isSnowMonth }, { raycast }] = await Promise.all([
    import('three'), import('../../world/voxHome.js'), import('../../three/voxel/engine.js'), import('../../three/voxel/mobs.js'),
    import('../../three/sky.js'), import('../../three/character.js'), import('../../data/locations/index.js'), import('../../world/genTerrain.js'),
    import('../../world/mesher.js')]);
  const location = byId[state.home.locationId];
  const view = h('div', { class: 'life-view life-view-blocks' });
  container.append(view);

  let vh = voxHome(state, { monthIndex: state.life.monthIndex });
  const world = await createVoxelWorld(view, {
    volume: vh.volume, far: { volume: { size: vh.far.size, data: vh.far.data }, scale: vh.far.scale, origin: vh.far.origin } });
  if (!world) { view.remove(); return null; }
  const volume = world.volume;

  // Light with the classic sky instead of the adapter's flat lights (same palettes, sun arc and moon as lifeView).
  world.scene.remove(world.lights.hemi, world.lights.sun);
  const sky = createSky({ biome: location.biome });
  world.scene.add(sky.group);
  world.scene.fog = new THREE.Fog(sky.fogColor.clone(), ...BLOCK_VIEW.fog);
  const mobsGroup = new THREE.Group();
  mobsGroup.name = 'mobs';
  world.scene.add(mobsGroup);

  // ── Framing (towers frame the student's floor, like lifeView) ──
  const hb = vh.info.homeBox;
  const box = new THREE.Box3(new THREE.Vector3(hb.x0, hb.y0, hb.z0), new THREE.Vector3(hb.x1 + 1, hb.y1 + 1, hb.z1 + 1));
  const building = vh.unit && (state.home.kind === 'apartment' || state.home.kind === 'condo');
  const tall = building && box.max.y - box.min.y > BLOCK_VIEW.tallBlocks;
  if (tall) {
    box.min.y = Math.max(hb.y0, vh.unit.y0 - BLOCK_VIEW.tallBand);
    box.max.y = vh.unit.y1 + 1 + BLOCK_VIEW.tallBand;
  }
  sky.fitShadow(box);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const low = size.y < Math.max(size.x, size.z) * 0.5;
  const pad = tall ? BLOCK_VIEW.towerPadding : building ? BLOCK_VIEW.buildingPadding : BLOCK_VIEW.padding;
  const radius = size.length() / 2;
  const dist = (radius / Math.sin(THREE.MathUtils.degToRad(world.camera.fov / 2))) * pad;
  world.controls.target.copy(center);
  // Neighbors (big-city towers, row houses) can stand between the camera and the home: tilt the view up until the
  // first block on the line of sight belongs to the home (or the camera clears everything).
  const near = { x0: hb.x0 - 2, x1: hb.x1 + 2, y0: hb.y0 - 1, y1: hb.y1 + 2, z0: hb.z0 - 2, z1: hb.z1 + 2 };
  const inHome = (c) => c.x >= near.x0 && c.x <= near.x1 && c.y >= near.y0 && c.y <= near.y1 && c.z >= near.z0 && c.z <= near.z1;
  let lift = low ? BLOCK_VIEW.lift : BLOCK_VIEW.lift * 0.7;
  const eye = new THREE.Vector3();
  for (let i = 0; i <= BLOCK_VIEW.liftSteps; i++, lift += BLOCK_VIEW.liftStep) {
    eye.copy(center).addScaledVector(new THREE.Vector3(BLOCK_VIEW.side, lift, 1).normalize(), dist);
    const dir = center.clone().sub(eye).normalize();
    const hit = raycast(volume, [eye.x, eye.y, eye.z], [dir.x, dir.y, dir.z], dist);
    if (!hit || inHome(hit)) break;
  }
  world.camera.position.copy(eye);
  Object.assign(world.controls, { minDistance: dist * 0.4, maxDistance: dist * 2.5 });
  world.controls.update();

  // ── Living things: the character at the door, animals at their spots, plants as blocks (dummies for animation) ──
  const cellCentre = (c) => new THREE.Vector3(c.x + 0.5, c.y, c.z + 0.5);
  let home = null, glassLit = false, season = null;

  function buildHome(s, v) {
    mobsGroup.clear();
    const character = mobs.createBlockCharacter(characterColors(seedFor(s.meta.seed, 'character')));
    character.object.position.copy(cellCentre(v.door));
    mobsGroup.add(character.object);
    const spots = v.animalSpots.length ? v.animalSpots : [v.door];
    const animals = (s.home.animals ?? []).map((a, i) => {
      const obj = mobs.createBlockAnimal(a.kind, a.color ? { color: a.color } : {});
      const at = spots[i % spots.length];
      obj.position.copy(cellCentre(at)).add(new THREE.Vector3(Math.floor(i / spots.length) * 0.9, 0, 0));
      obj.rotation.y = (i * 2.1) % (Math.PI * 2);
      obj.visible = a.present !== false;
      mobsGroup.add(obj);
      return { id: a.id, object: obj };
    });
    const plants = v.plants.map((p) => {
      const object = new THREE.Object3D(); // stands in for classic's plant prop (animation sways it; tests read userData)
      object.position.copy(cellCentre(p));
      object.userData = { healthy: true, cell: p, block: p.kind === 'garden-bed' ? ID('crops') : p.kind === 'potted' ? ID('potted-plant') : null };
      return { id: p.id, kind: p.kind, object };
    });
    const path = v.path.map(cellCentre);
    // Weekend time at home happens on the walk a few blocks out from the door, in view (the path is corners only, so a
    // plain waypoint would be the street gate).
    const yard = alongPath(path, BLOCK_VIEW.yardBlocks) ?? cellCentre(v.door);
    return {
      character, plants, animals, path, yard, door: cellCentre(v.door), exit: cellCentre(v.exit), windows: v.windows,
      /** Lit glass in the home's windows past BLOCK_VIEW.litAt night (13 §8); the glow pass carries lamps and streetlamps. */
      setNight(f) {
        world.setGlow(f);
        const lit = f >= BLOCK_VIEW.litAt;
        if (lit === glassLit) return;
        glassLit = lit;
        const from = lit ? ID('glass') : ID('lit-glass'), to = lit ? ID('lit-glass') : ID('glass');
        for (const i of v.windows) setIndex(i, from, to);
      },
      /** Wilted plants → wilted leaves; departed animals hide. */
      setLiving(h2) {
        for (const pl of plants) {
          const alive = (h2.plants ?? []).find((p) => p.id === pl.id)?.alive !== false;
          pl.object.userData.healthy = alive;
          const { cell, block } = pl.object.userData;
          if (block == null) continue;
          const cur = world.getBlock(cell.x, cell.y, cell.z);
          if (cur === 0 || cur === block || cur === ID('leaves-wilted')) world.setBlock(cell.x, cell.y, cell.z, alive ? block : ID('leaves-wilted'));
        }
        for (const an of animals) an.object.visible = (h2.animals ?? []).find((a) => a.id === an.id)?.present !== false;
        world.requestRender();
      },
    };
  }
  /** The point `d` blocks along a corner path (clamped to its end). */
  function alongPath(pts, d) {
    if (!pts.length) return null;
    for (let i = 1; i < pts.length; i++) {
      const len = pts[i].distanceTo(pts[i - 1]);
      if (d <= len) return pts[i - 1].clone().lerp(pts[i], len ? d / len : 1);
      d -= len;
    }
    return pts.at(-1).clone();
  }
  /** Swap one cell (volume index = x + X·(z + Z·y)) from → to. */
  function setIndex(i, from, to) {
    if (volume.data[i] !== from) return;
    const { x: X, z: Z } = volume.size;
    const x = i % X, z = Math.floor(i / X) % Z, y = Math.floor(i / (X * Z));
    world.setBlock(x, y, z, to);
  }
  /** Replace the near world with a fresh voxHome (season change or new plants); keeps lit windows in step. */
  function regenerate(s, mi) {
    vh = voxHome(s, { monthIndex: mi });
    volume.data.set(vh.volume.data);
    glassLit = false;
    world.invalidate();
    home = buildHome(s, vh);
  }
  home = buildHome(state, vh);
  home.setLiving(state.home);
  let shownIds = ids(state), stateRef = state;

  const sc = {
    scene: world.scene, camera: world.camera, renderer: world.renderer, controls: world.controls, sky, world,
    get info() { return world.info; },
    get nightFactor() { return sky.nightFactor; },
    get season() { return season; },
    /** Sky, sun, moon and fog for time t (0–1 of a day, 08 §3). */
    setTimeOfDay(t) { sky.setTimeOfDay(t); world.scene.fog.color.copy(sky.fogColor); world.requestRender(); return sc; },
    /** A new month: rebuild the near world only when snow comes or goes. */
    setSeason(mi) {
      const next = { month: mi, snow: isSnowMonth(location, mi) };
      if (season && snowKey(isSnowMonth, location, season.month) !== snowKey(isSnowMonth, location, mi)) {
        regenerate(stateRef, mi);
        home.setLiving(stateRef.home);
        home.setNight(sky.nightFactor);
      }
      season = next;
      return season;
    },
    requestRender: () => world.requestRender(),
    memory() { return { ...world.renderer.info.memory }; },
    get leftover() { return world.leftover; },
  };
  season = { month: state.life.monthIndex, snow: isSnowMonth(location, state.life.monthIndex) };
  sc.setTimeOfDay(LIFE3D.idleTimeOfDay);
  home.setNight(sky.nightFactor);

  return {
    scene: sc,
    get home() { return home; },
    get info() { return world.info; },
    /** The 13 §6 voxHome contract now shown (spawn, property, door …); Explore starts from it. */
    get contract() { return vh; },
    /** Voxel stats for tests and the dev panel. */
    get vox() { return vh.info; },
    /**
     * Care game anchor (13 §8): screen point (client px) of the home's plant/animal spot picked by `f` (0–1, careSpot's fx),
     * or null when nothing living is in view. Plants first, then present animals.
     */
    careAnchor(f) {
      const pts = [...home.plants.map((p) => p.object.position),
        ...home.animals.filter((a) => a.object.visible).map((a) => a.object.position)];
      if (!pts.length) return null;
      const p = pts[Math.min(pts.length - 1, Math.floor(f * pts.length))].clone().add(new THREE.Vector3(0, 0.5, 0)).project(world.camera);
      if (p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) return null;
      const r = world.renderer.domElement.getBoundingClientRect();
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    },
    /** Re-apply window glow after a time-of-day change. */
    refreshNight() { home.setNight(sky.nightFactor); world.requestRender(); },
    /** Show wilted plants / departed animals from a home record. */
    setLiving(h2) { home.setLiving(h2); },
    /** Match the block home to a state: setLiving, or regenerate when plants/animals were added (not mid-animation). */
    syncHome(s) {
      if (!s.home) return;
      stateRef = s;
      if (ids(s) !== shownIds) {
        regenerate(s, s.life.monthIndex);
        home.setNight(sky.nightFactor);
        shownIds = ids(s);
      }
      home.setLiving(s.home);
    },
    firstFrame: () => world.firstFrame(),
    dispose() {
      sky.group.traverse((o) => { o.material?.dispose?.(); });
      world.dispose();
      view.remove();
    },
  };
}
