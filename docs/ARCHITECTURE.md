# Architecture

```
┌────────────── Electron main (electron/main.ts) ──────────────┐
│ BrowserWindow: contextIsolation, sandbox, no nodeIntegration  │
│ Camera gate  ◄── armCamera(true|false) ── IPC (sender checked)│
│ CredentialStore (safeStorage)    bindSmartSpectraIpc(window)  │
└───────────────▲───────────────────────────▲──────────────────┘
        window.breathCoach            MessagePort (official SDK)
┌───────────────┴───────── preload.cjs ────┴───────────────────┐
│ contextBridge: key.*, armCamera, sdkStatus, openExternal(id)  │
│ + @smartspectra/node-sdk/preload (bundled, sandbox stays on)  │
└───────────────▲───────────────────────────────────────────────┘
┌───────────────┴──────────── Renderer (React) ────────────────┐
│ SessionController ─ owns lifecycle, generation counter        │
│   ├─ PresageSource  (renderer SDK, breathingMetrics only)     │
│   └─ SimulatedSource (explicit, labelled)                     │
│ domain: sessionMachine · assess() · BreathPacer               │
│ store (vanilla) → useSelector;  SignalStore (ring buffer) → canvas
└───────────────────────────────────────────────────────────────┘
```

## Data flow

1. `PresageSource` creates one `SmartSpectraSDK` (renderer build) per session: `requestedMetrics = breathingMetrics`,
   `enableTelemetry:false`. `PresageSource` opens the camera **once** at 640×480 @ 30 fps (the SDK default of 720p could not be pumped fast enough on a slow laptop) and gives it to the SDK with `useMediaStream()`; the preview `<video>`
   shows that same stream and the adapter stops its tracks on release. The SDK pumps frames to the main process over its own MessagePort (the officially supported path);
   the app does not move video over its own IPC.
2. SDK events become `SourceEvent`s: `running`, `validation`, `rate` (value, confidence %, stable), `trace`, `stream`, `error`.
   Every event is stamped with the renderer's monotonic clock on receipt.
3. `SessionController` applies them to the store (low-frequency: rate, validation, phase) or the `SignalStore` (high-frequency
   trace samples, which never touch React state).
4. `assess()` — a pure function of (phase, runningSince, now, latest validation, latest rate) — decides what may be claimed:
   warming-up / waiting / live / low-confidence / stale / signal-issue / invalid. A 500 ms tick re-evaluates it.
5. `deriveGuidance()` turns the assessment into a guide target (adaptive or default 6/min, clamped 6–12).
   `BreathPacer` (monotonic clock) renders inhale/exhale; rAF writes `--b`/`--p` CSS variables on the orb.

## Lifecycle and stale-event protection

- Phases: `idle → starting → running → stopping → idle`, plus `error`. Illegal transitions are ignored (`sessionMachine.ts`).
- Every `start`, `stop`, `reset`, failure, consent withdrawal and page-hide bumps a **generation** counter; each source subscription
  captures the generation it was created in and drops events from any other. A reset can't be polluted by a late packet.
- Teardown is single-flight: unsubscribe → `source.stop()` → `source.destroy()` → `armCamera(false)` → clear preview.
  `PresageSource.release()` destroys the SDK (which closes its port; the official main-process glue serialises native teardown against the next start)
  and additionally stops every track of the stream.
- A track that ends on its own (unplugged camera) becomes a `camera-lost` error and a full teardown.

## Freshness policy (`src/shared/constants.ts`)

| Constant | Value | Meaning |
|---|---|---|
| `WARMUP_MS` | 30 000 | Time-based warm-up. Not a confidence. |
| `MIN_GUIDANCE_CONFIDENCE` | 50 | Percent; SDK reports confidence 0–100 (its own "stable" flag is ≥ 45). |
| `RATE_STALE_AFTER_MS` | 10 000 | Older readings are never shown as live. |
| `LAST_READING_FORGET_MS` | 120 000 | After this, the previous reading isn't mentioned at all. |
| `SIGNAL_STALE_AFTER_MS` | 3 000 | No trace samples for this long → "Waiting for signal". |

## Security boundaries

- Renderer is untrusted-ish: IPC handlers verify `event.sender` is the main window and `senderFrame.url` is the app page.
- Camera gate: `setPermissionRequestHandler`/`CheckHandler` allow only `media`, video-only, from the app page, **and only while armed**.
- Navigation and `window.open` are denied; the only external link is selected by id from a fixed allow-list.
- CSP: `default-src 'self'`; `connect-src 'none'` in production; `worker-src blob:` (needed by the SDK frame worker).
  `style-src 'unsafe-inline'` is used for React inline style attributes.
- The API key does reach the renderer (the official renderer SDK takes it in its constructor and forwards it to main).
  It is held outside the store, never logged, and never put in an error message.
