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
  function expandGraphicPose(home, foreground, radius, progress, homeInset = 0) {
    if (!Number.isFinite(progress)) throw new RangeError("Graphic expansion progress must be finite.");
    const p = Math.max(0, Math.min(1, progress));
    const rest = fitRadialGraphic(home, radius, homeInset, 0.98);
    const large = fitRadialGraphic(foreground, radius, 2, 0.98);
    const lerp = (a, b) => a + (b - a) * p;
    return { x: lerp(rest.x, large.x), y: lerp(rest.y, large.y), scale: lerp(rest.scale, large.scale),
      clip: Object.fromEntries(["x", "y", "width", "height"].map(key => [key, lerp(rest.clip[key], large.clip[key])])) };
  }
  function fitRectGraphic(region, width, height, inset = 0) {
    if (!region || ![region.x, region.y, region.width, region.height, width, height, inset].every(Number.isFinite) ||
        Math.min(region.width, region.height, width, height) <= 0 || inset < 0) {
      throw new RangeError("Rectangle fitting requires positive dimensions and a nonnegative inset.");
    }
    const clip = { x: region.x + inset, y: region.y + inset,
      width: Math.max(0, region.width - inset * 2), height: Math.max(0, region.height - inset * 2) };
    return { x: region.x + region.width / 2, y: region.y + region.height / 2,
      scale: Math.min(clip.width / width, clip.height / height), clip };
  }
  function fadeInProgress(elapsed, duration) {
    if (![elapsed, duration].every(Number.isFinite) || duration < 0) {
      throw new RangeError("Fade timing must be finite, with a nonnegative duration.");
    }
    const p = duration ? Math.max(0, Math.min(1, elapsed / duration)) : 1;
    return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  }
  const previews = Object.freeze({
    dark: { room: false, ai: 0, scene: 0, clock: 0, card: 0, blackout: 0 },
    bright: { room: true, ai: 0, scene: 0, clock: 0, card: 0, blackout: 0 },
    ai: { room: true, ai: 1, scene: 0, clock: 0, card: 0, blackout: 0 },
    welcome: { room: true, ai: 1, scene: 1, clock: 0, card: 0, blackout: 0 },
    "door-kick": { room: true, ai: 1, scene: 0, clock: 0, card: 0, blackout: 0 },
    clock: { room: true, ai: 1, scene: 0, clock: 1, card: 0, blackout: 0 },
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
  return { fitStage, coverLayout, projectImageRegion, fitRadialGraphic, fitRectGraphic, expandGraphicPose, fadeInProgress, previewFrame };
});
