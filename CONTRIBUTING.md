# Contributing

## Set up
```
npm install
npm run dev
```
Node 20+ (22 recommended). See `README.md` for requirements and `docs/ARCHITECTURE.md` for how the pieces fit.

## Before opening a pull request
```
npm run check          # typecheck + unit tests + secret scan
npm run build
```
UI or Electron changes: also run `npm run test:e2e` (real Electron, fake camera).

## Ground rules
- **Honesty of measurement is the product.** Never show a value that is stale, invalid or low-confidence as live; never mix
  simulated and real data; the SIMULATED label must stay visible. Domain rules live in `src/domain/` and are unit-tested.
- **Privacy:** no recording, no storing readings, no new network access, no microphone. Keep `docs/PRIVACY.md` and the
  in-app text in step with the behaviour, and say plainly what is not verified.
- Keep `App.tsx` a composition root. SDK code stays in `src/infrastructure/presage/`; Electron privileges stay in `electron/`.
- Add a test for behaviour that could break trust or a session (lifecycle, stale events, camera release, validity rules).
- Never commit secrets, real-session screenshots or recordings.

## Layout
```
electron/   main process, camera gate, IPC, key storage, sandboxed preload
src/app/    composition (App.tsx), session controller, store
src/features/   consent, setup, measurement, guidance, controls, settings, shell (UI)
src/domain/     session machine, measurement validity, pacer, light estimate, user-facing copy (no UI, no SDK)
src/infrastructure/   presage (the only SDK code) and simulation
src/shared/     types, constants, ring buffer, store, bridge contract
tests/      behaviour tests
scripts/    build + e2e;  scripts/diagnostics/  real-hardware probes (need a key/camera)
docs/       architecture, privacy, report, transfer guide, article, demo script
```
