# Scripts

| Script | Purpose |
|---|---|
| `build-electron.mjs` | Bundles the Electron main process and the sandboxed preload (used by `npm run build`). |
| `dev.mjs` | Vite dev server + Electron (`npm run dev`). |
| `e2e.mjs` | End-to-end run of the real built app with Chromium's **fake** camera. No key needed (`npm run test:e2e`). |
| `make-demo.mjs` | Re-records the README walkthrough GIF and screenshots in **simulated** mode (no camera, no key): `npm run demo`. |
| `check-secrets.mjs` | Scans tracked files for secrets (`npm run check:secrets`). |

## `diagnostics/` — real hardware probes
These open the **real camera** and/or call Presage. Run from the repository root. Keys are read from the `BC_KEY` environment
variable only and are never written or printed. Output and screenshots go to `shots/` (git-ignored: they contain your image).

| Script | What it tells you |
|---|---|
| `readiness.mjs` | Presage's official `checkDeviceReadiness()` verdict for this computer. |
| `camera-probe.mjs` | What the camera driver allows (brightness, exposure), delivered fps and brightness. |
| `fps-probe.mjs` | How many frames/s the renderer can pull and convert (fake camera). |
| `key-check.mjs` | Whether Presage accepts a key, through the real UI (fake camera). |
| `real-session.mjs` | One real session; prints status, light, frames/s reaching the SDK and CPU per process. |

```
BC_KEY=<your key> node scripts/diagnostics/readiness.mjs
```
