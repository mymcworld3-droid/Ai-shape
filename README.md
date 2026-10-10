# Human Verification Test #67 - opening

This branch prepares the opening projection for *The Button*.

## Run the opening

Open `index.html` in a desktop browser, or serve this folder with:

```sh
python -m http.server 8765
```

The waiting screen contains only the room background and the AI graphic inside
the pictured wall monitor. There are no buttons, sliders, file pickers, player
controls, status bars or fullscreen overlays.

Press **Space once** at the opening AI cue. That one press:

1. Starts the bundled English narration and requests fullscreen.
2. Expands the audio-reactive AI graphic while the room fades to black.
3. Waits for the actual audio `ended` event.
4. Fades the AI graphic into a seven-segment clock.
5. Returns the room background and settles the clock inside its wall monitor.
6. Counts down from 15 minutes, ending at `00:00`.

Held keys and additional presses cannot replay the opening or reset its countdown.
The clock keeps elapsed time when the tab is in the background. Escape exits
fullscreen without stopping the opening or exposing controls. Reload the page to
restart a rehearsal. Later scenes are not yet wired to Space on this branch.

The first key must be sent to the page, rather than the browser address bar.
Fullscreen availability depends on the browser; a rejected fullscreen request
does not stop the narration. Use the actual performance computer and projector
for the final speaker, brightness and browser-permission check.

## Assets and calibration

- `IMG_0165.png`: existing room background, preserved without stretching.
- `assets/audio/ai-opening.mp3`: bundled 23.7-second AI narration, generated for
  this opening. Replace this file with the final recording at the same path.
- `opening-config.js`: asset paths, countdown duration and the monitor rectangle
  expressed as fractions of the background image.

All runtime assets are included in the folder. The projection has no CDN,
external font, speech-service or network dependency. The opening narration is:

> Welcome to human verification test number sixty-seven. Please remain calm.
> There is no escape. You have one mission. There is one robot in this room.
> Find out who. When you have decided, press the button. Or else, everyone will
> be executed. You have fifteen minutes.

## Checks

The media and countdown controller is tested independently of the renderer:

```sh
node --test tests/opening.test.cjs
node --check visualizer.js
```

The tests cover actual end-event gating, duplicate and pending key presses,
playback failure and retry, media errors, skipped frames, clock boundaries and
keyboard shortcuts.

For the real Chromium playback and projection checks:

```sh
npm install
npx playwright install chromium
npm run test:browser
```

## Verified opening

[GitHub checks on 2026-10-10](https://github.com/mymcworld3-droid/Ai-shape/actions/runs/38042553950)
passed both jobs: 13 controller tests and Chromium browser checks. The browser
played the complete MP3 to its natural end and verified real audio analyser
samples, fullscreen, automatic countdown, repeated keys, Escape, 1920x1080,
1440x900 and 390x844 layouts, fullscreen rejection and playback failure/retry.
The `opening-browser-evidence` artifact contains the waiting, narration and
countdown screenshots plus the browser results.

The projection was also inspected in a live browser with no player controls or
buttons, including a held Space press during narration and again during countdown.

![Clock settled inside the room monitor](docs/opening-countdown.jpg)
