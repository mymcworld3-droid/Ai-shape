"use strict";
// Asset paths are relative so the show also works from a downloaded folder.
window.OPENING_CONFIG = Object.freeze({
  background: "IMG_0165.png",
  narration: "assets/audio/ai-opening.mp3",
  countdownMs: 15 * 60 * 1000,
  // The inner black screen in IMG_0165.png, as fractions of the source image.
  monitor: Object.freeze({ x: 0.362, y: 0.302, width: 0.274, height: 0.191 }),
  sceneDurationMs: 1600,
  morphDurationMs: 1200,
  settleDurationMs: 1000
});
