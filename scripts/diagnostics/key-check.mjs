// Checks that Presage accepts an API key, through the real app UI and the real SDK, using a FAKE camera.
// The key is read from the BC_KEY environment variable only; it is never written to disk or printed.
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

delete process.env.ELECTRON_RUN_AS_NODE;
const key = process.env.BC_KEY;
if (!key) throw new Error('Set BC_KEY');
const exe = createRequire(import.meta.url)('electron');
const app = await electron.launch({
  executablePath: exe,
  args: ['.', `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'bc-key-'))}`, '--use-fake-device-for-media-stream'],
});
const page = await app.firstWindow();
await page.waitForSelector('.app');
await page.getByRole('checkbox').check();
await page.getByRole('button', { name: 'Continue' }).click();
await page.getByLabel('Presage API key').fill(key); // not remembered: "Remember" stays unchecked
await page.getByRole('button', { name: 'Save key' }).click();
await page.waitForSelector('.main');
await page.getByRole('button', { name: 'Start session' }).click();

const outcome = await Promise.race([
  page.waitForSelector('.notice', { timeout: 90000 }).then(async () => 'notice: ' + (await page.locator('.notice h2').innerText())),
  page.getByText('Warming up').first().waitFor({ timeout: 90000 }).then(() => 'accepted: session reached "Warming up"'),
]).catch(() => 'timeout');
console.log('RESULT:', outcome);
await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/key-check.png' });
await page.getByRole('button', { name: 'Turn screen light on' }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/key-check-light.png' });
await app.close();
