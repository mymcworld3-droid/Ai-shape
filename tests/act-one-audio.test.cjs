"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Controller, trackForStep } = require("../act-one-audio.js");

const tracks = [
  { from: 1, to: 14, src: "intro.mp3" },
  { from: 15, to: 91, src: "dialogue.mp3" },
  { from: 92, to: 92, src: "transition.mp3", loop: false },
  { from: 93, to: 173, src: "memory.mp3" },
  { from: 174, to: 174, src: "transition.mp3", loop: false }
];
class FakeAudio {
  constructor() { this.src = ""; this.paused = true; this.currentTime = 0; this.events = []; }
  play() { this.paused = false; this.events.push("play:" + this.src); return Promise.resolve(); }
  pause() { this.paused = true; this.events.push("pause"); }
  load() { this.events.push("load:" + this.src); }
  removeAttribute(name) { if (name === "src") this.src = ""; }
}

test("Act I soundtrack follows every script cue range, stopping at Act II", () => {
  const audio = new FakeAudio(), music = new Controller({ audio, tracks });
  assert.equal(trackForStep(0, tracks), null);
  music.setStep(1);
  assert.equal(audio.src, "intro.mp3");
  assert.equal(audio.loop, true);
  const events = audio.events.length;
  music.setStep(14);
  assert.equal(audio.events.length, events, "Same range must not restart its song");
  music.setStep(15);
  assert.equal(audio.src, "dialogue.mp3");
  music.setStep(91);
  assert.equal(audio.src, "dialogue.mp3");
  music.setStep(92);
  assert.equal(audio.src, "transition.mp3");
  assert.equal(audio.loop, false);
  music.setStep(93);
  assert.equal(audio.src, "memory.mp3");
  music.setStep(173);
  assert.equal(audio.src, "memory.mp3");
  music.setStep(174);
  assert.equal(audio.src, "transition.mp3");
  music.setStep(175);
  assert.equal(audio.paused, true);
  assert.equal(audio.src, "");
});

test("Rewind restores the matching song, and each switch pauses the old one", () => {
  const audio = new FakeAudio(), music = new Controller({ audio, tracks });
  music.setStep(93);
  music.setStep(92);
  assert.equal(audio.src, "transition.mp3");
  music.setStep(91);
  assert.equal(audio.src, "dialogue.mp3");
  music.setStep(14);
  assert.equal(audio.src, "intro.mp3");
  for (let i = 0; i < audio.events.length - 1; i++) {
    if (audio.events[i].startsWith("load:")) assert.equal(audio.events[i+1].startsWith("play:"), true);
  }
  const plays = audio.events.filter(x => x.startsWith("play:"));
  assert.equal(plays.length, 4);
});

test("Playback errors are reported instead of blocking the subtitle cue", async () => {
  const audio = new FakeAudio(), errors = [];
  audio.play = () => Promise.reject(new Error("blocked"));
  const music = new Controller({ audio, tracks, onError: e => errors.push(e.message) });
  music.setStep(1);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(errors, ["blocked"]);
});
