// BLOCKS: transpiled from upstream TypeScript with esbuild --format=esm; relative imports given .js paths.
import { ImprovedNoise } from "./ImprovedNoise.js"; // BLOCKS: local copy of three r186 ImprovedNoise that imports three by relative path, so it also loads in the worker
class Noise {
  noise = new ImprovedNoise();
  seed = Math.random();
  gap = 22;
  amp = 8;
  stoneSeed = this.seed * 0.4;
  stoneGap = 12;
  stoneAmp = 8;
  stoneThreshold = 3.5;
  coalSeed = this.seed * 0.5;
  coalGap = 3;
  coalAmp = 8;
  coalThreshold = 3;
  treeSeed = this.seed * 0.7;
  treeGap = 2;
  treeAmp = 6;
  treeHeight = 10;
  treeThreshold = 4;
  leafSeed = this.seed * 0.8;
  leafGap = 2;
  leafAmp = 5;
  leafThreshold = -0.03;
  get = (x, y, z) => {
    return this.noise.noise(x, y, z);
  };
}
export {
  Noise as default
};
