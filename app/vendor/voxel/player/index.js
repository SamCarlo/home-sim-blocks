// BLOCKS: transpiled from upstream TypeScript with esbuild --format=esm; relative imports given .js paths.
var Mode = /* @__PURE__ */ ((Mode2) => {
  Mode2["walking"] = "walking";
  Mode2["sprinting"] = "sprinting";
  Mode2["flying"] = "flying";
  Mode2["sprintFlying"] = "sprintFlying";
  Mode2["sneaking"] = "sneaking";
  return Mode2;
})(Mode || {});
var Speed = /* @__PURE__ */ ((Speed2) => {
  Speed2[Speed2["walking"] = 5.612] = "walking";
  Speed2[Speed2["sprinting"] = 5.612] = "sprinting";
  Speed2[Speed2["flying"] = 21.78] = "flying";
  Speed2[Speed2["sprintFlying"] = 21.78] = "sprintFlying";
  Speed2[Speed2["sneaking"] = 2.55] = "sneaking";
  return Speed2;
})(Speed || {});
class Player {
  mode = "walking" /* walking */;
  speed = Speed[this.mode];
  setMode(Mode2) {
    this.mode = Mode2;
    this.speed = Speed[this.mode];
  }
  falling = 38.4;
  jump = 1.2522;
  body = {
    height: 1.8,
    width: 0.5
  };
}
export {
  Mode,
  Speed,
  Player as default
};
