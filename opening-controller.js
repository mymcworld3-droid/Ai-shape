(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.StageOpening = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

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
      this.deadline = this.now() + this.durationMs;
      this.setState("countdown");
    }

    getRemainingMs() {
      if (this.state === "finished") return 0;
      if (this.state !== "countdown") return this.durationMs;
      // A deadline, rather than interval ticks, survives background-tab throttling.
      const remaining = Math.max(0, this.deadline - this.now());
      if (remaining === 0) this.setState("finished");
      return remaining;
    }

    fail(error) {
      if (["countdown", "finished"].includes(this.state)) return;
      ++this.run;
      this.deadline = null;
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

  function formatTime(ms) {
    const seconds = Math.ceil(Math.max(0, ms) / 1000);
    return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" +
      String(seconds % 60).padStart(2, "0");
  }

  function bindAdvanceKey(target, advance) {
    let held = false;
    const isSpace = event => event.code === "Space" || event.key === " ";
    const down = event => {
      if (!isSpace(event) || event.ctrlKey || event.altKey || event.metaKey ||
          event.shiftKey || event.isComposing) return;
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

  return { OpeningController, formatTime, bindAdvanceKey };
});
