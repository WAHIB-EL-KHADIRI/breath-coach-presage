# Security

## Reporting a vulnerability
Please open a private security advisory on the GitHub repository (Security → Report a vulnerability), or contact the maintainer
directly. Do not open a public issue for something exploitable.

## What this app protects
| Asset | Protection |
|---|---|
| Camera | Opened only after consent and an explicit Start. The main process refuses every camera permission request unless a session is armed, refuses audio, and only trusts the app's own page. Stop, Reset, withdrawing consent, closing the window or any error release it. |
| Presage API key | Memory only by default. Optional storage uses Electron `safeStorage` (Windows DPAPI); nothing is written if the OS cannot protect it. Never logged, never shown in errors, never in the repository. |
| Renderer | `contextIsolation`, `sandbox`, no `nodeIntegration`; a narrow preload; IPC handlers verify the sender window and page URL; navigation and `window.open` are denied; CSP `default-src 'self'`, `connect-src 'none'`. |
| Measurements | Not recorded or saved. The respiration trace lives in a bounded in-memory buffer cleared at session end. |

## Hardening in place (Electron)
- Renderer: `contextIsolation`, `sandbox` (also `app.enableSandbox()` for every renderer), no `nodeIntegration`, no `webviewTag`,
  `safeDialogs`, drag-and-drop navigation off, DevTools only in development.
- Network: the page may only load its own bundled files. A request filter cancels everything else (http, https, ws, ftp,
  extensions, other file paths) in addition to the CSP (`connect-src 'none'`). Device permissions (USB, serial, HID, Bluetooth) are denied.
- Every web contents (not only the main window) denies `window.open`, `<webview>` and navigation away from the app page.
- The camera session ends on any reload or main-frame navigation, on disarm, on window close and on quit.
- Packaged builds ignore the `SMARTSPECTRA_CAPI_PATH` environment override and the renderer-console diagnostics mirror.
- Electron fuses (packaged build): `runAsNode` off, `NODE_OPTIONS` off, `--inspect` off, ASAR integrity validation on,
  load app only from ASAR, cookie encryption on.
- Supply chain: lockfile committed, exact versions (`.npmrc`), SHA-pinned GitHub Actions with read-only permissions,
  CodeQL, Dependabot, and a secret scan in CI.

## Known limits
- The official renderer SDK needs the API key inside the renderer to start a session.
- What the SmartSpectra native runtime transmits during a measurement is documented by Presage and **not independently verified** here.
- `npm audit` reports advisories in development tooling only (test runner, glob matching). Production dependencies: 0.
  Fixing them needs a major upgrade of the test runner that did not run correctly in the author's environment.

## Secrets hygiene
- `npm run check:secrets` scans tracked files and runs in CI. Run it before every commit.
- If a real key is ever committed: **revoke it in the Presage console first**, then remove it from the repository history.
- `.gitignore` excludes `.env*`, keys, `*.pem`, credentials, archives and screenshots from real sessions (`shots/`).
- Diagnostic scripts under `scripts/diagnostics/` read the key from the `BC_KEY` environment variable only.
