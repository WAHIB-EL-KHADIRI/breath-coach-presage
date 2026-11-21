# Consent and privacy

This is the source text for the in-app consent screen and privacy sheet. It states what the app does and where behaviour
belongs to the Presage SDK and is **not independently verified**.

## What the app does

- **Camera.** Opened only after you agree and press Start. It is released on Stop, Reset, withdrawing consent, closing the window,
  or any error. In the main process a permission gate refuses every camera request unless a session is armed.
  The microphone is never requested (audio requests are refused).
- **No recording.** Breath Coach does not record video, capture images, or save readings or session history. The respiration
  trace is held in a fixed-size in-memory buffer (≈ 40 s) and cleared when the session ends.
- **Simulation.** Never uses the camera or the network; everything is synthetic and labelled SIMULATED at all times.
- **API key.** Held in memory for the current run. If you choose "Remember on this device" it is encrypted with Electron `safeStorage`
  (Windows DPAPI) and stored in the app's user-data folder. If the OS cannot protect it (or Linux reports the `basic_text` backend),
  nothing is written. It can be deleted in Settings. It is never logged or shown in errors.
- **Preferences.** Display options and the consent flag are kept in the window's local storage. No analytics of our own.

## What leaves the device

- Presage's SDK is configured with `enableTelemetry:false`. Presage documents telemetry as session summaries and readiness reports
  that never include video frames or measured vitals, and that when disabled "the SDK sends nothing" for telemetry.
- Measuring requires Presage's service (the SDK defines authentication, credit and network errors). **Exactly what the measurement
  itself transmits is described by Presage and has not been independently verified here.** Breath Coach therefore does not state
  that nothing leaves your device.
- Presage notes that service requests can be correlated with an account.
- The app itself makes no network requests (CSP `connect-src 'none'`); the SDK's native runtime does its own.

## Optional "SDK camera engine" (experimental, off by default)

When enabled in Settings, the SmartSpectra runtime in the main process opens the camera itself. The main process still refuses to
start it unless the session was explicitly armed from the app window, and Stop/disarm/close always release it. Only codes, metrics
packets and a ≈160-pixel-wide thumbnail (≈5 per second, memory only) go to the window. This path was not verified to be faster.

## Your controls

Withdraw consent (Settings) → camera stops at once and the welcome screen returns. Delete the key (Settings). Hide the preview at any time
(measurement continues; use Stop to end it).

## Known limits

- Under the official renderer pattern the API key passes through the renderer process to start the SDK.
- Windows DPAPI protects against other users, not against other software running as you.
- Network contents of the native runtime were not inspected.
