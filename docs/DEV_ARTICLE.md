---
title: "Breath Coach: an honest, consent-first desktop breathing guide on Presage SmartSpectra"
published: false
tags: devchallenge, presagechallenge, electron, typescript
---

*This is a submission for the [Presage SmartSpectra SDK Challenge](https://dev.to/challenges/presage-2026-11-04)*

## What I Built

**Breath Coach** is a Windows desktop app (Electron + React + TypeScript) that estimates your breathing rate from your laptop camera with
Presage SmartSpectra and paces a calm breathing circle around it. It is for relaxation, not a medical device.

The idea I cared about most is **never over-claiming**. The screen keeps four things strictly apart:

- **Measured breathing rate**: the SDK's average, shown as received. Dashes during warm-up and whenever the reading is stale, invalid or the signal is lost.
- **Guide rhythm**: what the circle does (6 to 12 breaths/min, 40% in / 60% out, no hold). It follows the measured rate only if the reading is fresh (10 s or less) and the SDK's confidence is at least 50%; otherwise it holds a labelled default of 6/min.
- **Signal confidence**: the SDK's own 0 to 100 value, never invented.
- **Warm-up progress**: elapsed time of the 30 s warm-up, not a quality score.

There is also an explicit **SIMULATED** mode (no camera, always labelled) so the interface can be explored without a key.

## Demo

**I do not have a live-camera demo video, and I want to be upfront about why.** On the only computer I built this on (an Intel i7-4510U from
2014) every real session ended with the SDK's "frame rate stayed too low" error (code 14), so I never captured a live breathing reading.
I measured instead of guessing: the camera alone delivered 26 to 30 fps but only about 12 to 15 fps reached the SDK. Lower resolution, a lighter
UI, no GPU acceleration, SDK-owned capture and a high-performance power plan did not change that, and Presage's own `checkDeviceReadiness()`
said "limited" until other apps were closed. A valid key was accepted by Presage and real sessions ran through the warm-up. Details are in
`docs/REPORT.md` in the repository.

The repository README contains a walkthrough of the real app in its **SIMULATED** mode. It uses no camera and is **not** evidence of a real measurement.

## Code

- Repository: https://github.com/WAHIB-EL-KHADIRI/breath-coach-presage (MIT for the app source; the SmartSpectra SDK keeps its own licence)
- Setup: `npm install`, then `npm run dev` (Node 20+, Windows x64). Paste a Presage API key in the setup screen, or choose "Explore without a camera (simulated)". No login is needed to test it.
- 71 unit tests, an end-to-end run of the real Electron app, CI with a secret scan, and a hardened packaged build (see `SECURITY.md`).

## How It Responds to Human Signals

**Signal used:** breathing rate (value and confidence), plus the chest respiration trace that drives the live wave.

I used `@smartspectra/node-sdk` 3.5.0 through its official Electron path, requesting `breathingMetrics` only with telemetry off. One adapter maps
SDK events (`processingStatus`, `validationStatus`, `metrics`, `error`, `streamAvailable`) to a small `MeasurementSource` contract; the simulator
implements the same contract. From each packet I take the newest `breathing.rate` entry and the trace. Validation codes become plain-language tips
("Too dark", "Chest not visible"), never raw SDK text.

What I added from real runs on the dev machine: a live **light meter** from the preview, a hardware **brightness boost** (raised a very dark preview from luma 23 to 73 without lowering the frame rate)
and a **screen light** frame to help in dim rooms. These fixed "Too dark"; they could not fix the frame rate.

## Prize Categories

**Best Thoughtful Real-World Use.** The need: people who want to slow their breathing for relaxation but have no feedback on whether what the
screen says matches reality. The design: consent first, a light meter and plain-language fixes for framing and lighting, failure states that explain the next step,
and a measurement that disappears rather than lie. Honest caveat: without a live reading on my hardware, this entry does not meet the live-signal requirement, and I am not claiming it does.

## Consent and Data Handling

- **Consent:** an explicit checkbox on the first screen. The camera opens only after you agree and press Start, and is released on Stop, Reset, withdrawing consent, closing the window, any reload or any error. The main process refuses every camera request unless a session is armed. The microphone is never requested.
- **Storage:** nothing is recorded; readings and the respiration trace are not saved (a bounded in-memory buffer, cleared at session end). Display preferences and the consent flag stay in local storage. The API key is memory-only unless you choose "Remember", then it is encrypted with the OS (Windows DPAPI); nothing is written if the OS cannot protect it.
- **Sharing:** measuring uses Presage's service. **What the measurement itself transmits to Presage is described by Presage and I have not independently verified it**, so I do not claim that nothing leaves the device. The app makes no other network requests (the renderer is blocked from the network).
- **Retention and deletion:** the app retains nothing. You can delete a stored key and withdraw consent in Settings. Presage's own retention follows its policies.
- **SDK telemetry:** disabled (`enableTelemetry: false`). Presage documents telemetry as session summaries that never include video frames or measured vitals.
- **Optional AI services:** none used.
- **Not a medical device.** No diagnosis, treatment or monitoring claims.

## Engineering Notes

- Every session has a generation number; late events from a stopped session are dropped.
- The pacer runs on a monotonic clock, changes rhythm only at cycle boundaries, and respects `prefers-reduced-motion`.
- Electron hardening: sandbox, context isolation, a main-process request filter, device permissions denied, fuses on the packaged build.
- Lesson for the next builder: check `checkDeviceReadiness()` and the real frames per second reaching the SDK on the target hardware before designing around the SDK.
