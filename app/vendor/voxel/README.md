# Block engine (vendored)

- **Repo:** https://github.com/vyse12138/minecraft-threejs (Yulei Zhu, "Minecraft clone made with Three.js and TypeScript")
- **Commit:** `ead87efbd95eb2092a1b341b7c3cc6c78187904d` (2026-10-30), fetched 2026-11-02 by task homeblocks 02
- **License:** MIT, `LICENSE` in this folder (copied unchanged). `terrain/noise/ImprovedNoise.js` is from three.js r186 (MIT).
- **Why this one:** the spec's first choice, `dgreenheck/minecraft-threejs-clone` (HEAD `52aabd3`), has no LICENSE file
  and GitHub reports `license: null`, so it may not be copied (13 §2). See `docs/spec/DEVIATIONS.md`.

Upstream is TypeScript built with Vite. Each file was transpiled once with
`npx -y esbuild <file>.ts --format=esm --target=es2022 --tsconfig-raw='{"compilerOptions":{"useDefineForClassFields":true}}'`
(no bundling; `three` stays a bare import resolved by our import map). Every hand change is marked `// BLOCKS:`.
No npm dependencies besides three.

## Files

| File | Upstream | What it does |
|---|---|---|
| `terrain/index.js` | `src/terrain/index.ts` | `Terrain`: one `InstancedMesh` per block type, asks the worker to generate, places/removes custom blocks; `BlockType` enum |
| `terrain/worker/generate.js` | `src/terrain/worker/generate.ts` | module worker: heightmap surface (one block per column at y = 30 + noise·8), stone/coal/sand/grass, trees + leaves, then applies `customBlocks`; posts instance matrices |
| `terrain/mesh/block.js` | `src/terrain/mesh/block.ts` | `Block(x, y, z, type, placed)`: an edit record (placed or removed) |
| `terrain/mesh/materials.js` | `src/terrain/mesh/materials.ts` | `Materials.get(MaterialType)` → material or 6-face array. **Textures removed**, plain placeholder colors |
| `terrain/noise/index.js` | `src/terrain/noise/index.ts` | `Noise`: ImprovedNoise wrapper + seeds/gaps/amps/thresholds for terrain, stone, coal, trees, leaves |
| `terrain/noise/ImprovedNoise.js` | three r186 `examples/jsm/math/ImprovedNoise.js` | Perlin noise (local copy so the worker can load it) |
| `terrain/highlight/index.js` | `src/terrain/highlight/index.ts` | `BlockHighlight`: crosshair raycast against a 16 × 16 shadow mesh around the camera, draws the highlight cube |
| `control/index.js` | `src/control/index.ts` | `Control`: PointerLockControls, WASD/space/shift, gravity + raycast collisions, left click removes / right click places, wheel or 1–9 picks the block |
| `player/index.js` | `src/player/index.ts` | `Player`: mode (walking/sprinting/flying/sneaking), speeds, jump, body 1.8 × 0.5 |
| `utils/index.js` | `src/utils/index.ts` | `isMobile`, `htmlToDom` |

Left out: `src/core` (renderer + lights glued to `document.body`), `src/ui` (menus, bag, FPS, joystick), `src/audio`
(+ .ogg files), `src/static` (Minecraft-style textures: never copied), `src/control/worker/*` (marked legacy, unused),
`main.ts`, `style.css`, `index.html`.

## Hand changes (`// BLOCKS:`)
- All files: relative imports get `.js` paths (`'../terrain'` → `'../terrain/index.js'`).
- `terrain/index.js`: Vite's `import Generate from './worker/generate?worker'` → a `new Worker(new URL('./worker/generate.js',
  import.meta.url), {type: 'module'})` factory.
- `terrain/worker/generate.js`: `three` imported as `../../../three/three.module.min.js` (workers don't see the import map).
- `terrain/noise/index.js` → local `ImprovedNoise.js`, which imports `MathUtils` from `../../../three/three.module.min.js`.
  On the main thread that URL is the same module the import map's `three` points at, so there's one three instance.
- `terrain/mesh/materials.js`: texture imports and `TextureLoader` removed; `map: …` → `color: COLORS.…`; the leaf's green
  tint dropped.
- `control/index.js`: `three/examples/jsm/controls/PointerLockControls` → `three/addons/controls/PointerLockControls.js`
  (copied into `vendor/three/addons/controls/`); `this.audio.playSound(…)` → `this.audio?.playSound(…)` (no audio vendored).

## Public API (what our adapter calls)
- `new Terrain(scene, camera)` (default export of `terrain/index.js`; also `BlockType` enum: grass 0, sand 1, tree 2,
  leaf 3, dirt 4, stone 5, coal 6, wood 7, diamond 8, quartz 9, glass 10, bedrock 11). Adds a cloud mesh to the scene.
  - Fields: `distance` (3 chunks), `chunkSize` (24), `maxCount` (computed in the constructor; recompute after changing
    the two), `noise` (`Noise`), `materials`, `blocks[]` (InstancedMesh per type), `blocksCount[]`, `blocksFactor[]`,
    `customBlocks[]` (`Block` edits), `idMap` (`"x_y_z"` → instance index), `generateWorker`, `cloud`, `highlight`.
  - `initBlocks()` (create the meshes; call once before `generate`), `generate()` (posts to the worker; the meshes update
    on its reply), `buildBlock(Vector3, type)`, `generateAdjacentBlocks(Vector3)`, `update()` (regenerate on chunk change
    + highlight).
- `new Control(scene, camera, player, terrain, audio?)`: pointer lock on `document.body`; `update()` per frame;
  `holdingBlock`, `holdingBlocks[]`, `velocity`, `control` (PointerLockControls).
- `new Player()`, `player.setMode(Mode.x)`; `Mode`, `Speed` enums.
- `new Noise()`: `seed`, `stoneSeed`, `coalSeed`, `treeSeed`, `leafSeed` (all `Math.random()` by default), `get(x, y, z)`.

## Gotchas
- It is a **surface-only heightmap** engine: the worker draws one block per column (plus trees). Digging creates the
  blocks underneath on demand (`generateAdjacentBlocks`), and steep steps show gaps. It has no dense volume, no chunk
  meshing and no face culling: every block is an instance of a full cube.
- Seeds default to `Math.random()`; set all five on `terrain.noise` before `generate()`. The worker builds its own
  `Noise` and is never sent `leafSeed`, so leaf shapes are random per worker (fine for the gallery, not for saves).
- Each InstancedMesh is drawn with all `maxCount × factor` slots (empty ones are zero matrices), so renderer triangle
  counts are large and fractional.
- `Control` adds listeners on `document` and `document.body` and has no `dispose`.
