// Which processes use the CPU right now? Two snapshots of per-process CPU time, a few seconds apart.
// Read-only (Get-Process). Prints the top consumers as a share of the whole machine.
import { execFileSync } from 'node:child_process';
import os from 'node:os';

const NL = String.fromCharCode(10);
const snap = () => {
  // WMI process times (100 ns units) are readable for protected processes too (Defender, System), unlike Get-Process.
  const cmd = 'Get-CimInstance Win32_Process | ForEach-Object { $_.ProcessId.ToString() + "|" + $_.Name + "|" + ($_.KernelModeTime + $_.UserModeTime) }';
  const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', cmd], { encoding: 'utf8', timeout: 90000 });
  const m = new Map();
  for (const line of out.split(NL)) {
    const [id, name, t] = line.trim().split('|');
    if (id && name && t) m.set(id, { name: name.replace('.exe', ''), cpu: Number(t) / 1e7 });
  }
  return m;
};

const seconds = Number(process.argv[2] ?? 8);
const cores = os.cpus().length;
const a = snap();
const t0 = Date.now();
await new Promise((r) => setTimeout(r, seconds * 1000));
const b = snap();
const dt = (Date.now() - t0) / 1000;

const byName = new Map();
for (const [id, p] of b) {
  const before = a.get(id);
  if (!before) continue;
  const d = Math.max(0, p.cpu - before.cpu);
  byName.set(p.name, (byName.get(p.name) ?? 0) + d);
}
const rows = [...byName.entries()].map(([name, d]) => ({ name, pct: (d / dt / cores) * 100 })).sort((x, y) => y.pct - x.pct).slice(0, 12);
console.log(`window ${dt.toFixed(1)} s, ${cores} logical cores; share of the WHOLE machine:`);
for (const r of rows) console.log(`  ${r.name.padEnd(28)} ${r.pct.toFixed(1)}%`);
console.log(`  (sum of listed: ${rows.reduce((s, r) => s + r.pct, 0).toFixed(1)}%)`);
