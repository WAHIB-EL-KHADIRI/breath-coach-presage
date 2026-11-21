# Implementation report

## Done and verified (this machine: Windows 10 x64, Node 22, Electron 45.3.2, SDK 3.5.0)

| Area | Evidence |
|---|---|
| Type check | `tsc --noEmit` clean |
| Build | `npm run build` OK; `npm run pack` produced `release/win-unpacked` |
| Unit tests | 54/54 pass (`npm test`): validity/staleness/confidence, guide-vs-measured separation, 40/60 timing, boundary rhythm changes, state machine, controller (no camera before consent, late-event drop, rapid Start/Stop/Reset, withdraw during start), SDK adapter with fake SDK, protobuf decoding with real encoded payloads, mapping pinned to SDK constants, camera gate, credential store, simulator |
| End-to-end (dev build **and** packaged exe) | 15/15: consent gating; node not exposed to page; camera request refused while disarmed; real native SDK loads; real SDK path with a bogus key reaches Presage's auth check and ends in a friendly error with the camera released; SIMULATED badge; dashes during warm-up; rapid Start/Stop/Reset; no page scroll at 1366×690 |
| Visual checks | Screenshots at 1366×690, 1440×780, 1920×1000, 1000×640 reviewed; fixed rail overflow, chip wrapping, hidden-attribute bug |

## Real-camera findings (Windows 10, i7-4510U, 4 threads, ~16 GB RAM)

- With the SDK's default 1280×720 capture, every real session ended in about 10 s with SDK error 14 (`kSustainedLowFrameRate`): only ~10–12 frames/s reached the SDK, falling over time. The camera itself reported 30 fps.
- Cause: this computer is slow and was heavily loaded (95 % RAM in use). Copying 720p frames to the SDK cost ~53 ms/frame in a probe (`scripts/fps-probe.mjs`); 640×480 costs ~22 ms.
- Fixes: capture at 640×480 @ 30 through the SDK's `useMediaStream()` (still one camera open), static orb shadow / no blur, orb ~30 fps and wave ~22 fps updates, no canvas shadowBlur. Close other heavy apps.
- After the fixes and freeing memory, a real session ran **134 s with no error 14**, passed the 30 s warm-up, and the SDK reported **"Too dark"** for the whole run. The app showed "Signal lost", dashes, confidence n/a — no value was invented.
- **Still no real breathing reading.** A valid key was accepted by Presage (session reached "Warming up"). A reading needs a lit, visible face and chest. 640×480 vs 720p effect on measurement quality is unknown.

## Frame-rate investigation (Windows 10, i7-4510U) — summary

| Attempt | Result on this machine |
|---|---|
| 1280×720 via the official renderer path | ≈ 11–12 fps reach the SDK → error 14 after ≈ 10 s |
| 640×480 / 640×360 | ≈ 14.5 fps → error 14 after 12–16 s |
| Hardware acceleration off (`BC_NO_GPU=1`) | ≈ 19 → 13 fps → error 14 |
| Lighter UI (static shadows, 30/22 fps drawing) | longer sessions (up to 134 s) but still error 14 |
| Camera brightness boost (hardware setting) | fixed "Too dark" (luma 23 → 73) without lowering fps |
| SDK-native camera capture in the main process (`Settings → SDK camera engine`) | still error 14 |
| Official `checkDeviceReadiness()` | `limited` with apps open; `ready` after closing Brave/ProtonVPN/Java, but real sessions still failed |

Conclusion: on this computer the SmartSpectra pipeline does not sustain the frame rate it requires during a full session. No real breathing reading was ever produced here. A faster computer is needed for the live demo. The app handles the failure honestly (no invented values, camera released, plain-language message).

## Bugs found and fixed during verification

- Trusted-URL check failed on Windows (`c:` vs `C:` in `file://` URLs) → every IPC call was rejected. Fixed + test.
- Simulation could start after Stop during its start delay → `stopped` flag.
- Start could leave the camera gate armed if Stop landed mid-arming → disarm on generation mismatch; consent withdrawal now cancels an in-flight start.
- `Vitest 5.1.0` fails to run in this environment; pinned `3.2.4`.

## NOT verified — still required

1. **Live measurement (still open).** A valid key was accepted and real sessions ran past warm-up, but the SDK never produced a reading (it reported "Too dark"), so no real rate, confidence value or trace was observed. The decode/mapping is tested against payloads built with the SDK's own protobuf classes, not against live data. **Do a real session past 30 s before recording.**
2. The assumption that `kRunning` is reported before a face is found (affects only when "Warming up" starts) and that the trace arrives incrementally (overlap is tolerated).
3. What the native runtime sends over the network during a measurement.
4. macOS and Linux (untested; the SDK supports darwin-arm64 and linux-x64/arm64). Installer (`npm run dist`) was not run; unpacked packaging was.
5. Screen-reader and keyboard-only passes were done by construction (roles, labels, focus rings, Esc closes sheets), not with an actual screen reader.
6. Dev-only: Electron DevTools are disabled in packaged builds.

## Notes

- Presage challenge: the entry period was reported as ending **Nov 22, 2026 11:59 PM PST** (search result, not the official page — confirm at https://dev.to/challenges/presage-2026-11-04). The article and repo are prepared; nothing has been published or uploaded.
- No secrets are in the repo; `.gitignore` excludes `.env*`, `release/`, `shots/`.
