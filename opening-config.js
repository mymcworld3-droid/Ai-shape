"use strict";
// Asset paths are relative so the show also works from a downloaded folder.
window.OPENING_CONFIG = Object.freeze({
  background: "assets/backgrounds/IMG_0165.png",
  darkBackground: "assets/backgrounds/Start_dark.PNG",
  roomReveal: "assets/videos/Start_animation.MP4",
  revealFadeMs: 240,
  narration: "assets/audio/ai-opening.mp3",
  // Supply the final effect, then set this to "assets/audio/door-kick.mp3".
  // null reserves its cue silently, without requesting a nonexistent file.
  doorKick: null,
  card: "assets/cards/memory-access-card.svg",
  memory: Object.freeze({
    background: "assets/backgrounds/memory-room.png",
    // Add final assets later. null makes no missing-file requests.
    narration: null,
    lightClick: null,
    fadeMs: 1000,
    aiFadeMs: 600
  }),
  countdownMs: 15 * 60 * 1000,
  // Same viewport percentages and scale multiplier as the original sliders.
  idleShape: Object.freeze({ x: 0.5, y: 0.4, size: 0.37 }),
  aiFadeMs: 900,
  sceneDurationMs: 1600,
  morphDurationMs: 1200,
  settleDurationMs: 1000,
  cardFadeMs: 400,
  blackoutMs: 1200
});
