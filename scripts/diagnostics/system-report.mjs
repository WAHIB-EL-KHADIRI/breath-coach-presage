// Read-only hardware and OS report for the performance investigation. Changes nothing, needs no administrator rights.
// Output: shots/system-report.json (also printed). Covers CPU/clock, power plan and processor-state limits, memory/paging,
// disk type, GPU and driver, camera device, startup items, and which Windows services live in the busiest svchost processes.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';

const NL = String.fromCharCode(10);
const ps = (cmd) => {
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', cmd], { encoding: 'utf8', timeout: 120000 }).trim();
    try {
      return JSON.parse(out);
    } catch {
      return out;
    }
  } catch (e) {
    return { error: String(e.message).split(NL)[0] };
  }
};
const exe = (file, args) => {
  try {
    return execFileSync(file, args, { encoding: 'utf8', timeout: 60000 }).trim();
  } catch (e) {
    return `error: ${String(e.message).split(NL)[0]}`;
  }
};

const report = {};
report.node = { cpus: os.cpus().length, model: os.cpus()[0]?.model, osCpuMhz: os.cpus()[0]?.speed };
report.cpu = ps('Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed,CurrentClockSpeed,LoadPercentage | ConvertTo-Json');
report.memory = ps('Get-CimInstance Win32_OperatingSystem | Select-Object TotalVisibleMemorySize,FreePhysicalMemory,TotalVirtualMemorySize,FreeVirtualMemory | ConvertTo-Json');
report.pageFile = ps('Get-CimInstance Win32_PageFileUsage | Select-Object Name,AllocatedBaseSize,CurrentUsage,PeakUsage | ConvertTo-Json');
report.disk = ps('Get-PhysicalDisk | Select-Object FriendlyName,MediaType,BusType,HealthStatus | ConvertTo-Json');
report.gpu = ps('Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,DriverDate | ConvertTo-Json');
report.camera = ps('Get-PnpDevice -Class Camera -PresentOnly | Select-Object FriendlyName,Status | ConvertTo-Json');
report.startupItems = ps('Get-CimInstance Win32_StartupCommand | Select-Object Name,Location | ConvertTo-Json');
report.powerPlan = exe('powercfg', ['/getactivescheme']);
const grab = (setting) =>
  exe('powercfg', ['/query', 'SCHEME_CURRENT', 'SUB_PROCESSOR', setting])
    .split(NL)
    .filter((l) => /0x[0-9a-f]{8}/i.test(l))
    .map((l) => l.trim());
report.processorStateMaxPercent = grab('PROCTHROTTLEMAX'); // AC then DC (hex)
report.processorStateMinPercent = grab('PROCTHROTTLEMIN');
report.pendingReboot = ps('Test-Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired"');

// Which services run inside the busiest svchost processes?
const wmi = () => {
  const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process -Filter "Name=\'svchost.exe\'" | ForEach-Object { $_.ProcessId.ToString() + "|" + ($_.KernelModeTime + $_.UserModeTime) }'], { encoding: 'utf8', timeout: 90000 });
  const m = new Map();
  for (const line of out.split(NL)) {
    const [pid, t] = line.trim().split('|');
    if (pid && t) m.set(pid, Number(t) / 1e7);
  }
  return m;
};
const a = wmi();
const t0 = Date.now();
await new Promise((r) => setTimeout(r, 8000));
const b = wmi();
const dt = (Date.now() - t0) / 1000;
const busy = [...b.entries()]
  .map(([pid, t]) => ({ pid, pct: (((t - (a.get(pid) ?? t)) / dt / os.cpus().length) * 100) }))
  .sort((x, y) => y.pct - x.pct)
  .slice(0, 3);
const services = ps('Get-CimInstance Win32_Service -Filter "State=\'Running\'" | Select-Object Name,DisplayName,ProcessId | ConvertTo-Json');
report.busiestSvchost = busy.map((p) => ({
  pid: p.pid,
  cpuPercentOfMachine: Math.round(p.pct * 10) / 10,
  services: (Array.isArray(services) ? services : []).filter((s) => String(s.ProcessId) === p.pid).map((s) => s.Name),
}));

mkdirSync('shots', { recursive: true });
writeFileSync('shots/system-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
