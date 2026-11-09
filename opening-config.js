"use strict";
// Asset paths are relative so the show also works from a downloaded folder.
window.OPENING_CONFIG = Object.freeze({
  background: "assets/backgrounds/IMG_0165.png",
  darkBackground: "assets/backgrounds/Start_dark.PNG",
  roomReveal: "assets/videos/Start_animation.mp4",
  revealFadeMs: 240,
  // Cue-count-independent: soundtrack cues are anchored to Word paragraph IDs.
  // Keep the historic actOneMusic key so existing mixer and controls continue
  // working; later acts can use the same fade/crossfade music player.
  actOneMusic: Object.freeze([
    Object.freeze({ from: 23, to: 29, src: "assets/audio/background/act-1/1-14.mp3" }),
    Object.freeze({ from: 30, to: 98, src: "assets/audio/background/act-1/15-91.mp3" }),
    Object.freeze({ from: 99, to: 103, src: "assets/audio/background/act-1/91-92(轉場).mp3", loop: false }),
    Object.freeze({ from: 104, to: 178, src: "assets/audio/background/act-1/92-174.mp3" }),
    Object.freeze({ from: 179, to: 184, src: "assets/audio/background/act-1/174-175(轉場).mp3", loop: false }),
    // Act II: recollection introduction, office scene, then Christopher's reflection.
    Object.freeze({ from: 185, to: 194, src: "assets/audio/background/act-2/175-180.mp3" }),
    Object.freeze({ from: 195, to: 268, src: "assets/audio/background/act-2/181-263.mp3" }),
    Object.freeze({ from: 269, to: 283, src: "assets/audio/background/act-2/264-277.mp3" }),
    Object.freeze({ from: 290, to: 402, src: "assets/audio/background/act-3/Act3.mp3" }),
    Object.freeze({ from: 407, to: 415, src: "assets/audio/background/act-4/Act4.m4a" })
  ]),
  // The compact 25-cue scene mode follows the same soundtrack timeline.
  // Each cue points to a representative Word paragraph, not its UI step number.
  // The two modes therefore share the exact same audio files and crossfade rules.
  sceneMusicSteps: Object.freeze({
    "dark": 20, "room-reveal": 23, "bright": 23, "ai": 27,
    "welcome": 28, "clock": 28, "door-kick": 33,
    "card": 83, "card-hidden": 85, "blackout": 99,
    "memory-light": 109, "memory-welcome": 115, "memory-room": 150,
    "memory-blackout": 179, "past-intro": 185, "past-isolate": 194,
    "office-light": 199, "office-bang": 213, "past-reflection": 269,
    "memory-return": 283, "discussion": 290, "vote-prompt": 388,
    "vote-clock": 388, "vote-one": 390, "vote-two": 395,
    "vote-final": 402, "vote-blackout": 403
  }),
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
  scriptEffects: Object.freeze({doorOpen: "assets/audio/effects/heavy-auto-door.mp3", timerClick: "assets/audio/effects/timer-click.wav", selectionButton: "assets/audio/Slam-button.m4a"}),
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
