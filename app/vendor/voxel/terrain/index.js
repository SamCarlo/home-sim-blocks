// BLOCKS: transpiled from upstream TypeScript with esbuild --format=esm; relative imports given .js paths.
import * as THREE from "three";
import Materials, { MaterialType } from "./mesh/materials.js";
import Block from "./mesh/block.js";
import Highlight from "./highlight/index.js";
import Noise from "./noise/index.js";
// BLOCKS: Vite `?worker` import replaced by a module worker (workers do not see the page import map, so the worker imports three by relative path).
const Generate = function() { return new Worker(new URL("./worker/generate.js", import.meta.url), { type: "module" }); };
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
class Terrain {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.maxCount = (this.distance * this.chunkSize * 2 + this.chunkSize) ** 2 + 500;
    this.highlight = new Highlight(scene, camera, this);
    this.scene.add(this.cloud);
    this.generateWorker.onmessage = (msg) => {
      this.resetBlocks();
      this.idMap = msg.data.idMap;
      this.blocksCount = msg.data.blocksCount;
      for (let i = 0; i < msg.data.arrays.length; i++) {
        this.blocks[i].instanceMatrix = new THREE.InstancedBufferAttribute(
          this.blocks[i].instanceMatrix.array = msg.data.arrays[i],
          16
        );
      }
      for (const block of this.blocks) {
        block.instanceMatrix.needsUpdate = true;
      }
    };
  }
  // core properties
  scene;
  camera;
  distance = 3;
  chunkSize = 24;
  // terrain properties
  maxCount;
  chunk = new THREE.Vector2(0, 0);
  previousChunk = new THREE.Vector2(0, 0);
  noise = new Noise();
  // materials
  materials = new Materials();
  materialType = [
    MaterialType.grass,
    MaterialType.sand,
    MaterialType.tree,
    MaterialType.leaf,
    MaterialType.dirt,
    MaterialType.stone,
    MaterialType.coal,
    MaterialType.wood,
    MaterialType.diamond,
    MaterialType.quartz,
    MaterialType.glass,
    MaterialType.bedrock
  ];
  // other properties
  blocks = [];
  blocksCount = [];
  blocksFactor = [1, 0.2, 0.1, 0.7, 0.1, 0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
  customBlocks = [];
  highlight;
  idMap = /* @__PURE__ */ new Map();
  generateWorker = new Generate();
  // cloud
  cloud = new THREE.InstancedMesh(
    new THREE.BoxGeometry(20, 5, 14),
    new THREE.MeshStandardMaterial({
      transparent: true,
      color: 16777215,
      opacity: 0.4
    }),
    1e3
  );
  cloudCount = 0;
  cloudGap = 5;
  getCount = (type) => {
    return this.blocksCount[type];
  };
  setCount = (type) => {
    this.blocksCount[type] = this.blocksCount[type] + 1;
  };
  initBlocks = () => {
    for (const block of this.blocks) {
      this.scene.remove(block);
    }
    this.blocks = [];
    const geometry = new THREE.BoxGeometry();
    for (let i = 0; i < this.materialType.length; i++) {
      let block = new THREE.InstancedMesh(
        geometry,
        this.materials.get(this.materialType[i]),
        this.maxCount * this.blocksFactor[i]
      );
      block.name = BlockType[i];
      this.blocks.push(block);
      this.scene.add(block);
    }
    this.blocksCount = new Array(this.materialType.length).fill(0);
  };
  resetBlocks = () => {
    for (let i = 0; i < this.blocks.length; i++) {
      this.blocks[i].instanceMatrix = new THREE.InstancedBufferAttribute(
        new Float32Array(this.maxCount * this.blocksFactor[i] * 16),
        16
      );
    }
  };
  generate = () => {
    this.blocksCount = new Array(this.blocks.length).fill(0);
    this.generateWorker.postMessage({
      distance: this.distance,
      chunk: this.chunk,
      noiseSeed: this.noise.seed,
      treeSeed: this.noise.treeSeed,
      stoneSeed: this.noise.stoneSeed,
      coalSeed: this.noise.coalSeed,
      idMap: /* @__PURE__ */ new Map(),
      blocksFactor: this.blocksFactor,
      blocksCount: this.blocksCount,
      customBlocks: this.customBlocks,
      chunkSize: this.chunkSize
    });
    if (this.cloudGap++ > 5) {
      this.cloudGap = 0;
      this.cloud.instanceMatrix = new THREE.InstancedBufferAttribute(
        new Float32Array(1e3 * 16),
        16
      );
      this.cloudCount = 0;
      for (let x = -this.chunkSize * this.distance * 3 + this.chunkSize * this.chunk.x; x < this.chunkSize * this.distance * 3 + this.chunkSize + this.chunkSize * this.chunk.x; x += 20) {
        for (let z = -this.chunkSize * this.distance * 3 + this.chunkSize * this.chunk.y; z < this.chunkSize * this.distance * 3 + this.chunkSize + this.chunkSize * this.chunk.y; z += 20) {
          const matrix = new THREE.Matrix4();
          matrix.setPosition(x, 80 + (Math.random() - 0.5) * 30, z);
          if (Math.random() > 0.8) {
            this.cloud.setMatrixAt(this.cloudCount++, matrix);
          }
        }
      }
      this.cloud.instanceMatrix.needsUpdate = true;
    }
  };
  // generate adjacent blocks after removing a block (vertical infinity world)
  generateAdjacentBlocks = (position) => {
    const { x, y, z } = position;
    const noise = this.noise;
    const yOffset = Math.floor(
      noise.get(x / noise.gap, z / noise.gap, noise.seed) * noise.amp
    );
    if (y > 30 + yOffset) {
      return;
    }
    const stoneOffset = noise.get(x / noise.stoneGap, z / noise.stoneGap, noise.stoneSeed) * noise.stoneAmp;
    let type;
    if (stoneOffset > noise.stoneThreshold || y < 23) {
      type = 5 /* stone */;
    } else {
      if (yOffset < -3) {
        type = 1 /* sand */;
      } else {
        type = 4 /* dirt */;
      }
    }
    this.buildBlock(new THREE.Vector3(x, y - 1, z), type);
    this.buildBlock(new THREE.Vector3(x, y + 1, z), type);
    this.buildBlock(new THREE.Vector3(x - 1, y, z), type);
    this.buildBlock(new THREE.Vector3(x + 1, y, z), type);
    this.buildBlock(new THREE.Vector3(x, y, z - 1), type);
    this.buildBlock(new THREE.Vector3(x, y, z + 1), type);
    this.blocks[type].instanceMatrix.needsUpdate = true;
  };
  buildBlock = (position, type) => {
    const noise = this.noise;
    const yOffset = Math.floor(
      noise.get(position.x / noise.gap, position.z / noise.gap, noise.seed) * noise.amp
    );
    if (position.y >= 30 + yOffset || position.y < 0) {
      return;
    }
    position.y === 0 && (type = 11 /* bedrock */);
    for (const block of this.customBlocks) {
      if (block.x === position.x && block.y === position.y && block.z === position.z) {
        return;
      }
    }
    this.customBlocks.push(
      new Block(position.x, position.y, position.z, type, true)
    );
    const matrix = new THREE.Matrix4();
    matrix.setPosition(position);
    this.blocks[type].setMatrixAt(this.getCount(type), matrix);
    this.blocks[type].instanceMatrix.needsUpdate = true;
    this.setCount(type);
  };
  update = () => {
    this.chunk.set(
      Math.floor(this.camera.position.x / this.chunkSize),
      Math.floor(this.camera.position.z / this.chunkSize)
    );
    if (this.chunk.x !== this.previousChunk.x || this.chunk.y !== this.previousChunk.y) {
      this.generate();
    }
    this.previousChunk.copy(this.chunk);
    this.highlight.update();
  };
}
export {
  BlockType,
  Terrain as default
};
