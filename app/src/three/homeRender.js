// The student's real home in 3D (08 §5, 09 §1, task 42). Browser only, import() lazily. `renderHome(state, opts)` turns
// `state.home` into the right generator call (buildingGen for apartments/condos, houseGen for houses and shared rooms,
// blueprintTo3d for builds), places plant and animal props at the contract's spots, adds the character at the door and
// returns the 08 §5 contract plus the props. Season and time of day come from the scene (`createScene({monthIndex,
// timeOfDay})` / `sc.setSeason` / `sc.setTimeOfDay`); call `setNight(sc.nightFactor)` after a time change.
import * as THREE from 'three';
import { generate as generateBuilding } from './buildingGen.js';
import { generate as generateHouse } from './houseGen.js';
import { build as buildBlueprint } from './blueprintTo3d.js';
import { createPlant, setPlantHealth, createAnimal } from './props.js';
import { createCharacter, characterColors } from './character.js';
import { byId } from '../data/locations/index.js';
import { listings } from '../phases/design/houseModel.js';
import { SHARED_BEDROOMS } from '../phases/design/sharedModel.js';
import { seedFor } from '../util/rng.js';
import { LIFE3D } from '../config.js';

/** Build the generator output for `state.home` (no props). */
function generatorFor(state, season) {
  const home = state.home;
  const loc = byId[home.locationId];
  const snow = !!season?.snow;
  const common = { style: loc.styleFamily, styleVariant: loc.styleVariant, biome: loc.biome, season, snow };
  if (home.kind === 'apartment' || home.kind === 'condo') {
    const b = home.building;
    const g = generateBuilding({ style: loc.styleFamily, variant: loc.styleVariant, settlement: loc.settlement, kind: home.kind,
      seed: b.seed, season: season ?? 'summer' });
    g.setUnit(b.floor, b.unit);
    g.highlight(b.floor, b.unit);
    return g;
  }
  if (home.kind === 'house') {
    const l = listings(state)[home.house.listingIndex];
    return generateHouse({ ...common, variant: 'house', seed: home.house.seed, palette: home.house.palette,
      sqft: l.sqftTarget, bedrooms: l.bedrooms,
      extras: { gardenBeds: home.house.gardenBeds ?? 0, fruitTrees: home.house.fruitTrees ?? 0, coop: !!home.house.coop } });
  }
  if (home.kind === 'shared') {
    return generateHouse({ ...common, variant: 'shared', seed: home.shared.seed, bedrooms: SHARED_BEDROOMS });
  }
  return buildBlueprint(home.blueprint, { ...common, seed: seedFor(state.meta.seed, 'build') });
}

/** Where plant `p` (index i) stands: bed spots by bed index or yard-item order, pots fanned out around a spot. */
function plantSpot(g, home, p, i) {
  const spots = g.plantSpots;
  if (!spots.length) return null;
  if (p.kind === 'garden-bed') {
    const beds = home.plants.filter((x) => x.kind === 'garden-bed');
    return spots[beds.indexOf(p) % spots.length].clone();
  }
  const s = spots[i % spots.length].clone();
  const round = Math.floor(i / spots.length);
  s.x += round * LIFE3D.potSpacing;
  return s;
}

/** Where animal `a` stands: pets in the yard (or balcony), chickens around the coop. */
function animalSpot(g, home, a, i) {
  const spots = g.animalSpots;
  if (!spots.length) return null;
  const isBuild = home.kind === 'build';
  if (a.kind === 'chicken') {
    const coops = isBuild ? [...new Set(home.animals.filter((x) => x.kind === 'chicken').map((x) => x.spot))] : [];
    const base = isBuild ? spots[Math.max(0, coops.indexOf(a.spot))] : spots[Math.min(2, spots.length - 1)];
    const hens = home.animals.filter((x) => x.kind === 'chicken' && x.spot === a.spot);
    const k = hens.indexOf(a);
    return base.clone().add(new THREE.Vector3((k - 1) * 2.2, 0, 1.5 + (k % 2) * 1.4));
  }
  if (isBuild) {
    const coopCount = new Set(home.animals.filter((x) => x.kind === 'chicken').map((x) => x.spot)).size;
    return spots[Math.min(coopCount + (i % 2), spots.length - 1)].clone();
  }
  return spots[0].clone().add(new THREE.Vector3(i * 1.5, 0, 0));
}

/**
 * renderHome(state, {season, nightFactor}) → the 08 §5 contract `{object, bounds, door, exit, path, plantSpots,
 * animalSpots, highlight, pick, setNight, dispose}` plus `{generator, plants [{id, object}], animals [{id, object}],
 * character, setLiving(home), info}`. `object` holds the home, the props and the character.
 */
export function renderHome(state, { season = 'summer', nightFactor = 0 } = {}) {
  const home = state.home;
  const g = generatorFor(state, season);
  const root = new THREE.Group();
  root.name = `home:${home.kind}`;
  root.add(g.object);
  const props = new THREE.Group();
  props.name = 'home-props';
  root.add(props);

  const plants = [];
  (home.plants ?? []).forEach((p, i) => {
    if (p.kind !== 'potted' && p.kind !== 'garden-bed') return; // fruit trees are part of the generator's yard
    const at = plantSpot(g, home, p, i);
    if (!at) return;
    const obj = createPlant(p.kind === 'potted' ? 'potted' : 'vegetable', { healthy: p.alive !== false });
    obj.position.copy(at);
    obj.scale.setScalar(p.kind === 'potted' ? LIFE3D.potScale : LIFE3D.bedPlantScale);
    obj.rotation.y = i * 1.3;
    props.add(obj);
    plants.push({ id: p.id, object: obj });
  });
  const animals = [];
  (home.animals ?? []).forEach((a, i) => {
    const at = animalSpot(g, home, a, i);
    if (!at) return;
    const obj = createAnimal(a.kind, a.color ? { color: a.color } : {});
    obj.position.copy(at);
    obj.rotation.y = (i * 2.1) % (Math.PI * 2);
    obj.visible = a.present !== false;
    props.add(obj);
    animals.push({ id: a.id, object: obj });
  });

  // Small props skip the shadow pass: each mesh would cost a second draw call (a house + coop + pets passed 150).
  props.traverse((o) => { if (o.isMesh) o.castShadow = false; });

  const character = createCharacter(characterColors(seedFor(state.meta.seed, 'character')));
  character.object.position.copy(g.door).setY(Math.max(0, g.door.y));
  character.object.position.z += LIFE3D.characterDoorOffset;
  root.add(character.object);

  g.setNight(nightFactor);
  root.updateMatrixWorld(true);
  const bounds = (g.bounds ?? new THREE.Box3().setFromObject(g.object)).clone(); // the generator's framing box

  return {
    object: root, bounds, door: g.door, exit: g.exit, path: g.path, plantSpots: g.plantSpots, animalSpots: g.animalSpots,
    highlight: g.highlight, pick: g.pick, setNight: (f) => g.setNight(f),
    generator: g, plants, animals, character, info: g.info ?? null,
    /** Re-apply alive/present from a home (wilted plants turn brown, departed animals disappear). */
    setLiving(h) {
      for (const pl of plants) setPlantHealth(pl.object, (h.plants ?? []).find((p) => p.id === pl.id)?.alive !== false);
      for (const an of animals) an.object.visible = (h.animals ?? []).find((a) => a.id === an.id)?.present !== false;
    },
    dispose() {
      g.dispose();
      props.traverse((o) => { if (o.isMesh || o.isInstancedMesh) o.geometry?.dispose(); });
      character.object.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); });
      root.removeFromParent();
    },
  };
}
