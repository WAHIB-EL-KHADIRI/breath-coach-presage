---
title: "Breath Coach: a quiet desktop breathing guide built on Presage SmartSpectra"
tags: presagechallenge, electron, react, typescript
---

*This is a submission for the [Presage SmartSpectra SDK Challenge](https://dev.to/challenges/presage-2026-11-04) (#presagechallenge).
Check the challenge page for the current submission template, category names and deadline before publishing — at the time of writing
it listed November 22, 2026, 11:59 PM PST.*

## What I built

**Breath Coach** is a desktop app (Electron + React + TypeScript) that estimates your breathing rate from your laptop camera with
Presage SmartSpectra and paces a calm breathing circle around it. It is for relaxation — not a medical device.

The idea I cared about most is *honesty about what is measured versus what is suggested*. The UI keeps four things apart:

- **Measured breathing rate** — an average reported by the SDK, shown as received.
- **Guide rhythm** — what the circle does (6–12 breaths/min, 40 % in / 60 % out, no hold).
- **Signal confidence** — the SDK's own 0–100 value, never invented.
- **Warm-up progress** — elapsed time, not a quality score.

## How it uses SmartSpectra

I used `@smartspectra/node-sdk` 3.5.0 through its official Electron path (main glue, preload, renderer SDK), requesting
`breathingMetrics` only and turning SDK telemetry off.

- The renderer SDK acquires the camera **once** and emits the `MediaStream`; my preview shows that same stream.
- SDK events (`processingStatus`, `validationStatus`, `metrics`, `error`, `streamAvailable`) are mapped by one adapter to a small
  `MeasurementSource` contract. A simulator implements the same contract and is always labelled **SIMULATED**.
- From each metrics packet I take the newest `breathing.rate` entry (value + confidence %) and the chest trace for the wave.
- The guide follows the measured rate only if the reading is fresh (≤ 10 s), valid, and confidence ≥ 50 %; otherwise it holds 6/min and says so.
  Only the *guide* is clamped; the measured number is shown unclamped.

## Consent and privacy

The camera is only reachable between an explicit **Start** and the end of that session: the main process refuses every camera
permission request unless the session has armed it, and refuses audio entirely. Nothing is recorded; the wave lives in a ~40 s
in-memory buffer. The API key is optionally stored with OS encryption (Windows DPAPI) — if the OS can't protect it, it isn't written.

I deliberately did **not** write "nothing leaves your device". Presage documents what its optional telemetry contains, but what the
measurement itself transmits isn't something I verified, so the consent text says so.

## Engineering notes

- Every session gets a generation number; events from older sessions are dropped, so Reset can't be polluted by a late packet.
- Time-based pacer on a monotonic clock, cycle-boundary rhythm changes, max 1 breath/min step.
- `prefers-reduced-motion`: the orb stops scaling; phase is carried by text, a progress arc and soft brightness.
- 71 unit tests plus an end-to-end run of the real Electron app (with Chromium's fake camera) that exercised the native SDK path up to Presage's key check.
  The mapping tests are pinned against the SDK's own constants.
- Security hardening beyond the basics: a main-process request filter that cancels anything but the app's own bundle, device
  permissions denied, every web contents locked down, the camera session ended on any reload, and Electron fuses
  (`RunAsNode`, `--inspect` off; ASAR integrity on) verified on the packaged build. CI runs a secret scan, CodeQL and a
  production dependency audit with SHA-pinned actions and read-only permissions.

## Limits (honest)

- Tested on Windows 10 x64 only.
- **I could not capture a live breathing reading on the computer I built this on** (an Intel i7-4510U from 2014). A valid key was
  accepted by Presage and real sessions ran, but every one ended with the SDK's "frame rate stayed too low" error (code 14). I
  measured it instead of guessing: the camera alone delivered 26–30 fps, but only ~12–15 fps reached the SDK. Lower resolution,
  a lighter UI, no GPU acceleration, SDK-owned capture and a high-performance power plan did not change that; Presage's own
  `checkDeviceReadiness()` said "limited" until other apps were closed. Details in `docs/REPORT.md`.
- What I did fix from the real run: a dark preview (camera brightness setting raised 23 → 73 luma without dropping fps), an
  in-app light meter and a "screen light" frame to help in dim rooms.
- The live demo must be recorded on a faster computer (`docs/TRANSFER.md`). Breathing estimates also depend on lighting, framing and stillness.

## What I'd tell the next builder
Check `checkDeviceReadiness()` and the real frames/s reaching the SDK on the target hardware **before** designing around the SDK.
Resolution was not the bottleneck on my machine; the SDK's own processing was.

## Prize categories

*Best Thoughtful Real-World Use* (consent, responsible data handling) and *Most Creative or Delightful Use* — adjust to the template.

## Code and demo

- Repository: https://github.com/WAHIB-EL-KHADIRI/breath-coach-presage
- Demo video: `<add link — recorded with the real camera>`
- Setup: see the README.
