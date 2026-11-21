// Instrumented REAL session: where do frames get lost between the camera and the SDK?
// Measured inside the page (without touching SDK code): frames delivered to the SDK's reader per second, the camera frame
// timestamp gaps the SDK sees (it derives fps from these), pixel format and size, and the time spent in drawImage/getImageData.
// Also samples whole-machine CPU use and free memory each second. Key from BC_KEY only. Prints a JSON summary.
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const NL = String.fromCharCode(10);
delete process.env.ELECTRON_RUN_AS_NODE;
const key = process.env.BC_KEY;
if (!key) throw new Error('Set BC_KEY');
const exe = createRequire(import.meta.url)('electron');

const app = await electron.launch({
  executablePath: exe,
  args: ['.', `--user-data-dir=${mkdtempSync(path.join(os.tmpdir(), 'bc-probe-'))}`],
  env: { ...process.env, SMARTSPECTRA_DIAGNOSTICS: '1' },
});
const mainArrivals = [];
app.process().stdout?.on('data', (d) =>
  String(d)
    .split(NL)
    .filter((l) => l.includes(' frames ('))
    .forEach(() => mainArrivals.push(Date.now())),
);

const page = await app.firstWindow();
await page.addInitScript(() => {
  const S = { frames: 0, arrivals: [], ts: [], gi: [], di: [], fmt: null, size: null };
  window.__probe = S;
  const R = ReadableStreamDefaultReader.prototype;
  const origRead = R.read;
  R.read = function (...a) {
    return origRead.apply(this, a).then((r) => {
      const v = r && r.value;
      if (v && typeof v.codedWidth === 'number') {
        S.frames++;
        if (S.arrivals.length < 4000) {
          S.arrivals.push(performance.now());
          S.ts.push(v.timestamp);
        }
        S.fmt = v.format;
        S.size = v.codedWidth + 'x' + v.codedHeight;
      }
      return r;
    });
  };
  const C = OffscreenCanvasRenderingContext2D.prototype;
  for (const name of ['drawImage', 'getImageData']) {
    const o = C[name];
    C[name] = function (...args) {
      const t = performance.now();
      const res = o.apply(this, args);
      (name === 'getImageData' ? S.gi : S.di).push(performance.now() - t);
      return res;
    };
  }
});
await page.reload();
await page.waitForSelector('.app');
await page.getByRole('checkbox').check();
await page.getByRole('button', { name: 'Continue' }).click();
await page.getByLabel('Presage API key').fill(key);
await page.getByRole('button', { name: 'Save key' }).click();
await page.waitForSelector('.main');
await page.getByRole('button', { name: 'Turn screen light on' }).click().catch(() => {});

// Optional experiment (reversible; applies only while these processes live):
//   PRIO=high|above   raise the OS priority of every Breath Coach process
//   PRIO_CODE=low     lower VS Code (the 'Code' processes) to below-normal so it yields CPU
const PRIO = process.env.PRIO;
const PRIO_CODE = process.env.PRIO_CODE;
const priorityLog = [];
if (PRIO || PRIO_CODE) {
  const K = os.constants.priority;
  if (PRIO) {
    const pids = await app.evaluate(({ app: a }) => a.getAppMetrics().map((m) => m.pid));
    pids.push(app.process().pid);
    for (const pid of new Set(pids)) {
      try {
        os.setPriority(pid, PRIO === 'high' ? K.PRIORITY_HIGH : K.PRIORITY_ABOVE_NORMAL);
        priorityLog.push(`app ${pid} -> ${PRIO}`);
      } catch (e) {
        priorityLog.push(`app ${pid} failed: ${e.code ?? e.message}`);
      }
    }
  }
  if (PRIO_CODE) {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', '(Get-Process Code).Id'], { encoding: 'utf8', timeout: 60000 });
    for (const line of out.split(NL)) {
      const pid = Number(line.trim());
      if (!pid) continue;
      try {
        os.setPriority(pid, K.PRIORITY_BELOW_NORMAL);
        priorityLog.push(`Code ${pid} -> below-normal`);
      } catch (e) {
        priorityLog.push(`Code ${pid} failed: ${e.code ?? e.message}`);
      }
    }
  }
  console.log('PRIORITY:', JSON.stringify(priorityLog));
}

// whole-machine CPU sampler
const cpuSamples = [];
const memSamples = [];
let prev = os.cpus().map((c) => ({ ...c.times }));
const timer = setInterval(() => {
  const cur = os.cpus().map((c) => ({ ...c.times }));
  let busy = 0;
  let total = 0;
  cur.forEach((c, i) => {
    const p = prev[i];
    const idle = c.idle - p.idle;
    const all = c.user - p.user + (c.nice - p.nice) + (c.sys - p.sys) + (c.irq - p.irq) + idle;
    busy += all - idle;
    total += all;
  });
  cpuSamples.push(total ? Math.round((busy / total) * 100) : 0);
  memSamples.push(Math.round(os.freemem() / 1048576));
  prev = cur;
}, 1000);

const t0 = Date.now();
await page.getByRole('button', { name: 'Start session' }).click();
let outcome = 'timeout';
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(1000);
  const failed = await page.locator('.notice h2').count();
  if (failed) {
    outcome = await page.locator('.notice h2').first().innerText();
    break;
  }
}
const seconds = (Date.now() - t0) / 1000;
clearInterval(timer);
const P = await page.evaluate(() => window.__probe);

const pct = (arr, q) => (arr.length ? [...arr].sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(arr.length * q))] : null);
const avg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const arr = P.arrivals;
const spanS = arr.length > 1 ? (arr[arr.length - 1] - arr[0]) / 1000 : 0;
const camGaps = P.ts.slice(1).map((t, i) => (t - P.ts[i]) / 1000); // ms between camera frame timestamps
const deliverGaps = arr.slice(1).map((t, i) => t - arr[i]); // ms between frames reaching the SDK reader
const summary = {
  outcome,
  sessionSeconds: r1(seconds),
  frameFormatAndSize: `${P.fmt} ${P.size}`,
  framesReachingSdkReader: P.frames,
  readerFpsOverall: r1(spanS ? (arr.length - 1) / spanS : 0),
  cameraTimestampGapsMs: { median: r1(pct(camGaps, 0.5)), p95: r1(pct(camGaps, 0.95)), over50ms: camGaps.filter((g) => g > 50).length, of: camGaps.length },
  deliveryGapsMs: { median: r1(pct(deliverGaps, 0.5)), p95: r1(pct(deliverGaps, 0.95)) },
  drawImageMs: { avg: r1(avg(P.di)), p95: r1(pct(P.di, 0.95)) },
  getImageDataMs: { avg: r1(avg(P.gi)), p95: r1(pct(P.gi, 0.95)) },
  mainProcessFramesLines: mainArrivals.length,
  cpuPercentWholeMachine: { avg: r1(avg(cpuSamples)), max: Math.max(...cpuSamples, 0), samples: cpuSamples },
  freeMemoryMb: { min: Math.min(...memSamples, 1e9), samples: memSamples.slice(0, 6) },
};
console.log(JSON.stringify(summary, null, 2));
await page.getByRole('button', { name: 'Stop', exact: true }).click({ timeout: 3000 }).catch(() => {});
await app.close();
