(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ActOneMusic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const clamp = value => Math.max(0, Math.min(1, value));
  const HALF_PI = Math.PI / 2;
  function trackForStep(step, tracks) {
    return tracks.find(track => step >= track.from && step <= track.to) || null;
  }

  // Two media elements allow a short overlap without cutting the outgoing song.
  // Gains are calculated from elapsed time, never a fixed frame count.
  class Controller {
    constructor({
      audio, alternateAudio, tracks, onError = () => {},
      onAudibleStart = () => {},
      fadeMs = 1400, fadeOutMs = 1100, masterVolume = .4,
      now = () => performance.now(),
      requestFrame = fn => requestAnimationFrame(fn),
      cancelFrame = id => cancelAnimationFrame(id),
      setTimer = (fn, ms) => setTimeout(fn, ms),
      clearTimer = id => clearTimeout(id)
    }) {
      if (!audio || !alternateAudio || audio === alternateAudio) {
        throw new Error("Two distinct background audio elements are required");
      }
      this.audio = audio;
      this.players = [audio, alternateAudio];
      this.tracks = tracks;
      this.onError = onError;
      this.onAudibleStart = onAudibleStart;
      this.fadeMs = fadeMs;
      this.fadeOutMs = fadeOutMs;
      this.masterVolume = clamp(masterVolume);
      this.now = now;
      this.requestFrame = requestFrame;
      this.cancelFrame = cancelFrame;
      this.setTimer = setTimer;
      this.clearTimer = clearTimer;
      this.pendingIntro = null;
      this.levels = new Map(this.players.map(player => [player, 0]));
      this.current = null;
      this.activeAudio = null;
      this.outgoingAudio = null;
      this.stoppingAudio = null;
      this.stopping = false;
      this.failed = false;
      this.run = 0;
      this.frame = null;
      this.players.forEach(player => { player.volume = 0; });
    }

    setMasterVolume(value) {
      this.masterVolume = clamp(value);
      for (const player of this.players) this.setLevel(player, this.levels.get(player) || 0);
    }

    setLevel(player, level) {
      if (!player) return;
      const gain = clamp(level);
      this.levels.set(player, gain);
      player.volume = clamp(this.masterVolume * gain);
    }

    cancelFade() {
      if (this.frame !== null) this.cancelFrame(this.frame);
      this.frame = null;
    }

    fade(outgoing, incoming, duration, onFinish = () => {}) {
      this.cancelFade();
      const began = this.now();
      const oldLevel = outgoing ? this.levels.get(outgoing) || 0 : 0;
      const newLevel = incoming ? this.levels.get(incoming) || 0 : 0;
      const tick = () => {
        const progress = duration <= 0 ? 1 : clamp((this.now() - began) / duration);
        if (outgoing) this.setLevel(outgoing, oldLevel * Math.cos(progress * HALF_PI));
        if (incoming) this.setLevel(incoming, newLevel + (1 - newLevel) * Math.sin(progress * HALF_PI));
        if (progress < 1) {
          this.frame = this.requestFrame(tick);
        } else {
          this.frame = null;
          if (outgoing) {
            outgoing.pause();
            this.setLevel(outgoing, 0);
          }
          onFinish();
        }
      };
      tick();
    }

    cancelIntro(){
      if(this.pendingIntro!==null)this.clearTimer(this.pendingIntro);
      this.pendingIntro=null;
    }

    clearPlayers() {
      this.cancelIntro();
      for (const player of this.players) {
        player.pause();
        this.setLevel(player, 0);
        player.removeAttribute("src");
        player.load();
      }
    }

    audiblePlayer() {
      // If the user advances again before the next file has buffered, keep the
      // song that is actually audible, not a silent pending player.
      return this.players.filter(player => !player.paused).reduce((best, player) => {
        return !best || (this.levels.get(player) || 0) > (this.levels.get(best) || 0)
          ? player : best;
      }, null);
    }

    // Optionally select a cue-specific track without duplicating players.
    // For a delayed cue, play() is invoked inside the operator's trusted
    // gesture with zero gain. The source is then rewound and faded in after
    // the one-second delay, so browser autoplay rules cannot suppress it.
    setStep(step,{track:override=null,delayMs=0}={}) {
      const track = override||trackForStep(step, this.tracks);
      if (!track) {
        // The pre-reveal black screen is strictly silent, even on rewind.
        this.stop({ immediate: step < this.tracks[0].from });
        return;
      }
      if (track === this.current) {
        if (this.failed) this.startPlayback(++this.run);
        return;
      }

      this.cancelIntro();
      this.cancelFade();
      ++this.run;
      const outgoing = this.audiblePlayer() || this.activeAudio || this.stoppingAudio;
      const incoming = this.players.find(player => player !== outgoing);
      incoming.pause(); // The inactive player may still contain an earlier fade tail.
      this.setLevel(incoming, 0);
      incoming.src = track.src;
      incoming.loop = track.loop !== false;
      incoming.currentTime = 0;
      incoming.load();
      this.current = track;
      this.activeAudio = incoming;
      this.outgoingAudio = outgoing;
      this.stoppingAudio = null;
      this.stopping = false;
      this.failed = false;
      this.startPlayback(this.run,delayMs);
    }

    startPlayback(run,delayMs=0) {
      const incoming = this.activeAudio;
      const outgoing = this.outgoingAudio;
      this.failed = false;
      const began=this.now();
      try {
        // play() runs inside the operator's gesture, inaudibly if delayed.
        // Starting the media for the first time inside a later timer callback
        // would be rejected by iOS Safari and other autoplay-blocking browsers.
        Promise.resolve(incoming.play()).then(() => {
          if (run !== this.run || incoming !== this.activeAudio) return;
          const startAudible=()=>{
            this.pendingIntro=null;
            if (run !== this.run || incoming !== this.activeAudio) return;
            // The delayed song must start at its actual beginning, not one
            // second into the file after its silent browser-unlock pre-roll.
            if(delayMs>0)incoming.currentTime=0;
            this.fade(outgoing, incoming, this.fadeMs, () => {
              if (run === this.run) this.outgoingAudio = null;
            });
            // Audio is now aligned at currentTime=0 and its fade has begun.
            // Client cue automation uses THIS moment rather than media.play()
            // (which happens silently before a delayed start).
            this.onAudibleStart(this.current,incoming);
          };
          const remaining=delayMs-(this.now()-began);
          if(remaining>0)this.pendingIntro=this.setTimer(startAudible,remaining);
          else startAudible();
        }).catch(error => this.playbackError(run, incoming, error));
      } catch (error) {
        this.playbackError(run, incoming, error);
      }
    }

    playbackError(run, incoming, error) {
      if (run !== this.run || incoming !== this.activeAudio) return;
      this.cancelIntro();
      incoming.pause();
      this.setLevel(incoming, 0);
      this.failed = true;
      this.onError(error);
      // Keep the old track at its existing level instead of a sudden silence.
      // A later manual cue retries the new track.
    }

    stop({ immediate = false } = {}) {
      this.cancelIntro();
      if (!immediate && this.stopping) return;
      if (!this.current && !this.activeAudio && !this.stoppingAudio && !this.stopping) return;
      ++this.run;
      this.cancelFade();
      const outgoing = this.audiblePlayer() || this.activeAudio || this.stoppingAudio || this.outgoingAudio;
      this.current = null;
      this.activeAudio = null;
      this.outgoingAudio = null;
      this.failed = false;
      if (immediate || !outgoing || outgoing.paused) {
        this.stopping = false;
        this.stoppingAudio = null;
        this.clearPlayers();
        return;
      }
      for (const player of this.players) if (player !== outgoing) {
        player.pause();
        this.setLevel(player, 0);
      }
      this.stopping = true;
      this.stoppingAudio = outgoing;
      const run = this.run;
      this.fade(outgoing, null, this.fadeOutMs, () => {
        if (run !== this.run) return;
        this.stopping = false;
        this.stoppingAudio = null;
        this.clearPlayers();
      });
    }
  }

  return { Controller, trackForStep };
});
