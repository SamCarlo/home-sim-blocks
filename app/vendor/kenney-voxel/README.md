# Kenney Voxel Pack (subset, CC0)

- **Source:** "Voxel Pack" by Kenney Vleugels, https://kenney.nl/assets/voxel-pack (zip `kenney_voxel-pack`, files dated
  2020-11-23), downloaded 2026-11-02 by task homeblocks 03.
- **License:** Creative Commons Zero (CC0), `License.txt` in this folder (copied unchanged). Credit "Textures: Kenney (CC0)".
- **Files:** only the 35 tiles `app/src/world/blocks.js` uses, copied from the pack's `PNG/Tiles/` with Kenney's file
  names, at the original 128 × 128 (the folder is ~172 KB, under the 600 KB budget, so nothing was downscaled).
  `textureFiles()` in blocks.js lists them; `tests/unit/blocks.test.js` checks every one exists here.
- **Hand changes (alpha only):** `water.png` and `ice.png` ship fully opaque; their alpha channel was set to a flat
  170 (water) and 210 (ice) with a throwaway Pillow script (`Image.merge('RGBA', (r, g, b, Image.new('L', size, a)))`).
  Colors are untouched. Glass and leaves use the pack's own `glass.png` and `leaves*_transparent.png` alpha as is.
- Extra colors (style plaster/roof/trim, lava rock, pine, wilted leaves …) come from each block's `tint`, multiplied over
  light textures (`snow.png` for plaster/trim/metal, `trunk_white_side.png` for roofs). No other art is used.

## Upgrading
Download the pack again from kenney.nl, re-read `License.txt` (must still say CC0), copy the files `textureFiles()`
lists and redo the alpha fix above.
