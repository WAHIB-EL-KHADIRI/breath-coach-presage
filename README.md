# Breath Coach

A calm desktop breathing coach. It measures your breathing rate through your laptop camera with
[Presage SmartSpectra](https://smartspectra.presagetech.com/) and shapes a gentle, paced breathing guide around it.

> For relaxation only. Not a medical device; it does not diagnose, monitor or treat anything.

**Design identity — "Quiet Precision":** deep night-blue surfaces, a single turquoise→mint light, a restrained violet accent,
tabular numerals so nothing shifts while values update, and one layered breathing orb at the centre of everything.

## What it does

- **Measured breathing rate** (from SmartSpectra) is shown separately from the **guide rhythm** (what the circle does).
- The guide follows the measured rate **only** when the reading is fresh (≤ 10 s), valid, and the source confidence is ≥ 50 %.
  The guide is clamped to 6–12 breaths/min; the measured value is never clamped.
  Otherwise it holds a default 6/min rhythm and says so.
- Inhale is 40 % and exhale 60 % of every cycle, no breath-hold. Rhythm changes apply only at a cycle boundary and by at most 1/min per cycle.
- The 30 s warm-up shows "Warming up" and dashes. Finishing it is not treated as proof of a valid reading.
- The wave is the real respiration trace from the SDK (chest trace, abdomen as fallback), drawn on a canvas from a bounded in-memory buffer.
- **Light helper:** a live brightness estimate from the camera preview (a hint; the SDK's own "Too dark" is the authority), and a **Screen light** toggle that surrounds the window with a warm white frame to light your face in a dark room.
- A clearly labelled **SIMULATED** mode (never automatic, never uses the camera) exists for exploring the interface.

## Requirements

| | |
|---|---|
| Node.js | ≥ 20 (developed on 22) |
| OS | Windows x64 (the only platform tested — see below). The SDK also ships macOS arm64 and Linux builds that are **untested** here. |
| Camera | Any webcam. Face and upper chest should be visible. |
| API key | From [physiology.presagetech.com](https://physiology.presagetech.com/auth/login). Without one you can only use the simulation. |

## Run

```bash
npm install
npm run dev        # Vite dev server + Electron
```

```bash
npm run build      # typecheck + web bundle + Electron main/preload bundles
npm start          # run the built app
npm test           # unit tests (vitest)
npm run test:e2e                           # end-to-end run of the real Electron app with a fake camera device
npm run check                              # typecheck + tests + secret scan
npm run pack       # unpacked app in release/win-unpacked
npm run dist       # Windows installer (NSIS) in release/
```

> Some shells (including VS Code's integrated terminal on certain setups) export `ELECTRON_RUN_AS_NODE=1`, which makes
> Electron behave like plain Node and crash at startup with `Cannot read properties of undefined (reading 'setName')`.
> Unset it: `unset ELECTRON_RUN_AS_NODE`.

## Project layout

```
electron/                 main process, camera gate, IPC, key storage, sandboxed preload
src/app/                  App.tsx (composition only), session controller, store, hooks
src/features/             consent, setup, measurement, guidance, controls, settings, shell
src/domain/               session machine, measurement validity, breath pacer, light estimate, user-facing copy
src/infrastructure/presage/      the only code that touches @smartspectra/node-sdk
src/infrastructure/simulation/   explicit simulator (same MeasurementSource contract)
src/shared/               types, constants, ring buffer, store, bridge contract
src/styles/               design tokens + component styles
tests/                    behaviour tests
scripts/                  build, e2e, secret scan;  scripts/diagnostics/ real-hardware probes
docs/                     see docs/README.md
```

## Known limit

On an Intel i7-4510U (2014) every real session ended with SDK error 14 (frame rate too low); no live reading was captured there. Use a
faster computer for the live demo: see [docs/TRANSFER.md](docs/TRANSFER.md) and [docs/REPORT.md](docs/REPORT.md).

## Verified vs. not verified

See [docs/REPORT.md](docs/REPORT.md). In short: everything except a **live measurement with a valid key and a real camera**
has been exercised. That last step still needs to be done by a person with a key before recording the demo.

## Privacy

[docs/PRIVACY.md](docs/PRIVACY.md) — the in-app text is derived from it. Breath Coach does not claim that nothing leaves the
device: what the measurement itself transmits to Presage is described by Presage and has not been independently verified here.

## Author

**WAHIB EL KHADIRI**

## Security

See [SECURITY.md](SECURITY.md) for what is protected, the hardening in place and the known limits.
Run `npm run check` (types, tests, secret scan) before committing.

## Licence notes

Breath Coach source code: MIT (see [LICENSE](LICENSE)), Copyright (c) 2026 WAHIB EL KHADIRI.

`@smartspectra/node-sdk` is proprietary (Presage Technologies); see its `LICENSE`. The native runtimes are shipped as
`extraResources` in packaged builds.
