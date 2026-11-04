(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ActOneMusic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Playback is driven by the 1-based, manually advanced script cue number,
  // never by elapsed wall time. Only one background audio element can play.
  function trackForStep(step, tracks) {
    return tracks.find(track => step >= track.from && step <= track.to) || null;
  }

  class Controller {
    constructor({ audio, tracks, onError = () => {} }) {
      this.audio = audio;
      this.tracks = tracks;
      this.onError = onError;
      this.current = null;
      this.run = 0;
    }

    setStep(step) {
      const track = trackForStep(step, this.tracks);
      if (!track) {
        this.stop();
        return;
      }
      if (track === this.current) return;
      ++this.run;
      this.audio.pause();
      this.current = track;
      this.audio.src = track.src;
      this.audio.loop = track.loop !== false;
      this.audio.currentTime = 0;
      this.audio.load();
      this.play();
    }

    play() {
      const run = ++this.run;
      try {
        // Invoked directly from the operator's Start / next / previous gesture.
        Promise.resolve(this.audio.play()).catch(error => {
          if (run === this.run) this.onError(error);
        });
      } catch (error) {
        if (run === this.run) this.onError(error);
      }
    }

    stop() {
      ++this.run;
      if (!this.current) return;
      this.audio.pause();
      this.current = null;
      this.audio.removeAttribute("src");
      this.audio.load();
    }
  }

  return { Controller, trackForStep };
});
