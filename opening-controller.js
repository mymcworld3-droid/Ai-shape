(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.StageOpening = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  class RoomRevealController {
    constructor({ video, onStateChange = () => {}, onError = () => {} }) {
      this.video = video;
      this.onStateChange = onStateChange;
      this.onError = onError;
      this.state = "dark";
      this.run = 0;
      this.ended = () => this.finish();
      this.failed = () => this.fail(new Error("Room transition video could not be played."));
      video.addEventListener("ended", this.ended);
      video.addEventListener("error", this.failed);
    }

    setState(state) {
      this.state = state;
      this.onStateChange(state);
    }

    async advance() {
      if (this.state !== "dark") return false;
      const run = ++this.run;
      this.setState("starting");
      try {
        if (this.video.error) this.video.load();
        this.video.currentTime = 0;
        // Play stays inside the genuine click/key event, before fullscreen.
        await this.video.play();
        if (run !== this.run || this.state !== "starting") return false;
        this.setState("playing");
        return true;
      } catch (error) {
        if (run === this.run) this.fail(error);
        return false;
      }
    }

    finish() {
      if (!this.video.ended || !["starting", "playing"].includes(this.state)) return;
      ++this.run;
      // This cue reveals the room only. Narration needs a separate user cue.
      this.setState("ready");
    }

    fail(error) {
      if (this.state === "ready") return;
      ++this.run;
      this.video.pause();
      this.setState("dark");
      this.onError(error);
    }

    destroy() {
      ++this.run;
      this.video.removeEventListener("ended", this.ended);
      this.video.removeEventListener("error", this.failed);
    }
  }

  class OpeningController {
    constructor({ audio, now = () => performance.now(), durationMs = 900000,
      onStateChange = () => {}, onError = () => {} }) {
      this.audio = audio;
      this.now = now;
      this.durationMs = durationMs;
      this.onStateChange = onStateChange;
      this.onError = onError;
      this.state = "ready";
      this.deadline = null;
      this.run = 0;
      this.ended = () => this.finishNarration();
      this.failed = () => this.fail(new Error("Opening audio could not be played."));
      audio.addEventListener("ended", this.ended);
      audio.addEventListener("error", this.failed);
    }

    setState(state) {
      this.state = state;
      this.onStateChange(state);
    }

    async advance() {
      // The opening is one cue. Extra presses cannot replay it or reset its clock.
      if (this.state !== "ready") return false;
      const run = ++this.run;
      this.setState("starting");
      try {
        if (this.audio.error) this.audio.load();
        this.audio.currentTime = 0;
        // Invoke play synchronously inside the key event to retain user activation.
        await this.audio.play();
        if (run !== this.run || this.state !== "starting") return false;
        this.setState("narration");
        return true;
      } catch (error) {
        if (run === this.run) this.fail(error);
        return false;
      }
    }

    finishNarration() {
      if (!this.audio.ended || !["starting", "narration"].includes(this.state)) return;
      ++this.run;
      if (this.deadline === null) this.deadline = this.now() + this.durationMs;
      this.setState("countdown");
    }

    getRemainingMs() {
      if (this.deadline === null) return this.durationMs;
      // A deadline, rather than interval ticks, survives background-tab throttling.
      const remaining = Math.max(0, this.deadline - this.now());
      if (remaining === 0 && this.state === "countdown") this.setState("finished");
      return remaining;
    }

    fail(error) {
      if (!["starting", "narration"].includes(this.state)) return;
      ++this.run;
      this.audio.pause();
      this.setState("ready");
      this.onError(error);
    }

    destroy() {
      ++this.run;
      this.audio.removeEventListener("ended", this.ended);
      this.audio.removeEventListener("error", this.failed);
    }
  }

  // This scene has its own media runs. Its welcome must never touch the
  // opening narration or the fifteen-minute deadline owned by that narration.
  class MemorySceneController {
    constructor({ voice = null, click = null, isReady = () => true,
      now = () => performance.now(), fadeMs = 1000, aiFadeMs = 600,
      voiceExpandMs = aiFadeMs,
      blackoutMs = 1200, onCue = () => {}, onMediaState = () => {},
      onLock = () => {}, onVoiceEnd = () => {}, onError = () => {} }) {
      Object.assign(this, { isReady, now, fadeMs, aiFadeMs, voiceExpandMs, blackoutMs,
        onCue, onMediaState, onLock, onVoiceEnd, onError });
      this.state = "waiting";
      this.busyUntil = 0;
      this.destroyed = false;
      this.media = { memoryVoice: voice, memoryClick: click };
      this.mediaStates = { memoryVoice: "idle", memoryClick: "idle" };
      this.runs = { memoryVoice: 0, memoryClick: 0 };
      this.listeners = [];
      for (const [kind, media] of Object.entries(this.media)) {
        if (!media) continue;
        const ended = () => this.finish(kind);
        const failed = () => this.fail(kind, new Error("Memory room audio could not be played."));
        media.addEventListener("ended", ended);
        media.addEventListener("error", failed);
        this.listeners.push({ media, ended, failed });
      }
    }

    setCue(state) { this.state = state; this.onCue(state); }
    setMediaState(kind, state) { this.mediaStates[kind] = state; this.onMediaState(kind, state); }
    lock(ms) { this.busyUntil = Math.max(this.busyUntil, this.now() + ms); this.onLock(ms); }

    async play(kind) {
      const media = this.media[kind];
      if (!media) { this.setMediaState(kind, "missing"); return true; }
      const run = ++this.runs[kind];
      this.setMediaState(kind, "starting");
      try {
        if (media.error) media.load();
        media.currentTime = 0;
        // Keep actual playback in the operator's click/key activation.
        await media.play();
        if (this.destroyed || run !== this.runs[kind] || this.mediaStates[kind] !== "starting") return false;
        if (kind === "memoryVoice") this.lock(this.voiceExpandMs);
        this.setMediaState(kind, "playing");
        return true;
      } catch (error) {
        if (!this.destroyed && run === this.runs[kind]) this.fail(kind, error);
        return false;
      }
    }

    finish(kind) {
      if (this.destroyed || !this.media[kind]?.ended ||
        !["starting", "playing"].includes(this.mediaStates[kind])) return;
      ++this.runs[kind];
      this.setMediaState(kind, "finished");
      if (kind === "memoryVoice") {
        this.lock(this.aiFadeMs);
        // Fade the AI automatically, but retain the next operator cue.
        this.onVoiceEnd();
      }
    }

    fail(kind, error) {
      if (this.destroyed || this.mediaStates[kind] === "finished") return;
      if (kind === "memoryVoice" && this.mediaStates[kind] === "playing") this.lock(this.aiFadeMs);
      ++this.runs[kind];
      this.media[kind]?.pause();
      this.setMediaState(kind, "error");
      this.onError(kind, error);
    }

    enter() {
      if (this.destroyed || this.state !== "waiting" || !this.isReady()) return false;
      this.lock(this.fadeMs);
      this.setCue("memory-light");
      return this.play("memoryClick");
    }

    advance() {
      if (this.destroyed || this.now() < this.busyUntil) return false;
      switch (this.state) {
        case "memory-light":
          if (["starting", "playing"].includes(this.mediaStates.memoryClick)) return false;
          if (this.mediaStates.memoryClick === "error") return this.play("memoryClick");
          this.lock(this.aiFadeMs); this.setCue("memory-welcome");
          return this.play("memoryVoice");
        case "memory-welcome":
          if (["starting", "playing"].includes(this.mediaStates.memoryVoice)) return false;
          if (this.mediaStates.memoryVoice === "error") return this.play("memoryVoice");
          this.lock(this.aiFadeMs); this.setCue("memory-room"); return true;
        case "memory-room":
          this.lock(this.blackoutMs); this.setCue("memory-blackout"); return true;
        default: return false;
      }
    }

    destroy() {
      this.destroyed = true;
      for (const kind of Object.keys(this.runs)) ++this.runs[kind];
      for (const { media, ended, failed } of this.listeners) {
        media.removeEventListener("ended", ended);
        media.removeEventListener("error", failed);
        media.pause();
      }
    }
  }

  // Act II remains actor-paced. Only the office BANG owns media; stage
  // spotlights are physical lighting cues, never drawn onto the projection.
  class OfficeSceneController {
    constructor({ bang = null, isReady = () => true, now = () => performance.now(),
      fadeMs = 1000, blackoutMs = 1200, onCue = () => {},
      onMediaState = () => {}, onLock = () => {}, onError = () => {} }) {
      Object.assign(this, { bang, isReady, now, fadeMs, blackoutMs,
        onCue, onMediaState, onLock, onError });
      this.state = "waiting";
      this.bangState = "idle";
      this.busyUntil = 0;
      this.run = 0;
      this.destroyed = false;
      this.ended = () => {
        if (this.destroyed || !bang?.ended || !["starting", "playing"].includes(this.bangState)) return;
        ++this.run;
        this.setBangState("finished");
      };
      this.failed = () => this.fail(new Error("Office entrance audio could not be played."));
      bang?.addEventListener("ended", this.ended);
      bang?.addEventListener("error", this.failed);
    }

    setCue(state) { this.state = state; this.onCue(state); }
    setBangState(state) { this.bangState = state; this.onMediaState("officeBang", state); }
    lock(ms) { this.busyUntil = Math.max(this.busyUntil, this.now() + ms); this.onLock(ms); }

    enter() {
      if (this.destroyed || this.state !== "waiting" || !this.isReady()) return false;
      this.lock(this.fadeMs); this.setCue("past-intro"); return true;
    }

    async playBang() {
      if (!this.bang) { this.setBangState("missing"); this.lock(150); return true; }
      const run = ++this.run;
      this.setBangState("starting");
      try {
        if (this.bang.error) this.bang.load();
        this.bang.currentTime = 0;
        await this.bang.play();
        if (this.destroyed || run !== this.run || this.bangState !== "starting") return false;
        this.setBangState("playing"); return true;
      } catch (error) {
        if (!this.destroyed && run === this.run) this.fail(error);
        return false;
      }
    }

    fail(error) {
      if (this.destroyed || this.bangState === "finished") return;
      ++this.run;
      this.bang?.pause(); this.setBangState("error"); this.onError("officeBang", error);
    }

    advance() {
      if (this.destroyed || this.now() < this.busyUntil) return false;
      switch (this.state) {
        case "past-intro":
          this.lock(this.blackoutMs); this.setCue("past-isolate"); return true;
        case "past-isolate":
          if (!this.isReady()) return false;
          this.lock(this.fadeMs); this.setCue("office-light"); return true;
        case "office-light":
          this.setCue("office-bang"); return this.playBang();
        case "office-bang":
          if (["starting", "playing"].includes(this.bangState)) return false;
          if (this.bangState === "error") return this.playBang();
          this.lock(this.blackoutMs); this.setCue("past-reflection"); return true;
        case "past-reflection":
          if (!this.isReady()) return false;
          this.lock(this.fadeMs); this.setCue("memory-return"); return true;
        default: return false;
      }
    }

    destroy() {
      this.destroyed = true; ++this.run;
      this.bang?.removeEventListener("ended", this.ended);
      this.bang?.removeEventListener("error", this.failed);
      this.bang?.pause();
    }
  }

  // Act III's one-minute selection deadline is separate from the opening
  // deadline. Voice completion never consumes an actor's next manual cue.
  class VotingSceneController {
    constructor({ prompt = null, one = null, two = null, final = null,
      isReady = () => true, now = () => performance.now(), durationMs = 60000,
      fadeMs = 600, blackoutMs = 1200, onCue = () => {},
      voiceExpandMs = fadeMs, voiceSettleMs = fadeMs,
      onMediaState = () => {}, onLock = () => {}, onError = () => {} }) {
      Object.assign(this, { isReady, now, durationMs, fadeMs, blackoutMs, voiceExpandMs, voiceSettleMs,
        onCue, onMediaState, onLock, onError });
      this.state = "waiting"; this.busyUntil = 0; this.deadline = null; this.destroyed = false;
      this.media = { selectionPrompt: prompt, selectionOne: one, selectionTwo: two, selectionFinal: final };
      this.mediaStates = {}; this.runs = {}; this.listeners = [];
      for (const [kind, media] of Object.entries(this.media)) {
        this.mediaStates[kind] = "idle"; this.runs[kind] = 0;
        if (!media) continue;
        const ended = () => this.finish(kind);
        const failed = () => this.fail(kind, new Error("Selection audio could not be played."));
        media.addEventListener("ended", ended); media.addEventListener("error", failed);
        this.listeners.push({ media, ended, failed });
      }
    }

    setCue(state) { this.state = state; this.onCue(state); }
    setMediaState(kind, state) { this.mediaStates[kind] = state; this.onMediaState(kind, state); }
    lock(ms) { this.busyUntil = Math.max(this.busyUntil, this.now() + ms); this.onLock(ms); }
    getRemainingMs() { return this.deadline === null ? this.durationMs : Math.max(0, this.deadline - this.now()); }

    enter() {
      if (this.destroyed || this.state !== "waiting" || !this.isReady()) return false;
      this.lock(this.fadeMs); this.setCue("discussion"); return true;
    }

    async play(kind) {
      const media = this.media[kind];
      if (!media) { this.setMediaState(kind, "missing"); return true; }
      const run = ++this.runs[kind]; this.setMediaState(kind, "starting");
      try {
        if (media.error) media.load();
        media.currentTime = 0; await media.play();
        if (this.destroyed || run !== this.runs[kind] || this.mediaStates[kind] !== "starting") return false;
        this.lock(this.voiceExpandMs);
        this.setMediaState(kind, "playing"); return true;
      } catch (error) {
        if (!this.destroyed && run === this.runs[kind]) this.fail(kind, error);
        return false;
      }
    }

    finish(kind) {
      if (this.destroyed || !this.media[kind]?.ended || !["starting", "playing"].includes(this.mediaStates[kind])) return;
      ++this.runs[kind]; this.lock(this.voiceSettleMs);
      if (kind === "selectionPrompt" && this.deadline === null) this.deadline = this.now() + this.durationMs;
      this.setMediaState(kind, "finished");
    }

    fail(kind, error) {
      if (this.destroyed || this.mediaStates[kind] === "finished") return;
      if (this.mediaStates[kind] === "playing") this.lock(this.voiceSettleMs);
      ++this.runs[kind]; this.media[kind]?.pause();
      this.setMediaState(kind, "error"); this.onError(kind, error);
    }

    advance() {
      if (this.destroyed || this.now() < this.busyUntil) return false;
      const current = { "vote-prompt": "selectionPrompt", "vote-one": "selectionOne",
        "vote-two": "selectionTwo", "vote-final": "selectionFinal" }[this.state];
      if (current) {
        if (["starting", "playing"].includes(this.mediaStates[current])) return false;
        if (this.mediaStates[current] === "error") return this.play(current);
      }
      switch (this.state) {
        case "discussion":
          this.lock(this.fadeMs); this.setCue("vote-prompt"); return this.play("selectionPrompt");
        case "vote-prompt":
          // Without a recording, this explicit operator cue starts the minute.
          // No synthetic ended event or guessed narration length is used.
          if (this.deadline === null && this.mediaStates.selectionPrompt === "missing") this.deadline = this.now() + this.durationMs;
          this.lock(this.fadeMs); this.setCue("vote-clock"); return true;
        case "vote-clock":
          this.lock(this.fadeMs); this.setCue("vote-one"); return this.play("selectionOne");
        case "vote-one":
          this.lock(this.fadeMs); this.setCue("vote-two"); return this.play("selectionTwo");
        case "vote-two":
          this.lock(this.fadeMs); this.setCue("vote-final"); return this.play("selectionFinal");
        case "vote-final":
          this.lock(this.blackoutMs); this.setCue("vote-blackout"); return true;
        default: return false;
      }
    }

    destroy() {
      this.destroyed = true;
      for (const kind of Object.keys(this.runs)) ++this.runs[kind];
      for (const { media, ended, failed } of this.listeners) {
        media.removeEventListener("ended", ended); media.removeEventListener("error", failed); media.pause();
      }
    }
  }

  // Operator cues and media completion are separate. The clock may replace the
  // graphic during narration, while its deadline still belongs to audio.ended.
  class StageCueController {
    constructor({ video, audio, effect = null, now = () => performance.now(),
      durationMs = 900000, revealFadeMs = 240, aiFadeMs = 900,
      expandMs = 1600, morphMs = 1200, settleMs = 1000,
      cardFadeMs = 400, blackoutMs = 1200,
      onCue = () => {}, onMediaState = () => {},
      onNarrationEnd = () => {}, onError = () => {}, memoryScene = null, officeScene = null, votingScene = null,
      onMemoryNarrationEnd = () => {}, capturePresentation = () => null,
      restorePresentation = () => {} }) {
      Object.assign(this, { now, effect, revealFadeMs, aiFadeMs, expandMs,
        morphMs, settleMs, cardFadeMs, blackoutMs, onCue, onMediaState,
        onNarrationEnd, onError, capturePresentation, restorePresentation });
      this.state = "dark";
      this.history = [];
      this.busyUntil = 0;
      this.effectState = "idle";
      this.effectRun = 0;
      this.destroyed = false;
      this.memory = memoryScene ? new MemorySceneController({ ...memoryScene, now, blackoutMs,
        onCue: state => this.setCue(state), onMediaState,
        onLock: ms => this.lock(ms), onVoiceEnd: onMemoryNarrationEnd, onError }) : null;
      this.office = officeScene ? new OfficeSceneController({ ...officeScene, now, blackoutMs,
        onCue: state => this.setCue(state), onMediaState, onLock: ms => this.lock(ms), onError }) : null;
      this.voting = votingScene ? new VotingSceneController({ ...votingScene, now, blackoutMs,
        onCue: state => this.setCue(state), onMediaState, onLock: ms => this.lock(ms), onError }) : null;
      this.room = new RoomRevealController({ video,
        onStateChange: state => {
          if (state === "starting") this.setCue("room-reveal");
          if (state === "ready") { this.lock(this.revealFadeMs); this.setCue("bright"); }
          if (state === "dark") { this.busyUntil = 0; this.setCue("dark"); }
          this.onMediaState("room", state);
        }, onError: error => this.onError("room", error) });
      this.opening = new OpeningController({ audio, now, durationMs,
        onStateChange: state => {
          if (state === "countdown") {
            this.lock(this.settleMs);
            this.onNarrationEnd();
          }
          if (state === "ready") { this.busyUntil = 0; this.setCue("welcome"); }
          this.onMediaState("narration", state);
        }, onError: error => this.onError("narration", error) });
      this.effectEnded = () => {
        if (this.effect.ended && ["starting", "playing"].includes(this.effectState)) {
          ++this.effectRun;
          this.setEffectState("finished");
        }
      };
      this.effectFailed = () => this.failEffect(new Error("Door kick audio could not be played."));
      if (effect) {
        effect.addEventListener("ended", this.effectEnded);
        effect.addEventListener("error", this.effectFailed);
      }
    }

    setCue(state) { this.state = state; this.onCue(state); }
    setEffectState(state) { this.effectState = state; this.onMediaState("effect", state); }
    lock(ms) { this.busyUntil = Math.max(this.busyUntil, this.now() + ms); }

    checkpoint() {
      return {
        state: this.state, room: this.room.state, opening: this.opening.state,
        effect: this.effectState,
        memory: this.memory && { state: this.memory.state, mediaStates: { ...this.memory.mediaStates } },
        office: this.office && { state: this.office.state, bangState: this.office.bangState },
        voting: this.voting && { state: this.voting.state, mediaStates: { ...this.voting.mediaStates } },
        presentation: this.capturePresentation()
      };
    }

    previous() {
      if (this.destroyed || !this.history.length) return false;
      const saved = this.history.pop();
      // Cancel pending play promises before pausing, so late completions cannot
      // restore a departed cue. A rewind never changes either timer deadline.
      ++this.room.run; ++this.opening.run; ++this.effectRun;
      this.room.state = "dark"; this.opening.state = "ready"; this.effectState = "idle";
      const media = [this.room.video, this.opening.audio, this.effect];
      for (const scene of [this.memory, this.voting]) {
        if (!scene) continue;
        for (const kind of Object.keys(scene.runs)) ++scene.runs[kind];
        media.push(...Object.values(scene.media));
        scene.busyUntil = 0;
      }
      if (this.office) { ++this.office.run; this.office.busyUntil = 0; media.push(this.office.bang); }
      for (const item of media) item?.pause();
      this.busyUntil = 0;
      this.room.state = saved.room;
      this.opening.state = saved.opening;
      this.setEffectState(saved.effect);
      this.onMediaState("room", saved.room);
      this.onMediaState("narration", saved.opening);
      for (const [scene, snapshot] of [[this.memory, saved.memory], [this.voting, saved.voting]]) {
        if (!scene || !snapshot) continue;
        scene.state = snapshot.state;
        for (const [kind, value] of Object.entries(snapshot.mediaStates)) scene.setMediaState(kind, value);
      }
      if (this.office && saved.office) {
        this.office.state = saved.office.state;
        this.office.setBangState(saved.office.bangState);
      }
      this.setCue(saved.state);
      this.restorePresentation(saved.presentation);
      return true;
    }

    advance() {
      if (this.destroyed || this.now() < this.busyUntil) return Promise.resolve(false);
      const saved = this.checkpoint();
      const result = this.advanceCue();
      // Video completion belongs to the first cue, not a second history entry.
      // A failed video retry must not accumulate duplicate dark checkpoints.
      if (this.state !== saved.state &&
          !(saved.state === "dark" && this.history.at(-1)?.state === "dark")) this.history.push(saved);
      return result;
    }

    async playEffect() {
      if (!this.effect) { this.setEffectState("missing"); this.lock(150); return true; }
      const run = ++this.effectRun;
      this.setEffectState("starting");
      try {
        if (this.effect.error) this.effect.load();
        this.effect.currentTime = 0;
        await this.effect.play();
        if (this.destroyed || run !== this.effectRun || this.effectState !== "starting") return false;
        this.setEffectState("playing");
        return true;
      } catch (error) {
        if (run === this.effectRun && !this.destroyed) this.failEffect(error);
        return false;
      }
    }

    failEffect(error) {
      if (this.effectState === "finished" || this.destroyed) return;
      ++this.effectRun;
      this.effect.pause();
      this.setEffectState("error");
      this.onError("effect", error);
    }

    async advanceCue() {
      if (this.destroyed || this.now() < this.busyUntil) return false;
      switch (this.state) {
        case "dark": return this.room.advance();
        case "bright":
          this.lock(this.aiFadeMs); this.setCue("ai"); return true;
        case "ai":
          this.lock(this.expandMs); this.setCue("welcome");
          return this.opening.advance();
        case "welcome":
          if (this.opening.state === "ready") {
            this.lock(this.expandMs); this.setCue("welcome");
            return this.opening.advance();
          }
          if (!["countdown", "finished"].includes(this.opening.state)) return false;
          this.lock(this.morphMs); this.setCue("clock"); return true;
        case "clock":
          if (!["countdown", "finished"].includes(this.opening.state)) return false;
          this.setCue("door-kick"); return this.playEffect();
        case "door-kick":
          if (["starting", "playing"].includes(this.effectState)) return false;
          if (this.effectState === "error") return this.playEffect();
          this.lock(this.cardFadeMs); this.setCue("card"); return true;
        case "card":
          this.lock(this.cardFadeMs); this.setCue("card-hidden"); return true;
        case "card-hidden":
          this.lock(this.blackoutMs); this.setCue("blackout"); return true;
        case "blackout": return this.memory ? this.memory.enter() : false;
        case "memory-light":
        case "memory-welcome":
        case "memory-room": return this.memory ? this.memory.advance() : false;
        case "memory-blackout": return this.office ? this.office.enter() : false;
        case "past-intro":
        case "past-isolate":
        case "office-light":
        case "office-bang":
        case "past-reflection": return this.office ? this.office.advance() : false;
        case "memory-return": return this.voting ? this.voting.enter() : false;
        case "discussion":
        case "vote-prompt":
        case "vote-clock":
        case "vote-one":
        case "vote-two":
        case "vote-final":
        case "vote-blackout": return this.voting ? this.voting.advance() : false;
        default: return false;
      }
    }

    destroy() {
      this.destroyed = true;
      ++this.effectRun;
      this.room.destroy(); this.opening.destroy();
      this.memory?.destroy();
      this.office?.destroy();
      this.voting?.destroy();
      if (this.effect) {
        this.effect.removeEventListener("ended", this.effectEnded);
        this.effect.removeEventListener("error", this.effectFailed);
      }
    }
  }

  function formatTime(ms) {
    const seconds = Math.ceil(Math.max(0, ms) / 1000);
    return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" +
      String(seconds % 60).padStart(2, "0");
  }

  class StartGate {
    constructor({ isReady, onStart }) {
      this.isReady = isReady;
      this.onStart = onStart;
      this.started = false;
    }
    start() {
      if (this.started || !this.isReady()) return false;
      this.started = true;
      // Stay synchronous so media play/fullscreen retain the button gesture.
      this.onStart();
      return true;
    }
  }

  function bindAdvanceKey(target, advance, { isEnabled = () => true } = {}) {
    let held = false;
    const isSpace = event => event.code === "Space" || event.key === " ";
    const down = event => {
      if (!isSpace(event) || event.ctrlKey || event.altKey || event.metaKey ||
          event.shiftKey || event.isComposing) return;
      // Preserve native Space activation on the Start button before the show.
      if (!isEnabled()) return;
      event.preventDefault();
      if (event.repeat || held) return;
      held = true;
      advance();
    };
    const up = event => { if (isSpace(event)) held = false; };
    const blur = () => { held = false; };
    target.addEventListener("keydown", down);
    target.addEventListener("keyup", up);
    target.addEventListener("blur", blur);
    return () => {
      target.removeEventListener("keydown", down);
      target.removeEventListener("keyup", up);
      target.removeEventListener("blur", blur);
    };
  }

  function bindStageKeys(target, { start, next, previous, volumeUp, volumeDown, isStarted }) {
    const held = new Set();
    const actionFor = event => ({ Space: "next", ArrowRight: "next", ArrowLeft: "previous",
      ArrowUp: "volumeUp", ArrowDown: "volumeDown", KeyF: "start" })[event.code] ||
      ({ " ": "next", ArrowRight: "next", ArrowLeft: "previous", ArrowUp: "volumeUp",
        ArrowDown: "volumeDown", f: "start", F: "start" })[event.key];
    const actions = { start, next, previous, volumeUp, volumeDown };
    const down = event => {
      const action = actionFor(event), element = event.target;
      if (!action || event.ctrlKey || event.altKey || event.metaKey || event.isComposing ||
          (event.shiftKey && action !== "start") || element?.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(element?.tagName)) return;
      if ((action === "next" || action === "previous") && !isStarted()) return;
      if (action === "start" && isStarted()) return;
      event.preventDefault();
      if (action === "volumeUp" || action === "volumeDown") { actions[action](); return; }
      if (event.repeat || held.size) return;
      held.add(event.code || event.key);
      actions[action]();
    };
    const up = event => held.delete(event.code || event.key);
    const blur = () => held.clear();
    target.addEventListener("keydown", down); target.addEventListener("keyup", up);
    target.addEventListener("blur", blur);
    return () => {
      target.removeEventListener("keydown", down); target.removeEventListener("keyup", up);
      target.removeEventListener("blur", blur);
    };
  }

  function adjustVolume(percent, delta) {
    return Math.max(0, Math.min(100, Math.round(percent + delta)));
  }

  function bindAdvanceClick(target, advance) {
    const click = event => {
      if (event.button !== 0 || event.detail > 1 || event.ctrlKey || event.altKey ||
          event.metaKey || event.shiftKey) return;
      advance();
    };
    target.addEventListener("click", click);
    return () => target.removeEventListener("click", click);
  }

  return { RoomRevealController, OpeningController, MemorySceneController, OfficeSceneController, VotingSceneController, StageCueController, StartGate, formatTime, bindAdvanceKey, bindStageKeys, adjustVolume, bindAdvanceClick };
});
