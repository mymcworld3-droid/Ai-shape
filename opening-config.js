"use strict";
// Asset paths are relative so the show also works from a downloaded folder.
window.OPENING_CONFIG = Object.freeze({
  background: "assets/backgrounds/IMG_0165.png",
  darkBackground: "assets/backgrounds/Start_dark.PNG",
  roomReveal: "assets/videos/Start_animation.mp4",
  revealFadeMs: 240,
  // Cue-count-independent: anchor the soundtrack to immutable Word paragraph IDs.
  // Blank stage directions can be removed without shifting the music.
  // The original MP3 filenames retain their historical cue range names.
  actOneMusic: Object.freeze([
    Object.freeze({ from: 23, to: 29, src: "assets/audio/background/act-1/1-14.mp3" }),
    Object.freeze({ from: 30, to: 98, src: "assets/audio/background/act-1/15-91.mp3" }),
    Object.freeze({ from: 99, to: 103, src: "assets/audio/background/act-1/91-92(轉場).mp3", loop: false }),
    Object.freeze({ from: 104, to: 178, src: "assets/audio/background/act-1/92-174.mp3" }),
    Object.freeze({ from: 179, to: 184, src: "assets/audio/background/act-1/174-175(轉場).mp3", loop: false })
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
    // Act II, Scene II: BANG explicitly reuses the original door-kick impact WAV.
    bang: "assets/audio/door-kick.wav",
    fadeMs: 1000,
    introDim: 0.35
  }),
  voting: Object.freeze({
    // Uploaded recordings are ordered by the six AI dialogue groups in the script.
    prompt: "assets/audio/387-389ai.m4a",
    one: "assets/audio/391-392ai.m4a",
    two: "assets/audio/395-396ai.m4a",
    final: "assets/audio/399ai.m4a",
    durationMs: 60 * 1000,
    fadeMs: 600,
    voiceExpandMs: 900,
    voiceSettleMs: 600,
    discussionDim: 0.2
  }),
  ending: Object.freeze({
    complete: "assets/audio/404-406ai.m4a",
    revealTruth: "assets/audio/411-415ai.m4a"
  }),
  scriptEffects: Object.freeze({doorOpen: "assets/audio/effects/heavy-auto-door.mp3", timerClick: "assets/audio/effects/timer-click.wav", selectionButton: null}),
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
