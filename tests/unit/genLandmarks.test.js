import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genFar, LANDMARK_SHAPES, farOrigin } from '../../app/src/world/genLandmarks.js';
import { LANDMARKS } from '../../app/src/data/enums.js';
import { LOCATIONS } from '../../app/src/data/locations/index.js';
import { WORLD, FAR } from '../../app/src/config.js';
import { BLOCK } from '../../app/src/world/blocks.js';

const filled = (f) => f.data.reduce((n, c) => n + (c ? 1 : 0), 0);
const plateCells = FAR.size.x * FAR.size.z;

test('every landmark key has a shape and a non-empty far volume', () => {
  assert.deepEqual(Object.keys(LANDMARK_SHAPES).sort(), [...LANDMARKS].sort());
  for (const key of LANDMARKS) {
    const f = genFar({ location: { landmark: key }, seed: 1 });
    assert.equal(f.data.length, f.size.x * f.size.y * f.size.z, key);
    assert.ok(filled(f) > plateCells + 500, `${key} has more than its ground plate`);
    assert.equal(f.scale, WORLD.farScale);
  }
});

test('genFar is deterministic and seeded', () => {
  for (const key of LANDMARKS) {
    const a = genFar({ location: { landmark: key }, seed: 7 }), b = genFar({ location: { landmark: key }, seed: 7 });
    assert.deepEqual(a.data, b.data, key);
  }
  const a = genFar({ location: { landmark: 'pine-ridges' }, seed: 1 }), b = genFar({ location: { landmark: 'pine-ridges' }, seed: 2 });
  assert.notDeepEqual(a.data, b.data);
});

test('far volume sits past the −z edge, centered in x, ground plate at groundY', () => {
  const o = farOrigin();
  const s = WORLD.farScale;
  assert.equal(o.z + FAR.size.z * s + FAR.gap * s, 0);
  assert.equal(o.x + (FAR.size.x * s) / 2, WORLD.size.x / 2);
  assert.equal(o.y + s, WORLD.groundY);
});

test('every place gets its landmark; Kīlauea has a plume, Maunakea snow, unknown keys only the plate', () => {
  for (const loc of LOCATIONS) assert.ok(filled(genFar({ location: loc, seed: 3 })) > plateCells, loc.id);
  const k = genFar({ location: { landmark: 'kilauea-plume' }, seed: 1 });
  assert.ok(k.data.includes(BLOCK.plume.id));
  const summer = genFar({ location: { landmark: 'maunakea' }, seed: 1, monthIndex: 6 });
  const winter = genFar({ location: { landmark: 'maunakea' }, seed: 1, monthIndex: 0 });
  const white = (f) => f.data.filter((c) => c === BLOCK.plaster.id).length;
  assert.ok(white(winter) > white(summer) && white(summer) > 0);
  assert.equal(filled(genFar({ location: { landmark: 'nowhere' }, seed: 1 })), plateCells);
});
