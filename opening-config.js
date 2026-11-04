"use strict";
// Asset paths are relative so the show also works from a downloaded folder.
window.OPENING_CONFIG = Object.freeze({
  background: "assets/backgrounds/IMG_0165.png",
  darkBackground: "assets/backgrounds/Start_dark.PNG",
  roomReveal: "assets/videos/Start_animation.mp4",
  revealFadeMs: 240,
  // Cue numbers account for deleted p64 dialogue and added p110 light-click cue.
  // Audio filenames mark start-to-next-cue boundaries.
  actOneMusic: Object.freeze([
    Object.freeze({ from: 1, to: 14, src: "assets/audio/background/act-1/1-14.mp3" }),
    Object.freeze({ from: 15, to: 90, src: "assets/audio/background/act-1/15-91.mp3" }),
    Object.freeze({ from: 91, to: 91, src: "assets/audio/background/act-1/91-92(轉場).mp3", loop: false }),
    Object.freeze({ from: 92, to: 173, src: "assets/audio/background/act-1/92-174.mp3" }),
    Object.freeze({ from: 174, to: 174, src: "assets/audio/background/act-1/174-175(轉場).mp3", loop: false })
  ]),
  narration: "assets/audio/ai-opening.m4a",
  // Original user-supplied WAV, stored locally for offline playback.
  doorKick: "assets/audio/door-kick.wav",
  card: "assets/cards/memory-access-card.svg",
  memory: Object.freeze({
    background: "assets/backgrounds/memory-room.png",
    // Original uploaded recording; keep its filename and bytes unchanged.
    narration: "assets/audio/Memory-room.m4a",
    lightClick: "assets/audio/effects/light-click.wav",
    fadeMs: 1000,
    aiFadeMs: 600,
    voiceExpandMs: 900
  }),
  office: Object.freeze({
    background: "assets/backgrounds/office-memory.png",
    // Act II, Scene II: BANG before Ben enters; temporary reusable impact sound.
    bang: "assets/audio/effects/office-bang.wav",
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
  ending: Object.freeze({complete: null, revealTruth: null}),
  scriptEffects: Object.freeze({doorOpen: "assets/audio/effects/door-open.mp3", timerClick: "assets/audio/effects/timer-click.wav", selectionButton: null}),
  countdownMs: 15 * 60 * 1000,
  // Black display interior in IMG_0165.png's source pixels; excludes its bezel.
  roomScreen: Object.freeze({ x: 552, y: 310, width: 430, height: 195, inset: 2 }),
  // Voice playback dims the original room without changing its composition.
  voiceDim: 1,
  // Reduce the foreground graphic only; idle TV placement and clocks stay unchanged.
  voiceGraphicScale: 0.82,
  // The selection clock and the Memory Room's resting AI use this placement.
  idleShape: Object.freeze({ x: 0.5, y: 0.4, size: 0.37 }),
  aiFadeMs: 1500,
  sceneDurationMs: 1600,
  morphDurationMs: 1200,
  settleDurationMs: 1000,
  cardFadeMs: 400,
  blackoutMs: 1200
});
