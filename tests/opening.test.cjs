"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { OpeningController, formatTime, bindAdvanceKey } = require("../opening-controller.js");

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
