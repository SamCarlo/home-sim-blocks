// BLOCKS: transpiled from upstream TypeScript with esbuild --format=esm; relative imports given .js paths.
import * as THREE from "../../../three/three.module.min.js"; // BLOCKS: relative path (no import map inside workers)
import Noise from "../noise/index.js";
var BlockType = /* @__PURE__ */ ((BlockType2) => {
  BlockType2[BlockType2["grass"] = 0] = "grass";
  BlockType2[BlockType2["sand"] = 1] = "sand";
  BlockType2[BlockType2["tree"] = 2] = "tree";
  BlockType2[BlockType2["leaf"] = 3] = "leaf";
  BlockType2[BlockType2["dirt"] = 4] = "dirt";
  BlockType2[BlockType2["stone"] = 5] = "stone";
  BlockType2[BlockType2["coal"] = 6] = "coal";
  BlockType2[BlockType2["wood"] = 7] = "wood";
  BlockType2[BlockType2["diamond"] = 8] = "diamond";
  BlockType2[BlockType2["quartz"] = 9] = "quartz";
  BlockType2[BlockType2["glass"] = 10] = "glass";
  BlockType2[BlockType2["bedrock"] = 11] = "bedrock";
  return BlockType2;
})(BlockType || {});
const matrix = new THREE.Matrix4();
const noise = new Noise();
const blocks = [];
const geometry = new THREE.BoxGeometry();
let isFirstRun = true;
onmessage = (msg) => {
  const {
    distance,
    chunk,
    noiseSeed,
    idMap,
    blocksFactor,
    treeSeed,
    stoneSeed,
    coalSeed,
    customBlocks,
    blocksCount,
    chunkSize
  } = msg.data;
  const maxCount = (distance * chunkSize * 2 + chunkSize) ** 2 + 500;
  if (isFirstRun) {
    for (let i = 0; i < blocksCount.length; i++) {
      let block = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshBasicMaterial(),
        maxCount * blocksFactor[i]
      );
      blocks.push(block);
    }
    isFirstRun = false;
  }
  noise.seed = noiseSeed;
  noise.treeSeed = treeSeed;
  noise.stoneSeed = stoneSeed;
  noise.coalSeed = coalSeed;
  for (let i = 0; i < blocks.length; i++) {
    blocks[i].instanceMatrix = new THREE.InstancedBufferAttribute(
      new Float32Array(maxCount * blocksFactor[i] * 16),
      16
    );
  }
  for (let x = -chunkSize * distance + chunkSize * chunk.x; x < chunkSize * distance + chunkSize + chunkSize * chunk.x; x++) {
    for (let z = -chunkSize * distance + chunkSize * chunk.y; z < chunkSize * distance + chunkSize + chunkSize * chunk.y; z++) {
      const y = 30;
      const yOffset = Math.floor(
        noise.get(x / noise.gap, z / noise.gap, noise.seed) * noise.amp
      );
      matrix.setPosition(x, y + yOffset, z);
      const stoneOffset = noise.get(x / noise.stoneGap, z / noise.stoneGap, noise.stoneSeed) * noise.stoneAmp;
      const coalOffset = noise.get(x / noise.coalGap, z / noise.coalGap, noise.coalSeed) * noise.coalAmp;
      if (stoneOffset > noise.stoneThreshold) {
        if (coalOffset > noise.coalThreshold) {
          idMap.set(`${x}_${y + yOffset}_${z}`, blocksCount[6 /* coal */]);
          blocks[6 /* coal */].setMatrixAt(
            blocksCount[6 /* coal */]++,
            matrix
          );
        } else {
          idMap.set(`${x}_${y + yOffset}_${z}`, blocksCount[5 /* stone */]);
          blocks[5 /* stone */].setMatrixAt(
            blocksCount[5 /* stone */]++,
            matrix
          );
        }
      } else {
        if (yOffset < -3) {
          idMap.set(`${x}_${y + yOffset}_${z}`, blocksCount[1 /* sand */]);
          blocks[1 /* sand */].setMatrixAt(
            blocksCount[1 /* sand */]++,
            matrix
          );
        } else {
          idMap.set(`${x}_${y + yOffset}_${z}`, blocksCount[0 /* grass */]);
          blocks[0 /* grass */].setMatrixAt(
            blocksCount[0 /* grass */]++,
            matrix
          );
        }
      }
      const treeOffset = noise.get(x / noise.treeGap, z / noise.treeGap, noise.treeSeed) * noise.treeAmp;
      if (treeOffset > noise.treeThreshold && yOffset >= -3 && stoneOffset < noise.stoneThreshold) {
        for (let i = 1; i <= noise.treeHeight; i++) {
          idMap.set(`${x}_${y + yOffset + i}_${z}`, blocksCount[2 /* tree */]);
          matrix.setPosition(x, y + yOffset + i, z);
          blocks[2 /* tree */].setMatrixAt(
            blocksCount[2 /* tree */]++,
            matrix
          );
        }
        for (let i = -3; i < 3; i++) {
          for (let j = -3; j < 3; j++) {
            for (let k = -3; k < 3; k++) {
              if (i === 0 && k === 0) {
                continue;
              }
              const leafOffset = noise.get(
                (x + i + j) / noise.leafGap,
                (z + k) / noise.leafGap,
                noise.leafSeed
              ) * noise.leafAmp;
              if (leafOffset > noise.leafThreshold) {
                idMap.set(
                  `${x + i}_${y + yOffset + noise.treeHeight + j}_${z + k}`,
                  blocksCount[3 /* leaf */]
                );
                matrix.setPosition(
                  x + i,
                  y + yOffset + noise.treeHeight + j,
                  z + k
                );
                blocks[3 /* leaf */].setMatrixAt(
                  blocksCount[3 /* leaf */]++,
                  matrix
                );
              }
            }
          }
        }
      }
    }
  }
  for (const block of customBlocks) {
    if (block.x > -chunkSize * distance + chunkSize * chunk.x && block.x < chunkSize * distance + chunkSize + chunkSize * chunk.x && block.z > -chunkSize * distance + chunkSize * chunk.y && block.z < chunkSize * distance + chunkSize + chunkSize * chunk.y) {
      if (block.placed) {
        matrix.setPosition(block.x, block.y, block.z);
        blocks[block.type].setMatrixAt(blocksCount[block.type]++, matrix);
      } else {
        const id = idMap.get(`${block.x}_${block.y}_${block.z}`);
        blocks[block.type].setMatrixAt(
          id,
          new THREE.Matrix4().set(
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          )
        );
      }
    }
  }
  const arrays = blocks.map((block) => block.instanceMatrix.array);
  postMessage({ idMap, arrays, blocksCount });
};
