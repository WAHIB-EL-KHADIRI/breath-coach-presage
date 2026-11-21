export interface CpuTimes {
  idle: number;
  busy: number;
}

/** Sum of per-core times from os.cpus(): `busy` is everything that is not idle. */
export function sumCpuTimes(cpus: { times: { user: number; nice: number; sys: number; idle: number; irq: number } }[]): CpuTimes {
  let idle = 0;
  let busy = 0;
  for (const c of cpus) {
    idle += c.times.idle;
    busy += c.times.user + c.times.nice + c.times.sys + c.times.irq;
  }
  return { idle, busy };
}

/** Whole-machine CPU use (0–100) between two snapshots. Returns null when no time has passed. */
export function cpuPercent(prev: CpuTimes, cur: CpuTimes): number | null {
  const dIdle = cur.idle - prev.idle;
  const dBusy = cur.busy - prev.busy;
  const total = dIdle + dBusy;
  if (total <= 0) return null;
  return Math.round((dBusy / total) * 100);
}
