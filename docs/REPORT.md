``# Implementation report
``
``## Done and verified (this machine: Windows 10 x64, Node 22, Electron 45.3.2, SDK 3.5.0)
``
``| Area | Evidence |
``|---|---|
``| Type check | `tsc --noEmit` clean |
``| Build | `npm run build` OK; `npm run pack` produced `release/win-unpacked` |
``| Unit tests | 54/54 pass (`npm test`): validity/staleness/confidence, guide-vs-measured separation, 40/60 timing, boundary rhythm changes, state machine, controller (no camera before consent, late-event drop, rapid Start/Stop/Reset, withdraw during start), SDK adapter with fake SDK, protobuf decoding with real encoded payloads, mapping pinned to SDK constants, camera gate, credential store, simulator |
``| End-to-end (dev build **and** packaged exe) | 15/15: consent gating; node not exposed to page; camera request refused while disarmed; real native SDK loads; real SDK path with a bogus key reaches Presage's auth check and ends in a friendly error with the camera released; SIMULATED badge; dashes during warm-up; rapid Start/Stop/Reset; no page scroll at 1366×690 |
``| Visual checks | Screenshots at 1366×690, 1440×780, 1920×1000, 1000×640 reviewed; fixed rail overflow, chip wrapping, hidden-attribute bug |
``
``## Real-camera findings (Windows 10, i7-4510U, 4 threads, ~16 GB RAM)
``
``- With the SDK's default 1280×720 capture, every real session ended in about 10 s with SDK error 14 (`kSustainedLowFrameRate`): only ~10–12 frames/s reached the SDK, falling over time. The camera itself reported 30 fps.
``- Cause: this computer is slow and was heavily loaded (95 % RAM in use). Copying 720p frames to the SDK cost ~53 ms/frame in a probe (`scripts/diagnostics/fps-probe.mjs`); 640×480 costs ~22 ms.
``- Fixes: capture at 640×480 @ 30 through the SDK's `useMediaStream()` (still one camera open), static orb shadow / no blur, orb ~30 fps and wave ~22 fps updates, no canvas shadowBlur. Close other heavy apps.
``- After the fixes and freeing memory, a real session ran **134 s with no error 14**, passed the 30 s warm-up, and the SDK reported **"Too dark"** for the whole run. The app showed "Signal lost", dashes, confidence n/a — no value was invented.
``- **Still no real breathing reading.** A valid key was accepted by Presage (session reached "Warming up"). A reading needs a lit, visible face and chest. 640×480 vs 720p effect on measurement quality is unknown.
``
``## Frame-rate investigation (Windows 10, i7-4510U) — summary
``
``| Attempt | Result on this machine |
``|---|---|
``| 1280×720 via the official renderer path | ≈ 11–12 fps reach the SDK → error 14 after ≈ 10 s |
``| 640×480 / 640×360 | ≈ 14.5 fps → error 14 after 12–16 s |
``| Hardware acceleration off (`BC_NO_GPU=1`) | ≈ 19 → 13 fps → error 14 |
``| Lighter UI (static shadows, 30/22 fps drawing) | longer sessions (up to 134 s) but still error 14 |
``| Camera brightness boost (hardware setting) | fixed "Too dark" (luma 23 → 73) without lowering fps |
``| SDK-native camera capture in the main process (`Settings → SDK camera engine`) | still error 14 |
``| Official `checkDeviceReadiness()` | `limited` with apps open; `ready` after closing Brave/ProtonVPN/Java, but real sessions still failed |
``
``### Root cause (measured, supersedes the conclusion above)
``
``- **Official requirement** (read from the SDK's own `smartspectra_readiness_chest_policy`, `scripts/diagnostics/sdk-policy.cjs`): chest/breathing
``  workload, reference 1280×720 @ 30 fps, **minimum throughput 27 fps (90 %) sustained for 20 s**, 5 % uncertainty band.
``- Presage's `checkDeviceReadiness()` returned **`ready`** when the machine was quiet, so the SDK's own processing *can* reach the required
``  throughput on this CPU. The earlier claim "the CPU is too weak for the SDK" was not supported by that evidence.
``- **Whole-machine CPU was saturated (100 %) before and during every failing session**, with only 2 physical cores / 4 threads (i7-4510U).
``  Top consumers measured with WMI process times (\`scripts/diagnostics/top-cpu.mjs\`), share of the whole machine:
``  VS Code ≈ 42 %, **Windows Modules Installer Worker (TiWorker, Windows Update servicing) ≈ 21 %**, MRT ≈ 8.5 %, Malwarebytes ≈ 5.5 %,
``  Defender ≈ 3 %, System ≈ 3 % (total ≈ 89 %).
``- Inside the app the per-frame work is small: \`drawImage\` ≈ 6 ms + \`getImageData\` ≈ 12 ms (capacity ≥ 50 fps), frames are I420 640×480, but only
``  **5–7 frames/s reached the SDK reader** (camera timestamp gaps: median ≈ 145–190 ms), which is exactly what the SDK uses to judge frame rate.
``- The SDK glue's per-frame copy (\`Buffer.from(koffi.decode(...))\`, 7–10 ms/frame) was measured and is **not** the main cost (\`callback-cost.cjs\`).
``- Raising the app's OS priority and lowering VS Code's gave 7.3 fps (vs 5.1 and 6.7 baselines): within noise. Not a fix.
``
``**Conclusion:** the dominant cause is CPU starvation by background load on a 2-core machine (Windows Update servicing, an IDE, scanners), not the
``camera, the key, the resolution or the app's own per-frame work. This was not yet re-tested on a clean machine, so it is a measured diagnosis, not a proven fix.
``
``**What was added from this:** a *Computer load* meter in the Camera panel (whole-machine CPU every 2 s, warns above 75 %), so the user can see
``when the computer is quiet enough to start. To test the diagnosis: restart, let Windows Update finish, close VS Code and other apps until the
``meter shows well under 40 %, then run the packaged app. Do not disable Windows Update or Defender to get there.
``
``### Confirmation on a quiet machine (2026-11-22)
`
`| Run | Machine state | Frames reaching the SDK | Result |
`|---|---|---|---|
`| probe 1 / 2 | CPU 100 %, free RAM ≈ 1.4 GB, Windows Update servicing | 6.7 / 5.1 fps (median gap 145 to 190 ms) | error 14 after 24 to 29 s |
`| probe 3 | same, app priority raised, VS Code lowered | 7.3 fps | error 14 after 18 s |
`| probe 4 | update finished, free RAM ≈ 7.4 GB | **22.7 fps** (median gap 40 ms) | no error 14 in 46 s |
`| full session | same | **≈ 25 fps steady, 3450 frames** | **no error 14 in 152 s**; warm-up passed |
`
`The same unmodified app went from failing in 12 s to running 152 s once the background load dropped. No valid reading appeared in that run
`because the SDK reported "Too dark" throughout (camera luma was ≈ 98 to 100 after the brightness boost, so the SDK's darkness limit is stricter than the
`app's light meter, which is only a hint). A later run ended with "Can't reach Presage" (SDK error 5) after ≈ 21 s; the service answered normally
`afterwards (HTTP 200), so it looked transient.
`
`Other measured facts (`scripts/diagnostics/system-report.mjs`): SSD (healthy), 16 GB RAM (8.6 GB free when quiet), Balanced power plan with processor
`max state 100 % on AC and **70 % on battery** (keep the charger connected), dual graphics (Intel HD with a 2017 driver, NVIDIA 840M), only two startup items.
`During a session the app itself uses ≈ 75 to 80 % of the whole machine (main ≈ 25, GPU process ≈ 23, renderer ≈ 27), so any other load matters.
`
`The app handles the failure honestly (no invented values, camera released, plain-language message).
``
``## Bugs found and fixed during verification
``
``- Trusted-URL check failed on Windows (`c:` vs `C:` in `file://` URLs) → every IPC call was rejected. Fixed + test.
``- Simulation could start after Stop during its start delay → `stopped` flag.
``- Start could leave the camera gate armed if Stop landed mid-arming → disarm on generation mismatch; consent withdrawal now cancels an in-flight start.
``- `Vitest 5.1.0` fails to run in this environment; pinned `3.2.4`.
``
``## NOT verified — still required
``
``1. **Live measurement (still open).** A valid key was accepted and real sessions ran past warm-up, but the SDK never produced a reading (it reported "Too dark"), so no real rate, confidence value or trace was observed. The decode/mapping is tested against payloads built with the SDK's own protobuf classes, not against live data. **Do a real session past 30 s before recording.**
``2. The assumption that `kRunning` is reported before a face is found (affects only when "Warming up" starts) and that the trace arrives incrementally (overlap is tolerated).
``3. What the native runtime sends over the network during a measurement.
``4. macOS and Linux (untested; the SDK supports darwin-arm64 and linux-x64/arm64). Installer (`npm run dist`) was not run; unpacked packaging was.
``5. Screen-reader and keyboard-only passes were done by construction (roles, labels, focus rings, Esc closes sheets), not with an actual screen reader.
``6. Dev-only: Electron DevTools are disabled in packaged builds.
``
``## Notes
``
``- Presage challenge: the entry period was reported as ending **Nov 22, 2026 11:59 PM PST** (search result, not the official page — confirm at https://dev.to/challenges/presage-2026-11-04). The article and repo are prepared; nothing has been published or uploaded.
``- No secrets are in the repo; `.gitignore` excludes `.env*`, `release/`, `shots/`.
