"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { RoomRevealController, OpeningController, StageCueController, formatTime, bindAdvanceKey, bindAdvanceClick } = require("../opening-controller.js");

class FakeAudio extends EventTarget {
  constructor() { super(); this.ended = false; this.currentTime = 0; this.calls = 0; this.error = null; }
  play() { ++this.calls; return this.result || Promise.resolve(); }
  pause() { this.paused = true; }
  load() { this.error = null; }
  end() { this.ended = true; this.dispatchEvent(new Event("ended")); }
}
function setup() {
  const audio = new FakeAudio(), states = [], errors = [];
  let time = 100;
  const controller = new OpeningController({ audio, now: () => time,
    onStateChange: state => states.push(state), onError: error => errors.push(error) });
  return { audio, controller, states, errors, setTime: value => { time = value; } };
}

function roomSetup() {
  const video = new FakeAudio(), states = [], errors = [];
  const controller = new RoomRevealController({ video,
    onStateChange: state => states.push(state), onError: error => errors.push(error) });
  return { video, controller, states, errors };
}

test("room starts dark, waits for a cue, and reaches ready only at the real video end", async () => {
  const { video, controller, states } = roomSetup();
  assert.equal(controller.state, "dark");
  assert.equal(video.calls, 0);
  video.dispatchEvent(new Event("ended"));
  assert.equal(controller.state, "dark");
  await controller.advance();
  assert.equal(controller.state, "playing");
  video.dispatchEvent(new Event("ended"));
  assert.equal(controller.state, "playing");
  video.end();
  assert.equal(controller.state, "ready");
  assert.deepEqual(states, ["starting", "playing", "ready"]);
});

test("rapid room cues while play is pending make one request", async () => {
  const { video, controller } = roomSetup();
  let resolve;
  video.result = new Promise(done => { resolve = done; });
  const pending = controller.advance();
  await Promise.all(Array.from({ length: 20 }, () => controller.advance()));
  assert.equal(video.calls, 1);
  assert.equal(controller.state, "starting");
  resolve();
  assert.equal(await pending, true);
  assert.equal(controller.state, "playing");
});

test("room cues during and after playback never restart the clip or start narration", async () => {
  const { video, controller } = roomSetup();
  const { audio, controller: narration } = setup();
  await controller.advance();
  assert.equal(await controller.advance(), false);
  video.end(); video.end();
  assert.equal(await controller.advance(), false);
  assert.equal(controller.state, "ready");
  assert.equal(video.calls, 1);
  assert.equal(audio.calls, 0);
  assert.equal(narration.deadline, null);
});

test("blocked video playback restores the dark room and permits retry", async () => {
  const { video, controller, errors } = roomSetup();
  video.result = Promise.reject(new Error("NotAllowedError"));
  assert.equal(await controller.advance(), false);
  assert.equal(controller.state, "dark");
  assert.equal(video.paused, true);
  assert.equal(errors.length, 1);
  video.result = Promise.resolve();
  assert.equal(await controller.advance(), true);
  assert.equal(video.calls, 2);
});

test("video errors cancel pending starts without a false ready state", async () => {
  const { video, controller, errors } = roomSetup();
  let resolve;
  video.result = new Promise(done => { resolve = done; });
  const pending = controller.advance();
  video.dispatchEvent(new Event("error")); resolve();
  assert.equal(await pending, false);
  assert.equal(controller.state, "dark");
  assert.equal(errors.length, 1);
  video.result = Promise.resolve();
  assert.equal(await controller.advance(), true);
});

test("immediate video end stays ready even if play settles or fails later", async () => {
  for (const rejected of [false, true]) {
    const { video, controller, errors } = roomSetup();
    let resolve, reject;
    video.result = new Promise((yes, no) => { resolve = yes; reject = no; });
    const pending = controller.advance();
    video.end();
    if (rejected) reject(new Error("Late playback failure")); else resolve();
    await pending;
    video.dispatchEvent(new Event("error"));
    assert.equal(controller.state, "ready");
    assert.equal(errors.length, 0);
  }
});

test("destroy removes video listeners and invalidates pending starts", async () => {
  const { video, controller, states, errors } = roomSetup();
  let resolve;
  video.result = new Promise(done => { resolve = done; });
  const pending = controller.advance();
  controller.destroy(); resolve(); await pending;
  video.end(); video.dispatchEvent(new Event("error"));
  assert.deepEqual(states, ["starting"]);
  assert.equal(errors.length, 0);
});

function click(target, options = {}) {
  const event = new Event("click");
  Object.assign(event, { button: 0, detail: 1, ...options });
  target.dispatchEvent(event);
}

test("a primary click or touch-generated click advances and unbind removes it", () => {
  const target = new EventTarget(); let calls = 0;
  const unbind = bindAdvanceClick(target, () => ++calls);
  click(target); click(target, { pointerType: "touch" });
  assert.equal(calls, 2);
  unbind(); click(target);
  assert.equal(calls, 2);
});

test("right, middle, double-click followups and modifier clicks do not advance", () => {
  const target = new EventTarget(); let calls = 0;
  bindAdvanceClick(target, () => ++calls);
  for (const options of [{button:1},{button:2},{detail:2},{detail:3},
    {ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true}]) click(target, options);
  assert.equal(calls, 0);
});

test("waits for a genuine key cue and media end before starting the clock", async () => {
  const { audio, controller, states, setTime } = setup();
  assert.equal(audio.calls, 0);
  assert.equal(controller.state, "ready");
  assert.equal(controller.deadline, null);
  await controller.advance();
  assert.equal(audio.calls, 1);
  assert.equal(controller.state, "narration");
  setTime(24000);
  assert.equal(controller.getRemainingMs(), 900000);
  assert.equal(controller.deadline, null);
  audio.end();
  assert.equal(controller.state, "countdown");
  assert.equal(controller.getRemainingMs(), 900000);
  assert.deepEqual(states, ["starting", "narration", "countdown"]);
});

test("rapid presses during a pending play request produce only one play", async () => {
  const { audio, controller } = setup();
  let resolve;
  audio.result = new Promise(done => { resolve = done; });
  const first = controller.advance();
  await Promise.all(Array.from({ length: 20 }, () => controller.advance()));
  assert.equal(audio.calls, 1);
  assert.equal(controller.state, "starting");
  resolve();
  assert.equal(await first, true);
  assert.equal(controller.state, "narration");
});

test("presses during narration and countdown cannot replay or restart", async () => {
  const { audio, controller, setTime } = setup();
  await controller.advance();
  await controller.advance();
  assert.equal(audio.calls, 1);
  audio.end();
  const deadline = controller.deadline;
  setTime(2100);
  await controller.advance();
  assert.equal(controller.deadline, deadline);
  assert.equal(controller.getRemainingMs(), 898000);
  assert.equal(audio.calls, 1);
});

test("duplicate ended events and premature ended events cannot restart the clock", async () => {
  const { audio, controller, setTime } = setup();
  audio.dispatchEvent(new Event("ended"));
  assert.equal(controller.state, "ready");
  await controller.advance();
  audio.dispatchEvent(new Event("ended"));
  assert.equal(controller.state, "narration");
  audio.end();
  const deadline = controller.deadline;
  setTime(10100); audio.end();
  assert.equal(controller.deadline, deadline);
  assert.equal(controller.getRemainingMs(), 890000);
});

test("absolute deadline survives skipped frames and ends exactly at zero", async () => {
  const { audio, controller, setTime, states } = setup();
  await controller.advance(); audio.end();
  setTime(300100); assert.equal(controller.getRemainingMs(), 600000);
  setTime(900100); assert.equal(controller.getRemainingMs(), 0);
  assert.equal(controller.state, "finished");
  setTime(950100); assert.equal(controller.getRemainingMs(), 0);
  await controller.advance();
  assert.equal(audio.calls, 1);
  assert.equal(states.filter(s => s === "finished").length, 1);
});

test("blocked playback returns to ready without showing a fake countdown", async () => {
  const { audio, controller, errors } = setup();
  audio.result = Promise.reject(new Error("NotAllowedError"));
  assert.equal(await controller.advance(), false);
  assert.equal(controller.state, "ready");
  assert.equal(controller.deadline, null);
  assert.equal(errors.length, 1);
  audio.result = Promise.resolve();
  assert.equal(await controller.advance(), true);
  assert.equal(audio.calls, 2);
});

test("a media error cancels a pending start and permits a later retry", async () => {
  const { audio, controller, errors } = setup();
  let resolve;
  audio.result = new Promise(done => { resolve = done; });
  const pending = controller.advance();
  audio.dispatchEvent(new Event("error"));
  resolve();
  assert.equal(await pending, false);
  assert.equal(controller.state, "ready");
  assert.equal(controller.deadline, null);
  assert.equal(errors.length, 1);
  audio.result = Promise.resolve();
  assert.equal(await controller.advance(), true);
});

test("ending immediately while play is resolving keeps the countdown", async () => {
  const { audio, controller } = setup();
  let resolve;
  audio.result = new Promise(done => { resolve = done; });
  const pending = controller.advance();
  audio.end(); resolve(); await pending;
  assert.equal(controller.state, "countdown");
  assert.equal(controller.getRemainingMs(), 900000);
});

test("late media errors cannot reset a countdown that already began", async () => {
  const { audio, controller, setTime } = setup();
  await controller.advance(); audio.end(); setTime(10100);
  audio.dispatchEvent(new Event("error"));
  assert.equal(controller.state, "countdown");
  assert.equal(controller.getRemainingMs(), 890000);
});

test("clock formatting respects second boundaries, fifteen minutes and zero", () => {
  for (const [ms, expected] of [[900000,"15:00"],[899999,"15:00"],[899000,"14:59"],
    [60000,"01:00"],[59999,"01:00"],[1000,"00:01"],[1,"00:01"],[0,"00:00"],[-1,"00:00"]]) {
    assert.equal(formatTime(ms), expected);
  }
});

function key(target, type, options = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { code: "Space", key: " ", repeat: false, ...options });
  target.dispatchEvent(event);
  return event;
}
test("holding Space and synthetic duplicate keydowns advance just once", () => {
  const target = new EventTarget(); let calls = 0;
  const unbind = bindAdvanceKey(target, () => ++calls);
  assert.equal(key(target, "keydown").defaultPrevented, true);
  key(target, "keydown", { repeat: true }); key(target, "keydown");
  assert.equal(calls, 1);
  key(target, "keyup"); key(target, "keydown"); assert.equal(calls, 2);
  target.dispatchEvent(new Event("blur")); key(target, "keydown"); assert.equal(calls, 3);
  unbind(); key(target, "keyup"); key(target, "keydown"); assert.equal(calls, 3);
});

function cueSetup(withEffect = false) {
  const video = new FakeAudio(), audio = new FakeAudio();
  const effect = withEffect ? new FakeAudio() : null;
  const cues = [], media = [], errors = [], completions = [];
  let time = 0;
  const stage = new StageCueController({ video, audio, effect, now: () => time,
    onCue: value => cues.push(value),
    onMediaState: (kind, value) => media.push([kind, value]),
    onNarrationEnd: () => completions.push(time),
    onError: (kind, error) => errors.push([kind, error.message]) });
  return { stage, video, audio, effect, cues, media, errors, completions,
    tick: ms => { time += ms; },
    async welcome() {
      await stage.advance(); video.end(); time += 1000;
      await stage.advance(); time += 1000;
      await stage.advance(); time += 2000;
    }
  };
}

test("opening cues play welcome before kick; only the genuine voice end starts the deadline", async () => {
  const c = cueSetup();
  await c.welcome();
  assert.equal(c.stage.state, "welcome");
  assert.equal(c.audio.calls, 1);
  c.tick(10000);
  assert.equal(await c.stage.advance(), false);
  assert.equal(c.stage.opening.deadline, null);
  c.audio.dispatchEvent(new Event("ended"));
  assert.equal(c.stage.opening.state, "narration");
  assert.equal(await c.stage.advance(), false);
  c.audio.end(); const deadline = c.stage.opening.deadline;
  assert.equal(c.stage.state, "welcome");
  assert.equal(c.stage.opening.getRemainingMs(), 900000);
  assert.equal(await c.stage.advance(), false); // Wait for automatic shrink.
  c.tick(1100); await c.stage.advance();
  assert.equal(c.stage.state, "door-kick");
  assert.equal(c.stage.effectState, "missing");
  c.tick(200); await c.stage.advance(); assert.equal(c.stage.state, "clock");
  c.tick(1300); await c.stage.advance(); assert.equal(c.stage.state, "card");
  c.tick(500); await c.stage.advance(); assert.equal(c.stage.state, "card-hidden");
  c.tick(500); await c.stage.advance(); assert.equal(c.stage.state, "blackout");
  c.tick(2000); assert.equal(await c.stage.advance(), false);
  assert.equal(c.stage.opening.deadline, deadline);
  assert.equal(c.audio.calls, 1); assert.equal(c.video.calls, 1);
  assert.deepEqual(c.cues, ["room-reveal","bright","ai","welcome","door-kick","clock","card","card-hidden","blackout"]);
});

test("speech completion shrinks automatically without consuming the operator's kick cue", async () => {
  const c = cueSetup(); await c.welcome();
  c.audio.end(); const deadline = c.stage.opening.deadline;
  c.audio.end(); assert.equal(c.completions.length, 1);
  assert.equal(c.stage.state, "welcome");
  c.tick(1100); await c.stage.advance(); assert.equal(c.stage.state, "door-kick");
  assert.equal(c.stage.opening.deadline, deadline);
});

test("animation presses are ignored rather than queued into later cues", async () => {
  const c = cueSetup();
  await c.stage.advance(); c.video.end(); c.tick(300);
  await c.stage.advance();
  await Promise.all(Array.from({length:20}, () => c.stage.advance()));
  assert.equal(c.stage.state, "ai");
  c.tick(1000); assert.equal(c.stage.state, "ai");
  assert.equal(c.audio.calls, 0);
  await c.stage.advance(); c.tick(200); await c.stage.advance();
  assert.equal(await c.stage.advance(), false);
  c.tick(2000); assert.equal(c.stage.state, "welcome");
});

test("a supplied door effect follows speech once and gates the clock until its actual end", async () => {
  const c = cueSetup(true);
  await c.welcome(); c.audio.end(); c.tick(1100);
  let resolve;
  c.effect.result = new Promise(done => { resolve = done; });
  const pending = c.stage.advance();
  assert.equal(c.stage.effectState, "starting");
  assert.equal(await c.stage.advance(), false);
  resolve(); await pending;
  assert.equal(c.stage.effectState, "playing");
  c.tick(5000); assert.equal(await c.stage.advance(), false);
  c.effect.dispatchEvent(new Event("ended"));
  assert.equal(c.stage.effectState, "playing");
  c.effect.end(); assert.equal(c.stage.effectState, "finished");
  assert.equal(c.audio.calls, 1);
  await c.stage.advance();
  assert.equal(c.stage.state, "clock");
  assert.equal(c.effect.calls, 1); assert.equal(c.audio.calls, 1);
});

test("blocked door audio retries its own cue, without replaying narration or resetting the deadline", async () => {
  const c = cueSetup(true);
  await c.welcome(); c.audio.end(); c.tick(1100);
  const deadline = c.stage.opening.deadline;
  c.effect.result = Promise.reject(new Error("NotAllowedError"));
  assert.equal(await c.stage.advance(), false);
  assert.equal(c.stage.state, "door-kick"); assert.equal(c.stage.effectState, "error");
  assert.equal(c.audio.calls, 1);
  c.effect.result = Promise.resolve(); await c.stage.advance();
  assert.equal(c.effect.calls, 2); assert.equal(c.audio.calls, 1);
  c.effect.end(); await c.stage.advance(); assert.equal(c.audio.calls, 1);
  assert.equal(c.stage.state, "clock"); assert.equal(c.stage.opening.deadline, deadline);
});

test("a genuine effect end wins over a late play rejection and late media error", async () => {
  const c = cueSetup(true);
  await c.welcome(); c.audio.end(); c.tick(1100);
  let reject;
  c.effect.result = new Promise((_, no) => { reject = no; });
  const pending = c.stage.advance();
  c.effect.end(); reject(new Error("Late error")); await pending;
  c.effect.dispatchEvent(new Event("error"));
  assert.equal(c.stage.effectState, "finished");
  assert.equal(c.errors.length, 0);
  await c.stage.advance(); assert.equal(c.audio.calls, 1);
});

test("narration failure retries welcome before any door effect can play", async () => {
  const c = cueSetup(true);
  c.audio.result = Promise.reject(new Error("NotAllowedError"));
  await c.welcome();
  assert.equal(c.stage.state, "welcome");
  assert.equal(c.stage.opening.deadline, null);
  assert.equal(c.completions.length, 0);
  c.audio.result = Promise.resolve(); await c.stage.advance();
  assert.equal(c.stage.state, "welcome");
  assert.equal(c.effect.calls, 0); assert.equal(c.audio.calls, 2);
});

test("an audio error during welcome retains its retry cue and cannot play the kick", async () => {
  const c = cueSetup(); await c.welcome(); await c.stage.advance();
  assert.equal(c.stage.state, "welcome");
  c.audio.dispatchEvent(new Event("error"));
  assert.equal(c.stage.state, "welcome");
  assert.equal(c.stage.opening.deadline, null);
  await c.stage.advance();
  assert.equal(c.stage.state, "welcome");
  assert.equal(c.audio.calls, 2);
});

test("cards and complete blackout neither pause nor reset the audio-owned deadline", async () => {
  const c = cueSetup(); await c.welcome(); await c.stage.advance();
  c.audio.end(); const deadline = c.stage.opening.deadline;
  c.tick(1100); await c.stage.advance(); c.tick(200); await c.stage.advance();
  c.tick(1300); await c.stage.advance();
  assert.equal(c.stage.state, "card");
  c.tick(5000); await c.stage.advance();
  c.tick(5000); await c.stage.advance();
  assert.equal(c.stage.state, "blackout");
  assert.equal(c.stage.opening.getRemainingMs(), 887400);
  assert.equal(c.stage.opening.deadline, deadline);
  c.tick(900000); assert.equal(c.stage.opening.getRemainingMs(), 0);
  assert.equal(c.stage.opening.state, "finished");
  assert.equal(c.stage.state, "blackout");
  c.audio.dispatchEvent(new Event("error"));
  assert.equal(c.stage.state, "blackout");
});

test("a held key across narration completion cannot spill into the door cue", async () => {
  const c = cueSetup(); await c.welcome();
  const target = new EventTarget(), unbind = bindAdvanceKey(target, () => c.stage.advance());
  key(target, "keydown"); assert.equal(c.stage.state, "welcome");
  c.audio.end(); c.tick(2000);
  key(target, "keydown", {repeat:true}); key(target, "keydown");
  assert.equal(c.stage.state, "welcome");
  key(target, "keyup"); key(target, "keydown");
  assert.equal(c.stage.state, "door-kick");
  unbind();
});

test("destroy prevents pending media promises or later end events from advancing the show", async () => {
  const c = cueSetup(true);
  let resolve;
  c.video.result = new Promise(done => { resolve = done; });
  const pending = c.stage.advance();
  c.stage.destroy(); resolve(); await pending;
  c.video.end(); c.audio.end(); c.effect.end();
  assert.equal(c.stage.state, "room-reveal");
  assert.equal(c.completions.length, 0);
  c.tick(5000); assert.equal(await c.stage.advance(), false);
});

test("other keys, modifier shortcuts and IME input do not advance", () => {
  const target = new EventTarget(); let calls = 0;
  bindAdvanceKey(target, () => ++calls);
  for (const options of [{code:"Enter",key:"Enter"},{ctrlKey:true},{altKey:true},
    {metaKey:true},{shiftKey:true},{isComposing:true},{repeat:true}]) {
    key(target, "keydown", options); key(target, "keyup");
  }
  assert.equal(calls, 0);
});

test("destroy removes media listeners and invalidates pending starts", async () => {
  const { audio, controller } = setup();
  let resolve;
  audio.result = new Promise(done => { resolve = done; });
  const pending = controller.advance();
  controller.destroy(); resolve(); await pending; audio.end();
  assert.equal(controller.deadline, null);
});
