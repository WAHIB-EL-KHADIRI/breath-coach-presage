// Records the README demo: a walkthrough of the REAL app in SIMULATED mode. No camera, no key, no network.
// Output: docs/assets/demo-simulated.gif and a few screenshots. Everything on screen is labelled SIMULATED.
// A fake clock fast-forwards the 30 s warm-up. Run: npm run demo
import { _electron as electron } from 'playwright-core';
import gifenc from 'gifenc';
import pngjs from 'pngjs';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { GIFEncoder, quantize, applyPalette } = gifenc;
const { PNG } = pngjs;

delete process.env.ELECTRON_RUN_AS_NODE;
const exe = createRequire(import.meta.url)('electron');
const OUT = 'docs/assets';
mkdirSync(OUT, { recursive: true });

const W = 1000;
const H = 640;
const app = await electron.launch({ executablePath: exe, args: ['.', `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'bc-demo-'))}`] });
const page = await app.firstWindow();
await page.waitForSelector('.app');
await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setContentSize(w, h), [W, H]);
await page.clock.install();
await page.reload();
await page.waitForSelector('.app');
await page.waitForTimeout(600);

const gif = GIFEncoder();
let frames = 0;
const snap = async (delay = 300) => {
  const png = PNG.sync.read(await page.screenshot());
  const rgba = new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength);
  const palette = quantize(rgba, 96, { format: 'rgb444' });
  gif.writeFrame(applyPalette(rgba, palette, 'rgb444'), png.width, png.height, { palette, delay });
  frames++;
};
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const advance = (ms) => page.clock.runFor(ms);
const hold = async (n, step, delay) => {
  for (let i = 0; i < n; i++) {
    await advance(step);
    await snap(delay);
  }
};

// 1 — welcome and consent
await hold(4, 400, 350);
await shot('screenshot-welcome');
await page.getByRole('checkbox').check();
await snap(700);
await page.getByRole('button', { name: 'Continue' }).click();
await advance(500);
await snap(900);
await shot('screenshot-setup');

// 2 — explore with the clearly labelled simulation
await page.getByRole('button', { name: 'Explore without a camera (simulated)' }).click();
await advance(500);
await hold(3, 500, 350);
await shot('screenshot-ready');

// 3 — start: warm-up shows dashes and an honest progress bar
await page.getByRole('button', { name: 'Start simulation' }).click();
await advance(900);
await hold(6, 1000, 350);
await shot('screenshot-warmup');
await page.clock.fastForward(24000); // the rest of the 30 s warm-up
await advance(2500);

// 4 — a valid, confident reading steers the guide
await hold(10, 700, 300);
await shot('screenshot-measuring');

// 5 — lose the signal: the number disappears and the guide falls back to its default
await page.getByRole('button', { name: 'Signal lost', exact: true }).click();
await hold(5, 900, 350);
await shot('screenshot-signal-lost');

// 6 — an error is explained in plain language, with a next step
await page.getByRole('button', { name: 'Connection error' }).click();
await advance(800);
await hold(3, 500, 500);
await shot('screenshot-error');
await page.getByRole('button', { name: 'Dismiss' }).click();
await advance(800);
await snap(600);

// 7 — settings
await page.getByRole('button', { name: 'Settings', exact: true }).click();
await advance(700);
await snap(1400);
await shot('screenshot-settings');

gif.finish();
const file = `${OUT}/demo-simulated.gif`;
writeFileSync(file, gif.bytes());
console.log(`frames: ${frames}, size: ${(statSync(file).size / 1024 / 1024).toFixed(2)} MB`);
await app.close();
