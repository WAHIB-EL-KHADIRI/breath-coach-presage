// Measures how many 720p frames per second the renderer can pull, convert and post
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
delete process.env.ELECTRON_RUN_AS_NODE;
const exe = createRequire(import.meta.url)('electron');
const app = await electron.launch({ executablePath: exe, args: ['.', `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'bc-'))}`, '--use-fake-device-for-media-stream'] });
const page = await app.firstWindow();
await page.waitForSelector('.app');
const probe = (W, H) => page.evaluate(async ([W, H]) => {
  await window.breathCoach.armCamera(true);
  
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: W }, height: { ideal: H }, frameRate: { ideal: 30 } } });
  const track = stream.getVideoTracks()[0];
  const settings = track.getSettings();
  const reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
  const canvas = new OffscreenCanvas(1, 1);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const ch = new MessageChannel();
  ch.port2.onmessage = () => {};
  let n = 0, cost = 0;
  const end = performance.now() + 6000;
  while (performance.now() < end) {
    const { value: vf } = await reader.read();
    const t = performance.now();
    canvas.width = vf.codedWidth; canvas.height = vf.codedHeight;
    ctx.drawImage(vf, 0, 0);
    const img = ctx.getImageData(0, 0, vf.codedWidth, vf.codedHeight);
    ch.port1.postMessage({ buffer: img.data.buffer, w: vf.codedWidth });
    cost += performance.now() - t; n++;
    vf.close();
  }
  track.stop();
  await window.breathCoach.armCamera(false);
  return { size: settings.width + 'x' + settings.height, cameraReportsFps: settings.frameRate, framesPerSecondProcessed: +(n / 6).toFixed(1), msPerFrame: +(cost / n).toFixed(1) };
}, [W, H]);
// reach the main screen so the real UI (with its animation) is what is being measured
await page.getByRole('checkbox').check();
await page.getByRole('button', { name: 'Continue' }).click();
await page.getByRole('button', { name: 'Explore without a camera (simulated)' }).click();
await page.waitForSelector('.main');
for (const [w, h] of [[1280, 720], [960, 540], [640, 480]]) console.log(JSON.stringify(await probe(w, h)));
await app.close();
