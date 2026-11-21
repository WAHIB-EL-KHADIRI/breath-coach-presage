# Running Breath Coach on another computer (15 minutes)

Use this to record the real-camera demo on a computer that can keep up with the SmartSpectra SDK.

## What the computer needs
- Windows 10/11 x64 (the only platform tested), a webcam, internet.
- A reasonably recent CPU. On an Intel i7-4510U (2014, 2 cores / 4 threads) every real session ended with SDK error 14
  ("frame rate too low"); see `docs/REPORT.md`. Close heavy apps (browsers, VPNs, IDEs) before recording.
- Node.js 20 or newer (https://nodejs.org).

## Steps
1. Unzip `breath-coach-transfer.zip` anywhere (for example `C:\breath-coach`).
2. Open a terminal in that folder and run:
   ```
   npm install
   npm start
   ```
   (`npm install` downloads Electron and the SDK's native runtimes, a few hundred MB. `npm start` needs a build, so run
   `npm run build` once first if `dist/` is missing.)
3. Tick the consent box. Paste your Presage API key. Leave "Remember" off on a shared computer.
4. Check the **Light** meter in the Camera panel says **Good** before pressing Start. If it says Too dark, press the sun button
   (screen light), add a lamp facing you, or keep "Brighten camera image" on in Settings.
5. Sit so your face, shoulders and upper chest are in the preview. Press **Start session** and stay still for 40 seconds.
6. A real reading should appear after the 30 s warm-up. Record the video following `docs/DEMO_SCRIPT.md`.

## If it still fails
- "The camera feed is too slow (Ref 14)": the computer is too slow or too busy. Close other apps and retry; try another computer.
- "Too dark" / "Chest not visible": lighting and framing, not the app.
- Settings → *SDK camera engine (experimental)* switches the SDK to open the camera itself. It was not verified to be faster.
- Diagnostics: set `SMARTSPECTRA_DIAGNOSTICS=1` before `npm start` to print how many frames per second reach the SDK.

## After the challenge
Rotate the API key in the Presage console and delete the old one.
