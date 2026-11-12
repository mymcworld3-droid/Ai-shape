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
      // Memory narration belongs to the following cue, never the light reveal.
      // Reset a stale/preloaded media position before entering the new room.
      const voice = this.media.memoryVoice;
      if (voice) {
        voice.pause();
        if (voice.currentTime !== 0) voice.currentTime = 0;
      }
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

  // Act III remains manually cued. No election/vote timer is started or shown;
  // voice completion alone gates the next deliberate stage input.
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
    getRemainingMs() { return null; }

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

  // Act IV remains actor-paced. The two original AI recordings play in
  // separate cues and cannot be skipped until they have really finished.
  class EndingSceneController {
    constructor({ complete = null, revealTruth = null, isReady = () => true,
      now = () => performance.now(), fadeMs = 1000, voiceSettleMs = 600,
      onCue = () => {}, onMediaState = () => {}, onLock = () => {}, onError = () => {} }) {
      Object.assign(this, { isReady, now, fadeMs, voiceSettleMs, onCue, onMediaState, onLock, onError });
      this.state = "waiting"; this.destroyed = false; this.busyUntil = 0;
      this.media = { endingComplete: complete, endingReveal: revealTruth };
      this.mediaStates = { endingComplete: "idle", endingReveal: "idle" };
      this.runs = { endingComplete: 0, endingReveal: 0 };
      this.listeners = [];
      for (const [kind, media] of Object.entries(this.media)) {
        if (!media) continue;
        const ended = () => this.finish(kind);
        const failed = () => this.fail(kind, new Error("Ending narration could not be played: " + kind));
        media.addEventListener("ended", ended); media.addEventListener("error", failed);
        this.listeners.push({ media, ended, failed });
      }
    }
    setCue(cue) { this.state = cue; this.onCue(cue); }
    setMediaState(kind, state) { this.mediaStates[kind] = state; this.onMediaState(kind, state); }
    lock(ms) { this.busyUntil = Math.max(this.busyUntil, this.now() + ms); this.onLock(ms); }
    enter() {
      if (this.destroyed || this.state !== "waiting" || !this.isReady()) return false;
      this.lock(this.fadeMs); this.setCue("ending-light"); return true;
    }
    async play(kind) {
      const media = this.media[kind];
      if (!media) { this.setMediaState(kind, "missing"); return true; }
      const run = ++this.runs[kind]; this.setMediaState(kind, "starting");
      try {
        if (media.error) media.load();
        media.currentTime = 0; await media.play();
        if (this.destroyed || run !== this.runs[kind] || this.mediaStates[kind] !== "starting") return false;
        this.setMediaState(kind, "playing"); return true;
      } catch (error) {
        if (run === this.runs[kind] && !this.destroyed) this.fail(kind, error);
        return false;
      }
    }
    finish(kind) {
      if (this.destroyed || !this.media[kind]?.ended ||
          !["starting", "playing"].includes(this.mediaStates[kind])) return;
      ++this.runs[kind]; this.lock(this.voiceSettleMs); this.setMediaState(kind, "finished");
    }
    fail(kind, error) {
      if (this.destroyed || this.mediaStates[kind] === "finished") return;
      ++this.runs[kind]; this.media[kind]?.pause();
      this.setMediaState(kind, "error"); this.onError(kind, error);
    }
    advance() {
      if (this.destroyed || this.now() < this.busyUntil) return false;
      const current = { "ending-complete": "endingComplete", "ending-reveal": "endingReveal" }[this.state];
      if (current) {
        if (["starting", "playing"].includes(this.mediaStates[current])) return false;
        if (this.mediaStates[current] === "error") return this.play(current);
      }
      switch (this.state) {
        case "ending-light": this.setCue("ending-dialogue"); return true;
        case "ending-dialogue": this.setCue("ending-complete"); return this.play("endingComplete");
        case "ending-complete": this.setCue("ending-question"); return true;
        case "ending-question": this.setCue("ending-reveal"); return this.play("endingReveal");
        case "ending-reveal": this.setCue("ending-blackout"); return true;
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

  // Scene cues include a dedicated memory-door effect between card and blackout.
  const STAGE_START_CUES = Object.freeze([
    "dark", "bright", "ai", "welcome", "clock", "door-kick", "card", "card-hidden", "door-open", "blackout",
    "memory-light", "memory-welcome", "memory-room", "memory-photo-front", "memory-photo-back", "memory-photo-hide", "memory-blackout",
    "past-intro", "past-isolate", "office-light", "office-bang", "past-reflection",
    "memory-return", "discussion", "vote-prompt", "vote-one",
    "vote-two", "vote-final", "vote-blackout",
    "ending-light", "ending-dialogue", "ending-complete", "ending-question",
    "ending-reveal", "ending-blackout", "behind-the-scenes",
    "credit-directed", "credit-conversation", "credit-produced",
    "credit-executive", "credit-backgrounds", "credit-title"
  ]);

  // Operator cues and media completion are separate. The clock may replace the
  // graphic during narration, while its deadline still belongs to audio.ended.
  class StageCueController {
    constructor({ video, audio, effect = null, doorOpen = null, selectionButton = null, now = () => performance.now(),
      durationMs = 900000, revealFadeMs = 240, aiFadeMs = 900,
      expandMs = 1600, morphMs = 1200, settleMs = 1000,
      cardFadeMs = 400, blackoutMs = 1200,
      onCue = () => {}, onMediaState = () => {},
      onNarrationEnd = () => {}, onError = () => {}, memoryScene = null, officeScene = null, votingScene = null, endingScene = null,
      onMemoryNarrationEnd = () => {}, capturePresentation = () => null,
      restorePresentation = () => {} }) {
      Object.assign(this, { now, effect, doorOpen, selectionButton, revealFadeMs, aiFadeMs, expandMs,
        morphMs, settleMs, cardFadeMs, blackoutMs, onCue, onMediaState,
        onNarrationEnd, onError, capturePresentation, restorePresentation });
      this.state = "dark";
      this.initialized = false;
      this.history = [];
      this.busyUntil = 0;
      this.effectState = "idle";
      this.effectRun = 0;
      this.doorOpenState = "idle";
      this.doorOpenRun = 0;
      this.selectionButtonState = "idle";
      this.selectionButtonRun = 0;
      this.destroyed = false;
      this.memory = memoryScene ? new MemorySceneController({ ...memoryScene, now, blackoutMs,
        onCue: state => this.setCue(state), onMediaState,
        onLock: ms => this.lock(ms), onVoiceEnd: onMemoryNarrationEnd, onError }) : null;
      this.office = officeScene ? new OfficeSceneController({ ...officeScene, now, blackoutMs,
        onCue: state => this.setCue(state), onMediaState, onLock: ms => this.lock(ms), onError }) : null;
      this.voting = votingScene ? new VotingSceneController({ ...votingScene, now, blackoutMs,
        onCue: state => {
          this.setCue(state);
          if (state === "vote-prompt") void this.playSelectionButton();
        }, onMediaState, onLock: ms => this.lock(ms), onError }) : null;
      this.ending = endingScene ? new EndingSceneController({ ...endingScene, now,
        onCue: state => this.setCue(state), onMediaState,
        onLock: ms => this.lock(ms), onError }) : null;
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
      this.doorOpenEnded = () => {
        if (doorOpen?.ended && ["starting", "playing"].includes(this.doorOpenState)) {
          ++this.doorOpenRun;
          this.setDoorOpenState("finished");
        }
      };
      this.doorOpenFailed = () => this.failDoorOpen(new Error("Memory door opening audio could not be played."));
      if (doorOpen) {
        doorOpen.addEventListener("ended", this.doorOpenEnded);
        doorOpen.addEventListener("error", this.doorOpenFailed);
      }
      this.selectionButtonEnded = () => {
        if (selectionButton?.ended && ["starting", "playing"].includes(this.selectionButtonState)) {
          ++this.selectionButtonRun;
          this.setSelectionButtonState("finished");
        }
      };
      this.selectionButtonFailed = () => this.failSelectionButton(new Error("Selection button audio could not be played."));
      if (selectionButton) {
        selectionButton.addEventListener("ended", this.selectionButtonEnded);
        selectionButton.addEventListener("error", this.selectionButtonFailed);
      }
    }

    setCue(state) { this.state = state; this.onCue(state); }
    setEffectState(state) { this.effectState = state; this.onMediaState("effect", state); }
    setDoorOpenState(state) { this.doorOpenState = state; this.onMediaState("doorOpen", state); }
    setSelectionButtonState(state) { this.selectionButtonState = state; this.onMediaState("selectionButton", state); }
    lock(ms) { this.busyUntil = Math.max(this.busyUntil, this.now() + ms); }

    // Begin rehearsal at an arbitrary cue without playing skipped video, voices or effects.
    // Skipped deadlines start fresh; the chosen cue's own media plays immediately.
    startAt(cue = STAGE_START_CUES[0]) {
      const index = STAGE_START_CUES.indexOf(cue);
      if (this.destroyed || this.initialized || this.state !== "dark" || this.history.length || index < 0) return false;
      this.initialized = true;
      if (cue === "dark") { this.setCue("dark"); return true; } // Step 0: blue room, silent.
      if (cue === "bright") return this.advance(); // Step 1: original room-reveal video.
      this.room.state = "ready";
      this.onMediaState("room", "ready");
      if (index >= STAGE_START_CUES.indexOf("clock")) {
        this.opening.state = "countdown";
        this.opening.deadline = this.now() + this.opening.durationMs;
        this.onMediaState("narration", "countdown");
      }
      if (index >= STAGE_START_CUES.indexOf("card")) this.setEffectState("finished");
      if (index >= STAGE_START_CUES.indexOf("blackout")) this.setDoorOpenState("finished");
      if (this.memory && index >= STAGE_START_CUES.indexOf("memory-light")) {
        this.memory.state = index <= STAGE_START_CUES.indexOf("memory-blackout") ? (cue.startsWith("memory-photo-") ? "memory-room" : cue) : "memory-blackout";
        if (index >= STAGE_START_CUES.indexOf("memory-welcome")) this.memory.setMediaState("memoryClick", "finished");
        if (index >= STAGE_START_CUES.indexOf("memory-room")) this.memory.setMediaState("memoryVoice", "finished");
      }
      if (this.office && index >= STAGE_START_CUES.indexOf("past-intro")) {
        this.office.state = index <= STAGE_START_CUES.indexOf("memory-return") ? cue : "memory-return";
        if (index >= STAGE_START_CUES.indexOf("past-reflection")) this.office.setBangState("finished");
      }
      if (index >= STAGE_START_CUES.indexOf("vote-one")) this.setSelectionButtonState("finished");
      if (this.voting && index >= STAGE_START_CUES.indexOf("discussion")) {
        this.voting.state = index >= STAGE_START_CUES.indexOf("ending-light") ? "vote-blackout" : cue;
        if (index >= STAGE_START_CUES.indexOf("vote-one")) this.voting.setMediaState("selectionPrompt", "finished");
        if (index >= STAGE_START_CUES.indexOf("vote-two")) this.voting.setMediaState("selectionOne", "finished");
        if (index >= STAGE_START_CUES.indexOf("vote-final")) this.voting.setMediaState("selectionTwo", "finished");
        if (index >= STAGE_START_CUES.indexOf("vote-blackout")) this.voting.setMediaState("selectionFinal", "finished");
      }
      if (this.ending && index >= STAGE_START_CUES.indexOf("ending-light")) {
        this.ending.state = cue;
        if (index >= STAGE_START_CUES.indexOf("ending-question")) this.ending.setMediaState("endingComplete", "finished");
        if (index >= STAGE_START_CUES.indexOf("ending-blackout")) this.ending.setMediaState("endingReveal", "finished");
      }
      this.setCue(cue);
      switch (cue) {
        case "welcome": return this.opening.advance();
        case "door-kick": return this.playEffect();
        case "door-open": return this.playDoorOpen();
        case "memory-light": return this.memory?.play("memoryClick") ?? false;
        case "memory-welcome": return this.memory?.play("memoryVoice") ?? false;
        case "office-bang": return this.office?.playBang() ?? false;
        case "vote-prompt":
          void this.playSelectionButton();
          return this.voting?.play("selectionPrompt") ?? false;
        case "vote-one": return this.voting?.play("selectionOne") ?? false;
        case "vote-two": return this.voting?.play("selectionTwo") ?? false;
        case "vote-final": return this.voting?.play("selectionFinal") ?? false;
        case "ending-complete": return this.ending?.play("endingComplete") ?? false;
        case "ending-reveal": return this.ending?.play("endingReveal") ?? false;
        default: return true;
      }
    }

    // Move directly between scene cues without running skipped effects.
    // Invalidate every media completion/pending promise before rebuilding
    // the target through the same path used by a fresh rehearsal start.
    seekTo(cue) {
      if(this.destroyed||!this.initialized||!STAGE_START_CUES.includes(cue))return false;
      if(cue===this.state||cue==="bright"&&this.state==="room-reveal")return true;
      ++this.room.run; ++this.opening.run;
      ++this.effectRun; ++this.doorOpenRun; ++this.selectionButtonRun;
      for(const media of [this.room.video,this.opening.audio,this.effect,this.doorOpen,this.selectionButton])
       media?.pause();
      for(const scene of [this.memory,this.voting,this.ending]){
       if(!scene)continue;
       for(const kind of Object.keys(scene.runs))++scene.runs[kind];
       for(const media of Object.values(scene.media))media?.pause();
       for(const kind of Object.keys(scene.mediaStates))scene.mediaStates[kind]="idle";
       scene.state="waiting";scene.busyUntil=0;
      }
      if(this.office){
       ++this.office.run;
       this.office.bang?.pause();
       this.office.bangState="idle";
       this.office.state="waiting";this.office.busyUntil=0;
      }
      this.room.state="dark";
      this.opening.state="ready";this.opening.deadline=null;
      this.effectState="idle";this.doorOpenState="idle";this.selectionButtonState="idle";
      this.state="dark";this.initialized=false;this.busyUntil=0;this.history=[];
      return this.startAt(cue);
    }

    checkpoint() {
      return {
        state: this.state, room: this.room.state, opening: this.opening.state,
        effect: this.effectState, doorOpen: this.doorOpenState,
        selectionButton: this.selectionButtonState,
        memory: this.memory && { state: this.memory.state, mediaStates: { ...this.memory.mediaStates } },
        office: this.office && { state: this.office.state, bangState: this.office.bangState },
        voting: this.voting && { state: this.voting.state, mediaStates: { ...this.voting.mediaStates } },
        ending: this.ending && { state: this.ending.state, mediaStates: { ...this.ending.mediaStates } },
        presentation: this.capturePresentation()
      };
    }

    previous() {
      if (this.destroyed || !this.history.length) return false;
      const saved = this.history.pop();
      // Cancel pending play promises before pausing, so late completions cannot
      // restore a departed cue. Rewinding keeps the opening deadline unchanged.
      ++this.room.run; ++this.opening.run; ++this.effectRun; ++this.doorOpenRun; ++this.selectionButtonRun;
      this.room.state = "dark"; this.opening.state = "ready"; this.effectState = "idle"; this.doorOpenState = "idle";
      this.selectionButtonState = "idle";
      const media = [this.room.video, this.opening.audio, this.effect, this.doorOpen, this.selectionButton];
      for (const scene of [this.memory, this.voting, this.ending]) {
        if (!scene) continue;
        for (const kind of Object.keys(scene.runs)) ++scene.runs[kind];
        media.push(...Object.values(scene.media));
        scene.busyUntil = 0;
      }
      if (this.office) { ++this.office.run; this.office.busyUntil = 0; media.push(this.office.bang); }
      for (const item of media) item?.pause();
      this.busyUntil = 0;
      this.room.state = saved.room;
      this.opening.state = ["starting", "narration"].includes(saved.opening) ? "ready" : saved.opening;
      this.setEffectState(saved.effect);
      this.setDoorOpenState(saved.doorOpen);
      this.setSelectionButtonState(saved.selectionButton);
      this.onMediaState("room", saved.room);
      this.onMediaState("narration", this.opening.state);
      for (const [scene, snapshot] of [[this.memory, saved.memory], [this.voting, saved.voting], [this.ending, saved.ending]]) {
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

    async playDoorOpen() {
      if (!this.doorOpen) { this.setDoorOpenState("missing"); this.lock(150); return true; }
      const run = ++this.doorOpenRun;
      this.setDoorOpenState("starting");
      try {
        if (this.doorOpen.error) this.doorOpen.load();
        this.doorOpen.currentTime = 0;
        await this.doorOpen.play();
        if (this.destroyed || run !== this.doorOpenRun || this.doorOpenState !== "starting") return false;
        this.setDoorOpenState("playing");
        return true;
      } catch (error) {
        if (run === this.doorOpenRun && !this.destroyed) this.failDoorOpen(error);
        return false;
      }
    }

    failDoorOpen(error) {
      if (this.doorOpenState === "finished" || this.destroyed) return;
      ++this.doorOpenRun;
      this.doorOpen?.pause();
      this.setDoorOpenState("error");
      this.onError("doorOpen", error);
    }

    // The actor's button click plays alongside the AI prompt. It never delays
    // the prompt, starts a timer, or consumes another operator step.
    async playSelectionButton() {
      if (!this.selectionButton) { this.setSelectionButtonState("missing"); return false; }
      const run = ++this.selectionButtonRun;
      this.setSelectionButtonState("starting");
      try {
        if (this.selectionButton.error) this.selectionButton.load();
        this.selectionButton.currentTime = 0;
        await this.selectionButton.play();
        if (this.destroyed || run !== this.selectionButtonRun || this.selectionButtonState !== "starting") return false;
        this.setSelectionButtonState("playing");
        return true;
      } catch (error) {
        if (run === this.selectionButtonRun && !this.destroyed) this.failSelectionButton(error);
        return false;
      }
    }

    failSelectionButton(error) {
      if (this.selectionButtonState === "finished" || this.destroyed) return;
      ++this.selectionButtonRun;
      this.selectionButton?.pause();
      this.setSelectionButtonState("error");
      this.onError("selectionButton", error);
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
          if (!["narration", "countdown", "finished"].includes(this.opening.state)) return false;
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
          this.setCue("door-open"); return this.playDoorOpen();
        case "door-open":
          if (["starting", "playing"].includes(this.doorOpenState)) return false;
          if (this.doorOpenState === "error") return this.playDoorOpen();
          this.lock(this.blackoutMs); this.setCue("blackout"); return true;
        case "blackout": return this.memory ? this.memory.enter() : false;
        case "memory-light":
        case "memory-welcome": return this.memory ? this.memory.advance() : false;
        // The photo sequence begins only AFTER the memory-room AI voice ends
        // and the operator deliberately advances into the unobstructed room.
        case "memory-room": this.setCue("memory-photo-front"); return true;
        case "memory-photo-front": this.setCue("memory-photo-back"); return true;
        case "memory-photo-back": this.setCue("memory-photo-hide"); return true;
        case "memory-photo-hide": return this.memory ? this.memory.advance() : false;
        case "memory-blackout": return this.office ? this.office.enter() : false;
        case "past-intro":
        case "past-isolate":
        case "office-light":
        case "office-bang":
        case "past-reflection": return this.office ? this.office.advance() : false;
        case "memory-return": return this.voting ? this.voting.enter() : false;
        case "discussion":
        case "vote-prompt":
        case "vote-one":
        case "vote-two":
        case "vote-final": return this.voting ? this.voting.advance() : false;
        case "vote-blackout": return this.ending ? this.ending.enter() : false;
        case "ending-light":
        case "ending-dialogue":
        case "ending-complete":
        case "ending-question":
        case "ending-reveal": return this.ending ? this.ending.advance() : false;
        // An additional operator input is required after final blackout.
        case "ending-blackout": this.setCue("behind-the-scenes"); return true;
        case "behind-the-scenes": this.setCue("credit-directed"); return true;
        case "credit-directed": this.setCue("credit-conversation"); return true;
        case "credit-conversation": this.setCue("credit-produced"); return true;
        case "credit-produced": this.setCue("credit-executive"); return true;
        case "credit-executive": this.setCue("credit-backgrounds"); return true;
        case "credit-backgrounds": this.setCue("credit-title"); return true;
        case "credit-title": return false;
        default: return false;
      }
    }

    destroy() {
      this.destroyed = true;
      ++this.effectRun; ++this.doorOpenRun; ++this.selectionButtonRun;
      this.selectionButton?.pause();
      this.room.destroy(); this.opening.destroy();
      this.memory?.destroy();
      this.office?.destroy();
      this.voting?.destroy();
      this.ending?.destroy();
      if (this.effect) {
        this.effect.removeEventListener("ended", this.effectEnded);
        this.effect.removeEventListener("error", this.effectFailed);
      }
      if (this.doorOpen) {
        this.doorOpen.removeEventListener("ended", this.doorOpenEnded);
        this.doorOpen.removeEventListener("error", this.doorOpenFailed);
      }
      if (this.selectionButton) {
        this.selectionButton.removeEventListener("ended", this.selectionButtonEnded);
        this.selectionButton.removeEventListener("error", this.selectionButtonFailed);
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

  function bindStageKeys(target, { start, next, previous, voiceUp, voiceDown,
    effectUp, effectDown, otherUp, otherDown, toggleVolumeDisplay, isStarted }) {
    const held = new Set();
    const actionFor = event => ({
      Space: "next", ArrowRight: "next", ArrowLeft: "previous",
      Digit1: "voiceUp", Numpad1: "voiceUp", KeyQ: "voiceDown",
      Digit2: "effectUp", Numpad2: "effectUp", KeyW: "effectDown",
      Digit3: "otherUp", Numpad3: "otherUp", KeyE: "otherDown",
      KeyO: "toggleVolumeDisplay", KeyF: "start"
    })[event.code] || ({
      " ": "next", ArrowRight: "next", ArrowLeft: "previous",
      "1": "voiceUp", q: "voiceDown", Q: "voiceDown",
      "2": "effectUp", w: "effectDown", W: "effectDown",
      "3": "otherUp", e: "otherDown", E: "otherDown",
      o: "toggleVolumeDisplay", O: "toggleVolumeDisplay", f: "start", F: "start"
    })[event.key];
    const actions = { start, next, previous, voiceUp, voiceDown, effectUp, effectDown, otherUp,
      otherDown, toggleVolumeDisplay };
    const volumeActions = new Set(["voiceUp", "voiceDown", "effectUp", "effectDown", "otherUp", "otherDown"]);
    const down = event => {
      const action = actionFor(event), element = event.target;
      if (!action || event.ctrlKey || event.altKey || event.metaKey || event.isComposing ||
          event.shiftKey || element?.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(element?.tagName)) return;
      if ((action === "next" || action === "previous") && !isStarted()) return;
      if (action === "start" && isStarted()) return;
      event.preventDefault();
      // Holding a volume key continuously adjusts only its own audio channel.
      if (volumeActions.has(action)) { actions[action]?.(); return; }
      if (event.repeat || held.size) return;
      held.add(event.code || event.key);
      actions[action]?.();
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

  return { STAGE_START_CUES, RoomRevealController, OpeningController, MemorySceneController, OfficeSceneController, VotingSceneController, StageCueController, StartGate, formatTime, bindAdvanceKey, bindStageKeys, adjustVolume, bindAdvanceClick };
});
