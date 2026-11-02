// BLOCKS: transpiled from upstream TypeScript with esbuild --format=esm; relative imports given .js paths.
import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js"; // BLOCKS: three/examples/jsm → three/addons
import { Mode } from "../player/index.js";
import { BlockType } from "../terrain/index.js";
import Block from "../terrain/mesh/block.js";
import { isMobile } from "../utils/index.js";
var Side = /* @__PURE__ */ ((Side2) => {
  Side2[Side2["front"] = 0] = "front";
  Side2[Side2["back"] = 1] = "back";
  Side2[Side2["left"] = 2] = "left";
  Side2[Side2["right"] = 3] = "right";
  Side2[Side2["down"] = 4] = "down";
  Side2[Side2["up"] = 5] = "up";
  return Side2;
})(Side || {});
class Control {
  constructor(scene, camera, player, terrain, audio) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.terrain = terrain;
    this.control = new PointerLockControls(camera, document.body);
    this.audio = audio;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 8;
    this.far = this.player.body.height;
    this.initRayCaster();
    this.initEventListeners();
  }
  // core properties
  scene;
  camera;
  player;
  terrain;
  control;
  audio;
  velocity = new THREE.Vector3(0, 0, 0);
  // collide and jump properties
  frontCollide = false;
  backCollide = false;
  leftCollide = false;
  rightCollide = false;
  downCollide = true;
  upCollide = false;
  isJumping = false;
  raycasterDown = new THREE.Raycaster();
  raycasterUp = new THREE.Raycaster();
  raycasterFront = new THREE.Raycaster();
  raycasterBack = new THREE.Raycaster();
  raycasterRight = new THREE.Raycaster();
  raycasterLeft = new THREE.Raycaster();
  tempMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
    100
  );
  tempMeshMatrix = new THREE.InstancedBufferAttribute(
    new Float32Array(100 * 16),
    16
  );
  // other properties
  p1 = performance.now();
  p2 = performance.now();
  raycaster;
  far;
  holdingBlock = BlockType.grass;
  holdingBlocks = [
    BlockType.grass,
    BlockType.stone,
    BlockType.tree,
    BlockType.wood,
    BlockType.diamond,
    BlockType.quartz,
    BlockType.glass,
    BlockType.grass,
    BlockType.grass,
    BlockType.grass
  ];
  holdingIndex = 0;
  wheelGap = false;
  clickInterval;
  jumpInterval;
  mouseHolding = false;
  spaceHolding = false;
  initRayCaster = () => {
    this.raycasterUp.ray.direction = new THREE.Vector3(0, 1, 0);
    this.raycasterDown.ray.direction = new THREE.Vector3(0, -1, 0);
    this.raycasterFront.ray.direction = new THREE.Vector3(1, 0, 0);
    this.raycasterBack.ray.direction = new THREE.Vector3(-1, 0, 0);
    this.raycasterLeft.ray.direction = new THREE.Vector3(0, 0, -1);
    this.raycasterRight.ray.direction = new THREE.Vector3(0, 0, 1);
    this.raycasterUp.far = 1.2;
    this.raycasterDown.far = this.player.body.height;
    this.raycasterFront.far = this.player.body.width;
    this.raycasterBack.far = this.player.body.width;
    this.raycasterLeft.far = this.player.body.width;
    this.raycasterRight.far = this.player.body.width;
  };
  downKeys = {
    a: false,
    d: false,
    w: false,
    s: false
  };
  setMovementHandler = (e) => {
    if (e.repeat) {
      return;
    }
    switch (e.key) {
      case "q":
        if (this.player.mode === Mode.walking) {
          this.player.setMode(Mode.flying);
        } else {
          this.player.setMode(Mode.walking);
        }
        this.velocity.y = 0;
        this.velocity.x = 0;
        this.velocity.z = 0;
        break;
      case "w":
      case "W":
        this.downKeys.w = true;
        this.velocity.x = this.player.speed;
        break;
      case "s":
      case "S":
        this.downKeys.s = true;
        this.velocity.x = -this.player.speed;
        break;
      case "a":
      case "A":
        this.downKeys.a = true;
        this.velocity.z = -this.player.speed;
        break;
      case "d":
      case "D":
        this.downKeys.d = true;
        this.velocity.z = this.player.speed;
        break;
      case " ":
        if (this.player.mode === Mode.sneaking && !this.isJumping) {
          return;
        }
        if (this.player.mode === Mode.walking) {
          if (!this.isJumping) {
            this.velocity.y = 8;
            this.isJumping = true;
            this.downCollide = false;
            this.far = 0;
            setTimeout(() => {
              this.far = this.player.body.height;
            }, 300);
          }
        } else {
          this.velocity.y += this.player.speed;
        }
        if (this.player.mode === Mode.walking && !this.spaceHolding) {
          this.spaceHolding = true;
          this.jumpInterval = setInterval(() => {
            this.setMovementHandler(e);
          }, 10);
        }
        break;
      case "Shift":
        if (this.player.mode === Mode.walking) {
          if (!this.isJumping) {
            this.player.setMode(Mode.sneaking);
            if (this.downKeys.w) {
              this.velocity.x = this.player.speed;
            }
            if (this.downKeys.s) {
              this.velocity.x = -this.player.speed;
            }
            if (this.downKeys.a) {
              this.velocity.z = -this.player.speed;
            }
            if (this.downKeys.d) {
              this.velocity.z = this.player.speed;
            }
            this.camera.position.setY(this.camera.position.y - 0.2);
          }
        } else {
          this.velocity.y -= this.player.speed;
        }
        break;
      default:
        break;
    }
  };
  resetMovementHandler = (e) => {
    if (e.repeat) {
      return;
    }
    switch (e.key) {
      case "w":
      case "W":
        this.downKeys.w = false;
        this.velocity.x = 0;
        break;
      case "s":
      case "S":
        this.downKeys.s = false;
        this.velocity.x = 0;
        break;
      case "a":
      case "A":
        this.downKeys.a = false;
        this.velocity.z = 0;
        break;
      case "d":
      case "D":
        this.downKeys.d = false;
        this.velocity.z = 0;
        break;
      case " ":
        if (this.player.mode === Mode.sneaking && !this.isJumping) {
          return;
        }
        this.jumpInterval && clearInterval(this.jumpInterval);
        this.spaceHolding = false;
        if (this.player.mode === Mode.walking) {
          return;
        }
        this.velocity.y = 0;
        break;
      case "Shift":
        if (this.player.mode === Mode.sneaking) {
          if (!this.isJumping) {
            this.player.setMode(Mode.walking);
            if (this.downKeys.w) {
              this.velocity.x = this.player.speed;
            }
            if (this.downKeys.s) {
              this.velocity.x = -this.player.speed;
            }
            if (this.downKeys.a) {
              this.velocity.z = -this.player.speed;
            }
            if (this.downKeys.d) {
              this.velocity.z = this.player.speed;
            }
            this.camera.position.setY(this.camera.position.y + 0.2);
          }
        }
        if (this.player.mode === Mode.walking) {
          return;
        }
        this.velocity.y = 0;
        break;
      default:
        break;
    }
  };
  mousedownHandler = (e) => {
    e.preventDefault();
    this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
    const block = this.raycaster.intersectObjects(this.terrain.blocks)[0];
    const matrix = new THREE.Matrix4();
    switch (e.button) {
      // left click to remove block
      case 0:
        {
          if (block && block.object instanceof THREE.InstancedMesh) {
            block.object.getMatrixAt(block.instanceId, matrix);
            const position = new THREE.Vector3().setFromMatrixPosition(matrix);
            if (BlockType[block.object.name] === BlockType.bedrock) {
              this.terrain.generateAdjacentBlocks(position);
              return;
            }
            block.object.setMatrixAt(
              block.instanceId,
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
            // BLOCKS: audio is optional (not vendored), hence ?.
            this.audio?.playSound(BlockType[block.object.name]
            );
            const mesh = new THREE.Mesh(
              new THREE.BoxGeometry(1, 1, 1),
              this.terrain.materials.get(
                this.terrain.materialType[parseInt(BlockType[block.object.name])]
              )
            );
            mesh.position.set(position.x, position.y, position.z);
            this.scene.add(mesh);
            const time = performance.now();
            let raf = 0;
            const animate = () => {
              if (performance.now() - time > 250) {
                this.scene.remove(mesh);
                cancelAnimationFrame(raf);
                return;
              }
              raf = requestAnimationFrame(animate);
              mesh.geometry.scale(0.85, 0.85, 0.85);
            };
            animate();
            block.object.instanceMatrix.needsUpdate = true;
            let existed = false;
            for (const customBlock of this.terrain.customBlocks) {
              if (customBlock.x === position.x && customBlock.y === position.y && customBlock.z === position.z) {
                existed = true;
                customBlock.placed = false;
              }
            }
            if (!existed) {
              this.terrain.customBlocks.push(
                new Block(
                  position.x,
                  position.y,
                  position.z,
                  BlockType[block.object.name],
                  false
                )
              );
            }
            this.terrain.generateAdjacentBlocks(position);
          }
        }
        break;
      // right click to put block
      case 2:
        {
          if (block && block.object instanceof THREE.InstancedMesh) {
            const normal = block.face.normal;
            block.object.getMatrixAt(block.instanceId, matrix);
            const position = new THREE.Vector3().setFromMatrixPosition(matrix);
            if (position.x + normal.x === Math.round(this.camera.position.x) && position.z + normal.z === Math.round(this.camera.position.z) && (position.y + normal.y === Math.round(this.camera.position.y) || position.y + normal.y === Math.round(this.camera.position.y - 1))) {
              return;
            }
            matrix.setPosition(
              normal.x + position.x,
              normal.y + position.y,
              normal.z + position.z
            );
            this.terrain.blocks[this.holdingBlock].setMatrixAt(
              this.terrain.getCount(this.holdingBlock),
              matrix
            );
            this.terrain.setCount(this.holdingBlock);
            // BLOCKS: audio is optional (not vendored), hence ?.
            this.audio?.playSound(this.holdingBlock);
            this.terrain.blocks[this.holdingBlock].instanceMatrix.needsUpdate = true;
            this.terrain.customBlocks.push(
              new Block(
                normal.x + position.x,
                normal.y + position.y,
                normal.z + position.z,
                this.holdingBlock,
                true
              )
            );
          }
        }
        break;
      default:
        break;
    }
    if (!isMobile && !this.mouseHolding) {
      this.mouseHolding = true;
      this.clickInterval = setInterval(() => {
        this.mousedownHandler(e);
      }, 333);
    }
  };
  mouseupHandler = () => {
    this.clickInterval && clearInterval(this.clickInterval);
    this.mouseHolding = false;
  };
  changeHoldingBlockHandler = (e) => {
    if (isNaN(parseInt(e.key)) || e.key === "0") {
      return;
    }
    this.holdingIndex = parseInt(e.key) - 1;
    this.holdingBlock = this.holdingBlocks[this.holdingIndex] ?? BlockType.grass;
  };
  wheelHandler = (e) => {
    if (!this.wheelGap) {
      this.wheelGap = true;
      setTimeout(() => {
        this.wheelGap = false;
      }, 100);
      if (e.deltaY > 0) {
        this.holdingIndex++;
        this.holdingIndex > 9 && (this.holdingIndex = 0);
      } else if (e.deltaY < 0) {
        this.holdingIndex--;
        this.holdingIndex < 0 && (this.holdingIndex = 9);
      }
      this.holdingBlock = this.holdingBlocks[this.holdingIndex] ?? BlockType.grass;
    }
  };
  initEventListeners = () => {
    document.addEventListener("pointerlockchange", () => {
      if (document.pointerLockElement) {
        document.body.addEventListener(
          "keydown",
          this.changeHoldingBlockHandler
        );
        document.body.addEventListener("wheel", this.wheelHandler);
        document.body.addEventListener("keydown", this.setMovementHandler);
        document.body.addEventListener("keyup", this.resetMovementHandler);
        document.body.addEventListener("mousedown", this.mousedownHandler);
        document.body.addEventListener("mouseup", this.mouseupHandler);
      } else {
        document.body.removeEventListener(
          "keydown",
          this.changeHoldingBlockHandler
        );
        document.body.removeEventListener("wheel", this.wheelHandler);
        document.body.removeEventListener("keydown", this.setMovementHandler);
        document.body.removeEventListener("keyup", this.resetMovementHandler);
        document.body.removeEventListener("mousedown", this.mousedownHandler);
        document.body.removeEventListener("mouseup", this.mouseupHandler);
        this.velocity = new THREE.Vector3(0, 0, 0);
      }
    });
  };
  // move along X with direction factor
  moveX(distance, delta) {
    this.camera.position.x += distance * (this.player.speed / Math.PI) * 2 * delta;
  }
  // move along Z with direction factor
  moveZ = (distance, delta) => {
    this.camera.position.z += distance * (this.player.speed / Math.PI) * 2 * delta;
  };
  // collide checking
  collideCheckAll = (position, noise, customBlocks, far) => {
    this.collideCheck(4 /* down */, position, noise, customBlocks, far);
    this.collideCheck(0 /* front */, position, noise, customBlocks);
    this.collideCheck(1 /* back */, position, noise, customBlocks);
    this.collideCheck(2 /* left */, position, noise, customBlocks);
    this.collideCheck(3 /* right */, position, noise, customBlocks);
    this.collideCheck(5 /* up */, position, noise, customBlocks);
  };
  collideCheck = (side, position, noise, customBlocks, far = this.player.body.width) => {
    const matrix = new THREE.Matrix4();
    let index = 0;
    this.tempMesh.instanceMatrix = new THREE.InstancedBufferAttribute(
      new Float32Array(100 * 16),
      16
    );
    let removed = false;
    let treeRemoved = new Array(
      this.terrain.noise.treeHeight + 1
    ).fill(false);
    let x = Math.round(position.x);
    let z = Math.round(position.z);
    switch (side) {
      case 0 /* front */:
        x++;
        this.raycasterFront.ray.origin = position;
        break;
      case 1 /* back */:
        x--;
        this.raycasterBack.ray.origin = position;
        break;
      case 2 /* left */:
        z--;
        this.raycasterLeft.ray.origin = position;
        break;
      case 3 /* right */:
        z++;
        this.raycasterRight.ray.origin = position;
        break;
      case 4 /* down */:
        this.raycasterDown.ray.origin = position;
        this.raycasterDown.far = far;
        break;
      case 5 /* up */:
        this.raycasterUp.ray.origin = new THREE.Vector3().copy(position);
        this.raycasterUp.ray.origin.y--;
        break;
    }
    let y = Math.floor(
      noise.get(x / noise.gap, z / noise.gap, noise.seed) * noise.amp
    ) + 30;
    for (const block of customBlocks) {
      if (block.x === x && block.z === z) {
        if (block.placed) {
          matrix.setPosition(block.x, block.y, block.z);
          this.tempMesh.setMatrixAt(index++, matrix);
        } else if (block.y === y) {
          removed = true;
        } else {
          for (let i = 1; i <= this.terrain.noise.treeHeight; i++) {
            if (block.y === y + i) {
              treeRemoved[i] = true;
            }
          }
        }
      }
    }
    if (!removed) {
      matrix.setPosition(x, y, z);
      this.tempMesh.setMatrixAt(index++, matrix);
    }
    for (let i = 1; i <= this.terrain.noise.treeHeight; i++) {
      if (!treeRemoved[i]) {
        let treeOffset = noise.get(x / noise.treeGap, z / noise.treeGap, noise.treeSeed) * noise.treeAmp;
        let stoneOffset = noise.get(x / noise.stoneGap, z / noise.stoneGap, noise.stoneSeed) * noise.stoneAmp;
        if (treeOffset > noise.treeThreshold && y >= 27 && stoneOffset < noise.stoneThreshold) {
          matrix.setPosition(x, y + i, z);
          this.tempMesh.setMatrixAt(index++, matrix);
        }
      }
    }
    if (this.player.mode === Mode.sneaking && y < Math.floor(this.camera.position.y - 2) && side !== 4 /* down */ && side !== 5 /* up */) {
      matrix.setPosition(x, Math.floor(this.camera.position.y - 1), z);
      this.tempMesh.setMatrixAt(index++, matrix);
    }
    this.tempMesh.instanceMatrix.needsUpdate = true;
    const origin = new THREE.Vector3(position.x, position.y - 1, position.z);
    switch (side) {
      case 0 /* front */: {
        const c1 = this.raycasterFront.intersectObject(this.tempMesh).length;
        this.raycasterFront.ray.origin = origin;
        const c2 = this.raycasterFront.intersectObject(this.tempMesh).length;
        c1 || c2 ? this.frontCollide = true : this.frontCollide = false;
        break;
      }
      case 1 /* back */: {
        const c1 = this.raycasterBack.intersectObject(this.tempMesh).length;
        this.raycasterBack.ray.origin = origin;
        const c2 = this.raycasterBack.intersectObject(this.tempMesh).length;
        c1 || c2 ? this.backCollide = true : this.backCollide = false;
        break;
      }
      case 2 /* left */: {
        const c1 = this.raycasterLeft.intersectObject(this.tempMesh).length;
        this.raycasterLeft.ray.origin = origin;
        const c2 = this.raycasterLeft.intersectObject(this.tempMesh).length;
        c1 || c2 ? this.leftCollide = true : this.leftCollide = false;
        break;
      }
      case 3 /* right */: {
        const c1 = this.raycasterRight.intersectObject(this.tempMesh).length;
        this.raycasterRight.ray.origin = origin;
        const c2 = this.raycasterRight.intersectObject(this.tempMesh).length;
        c1 || c2 ? this.rightCollide = true : this.rightCollide = false;
        break;
      }
      case 4 /* down */: {
        const c1 = this.raycasterDown.intersectObject(this.tempMesh).length;
        c1 ? this.downCollide = true : this.downCollide = false;
        break;
      }
      case 5 /* up */: {
        const c1 = this.raycasterUp.intersectObject(this.tempMesh).length;
        c1 ? this.upCollide = true : this.upCollide = false;
        break;
      }
    }
  };
  update = () => {
    this.p1 = performance.now();
    const delta = (this.p1 - this.p2) / 1e3;
    if (
      // dev mode
      this.player.mode === Mode.flying
    ) {
      this.control.moveForward(this.velocity.x * delta);
      this.control.moveRight(this.velocity.z * delta);
      this.camera.position.y += this.velocity.y * delta;
    } else {
      this.collideCheckAll(
        this.camera.position,
        this.terrain.noise,
        this.terrain.customBlocks,
        this.far - this.velocity.y * delta
      );
      if (Math.abs(this.velocity.y) < this.player.falling) {
        this.velocity.y -= 25 * delta;
      }
      if (this.upCollide) {
        this.velocity.y = -225 * delta;
        this.far = this.player.body.height;
      }
      if (this.downCollide && !this.isJumping) {
        this.velocity.y = 0;
      } else if (this.downCollide && this.isJumping) {
        this.isJumping = false;
      }
      let vector = new THREE.Vector3(0, 0, -1).applyQuaternion(
        this.camera.quaternion
      );
      let direction = Math.atan2(vector.x, vector.z);
      if (this.frontCollide || this.backCollide || this.leftCollide || this.rightCollide) {
        if (this.frontCollide) {
          if (direction < Math.PI && direction > 0 && this.velocity.x > 0) {
            if (!this.leftCollide && direction > Math.PI / 2 || !this.rightCollide && direction < Math.PI / 2) {
              this.moveZ(Math.PI / 2 - direction, delta);
            }
          } else if (!this.leftCollide && !this.rightCollide && this.velocity.x > 0) {
            this.control.moveForward(this.velocity.x * delta);
          }
          if (direction < 0 && direction > -Math.PI && this.velocity.x < 0) {
            if (!this.leftCollide && direction > -Math.PI / 2 || !this.rightCollide && direction < -Math.PI / 2) {
              this.moveZ(-Math.PI / 2 - direction, delta);
            }
          } else if (!this.leftCollide && !this.rightCollide && this.velocity.x < 0) {
            this.control.moveForward(this.velocity.x * delta);
          }
          if (direction < Math.PI / 2 && direction > -Math.PI / 2 && this.velocity.z < 0) {
            if (!this.rightCollide && direction < 0 || !this.leftCollide && direction > 0) {
              this.moveZ(-direction, delta);
            }
          } else if (!this.leftCollide && !this.rightCollide && this.velocity.z < 0) {
            this.control.moveRight(this.velocity.z * delta);
          }
          if ((direction < -Math.PI / 2 || direction > Math.PI / 2) && this.velocity.z > 0) {
            if (!this.rightCollide && direction > 0) {
              this.moveZ(Math.PI - direction, delta);
            }
            if (!this.leftCollide && direction < 0) {
              this.moveZ(-Math.PI - direction, delta);
            }
          } else if (!this.leftCollide && !this.rightCollide && this.velocity.z > 0) {
            this.control.moveRight(this.velocity.z * delta);
          }
        }
        if (this.backCollide) {
          if (direction < 0 && direction > -Math.PI && this.velocity.x > 0) {
            if (!this.leftCollide && direction < -Math.PI / 2 || !this.rightCollide && direction > -Math.PI / 2) {
              this.moveZ(Math.PI / 2 + direction, delta);
            }
          } else if (!this.leftCollide && !this.rightCollide && this.velocity.x > 0) {
            this.control.moveForward(this.velocity.x * delta);
          }
          if (direction < Math.PI && direction > 0 && this.velocity.x < 0) {
            if (!this.leftCollide && direction < Math.PI / 2 || !this.rightCollide && direction > Math.PI / 2) {
              this.moveZ(direction - Math.PI / 2, delta);
            }
          } else if (!this.leftCollide && !this.rightCollide && this.velocity.x < 0) {
            this.control.moveForward(this.velocity.x * delta);
          }
          if ((direction < -Math.PI / 2 || direction > Math.PI / 2) && this.velocity.z < 0) {
            if (!this.leftCollide && direction > 0) {
              this.moveZ(-Math.PI + direction, delta);
            }
            if (!this.rightCollide && direction < 0) {
              this.moveZ(Math.PI + direction, delta);
            }
          } else if (!this.leftCollide && !this.rightCollide && this.velocity.z < 0) {
            this.control.moveRight(this.velocity.z * delta);
          }
          if (direction < Math.PI / 2 && direction > -Math.PI / 2 && this.velocity.z > 0) {
            if (!this.leftCollide && direction < 0 || !this.rightCollide && direction > 0) {
              this.moveZ(direction, delta);
            }
          } else if (!this.leftCollide && !this.rightCollide && this.velocity.z > 0) {
            this.control.moveRight(this.velocity.z * delta);
          }
        }
        if (this.leftCollide) {
          if ((direction < -Math.PI / 2 || direction > Math.PI / 2) && this.velocity.x > 0) {
            if (!this.frontCollide && direction > 0) {
              this.moveX(Math.PI - direction, delta);
            }
            if (!this.backCollide && direction < 0) {
              this.moveX(-Math.PI - direction, delta);
            }
          } else if (!this.frontCollide && !this.backCollide && this.velocity.x > 0) {
            this.control.moveForward(this.velocity.x * delta);
          } else if (this.frontCollide && direction < 0 && direction > -Math.PI / 2 && this.velocity.x > 0) {
            this.control.moveForward(this.velocity.x * delta);
          } else if (this.backCollide && direction < Math.PI / 2 && direction > 0 && this.velocity.x > 0) {
            this.control.moveForward(this.velocity.x * delta);
          }
          if (direction < Math.PI / 2 && direction > -Math.PI / 2 && this.velocity.x < 0) {
            if (!this.frontCollide && direction < 0 || !this.backCollide && direction > 0) {
              this.moveX(-direction, delta);
            }
          } else if (!this.frontCollide && !this.backCollide && this.velocity.x < 0) {
            this.control.moveForward(this.velocity.x * delta);
          } else if (this.frontCollide && direction < Math.PI && direction > Math.PI / 2 && this.velocity.x < 0) {
            this.control.moveForward(this.velocity.x * delta);
          } else if (this.backCollide && direction > -Math.PI && direction < -Math.PI / 2 && this.velocity.x < 0) {
            this.control.moveForward(this.velocity.x * delta);
          }
          if (direction > 0 && direction < Math.PI && this.velocity.z < 0) {
            if (!this.backCollide && direction > Math.PI / 2 || !this.frontCollide && direction < Math.PI / 2) {
              this.moveX(Math.PI / 2 - direction, delta);
            }
          } else if (!this.frontCollide && !this.backCollide && this.velocity.z < 0) {
            this.control.moveRight(this.velocity.z * delta);
          } else if (this.frontCollide && direction > -Math.PI && direction < -Math.PI / 2 && this.velocity.z < 0) {
            this.control.moveRight(this.velocity.z * delta);
          } else if (this.backCollide && direction > -Math.PI / 2 && direction < 0 && this.velocity.z < 0) {
            this.control.moveRight(this.velocity.z * delta);
          }
          if (direction < 0 && direction > -Math.PI && this.velocity.z > 0) {
            if (!this.backCollide && direction > -Math.PI / 2 || !this.frontCollide && direction < -Math.PI / 2) {
              this.moveX(-Math.PI / 2 - direction, delta);
            }
          } else if (!this.frontCollide && !this.backCollide && this.velocity.z > 0) {
            this.control.moveRight(this.velocity.z * delta);
          } else if (this.frontCollide && direction < Math.PI / 2 && direction > 0 && this.velocity.z > 0) {
            this.control.moveRight(this.velocity.z * delta);
          } else if (this.backCollide && direction < Math.PI && direction > Math.PI / 2 && this.velocity.z > 0) {
            this.control.moveRight(this.velocity.z * delta);
          }
        }
        if (this.rightCollide) {
          if (direction < Math.PI / 2 && direction > -Math.PI / 2 && this.velocity.x > 0) {
            if (!this.backCollide && direction < 0 || !this.frontCollide && direction > 0) {
              this.moveX(direction, delta);
            }
          } else if (!this.frontCollide && !this.backCollide && this.velocity.x > 0) {
            this.control.moveForward(this.velocity.x * delta);
          } else if (this.frontCollide && direction < -Math.PI / 2 && direction > -Math.PI && this.velocity.x > 0) {
            this.control.moveForward(this.velocity.x * delta);
          } else if (this.backCollide && direction < Math.PI && direction > Math.PI / 2 && this.velocity.x > 0) {
            this.control.moveForward(this.velocity.x * delta);
          }
          if ((direction < -Math.PI / 2 || direction > Math.PI / 2) && this.velocity.x < 0) {
            if (!this.backCollide && direction > 0) {
              this.moveX(-Math.PI + direction, delta);
            }
            if (!this.frontCollide && direction < 0) {
              this.moveX(Math.PI + direction, delta);
            }
          } else if (!this.frontCollide && !this.backCollide && this.velocity.x < 0) {
            this.control.moveForward(this.velocity.x * delta);
          } else if (this.frontCollide && direction < Math.PI / 2 && direction > 0 && this.velocity.x < 0) {
            this.control.moveForward(this.velocity.x * delta);
          } else if (this.backCollide && direction < 0 && direction > -Math.PI / 2 && this.velocity.x < 0) {
            this.control.moveForward(this.velocity.x * delta);
          }
          if (direction < 0 && direction > -Math.PI && this.velocity.z < 0) {
            if (!this.frontCollide && direction > -Math.PI / 2 || !this.backCollide && direction < -Math.PI / 2) {
              this.moveX(Math.PI / 2 + direction, delta);
            }
          } else if (!this.frontCollide && !this.backCollide && this.velocity.z < 0) {
            this.control.moveRight(this.velocity.z * delta);
          } else if (this.frontCollide && direction > Math.PI / 2 && direction < Math.PI && this.velocity.z < 0) {
            this.control.moveRight(this.velocity.z * delta);
          } else if (this.backCollide && direction > 0 && direction < Math.PI / 2 && this.velocity.z < 0) {
            this.control.moveRight(this.velocity.z * delta);
          }
          if (direction > 0 && direction < Math.PI && this.velocity.z > 0) {
            if (!this.frontCollide && direction > Math.PI / 2 || !this.backCollide && direction < Math.PI / 2) {
              this.moveX(direction - Math.PI / 2, delta);
            }
          } else if (!this.frontCollide && !this.backCollide && this.velocity.z > 0) {
            this.control.moveRight(this.velocity.z * delta);
          } else if (this.frontCollide && direction > -Math.PI / 2 && direction < 0 && this.velocity.z > 0) {
            this.control.moveRight(this.velocity.z * delta);
          } else if (this.backCollide && direction > -Math.PI && direction < -Math.PI / 2 && this.velocity.z > 0) {
            this.control.moveRight(this.velocity.z * delta);
          }
        }
      } else {
        this.control.moveForward(this.velocity.x * delta);
        this.control.moveRight(this.velocity.z * delta);
      }
      this.camera.position.y += this.velocity.y * delta;
      if (this.camera.position.y < -100) {
        this.camera.position.y = 60;
      }
    }
    this.p2 = this.p1;
  };
}
export {
  Control as default
};
