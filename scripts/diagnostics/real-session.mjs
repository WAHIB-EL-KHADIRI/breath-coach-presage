// One real session with the REAL camera and the REAL SDK. Key from BC_KEY only (never stored or printed).
// Samples the visible UI every ~3 s, the frames/s the SDK receives, and CPU use per process.
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const NL = String.fromCharCode(10);

// CPU-time snapshot of every Breath Coach process (main / renderer / gpu ...): [type, pid, cpuSeconds]
const snapshot = () => {
  const ps =
    "$procs = Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like '*breath-coach*electron.exe' }; " +
    "foreach ($q in $procs) { $t = if ($q.CommandLine -match '--type=([a-z-]+)') { $Matches[1] } else { 'main' }; " +
    '$c = (Get-Process -Id $q.ProcessId -ErrorAction SilentlyContinue).TotalProcessorTime.TotalSeconds; "$t,$($q.ProcessId),$c" }';
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8', timeout: 20000 })
      .split(NL)
      .map((l) => l.trim().split(','))
      .filter((a) => a.length === 3);
  } catch {
    return [];
  }
};

delete process.env.ELECTRON_RUN_AS_NODE;
const key = process.env.BC_KEY;
if (!key) throw new Error('Set BC_KEY');
const exe = createRequire(import.meta.url)('electron');
const app = await electron.launch({
  executablePath: exe,
  args: ['.', `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'bc-real-'))}`],
  env: { ...process.env, SMARTSPECTRA_DIAGNOSTICS: '1' },
});
// Frame counters printed by the SDK glue in the main process: the real frames/s the SDK receives.
app.process().stdout?.on('data', (d) =>
  String(d)
    .split(NL)
    .filter((l) => l.includes('received first frame') || l.includes(' frames ('))
    .forEach((l) => console.log('MAIN', l.slice(0, 90))),
);
const page = await app.firstWindow();
await page.waitForSelector('.app');
if (process.env.ENGINE) {
  // ENGINE=native uses the SDK's own camera capture (it manages Windows exposure); default is the browser path.
  await page.evaluate((engine) => localStorage.setItem('breathcoach.prefs.v1', JSON.stringify({ showCountdown: true, soundOn: false, cameraVisible: true, lightBoost: false, cameraBoost: true, engine })), process.env.ENGINE);
  await page.reload();
  await page.waitForSelector('.app');
}
await page.getByRole('checkbox').check();
await page.getByRole('button', { name: 'Continue' }).click();
await page.getByLabel('Presage API key').fill(key);
await page.getByRole('button', { name: 'Save key' }).click();
await page.waitForSelector('.main');
await page.getByRole('button', { name: 'Turn screen light on' }).click();
await page.waitForTimeout(800);
const t0 = Date.now();
await page.getByRole('button', { name: 'Start session' }).click();

const text = async (sel) => (await page.locator(sel).first().innerText({ timeout: 1500 }).catch(() => '')).split(NL).join(' ').trim();
let a = null;
let b = null;
let shotTaken = false;
for (let i = 0; i < 36; i++) {
  await page.waitForTimeout(2000);
  const s = {
    t: Math.round((Date.now() - t0) / 1000),
    status: await text('.status-pill'),
    rate: await text('.rate__number'),
    notice: await text('.notice h2'),
    tip: await text('.tip strong'),
    light: await text('.light:has-text("Light") .light__head strong'),
    load: await text('.light:has-text("Computer load") .light__head strong'),
    warm: await text('.meter__head span:last-child'),
  };
  console.log(JSON.stringify(s));
  if (s.t >= 2 && !a) a = { at: Date.now(), snap: snapshot() };
  else if (s.t >= 6 && a && !b) {
    b = { at: Date.now(), snap: snapshot() };
    const dt = (b.at - a.at) / 1000;
    const byType = {};
    for (const [type, pid, cpu] of b.snap) {
      const before = a.snap.find((x) => x[1] === pid);
      if (before) byType[type] = (byType[type] ?? 0) + ((Number(cpu) - Number(before[2])) / dt / 4) * 100;
    }
    console.log('CPU (percent of the whole 4-thread machine):', JSON.stringify(Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, Math.round(v)]))));
  }
  if (s.t >= 45 && !shotTaken) {
    shotTaken = true;
    await page.screenshot({ path: 'shots/real-session.png' });
  }
  if (s.notice) break;
}
await page.screenshot({ path: 'shots/real-session-end.png' });
await page.getByRole('button', { name: 'Stop', exact: true }).click({ timeout: 3000 }).catch(() => {});
await page.waitForTimeout(1500);
await app.close();
