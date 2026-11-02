// Blocky character and animals for the block world (13 §8, blocks task 13). 1 unit = 1 block = 1 m, feet on y = 0,
// facing +z. Our own boxy look and colors (characterColors), never a Minecraft skin. Browser only, load with import().
// createBlockCharacter(colors) has exactly createCharacter's API (three/character.js), so animation.js drives either.
// createBlockAnimal(kind, {color}) → Group with userData.idle(t) (t = total seconds) and userData.wander(box | null).
import * as THREE from 'three';
import { m, merged, pivot } from '../propKit.js';
import { characterColors } from '../character.js';
import { ANIMAL_KINDS } from '../animals.js';
import { wanderAt } from '../../world/wander.js';
import { VOX_MOBS } from '../../config.js';

export { ANIMAL_KINDS };

const toVec = (p) => new THREE.Vector3(p.x, p.y ?? 0, p.z);

/** Smallest signed angle from a to b. */
function angleTo(a, b) {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Relative luminance 0..1 of a #rrggbb color (dark coats get light eyes so the face still reads). */
function luma(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (!Number.isFinite(n)) return 0.5;
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/** Build the blocky character (~1.8 blocks tall). Missing colors come from characterColors(0). */
export function createBlockCharacter(colors = {}) {
  const c = { ...characterColors(0), ...colors };
  const shirt = m(c.shirt), pants = m(c.pants), skin = m(c.skin), hair = m(c.hair), shoe = m('dark');

  const torso = merged((add) => {
    add('box', pants, { y: 0.66, sx: 0.48, sz: 0.27, sy: 0.16 }); // hips
    add('box', shirt, { y: 0.8, sx: 0.5, sz: 0.28, sy: 0.6 }); // chest
  }, { name: 'torso' });
  const head = merged((add) => {
    add('box', skin, { y: 1.4, s: 0.4 });
    add('box', hair, { y: 1.7, sx: 0.43, sz: 0.43, sy: 0.13 }); // crown
    add('box', hair, { y: 1.42, z: -0.12, sx: 0.43, sz: 0.2, sy: 0.3 }); // back of the head
    for (const sx of [-1, 1]) add('cbox', m('black'), { x: sx * 0.09, y: 1.6, z: 0.2, sx: 0.07, sy: 0.08, sz: 0.02 });
  }, { name: 'head' });

  const limb = (name, at, build) => pivot(name, at, merged(build, { name: `${name}-mesh` }));
  const arm = (sx) => limb(sx < 0 ? 'arm-l' : 'arm-r', [sx * 0.34, 1.38, 0], (add) => {
    add('box', shirt, { y: -0.3, sx: 0.18, sz: 0.2, sy: 0.3 }); // sleeve
    add('box', skin, { y: -0.64, sx: 0.15, sz: 0.17, sy: 0.35 }); // forearm + hand
  });
  const leg = (sx) => limb(sx < 0 ? 'leg-l' : 'leg-r', [sx * 0.12, 0.72, 0], (add) => {
    add('box', pants, { y: -0.62, sx: 0.23, sz: 0.25, sy: 0.62 });
    add('box', shoe, { y: -0.72, z: 0.03, sx: 0.24, sz: 0.3, sy: 0.1 });
  });
  const limbs = { armL: arm(-1), armR: arm(1), legL: leg(-1), legR: leg(1) };
  const body = new THREE.Group();
  body.name = 'body';
  body.add(torso, head, ...Object.values(limbs));
  const object = new THREE.Group();
  object.name = 'block-character';
  object.add(body);

  const { walkSpeed, stride, swing } = VOX_MOBS;
  let phase = 0, amp = 0, route = null; // route = {pts, lens, total, speed, done, resolve}

  function pose() {
    const s = Math.sin(phase) * swing * amp;
    limbs.legL.rotation.x = s;
    limbs.legR.rotation.x = -s;
    limbs.armL.rotation.x = -s * 0.8;
    limbs.armR.rotation.x = s * 0.8;
    body.position.y = Math.abs(Math.cos(phase)) * 0.03 * amp;
  }
  function finish(arrived) {
    if (!route) return;
    const { resolve } = route;
    route = null;
    resolve(arrived);
  }

  return {
    object,
    colors: c,
    get walking() { return !!route; },
    /** Walk through points ({x, y?, z} or Vector3) in ms (default: walking pace). Resolves true on arrival, false if interrupted. */
    walkTo(points, ms) {
      finish(false);
      const pts = [object.position.clone(), ...points.map(toVec)];
      const lens = [];
      let total = 0;
      for (let i = 1; i < pts.length; i++) { lens.push(pts[i].distanceTo(pts[i - 1])); total += lens[i - 1]; }
      if (total < 1e-6) { if (pts.length > 1) object.position.copy(pts.at(-1)); return Promise.resolve(true); }
      const speed = ms > 0 ? total / (ms / 1000) : walkSpeed;
      return new Promise((resolve) => { route = { pts, lens, total, speed, done: 0, resolve }; });
    },
    setVisible(v) {
      object.visible = !!v;
      if (!v) finish(false);
    },
    /** Advance the walk by dt seconds (call every frame). */
    update(dt) {
      if (route) {
        route.done = Math.min(route.total, route.done + route.speed * dt);
        let d = route.done, i = 0;
        while (i < route.lens.length - 1 && d > route.lens[i]) { d -= route.lens[i]; i++; }
        const a = route.pts[i], b = route.pts[i + 1];
        object.position.lerpVectors(a, b, route.lens[i] ? Math.min(1, d / route.lens[i]) : 1);
        if (route.lens[i] > 1e-6) {
          const heading = Math.atan2(b.x - a.x, b.z - a.z);
          object.rotation.y += angleTo(object.rotation.y, heading) * Math.min(1, dt * 10);
        }
        phase += ((route.speed * dt) / stride) * Math.PI;
        amp = Math.min(1, amp + dt * 4);
        if (route.done >= route.total) finish(true);
      } else if (amp > 0) {
        amp = Math.max(0, amp - dt * 4);
        if (!amp) phase = 0;
      }
      pose();
    },
  };
}

/** Four legs as one merged part: boxes at (±x, ±z) from y = 0 to h, r thick. */
function legs(add, material, x, z, h, r) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('box', material, { x: sx * x, z: sz * z, sx: r, sz: r, sy: h });
}
/** Two eyes on the +z face of a head (positions relative to the head pivot). */
function eyes(add, coat, x, y, z, s = 0.04) {
  const eye = m(luma(coat) < 0.25 ? '#d8e05a' : 'black');
  for (const sx of [-1, 1]) add('cbox', eye, { x: sx * x, y, z, sx: s, sy: s, sz: 0.02 });
}
const hopAt = (t, every, offset = 0) => {
  const p = ((t + offset) % every) / every; // a short hop in the first 8% of each cycle
  return p < 0.08 ? Math.sin((p / 0.08) * Math.PI) : 0;
};

// Each builder → {body (Group that hops), head pivot, tail pivot?, idle(t, walking)}; built facing +z, feet on y = 0.
const BUILD = {
  chicken(color = '#f4f1ea') {
    const feather = m(color), beak = m('orange'), red = m('red');
    const body = merged((add) => {
      for (const sx of [-1, 1]) add('box', beak, { x: sx * 0.07, sx: 0.04, sz: 0.04, sy: 0.14 });
      add('box', feather, { y: 0.14, sx: 0.28, sy: 0.24, sz: 0.36 });
      add('box', feather, { y: 0.26, z: -0.2, sx: 0.2, sy: 0.18, sz: 0.08 }); // tail
    }, { name: 'body-mesh' });
    const head = pivot('head', [0, 0.32, 0.13], merged((add) => {
      add('box', feather, { y: 0, z: 0.04, sx: 0.16, sy: 0.18, sz: 0.16 });
      add('cbox', beak, { y: 0.1, z: 0.15, sx: 0.06, sy: 0.04, sz: 0.06 });
      add('box', red, { y: 0.18, z: 0.05, sx: 0.04, sy: 0.05, sz: 0.1 }); // comb
      add('cbox', red, { y: 0.05, z: 0.13, sx: 0.04, sy: 0.05, sz: 0.02 }); // wattle
      eyes(add, color, 0.081, 0.12, 0.07, 0.03);
    }, { name: 'head-mesh' }));
    // Peck: the head dips to the ground twice every few seconds; a little hop now and then.
    const idle = (t) => {
      const p = (t % 3) / 3;
      head.rotation.x = p < 0.3 ? 1.1 * Math.abs(Math.sin((p / 0.3) * 2 * Math.PI)) : 0.05 * Math.sin(t * 3);
      return hopAt(t, 7, 3) * 0.12;
    };
    return { parts: [body, head], idle };
  },
  cat(color = '#d98a3a') {
    const fur = m(color), pink = m('pink');
    const body = merged((add) => {
      legs(add, fur, 0.07, 0.17, 0.16, 0.07);
      add('box', fur, { y: 0.15, sx: 0.22, sy: 0.18, sz: 0.48 });
    }, { name: 'body-mesh' });
    const head = pivot('head', [0, 0.3, 0.26], merged((add) => {
      add('cbox', fur, { sx: 0.22, sy: 0.19, sz: 0.18 });
      for (const sx of [-1, 1]) add('box', fur, { x: sx * 0.07, y: 0.09, sx: 0.06, sy: 0.07, sz: 0.04 }); // ears
      add('cbox', pink, { y: -0.03, z: 0.095, sx: 0.04, sy: 0.03, sz: 0.01 }); // nose
      eyes(add, color, 0.05, 0.02, 0.095, 0.04);
    }, { name: 'head-mesh' }));
    const tail = pivot('tail', [0, 0.28, -0.23], merged((add) => {
      add('box', fur, { sx: 0.05, sz: 0.05, sy: 0.3, pitch: 0 });
    }, { name: 'tail-mesh' }));
    tail.rotation.x = -0.5;
    // Tail swish, an occasional look around, and a pounce-hop every so often.
    const idle = (t) => {
      tail.rotation.z = 0.45 * Math.sin(t * 2.2);
      head.rotation.y = 0.5 * Math.sin(t * 0.45) * (Math.sin(t * 0.21) > 0 ? 1 : 0.2);
      return hopAt(t, 6, 1.5) * 0.15;
    };
    return { parts: [body, head, tail], idle };
  },
  dog(color = '#8a5a32') {
    const fur = m(color), dark = m('woodDark');
    const body = merged((add) => {
      legs(add, fur, 0.09, 0.21, 0.26, 0.09);
      add('box', fur, { y: 0.24, sx: 0.28, sy: 0.24, sz: 0.6 });
    }, { name: 'body-mesh' });
    const head = pivot('head', [0, 0.46, 0.3], merged((add) => {
      add('cbox', fur, { z: 0.04, sx: 0.26, sy: 0.24, sz: 0.24 });
      add('cbox', fur, { y: -0.05, z: 0.2, sx: 0.14, sy: 0.12, sz: 0.12 }); // snout
      add('cbox', m('black'), { y: -0.01, z: 0.265, sx: 0.06, sy: 0.04, sz: 0.02 }); // nose
      for (const sx of [-1, 1]) add('cbox', dark, { x: sx * 0.15, y: 0.02, z: 0.02, sx: 0.04, sy: 0.18, sz: 0.1 }); // ears
      eyes(add, color, 0.07, 0.05, 0.161, 0.045);
    }, { name: 'head-mesh' }));
    const tail = pivot('tail', [0, 0.44, -0.29], merged((add) => {
      add('box', fur, { sx: 0.06, sz: 0.06, sy: 0.24 });
    }, { name: 'tail-mesh' }));
    tail.rotation.x = -0.7;
    // Wag, pant, and an excited hop.
    const idle = (t) => {
      tail.rotation.z = 0.6 * Math.sin(t * 9);
      head.rotation.x = 0.06 * Math.sin(t * 5);
      return hopAt(t, 5, 0.5) * 0.18;
    };
    return { parts: [body, head, tail], idle };
  },
  goat(color = '#e8e2d4') {
    const fur = m(color), horn = m('#6b6258'), hoof = m('dark');
    const body = merged((add) => {
      legs(add, hoof, 0.11, 0.26, 0.1, 0.09);
      legs(add, fur, 0.11, 0.26, 0.4, 0.085);
      add('box', fur, { y: 0.38, sx: 0.34, sy: 0.34, sz: 0.74 });
      add('box', fur, { y: 0.62, z: -0.38, sx: 0.08, sy: 0.08, sz: 0.06 }); // tail
    }, { name: 'body-mesh' });
    const head = pivot('head', [0, 0.66, 0.36], merged((add) => {
      add('box', fur, { z: 0.08, sx: 0.12, sy: 0.18, sz: 0.14 }); // neck
      add('cbox', fur, { y: 0.24, z: 0.16, sx: 0.2, sy: 0.2, sz: 0.3 });
      add('cbox', fur, { y: 0.06, z: 0.28, sx: 0.05, sy: 0.12, sz: 0.04 }); // beard
      for (const sx of [-1, 1]) add('cbox', horn, { x: sx * 0.06, y: 0.38, z: 0.06, sx: 0.04, sy: 0.16, sz: 0.04, pitch: -0.5 });
      eyes(add, color, 0.07, 0.28, 0.315, 0.04);
    }, { name: 'head-mesh' }));
    // Graze: head dips to the ground, chews, comes back up.
    const idle = (t) => {
      const p = (t % 6) / 6;
      head.rotation.x = 1.0 * Math.max(0, p < 0.5 ? Math.sin(p * 2 * Math.PI) : 0) + 0.04 * Math.sin(t * 7);
      return 0;
    };
    return { parts: [body, head], idle };
  },
};

/**
 * A blocky animal: one of ANIMAL_KINDS (chicken cat dog goat; the black stray is a cat with a dark color, which gets
 * light eyes). userData.idle(t) animates it (t = total seconds); userData.wander(box, {seed}) makes idle also walk it
 * around a box of air cells {x0,y0,z0,x1,y1,z1} (world/wander.js), wander(null) stops and leaves it where it is.
 */
export function createBlockAnimal(kind = 'chicken', { color } = {}) {
  if (!BUILD[kind]) throw new Error(`unknown animal ${kind}`);
  const built = BUILD[kind](color);
  const hop = new THREE.Group();
  hop.name = 'hop';
  hop.add(...built.parts);
  const g = new THREE.Group();
  g.name = `block-animal:${kind}`;
  g.add(hop);
  g.userData.kind = kind;
  let roam = null;
  g.userData.wander = (box, { seed = 0 } = {}) => { roam = box ? { box, seed } : null; };
  g.userData.idle = (t) => {
    let lift = built.idle(t);
    if (roam) {
      const p = wanderAt(roam.box, t, { seed: roam.seed });
      g.position.set(p.x, p.y, p.z);
      g.rotation.y = p.yaw;
      if (p.walking) lift = Math.abs(Math.sin(t * 10)) * 0.04;
    }
    hop.position.y = lift;
  };
  g.userData.idle(0);
  return g;
}
