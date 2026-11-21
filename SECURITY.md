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
