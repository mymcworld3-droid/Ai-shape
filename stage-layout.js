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
  function projectImageRegion(width, height, imageWidth, imageHeight, region) {
    if (!region || ![region.x, region.y, region.width, region.height].every(Number.isFinite) ||
        region.width <= 0 || region.height <= 0) {
      throw new RangeError("Image region must have finite coordinates and positive dimensions.");
    }
    const image = coverLayout(width, height, imageWidth, imageHeight);
    const scale = image.width / imageWidth;
    return { x: image.x + region.x * scale, y: image.y + region.y * scale,
      width: region.width * scale, height: region.height * scale };
  }
  function fitRadialGraphic(region, radius, inset = 0, fill = 1) {
    if (![region.x, region.y, region.width, region.height, radius, inset, fill].every(Number.isFinite) ||
        region.width <= 0 || region.height <= 0 || radius <= 0 || inset < 0 || fill < 0 || fill > 1) {
      throw new RangeError("Graphic fitting requires positive dimensions and radius, and a fill from zero to one.");
    }
    const availableRadius = Math.max(0, Math.min(region.width, region.height) / 2 - inset);
    return { x: region.x + region.width / 2, y: region.y + region.height / 2,
      scale: availableRadius * fill / radius,
      clip: { x: region.x + inset, y: region.y + inset,
        width: Math.max(0, region.width - inset * 2), height: Math.max(0, region.height - inset * 2) } };
  }
  function moveScreenForward(width, height, home, progress, { maxWidth = 0.92, maxHeight = 0.9, centerY = 0.5 } = {}) {
    if (!home || ![width, height, home.x, home.y, home.width, home.height, progress,
        maxWidth, maxHeight, centerY].every(Number.isFinite) ||
        Math.min(width, height, home.width, home.height, maxWidth, maxHeight) <= 0 ||
        maxWidth > 1 || maxHeight > 1 || centerY < maxHeight / 2 || centerY > 1 - maxHeight / 2) {
      throw new RangeError("Screen motion requires valid dimensions and a foreground display inside the stage.");
    }
    const p = Math.max(0, Math.min(1, progress));
    const scale = Math.min(width * maxWidth / home.width, height * maxHeight / home.height);
    const screenWidth = home.width * (1 + (scale - 1) * p);
    const screenHeight = home.height * (1 + (scale - 1) * p);
    const x = home.x + home.width / 2 + (width / 2 - home.x - home.width / 2) * p;
    const y = home.y + home.height / 2 + (height * centerY - home.y - home.height / 2) * p;
    return { x: x - screenWidth / 2, y: y - screenHeight / 2, width: screenWidth, height: screenHeight };
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
    "memory-welcome": { background: "memory", room: true, ai: 1, aiExpansion: 1, scene: 0, clock: 0, card: 0, blackout: 0 },
    "memory-room": { background: "memory", room: true, ai: 0, scene: 0, clock: 0, card: 0, blackout: 0 },
    "memory-blackout": { background: "memory", room: true, ai: 0, scene: 0, clock: 0, card: 0, blackout: 1 },
    "past-intro": { background: "memory", room: true, ai: 0, scene: 0.35, clock: 0, card: 0, blackout: 0 },
    "past-isolate": { background: "memory", room: true, ai: 0, scene: 0, clock: 0, card: 0, blackout: 1 },
    "office-light": { background: "office", room: true, ai: 0, scene: 0, clock: 0, card: 0, blackout: 0 },
    "office-bang": { background: "office", room: true, ai: 0, scene: 0, clock: 0, card: 0, blackout: 0 },
    "past-reflection": { background: "office", room: true, ai: 0, scene: 0, clock: 0, card: 0, blackout: 1 },
    "memory-return": { background: "memory", room: true, ai: 0, scene: 0, clock: 0, card: 0, blackout: 0 },
    discussion: { background: "memory", room: true, ai: 0, scene: 0.2, clock: 0, card: 0, blackout: 0 },
    "vote-prompt": { background: "memory", room: true, ai: 1, aiExpansion: 1, scene: 0.2, clock: 0, card: 0, blackout: 0, vote: 1 },
    "vote-clock": { background: "memory", room: true, ai: 0, scene: 0.2, clock: 1, card: 0, blackout: 0, vote: 1, timer: "selection" },
    "vote-one": { background: "memory", room: true, ai: 1, aiExpansion: 1, scene: 0.2, clock: 0, card: 0, blackout: 0, vote: 1, timer: "selection" },
    "vote-two": { background: "memory", room: true, ai: 1, aiExpansion: 1, scene: 0.2, clock: 0, card: 0, blackout: 0, vote: 1, timer: "selection" },
    "vote-final": { background: "memory", room: true, ai: 1, aiExpansion: 1, scene: 0.2, clock: 0, card: 0, blackout: 0, vote: 1, timer: "selection" },
    "vote-blackout": { background: "memory", room: true, ai: 0, scene: 0, clock: 0, card: 0, blackout: 1 }
  });
  for (const frame of Object.values(previews)) Object.freeze(frame);
  function previewFrame(cue) {
    return Object.prototype.hasOwnProperty.call(previews, cue) ? previews[cue] : null;
  }
  return { fitStage, coverLayout, projectImageRegion, fitRadialGraphic, moveScreenForward, previewFrame };
});
