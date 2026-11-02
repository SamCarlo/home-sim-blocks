// BLOCKS: transpiled from upstream TypeScript with esbuild --format=esm; relative imports given .js paths.
// BLOCKS: upstream loads Minecraft-style PNG textures here; those are never copied (13 §2). Plain placeholder
// colors stand in until task 03 brings the CC0 Kenney textures: every `map: <texture>` became `color: COLORS.<name>`.
import * as THREE from "three";
var MaterialType = /* @__PURE__ */ ((MaterialType2) => {
  MaterialType2["grass"] = "grass";
  MaterialType2["dirt"] = "dirt";
  MaterialType2["tree"] = "tree";
  MaterialType2["leaf"] = "leaf";
  MaterialType2["sand"] = "sand";
  MaterialType2["stone"] = "stone";
  MaterialType2["coal"] = "coal";
  MaterialType2["wood"] = "wood";
  MaterialType2["diamond"] = "diamond";
  MaterialType2["quartz"] = "quartz";
  MaterialType2["glass"] = "glass";
  MaterialType2["bedrock"] = "bedrock";
  return MaterialType2;
})(MaterialType || {});
const COLORS = { grassTop: 0x6aa84f, grassSide: 0x7d6b45, dirt: 0x8a6a3f, sand: 0xe3d38f, log: 0x6b4f2a, logTop: 0x9c7a48,
  leaf: 0x3f8f3a, stone: 0x8c8c8c, coal: 0x5a5a5a, wood: 0xb58a50, diamond: 0x5fd3d0, quartz: 0xeeeae2, glass: 0xbfe6f2, bedrock: 0x3a3a3a };
class Materials {
  materials = {
    grass: [
      new THREE.MeshStandardMaterial({ color: COLORS.grassSide }),
      new THREE.MeshStandardMaterial({ color: COLORS.grassSide }),
      new THREE.MeshStandardMaterial({
        color: COLORS.grassTop
      }),
      new THREE.MeshStandardMaterial({ color: COLORS.dirt }),
      new THREE.MeshStandardMaterial({ color: COLORS.grassSide }),
      new THREE.MeshStandardMaterial({ color: COLORS.grassSide })
    ],
    dirt: new THREE.MeshStandardMaterial({ color: COLORS.dirt }),
    sand: new THREE.MeshStandardMaterial({ color: COLORS.sand }),
    tree: [
      new THREE.MeshStandardMaterial({ color: COLORS.log }),
      new THREE.MeshStandardMaterial({ color: COLORS.log }),
      new THREE.MeshStandardMaterial({ color: COLORS.logTop }),
      new THREE.MeshStandardMaterial({ color: COLORS.logTop }),
      new THREE.MeshStandardMaterial({ color: COLORS.log }),
      new THREE.MeshStandardMaterial({ color: COLORS.log })
    ],
    leaf: new THREE.MeshStandardMaterial({
      color: COLORS.leaf,
      // BLOCKS: upstream also tinted the leaf texture with color: new THREE.Color(0, 1, 0); dropped (it would override the placeholder)
      transparent: true
    }),
    // water: new THREE.MeshStandardMaterial({
    //   map: waterMaterial,
    //   transparent: true,
    //   opacity: 0.7
    // }),
    stone: new THREE.MeshStandardMaterial({ color: COLORS.stone }),
    coal: new THREE.MeshStandardMaterial({ color: COLORS.coal }),
    wood: new THREE.MeshStandardMaterial({ color: COLORS.wood }),
    diamond: new THREE.MeshStandardMaterial({ color: COLORS.diamond }),
    quartz: new THREE.MeshStandardMaterial({ color: COLORS.quartz }),
    glass: new THREE.MeshStandardMaterial({
      color: COLORS.glass,
      transparent: true
    }),
    bedrock: new THREE.MeshStandardMaterial({ color: COLORS.bedrock })
  };
  get = (type) => {
    return this.materials[type];
  };
}
export {
  MaterialType,
  Materials as default
};
