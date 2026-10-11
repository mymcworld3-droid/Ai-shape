"use strict";
// Asset paths are relative so the show also works from a downloaded folder.
window.OPENING_CONFIG = Object.freeze({
  background: "assets/backgrounds/IMG_0165.png",
  darkBackground: "assets/backgrounds/Start_dark.PNG",
  roomReveal: "assets/videos/Start_animation.mp4",
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
    aiFadeMs: 600,
    voiceExpandMs: 900
  }),
  office: Object.freeze({
    background: "assets/backgrounds/office-memory.png",
    // Act II, Scene II: BANG before Ben enters. Add the final sound later.
    bang: null,
    fadeMs: 1000,
    introDim: 0.35
  }),
  voting: Object.freeze({
    // Four distinct script recordings; null preserves manual silent cues.
    prompt: null,
    one: null,
    two: null,
    final: null,
    durationMs: 60 * 1000,
    fadeMs: 600,
    voiceExpandMs: 900,
    voiceSettleMs: 600,
    discussionDim: 0.2
  }),
  countdownMs: 15 * 60 * 1000,
  // Black display interior in IMG_0165.png's source pixels; excludes its bezel.
  roomScreen: Object.freeze({ x: 552, y: 310, width: 430, height: 195, inset: 2 }),
  // The clock and the screen-free Memory Room retain their existing placement.
  idleShape: Object.freeze({ x: 0.5, y: 0.4, size: 0.37 }),
  aiFadeMs: 900,
  sceneDurationMs: 1600,
  morphDurationMs: 1200,
  settleDurationMs: 1000,
  cardFadeMs: 400,
  blackoutMs: 1200
});
