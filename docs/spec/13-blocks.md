# 13 · Block Edition

This fork of Home & Life Sim (`interfaces/home-sim`, "HS classic") replaces the Phase 4 procedural 3D home and its
scripted character with a **block (voxel) world**: the student's home built from blocks, surrounded by what that place
plausibly has, that the student can walk around and build in. Everything before Phase 4 (login, intake, plan table,
paperwork, design) and every rule of the month loop (09) stays as it is. This file is the spec for the
`homeblocks_NN` tasks; where it is silent, 00–12 still apply.

Teacher's request (2026-11-01, verbatim): "Fork the life-sim game: in the new edition, make the life sim a minecraft
rendition of a house instead of a procedural animation. Build house/apt/condo, surround with likely surroundings as the
player selected from their lifestyle setup. Borrow from open source minecraft versions rather than generating code for
the entire game. Allow saves in a sensible way that still allows the user to traverse back to the lifestyle menu for
updates / upgrades to their living situation."

## 1. Identity

| | Classic | Block Edition |
|---|---|---|
| Folder | `interfaces/home-sim` | `interfaces/home-sim-blocks` |
| `GAME_TITLE` | Home & Life Sim | Home & Life Sim: Block Edition |
| Port (`tools/serve.py`) | 1270 | **1271** |
| `STORAGE_PREFIX` | `homesim:v1:` | **`homeblocks:v1:`** |
| Task files | `homesim_NN_*` | `homeblocks_NN_*` |
| Firebase | its own project | **a separate project** (never share a Firestore with classic: saves are schema v3) |

Never call the game or any UI "Minecraft". Say "block world", "blocks", "Explore & build".

## 2. Borrowed code and art (the licensing rule)

- **Engine:** `dgreenheck/minecraft-threejs-clone` on GitHub, pinned to one commit SHA, vendored into
  `app/vendor/voxel/` with its LICENSE. It is three.js based, so it shares the vendored three r186 through the import map
  (`three`, `three/addons/…`). Task 02 must **read its LICENSE file**: MIT, BSD, ISC, Apache-2.0, zlib or CC0 are fine.
  If it is anything else or missing, use the first acceptable fallback, in order: `vyse12138/minecraft-threejs` (MIT),
  then the three.js example `webgl_geometry_minecraft` (+ `ImprovedNoise`, MIT, from the three package).
- Keep borrowed files as close to upstream as possible. Our changes go in a thin adapter (`app/src/three/voxel/`);
  if an upstream file must change, mark each change with `// BLOCKS:` and list it in `app/vendor/VERSIONS.md`.
- Bundling: like nspell, any npm dependency of the engine (e.g. `simplex-noise`) is esbuilt to one ESM file in
  `app/vendor/`. No build step for the app itself, no CDN at runtime.
- **Textures:** Kenney "Voxel Pack" (kenney.nl, **CC0**), the needed subset copied to `app/vendor/kenney-voxel/` with
  its license file. **Never** use Minecraft/Mojang textures, sounds, skins or names, and never a texture pack whose
  license isn't CC0/CC-BY. Extra colors come from tinting neutral textures (§4), not from new art.
- In-game credits (task 24): engine name + author + license, "Textures: Kenney (CC0)".
- The engine, its textures and the voxel modules load **lazily** with `import()` from Phase 4 only. Login, intake and
  the plan table never pull them in (the lazy-plan check in `check.sh` stays green).

## 3. World, units and coordinates

- **1 block = 1 meter (3.28 ft).** Plan feet convert with `ftToBlocks(ft) = Math.max(1, Math.round(ft / 3.28))`
  (in `world/volume.js`). Room interiors are at least 3 × 3; ceilings are 3 blocks (floor-to-floor 4 with the slab).
- Axes: **x** east (right), **y** up, **z** toward the street (matches `housePlan.js`: street along +Z).
- The world is one dense volume `WORLD.size = {x: 128, y: 96, z: 128}` (`config.js` `WORLD`; big-city towers use
  `WORLD.tallY = 160`). Index = `x + X * (z + Z * y)`. Values are `Uint8` block ids, 0 = air.
- `WORLD.groundY = 24` is the top of the ground at the lot. The lot is centered at `(X/2, groundY, Z/2)`; the street
  runs along the +z side of the lot. y = 0 is unbreakable bedrock.
- Far scenery (landmarks, distant skyline, mountains) sits **outside** the dense volume as a separate low-res volume
  rendered at `WORLD.farScale = 4` (one far block = 4 m), placed past the world edge in the landmark's direction.
- **All generation is pure and seeded**: `seedFor(state.meta.seed, 'world', homeKey)` (§7), so the same save always
  rebuilds the same world in Node and the browser. No `Math.random()`.

## 4. Blocks (`world/blocks.js`, pure)

A registry, one entry per id (stable forever once shipped; append only):
`{ id, key, label, faces: {top, side, bottom} (texture file names), tint: '#rrggbb' | null, solid, transparent,
emissive (0..1, for lit windows and lamps), placeable (in the hotbar), group: 'ground'|'structure'|'nature'|'decor' }`.

- Ground: grass, dirt, sand, red sand, snow, stone, gravel, **lava rock** (dark tinted stone, Pāhoa), water, ice, bedrock.
- Structure: planks (light/dark), plaster (tinted per style family), brick, stone brick, roof (tinted per style family),
  glass, **lit glass** (emissive, night windows), door (lower/upper), slab/floor, concrete, metal (towers).
- Nature: trunk, leaves (green / **wilted brown**), palm trunk + palm leaves, pine leaves, cactus, flowers, crops.
- Decor (furniture is blocks, not models): bed, table, chair, counter, shelf, lamp (emissive), rug colors, catchment
  tank, solar panel, fence, coop.
- Style tints: each of the 16 `STYLE_FAMILIES` maps to `{plaster, roof, trim}` hex values taken from
  `data/styleFamilies.js` palettes, so a Miami Deco home is pastel and a Hawaiʻi plantation home has its green roof.
  Tinted variants are separate ids generated from that table (deterministic id order).

## 5. Generators (pure, `app/src/world/`, Node-testable)

Each returns writes into a volume; none touch three or the DOM.

| Module | Input | Puts in the world |
|---|---|---|
| `genTerrain.js` | location (biome, hazards), season | ground layers by biome, gentle seeded height (flat on the lot ± 0, rising away from it), coast water for coastal biomes, biome trees, snow cover in snowy months |
| `genNeighborhood.js` | settlement, style family, seed | street + sidewalk along +z, neighbor lots: rural = fields + 1–2 far houses; small-town/suburb = neighbor houses in the style; small/mid-city = row houses + 3–6 floor blocks; big-city = towers |
| `genLandmarks.js` | `location.landmark` | the far-scene sketch for each of the 20 `LANDMARKS` (§3 far volume) |
| `voxHouse.js` | `planHouse(...)`, `home.house` extras | house or shared house: walls, windows, door, style roof, garage, fence, garden beds, fruit trees, coop |
| `voxBuilding.js` | `planBuilding(...)`, `home.building` | apartment/condo tower; the student's unit is hollow and furnished, other units are closed shells with glass |
| `voxBlueprint.js` | `home.blueprint` | a build: rooms, doors/windows from openings, yard items, catchment, solar |
| `voxInteriors.js` | room list with types | furniture blocks per room type |
| `voxHome.js` | state | calls the right generators and returns the **voxel home contract** (§6) |

Biome → look (genTerrain): tropical-* = grass + palm/ʻōhiʻa (red-flower leaves), Pāhoa adds lava rock patches;
desert/desert-mountain = red sand + cactus + stone outcrops; humid-forest/continental-forest/appalachian look = oak
and pine; alpine/subarctic-coastal = pine, stone, snow most months; plains = grass + crops; maritime/temperate-rain =
dark grass, pine, gravel shore; continental-lake = grass + lake water on one side; urban biomes = less green, more
concrete. Use the location's real season rule (08 §3) for snow.

## 6. The voxel home contract (`world/voxHome.js`)

```js
voxHome(state, { season }) → {
  volume,          // { size:{x,y,z}, data: Uint8Array } the full near world (terrain + neighborhood + home)
  far,             // { size, data, origin:{x,y,z}, scale } the far scenery volume
  homeKey,         // §7
  door, exit,      // {x,y,z} block coords: outside the front door; where the character goes each day
  path,            // [{x,y,z}] walkable waypoints door → exit (the life animation walks these)
  spawn,           // {x,y,z,yaw} where Explore mode starts (inside, by the door)
  plantSpots, animalSpots,      // [{x,y,z}] same meaning as 08 §5
  windows,         // [index] block indices of the home's glass (lit at night)
  property,        // [{x0,y0,z0,x1,y1,z1}] boxes the student may build in (§9)
  unit,            // apartments/condos/shared: the student's own box; null for houses/builds
  info,            // { blocks, homeBlocks, kind } for tests and the dev panel
}
```

The life view (task 14) only uses this contract, never the generators directly.

## 7. Saves (`state.world`, `state.upgrade`, schema v3)

`STATE_VERSION` becomes **3**; `migrate.js` adds `world: null, upgrade: null` to v2 saves.

```js
world: {
  homeKey,       // `${home.kind}:${hash of the generator inputs}`; changes when the home changes (move or upgrade)
  edits,         // packed string: the student's changes vs the generated base (below)
  editCount,     // number of changed blocks
  pose,          // {x,y,z,yaw,pitch} last Explore position, or null
  hotbar,        // [blockId × 9]
  cleared,       // blocks dropped by the last upgrade (shown once, then 0)
} | null
upgrade: { startedMonth, stage: 'design', homeBefore, worldBefore } | null   // task 20/21
```

- **Edits are a diff, never the whole world.** `edits` = base64 of: varint delta-coded sorted block indices, then one
  byte per block id. Pure helpers in `world/edits.js`: `diff(base, current)`, `apply(base, edits)`, `pack`, `unpack`,
  `rebase(oldBase, newBase, edits) → {edits, dropped}` (an edit is dropped when the renovation changed that cell, i.e.
  `oldBase[i] !== newBase[i]`).
- **Cap:** `WORLD.maxEdits = 20000` (≈ 130 KB packed, far under Firestore's 1 MiB document). At 90 % the hotbar shows
  "Your world is almost full"; at the cap, placing is refused with "Your world is full. Break something first."
- **When it saves:** block edits update the store **without** a checkpoint (the draft timer batches them, 02 §4).
  Leaving Explore mode, the Save button and every stage change are checkpoints (`'world'`).
- **Through the lifestyle menus:** going to Plan (moving) or Design (upgrading) keeps `state.world` untouched.
  - Cancelled move or upgrade: nothing changes; the world comes back exactly.
  - Upgrade committed: regenerate the base with the new home, `rebase` the edits, set `cleared` to the dropped count;
    the welcome panel says "Your renovation cleared N of your blocks." once.
  - Move committed (new home approved and moved in): `state.world` resets to null for the new home. The move confirm
    (task 19) says up front: "Your builds stay with this home when you move."
- Reload anywhere restores the same blocks and the last Explore pose.

## 8. Phase 4 with blocks

- Layout stays 09 §1: money strip, the block world on the left (orbit camera, drag to rotate, scroll to zoom, like
  classic), the stage panel on the right. `phases/life/blockView.js` returns **the same handle as `lifeView.js`**
  (`scene.setSeason/setTimeOfDay`, `scene.nightFactor`, `home.character`, `refreshNight`, `setLiving`, `syncHome`,
  `firstFrame`, `info`, `dispose`) so `lifeScreen.js`, `animation.js` and `careButton.js` barely change.
- `?view=classic` mounts the old `lifeView.js` (comparison and fallback) until task 24.
- Live this month: the timeline, calendar strip, toasts, speeds, pause, care game and reduced-motion calendar grid are
  unchanged. The blocky avatar walks `path` door → exit and back on the timeline's schedule; the sky runs the day; the
  home's `windows` swap to lit glass at night; wilted plants swap to brown leaves; absent animals hide.
- **Explore & build** (welcome, plan and summary stages; never during live): a button opens the block world full screen
  in first person, spawned at `spawn` (or the saved pose). "Done" or Esc returns to the panel and saves.

## 9. Controls and building

| Action | Mouse/touchpad | Keyboard only |
|---|---|---|
| Move | W A S D / arrows | same |
| Jump | Space | Space |
| Look | mouse (pointer lock) or **drag** if pointer lock is unavailable (Chromebook trackpads, headless tests) | Q/E turn, R/F look up/down |
| Break block | left click | B |
| Place block | right click (two-finger tap) or Shift + click | P |
| Choose block | 1–9, scroll | 1–9 |
| Leave | Esc / Done button | Esc |

- A crosshair and a 9-slot hotbar: the home's style blocks first, then glass, planks, plants, decor.
- **Property rule:** place/break only inside `property` boxes. Renters (apartment, shared) = their own unit/room box;
  condo owners = their unit + balcony; house and build owners = the whole lot up to `WORLD.buildHeight` above ground.
  Outside: a short friendly toast ("That's your neighbor's. Build on your own place."), no edit.
- Bedrock and anything below `groundY - WORLD.digDepth` (4) can't be broken. Doors, the student's mailbox and
  plant/animal spots are protected so the life animation and care game always work.
- Building is free decoration. Anything that costs money (rooms, beds, trees, coops, pets) goes through Upgrade.

## 10. The "My home" menu (task 19) and upgrades (tasks 20–21)

On the welcome, plan and summary stages, a **My home** button opens a small menu:
1. **Explore & build** (§8).
2. **Upgrade this home** → `state.upgrade` set, `phase = 'design'` in upgrade mode with a bar like the relocation bar
   ("Upgrading your home · Cancel"). What it offers by kind:
   - house: the house customizations from `houseModel.js` (palette, garden beds, fruit trees, coop, pet), charging only
     the **difference** from what's already there through `finance/ledger.js` (`category: 'home-upgrade'`);
   - build: the blueprint editor seeded with the current blueprint; cost = `build.js` cost(new) − cost(old) plus the
     permit line; must pass the same validation as a new build;
   - apartment / condo / shared: plants (and a cat where the lease allows), same pricing as move-in.
   Commit → back to Life at the same stage, world rebased (§7). Cancel → back, nothing charged.
3. **Find a new place to live** → the existing task-58 relocation flow (Plan table, paperwork, design), with the §7
   warning added to its confirm.

## 11. Performance and accessibility

- Budget at 1366 × 768 on a school Chromebook: **≤ 150 draw calls, ≤ 400 k triangles** in the life view; only exposed
  faces are meshed (the engine's chunk meshing or our adapter's face culling); the far volume is one merged mesh.
  Measure under SwiftShader with `tools/shoot.mjs` and report `renderer.info` in PROGRESS.
- Reduced motion: no sky animation or camera moves; Explore still works (it is user-driven).
- The `describeHome` text stays the accessible description of the view; add one sentence about the surroundings.
- Every new screen sets `data-ready`, gets a seed and a `tools/smoke.txt` line; galleries register in `dev/galleries.js`.

## 12. Task map

01 fork identity · 02 vendor engine · 03 textures + block registry · 04 volume core · 05 engine adapter ·
06 terrain · 07 neighborhood · 08 landmarks · 09 house · 10 apartment/condo building · 11 blueprint build ·
12 interiors + voxel home contract · 13 avatar + animals · 14 block life view · 15 live animation + care ·
16 Explore mode · 17 building · 18 world saves (schema v3) · 19 My home menu · 20 upgrade house/rentals ·
21 upgrade build · 22 performance + accessibility · 23 e2e playthroughs · 24 docs + final review.
