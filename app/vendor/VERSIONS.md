# Vendored libraries

Fetched once from the npm registry by task 03 (2026-09-30) and committed. Nothing here is built or fetched at runtime.
Upgrade steps are in `HS/CLAUDE.md` → "Vendor".

| Library | Version | Source | License | Files | Fetched |
|---|---|---|---|---|---|
| three.js | 0.186.1 (r186) | npm `three` | MIT (`three/LICENSE`) | `three/three.module.min.js` (esbuild `--bundle --minify` of `build/three.module.js` + `three.core.js`; r186 ships no `.min.js`), `three/addons/controls/OrbitControls.js`, `three/addons/utils/BufferGeometryUtils.js` (copied as is; they `import … from 'three'`) | 2026-09-30 |
| nspell | 2.1.5 (+ is-buffer 2.0.5) | npm `nspell` | MIT (`nspell/LICENSE`) | `nspell/nspell.js` (esbuild `--bundle --format=esm --platform=browser`; default export `nspell(aff, dic)`) | 2026-09-30 |
| dictionary-en | 4.0.0 (en_US Hunspell, SCOWL 2020.12.07) | npm `dictionary-en` | MIT AND BSD (`dictionary-en/LICENSE`) | `dictionary-en/index.aff`, `dictionary-en/index.dic` | 2026-09-30 |
| vader-sentiment | 1.1.3 | npm `vader-sentiment` (Comcast JS port of VADER) | Apache-2.0 (`vader/LICENSE`, `vader/NOTICE`); VADER lexicon MIT (Hutto & Gilbert) | `vader/vader.js` (esbuild ESM bundle; exports `polarityScores(text) → {neg, neu, pos, compound}`, also the default export) | 2026-09-30 |
| voxel engine | vyse12138/minecraft-threejs @ `ead87efbd95eb2092a1b341b7c3cc6c78187904d` | https://github.com/vyse12138/minecraft-threejs | MIT (`voxel/LICENSE`) | `voxel/` (terrain, worker generator, noise, highlight, control, player, utils: esbuild per-file TS → ESM, no bundling; hand changes marked `// BLOCKS:`, listed in `voxel/README.md`) + `three/addons/controls/PointerLockControls.js` (three r186, as is) | 2026-11-02 |
| Kenney Voxel Pack | base pack (files dated 2020-11-23) | https://kenney.nl/assets/voxel-pack | CC0 (`kenney-voxel/License.txt`) | `kenney-voxel/*.png`: the 35 tiles `world/blocks.js` uses, 128 px, original names; water/ice alpha set (see `kenney-voxel/README.md`) | 2026-11-02 |
| Firebase JS SDK | 12.19.0 | `https://www.gstatic.com/firebasejs/12.19.0/firebase-{app,auth,firestore}.js` (import map) | Apache-2.0 | not vendored | 2026-09-30 |

Tool used: esbuild 0.28.2 via `npx -y esbuild`.

## Upgrading the voxel engine
1. In a temp dir outside HS: `git clone https://github.com/vyse12138/minecraft-threejs` and note `git rev-parse HEAD`;
   re-read `LICENSE` (must still be MIT/BSD/ISC/Apache-2.0/zlib/CC0).
2. From its `src/`, for each file in the `voxel/README.md` table:
   `npx -y esbuild <file>.ts --format=esm --target=es2022 --tsconfig-raw='{"compilerOptions":{"useDefineForClassFields":true}}' --outfile=<out>/<file>.js`.
3. Re-apply every `// BLOCKS:` change listed in `voxel/README.md` (diff the old vendored file against a fresh transpile
   of the old SHA to see them). Never copy `src/static` textures or `src/audio`.
4. Update the SHA in this table and in `voxel/README.md`, run `bash tools/check.sh` and shoot `?dev=voxel-vendor`.
