// End-to-end run of the real Electron app (built output) with a fake camera device.
// Usage: node scripts/e2e.mjs   → writes screenshots to ./shots and prints PASS/FAIL lines.
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const exe = require('electron');
mkdirSync('shots', { recursive: true });
const results = [];
const check = (name, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};

delete process.env.ELECTRON_RUN_AS_NODE; // set by some host shells; it makes Electron behave as plain Node
const app = await electron.launch({
  executablePath: process.env.E2E_EXE ?? exe,
  args: [...(process.env.E2E_EXE ? [] : ['.']), `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'bc-'))}`, '--use-fake-device-for-media-stream'],
});
const page = await app.firstWindow();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.waitForSelector('.app');
const size = async (w, h) => {
  await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setContentSize(w, h), [w, h]);
  await page.waitForTimeout(400);
};
const shot = (n) => page.screenshot({ path: `shots/${n}.png` });
const camTracks = () => page.evaluate(() => [...document.querySelectorAll('video')].filter((v) => v.srcObject).length);

await size(1366, 690);
await shot('01-welcome');
check('welcome shown, no consent yet', await page.locator('text=slow your breath').count() > 0);
check('Continue disabled until agreement', await page.getByRole('button', { name: 'Continue' }).isDisabled());
check('bridge exposed', await page.evaluate(() => typeof window.breathCoach?.key?.status === 'function' && typeof window.__smartspectraBridge?.attach === 'function'));
check('node not exposed to page', await page.evaluate(() => typeof require === 'undefined' && typeof process === 'undefined'));
check('SDK runtime available in main', await page.evaluate(() => window.breathCoach.sdkStatus().then((s) => s.available)));

await page.getByRole('checkbox').check();
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForSelector('text=Connect');
await shot('02-setup');

// Camera must still be closed, and the gate must refuse a request while not armed.
const deniedBeforeStart = await page.evaluate(() =>
  navigator.mediaDevices.getUserMedia({ video: true }).then(() => false, () => true));
check('camera request refused before Start (gate disarmed)', deniedBeforeStart);

// Real SDK path with an invalid key: exercises native load, IPC, camera acquisition and error mapping.
await page.getByLabel('Presage API key').fill('invalid-key-for-e2e-0000');
await page.getByRole('button', { name: 'Save key' }).click();
await page.waitForSelector('.main');
await size(1366, 690);
await shot('03-ready');
check('main screen at 1366×690 has no page scroll', await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1));
await page.getByRole('button', { name: 'Start session' }).click();
await page.waitForTimeout(1500);
await shot('04-starting-real');
const real = await Promise.race([
  page.waitForSelector('.notice', { timeout: 40000 }).then(() => 'notice'),
  page.waitForSelector('text=Warming up', { timeout: 40000 }).then(() => 'warming'),
]).catch(() => 'timeout');
await page.waitForTimeout(800);
await shot('05-real-result');
const title = real === 'notice' ? await page.locator('.notice h2').innerText() : real;
console.log('INFO  real-SDK outcome with bogus key:', title);
check('real SDK path produced a handled outcome (no crash/hang)', real !== 'timeout');
if (real === 'notice') {
  check('error text is friendly, not raw', !/Error:|at \w+\.|undefined|\[object/.test(await page.locator('.notice').innerText()));
  await page.waitForTimeout(800);
  check('camera released after failed start', (await camTracks()) === 0);
  check('Start available again', await page.getByRole('button', { name: 'Try again' }).first().isEnabled());
}

// Simulation flow.
await page.getByRole('button', { name: 'Dismiss' }).click().catch(() => {});
await page.getByRole('button', { name: 'Settings', exact: true }).click();
await page.getByRole('button', { name: 'Simulation' }).click();
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('SIMULATED badge visible', await page.locator('.sim-badge').isVisible());
await page.getByRole('button', { name: 'Start simulation' }).click();
await page.waitForSelector('text=Warming up');
await page.waitForTimeout(2500);
await shot('06-sim-warmup');
check('rate shows dashes during warm-up', (await page.locator('.rate__number').innerText()).includes('–'));
check('no camera opened by simulation', (await camTracks()) === 0);

// Rapid clicking.
await page.getByRole('button', { name: 'Stop', exact: true }).click();
await page.getByRole('button', { name: 'Reset' }).click();
await page.getByRole('button', { name: 'Start simulation' }).click();
await page.getByRole('button', { name: 'Reset' }).click();
await page.waitForTimeout(800);
check('rapid Start/Stop/Reset ends idle & consistent', await page.getByRole('button', { name: 'Start simulation' }).isEnabled());

for (const [w, h, n] of [[1440, 780, '07-1440x900'], [1920, 1000, '08-1920x1080'], [1000, 640, '09-small']]) {
  await size(w, h);
  await shot(n);
}
await size(1366, 690);

await app.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
