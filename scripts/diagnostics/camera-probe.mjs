// Probes the REAL camera (≈15 s): what the driver allows, delivered frame rate and brightness, and whether
// applying brightness / exposure constraints changes them. Nothing is saved; frames never leave the page.
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

delete process.env.ELECTRON_RUN_AS_NODE;
const exe = createRequire(import.meta.url)('electron');
const app = await electron.launch({ executablePath: exe, args: ['.', `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'bc-cam-'))}`] });
const page = await app.firstWindow();
await page.waitForSelector('.app');

const result = await page.evaluate(async () => {
  await window.breathCoach.armCamera(true);
  const out = {};
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: false });
  const track = stream.getVideoTracks()[0];
  out.label = track.label;
  const caps = track.getCapabilities();
  const pick = (k) => (caps[k] === undefined ? null : caps[k]);
  out.capabilities = Object.fromEntries(['frameRate', 'brightness', 'contrast', 'exposureMode', 'exposureTime', 'exposureCompensation', 'iso', 'whiteBalanceMode', 'colorTemperature'].map((k) => [k, pick(k)]));
  out.settings0 = track.getSettings();

  const video = document.createElement('video');
  video.muted = true;
  video.srcObject = stream;
  await video.play();
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 24;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const luma = () => {
    ctx.drawImage(video, 0, 0, 32, 24);
    const d = ctx.getImageData(8, 6, 16, 12).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return Math.round(s / (d.length / 4));
  };
  const measure = async (ms) => {
    let n = 0;
    const t0 = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        n++;
        if (performance.now() - t0 >= ms) return resolve();
        video.requestVideoFrameCallback(tick);
      };
      video.requestVideoFrameCallback(tick);
    });
    return { fps: +((n * 1000) / (performance.now() - t0)).toFixed(1), luma: luma() };
  };
  await new Promise((r) => setTimeout(r, 1500));
  out.baseline = await measure(3500);

  const tryConstraint = async (name, advanced) => {
    try {
      await track.applyConstraints({ advanced: [advanced] });
      await new Promise((r) => setTimeout(r, 1200));
      out[name] = { applied: true, settings: (({ brightness, exposureMode, exposureTime, exposureCompensation, frameRate }) => ({ brightness, exposureMode, exposureTime, exposureCompensation, frameRate }))(track.getSettings()), ...(await measure(3000)) };
    } catch (e) {
      out[name] = { applied: false, error: String(e.name || e) };
    }
  };
  if (caps.brightness) await tryConstraint('brightnessMax', { brightness: caps.brightness.max });
  if (caps.exposureCompensation) await tryConstraint('exposureCompMax', { exposureCompensation: caps.exposureCompensation.max });
  if (caps.exposureMode?.includes('continuous')) await tryConstraint('exposureContinuous', { exposureMode: 'continuous' });
  for (const t of stream.getTracks()) t.stop();
  await window.breathCoach.armCamera(false);
  return out;
});
console.log(JSON.stringify(result, null, 2));
await app.close();
