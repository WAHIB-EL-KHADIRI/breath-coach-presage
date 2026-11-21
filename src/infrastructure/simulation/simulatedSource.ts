import { WARMUP_MS } from '../../shared/constants';
import type { MeasurementSource, SignalPoint, SimScenario, SourceEvent } from '../../shared/types';

export interface SimulatedDeps {
  now: () => number;
  /** Milliseconds before the first rate is produced. Defaults to the real warm-up length. */
  warmupMs?: number;
  tickMs?: number;
}

/**
 * Explicitly simulated measurement source. It never touches the camera, never
 * contacts the network, and everything it produces is synthetic. The UI shows
 * "SIMULATED" for as long as one of these is the active source.
 */
export class SimulatedSource implements MeasurementSource {
  readonly kind = 'simulated' as const;

  private readonly listeners = new Set<(e: SourceEvent) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;
  private stopped = false;
  private scenario: SimScenario = 'normal';
  private startedAt = 0;
  private lastTick = 0;
  private lastRateAt = -Infinity;
  private phase = 0;
  private simTime = 0;
  private seed = 1234567;

  constructor(private readonly deps: SimulatedDeps) {}

  subscribe(listener: (e: SourceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setScenario(scenario: SimScenario): void {
    if (scenario === this.scenario) return;
    this.scenario = scenario;
    if (!this.timer) return;
    const at = this.deps.now();
    if (scenario === 'connection-error') {
      this.emit({ type: 'error', error: { kind: 'network', code: 5, retryable: true } });
    } else {
      this.emit({ type: 'validation', kind: this.validationFor(scenario), at });
    }
  }

  async start(): Promise<void> {
    if (this.destroyed || this.timer) return;
    this.startedAt = this.lastTick = this.deps.now();
    // A short, believable "camera starting" delay, then the pipeline reports running.
    await new Promise<void>((r) => setTimeout(r, 450));
    if (this.destroyed || this.stopped) return;
    this.emit({ type: 'running' });
    this.emit({ type: 'validation', kind: this.validationFor(this.scenario), at: this.deps.now() });
    this.timer = setInterval(() => this.tick(), this.deps.tickMs ?? 100);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  destroy(): void {
    this.destroyed = true;
    void this.stop();
    this.listeners.clear();
  }

  private emit(e: SourceEvent): void {
    if (this.destroyed) return;
    for (const l of [...this.listeners]) l(e);
  }

  private validationFor(s: SimScenario) {
    return s === 'signal-lost' ? 'no-face' : s === 'motion' ? 'motion' : 'ok';
  }

  private rand(): number {
    // Small deterministic LCG so the simulated wave looks natural but is reproducible.
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }

  /** The "person" slowly relaxes from ~15 to ~11 breaths/min and drifts a little. */
  private trueRate(tSec: number): number {
    return 13 + 2.2 * Math.cos(tSec / 55) + 0.35 * Math.sin(tSec / 7);
  }

  private tick(): void {
    const now = this.deps.now();
    const dt = Math.min(500, now - this.lastTick);
    this.lastTick = now;
    const elapsed = now - this.startedAt;
    const rate = this.trueRate(elapsed / 1000);

    if (this.scenario === 'connection-error') return;
    const lost = this.scenario === 'signal-lost';
    const noisy = this.scenario === 'motion';

    const points: SignalPoint[] = [];
    if (!lost) {
      const step = 50; // 20 Hz
      for (let t = 0; t < dt; t += step) {
        this.simTime += step;
        this.phase += (2 * Math.PI * (rate / 60) * step) / 1000;
        const base = Math.sin(this.phase) + 0.25 * Math.sin(2 * this.phase + 0.8);
        const noise = (this.rand() - 0.5) * (noisy ? 1.6 : 0.12);
        points.push({ t: this.simTime, v: base + noise });
      }
      if (points.length) this.emit({ type: 'trace', points, at: now });
    }

    const gated = elapsed >= (this.deps.warmupMs ?? WARMUP_MS);
    if (gated && !lost && !noisy && now - this.lastRateAt >= 1000) {
      this.lastRateAt = now;
      const low = this.scenario === 'low-confidence';
      const confidence = low ? 28 + this.rand() * 12 : 70 + this.rand() * 14;
      this.emit({ type: 'rate', value: Math.round(rate * 10) / 10, confidence, stable: !low, at: now });
    }
  }
}
