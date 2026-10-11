(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.StageLayout = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function fitStage(width, height) {
    const unit = Math.max(0, Math.min(width / 16, height / 9));
    return { width: unit * 16, height: unit * 9 };
  }
  function coverLayout(width, height, imageWidth, imageHeight) {
    if (![width, height, imageWidth, imageHeight].every(value => Number.isFinite(value) && value > 0)) {
      throw new RangeError("Cover dimensions must be positive finite numbers.");
    }
    const scale = Math.max(width / imageWidth, height / imageHeight);
    const drawnWidth = imageWidth * scale, drawnHeight = imageHeight * scale;
    return { x: (width - drawnWidth) / 2, y: (height - drawnHeight) / 2,
      width: drawnWidth, height: drawnHeight };
  }
  const previews = Object.freeze({
    dark: { room: false, ai: 0, scene: 0, clock: 0, card: 0, blackout: 0 },
    bright: { room: true, ai: 0, scene: 0, clock: 0, card: 0, blackout: 0 },
    ai: { room: true, ai: 1, scene: 0, clock: 0, card: 0, blackout: 0 },
    "door-kick": { room: true, ai: 1, scene: 0, clock: 0, card: 0, blackout: 0 },
    welcome: { room: true, ai: 1, scene: 1, clock: 0, card: 0, blackout: 0 },
    clock: { room: true, ai: 1, scene: 1, clock: 1, card: 0, blackout: 0 },
    card: { room: true, ai: 1, scene: 0, clock: 1, card: 1, blackout: 0 },
    "card-hidden": { room: true, ai: 1, scene: 0, clock: 1, card: 0, blackout: 0 },
    blackout: { room: true, ai: 0, scene: 0, clock: 0, card: 0, blackout: 1 },
    "memory-light": { background: "memory", room: true, ai: 0, scene: 0, clock: 0, card: 0, blackout: 0 },
    "memory-welcome": { background: "memory", room: true, ai: 1, scene: 0, clock: 0, card: 0, blackout: 0 },
    "memory-room": { background: "memory", room: true, ai: 0, scene: 0, clock: 0, card: 0, blackout: 0 },
    "memory-blackout": { background: "memory", room: true, ai: 0, scene: 0, clock: 0, card: 0, blackout: 1 }
  });
  for (const frame of Object.values(previews)) Object.freeze(frame);
  function previewFrame(cue) {
    return Object.prototype.hasOwnProperty.call(previews, cue) ? previews[cue] : null;
  }
  return { fitStage, coverLayout, previewFrame };
});
