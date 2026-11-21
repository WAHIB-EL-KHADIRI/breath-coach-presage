import {
  GUIDE_DEFAULT_BPM,
  GUIDE_MAX_BPM,
  GUIDE_MAX_STEP_BPM,
  GUIDE_MIN_BPM,
  INHALE_FRACTION,
} from '../shared/constants';
import type { Assessment } from './measurement';

export type BreathPhase = 'inhale' | 'exhale';

export interface PacerFrame {
  phase: BreathPhase;
  /** 0–1 progress through the current phase. */
  phaseProgress: number;
  /** 0 (fully contracted) – 1 (fully expanded), eased. */
  level: number;
  phaseRemainingMs: number;
  /** Rhythm of the cycle currently being shown, breaths per minute. */
  cycleBpm: number;
  cycleIndex: number;
}

export interface Guidance {
  /** `adaptive`: follows a valid measured rate. `default`: fixed guide rhythm. */
  mode: 'adaptive' | 'default';
  targetBpm: number;
}

export function clampGuideBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return GUIDE_DEFAULT_BPM;
  return Math.min(GUIDE_MAX_BPM, Math.max(GUIDE_MIN_BPM, bpm));
}

export function cycleTimings(bpm: number): { periodMs: number; inhaleMs: number; exhaleMs: number } {
  const periodMs = 60_000 / clampGuideBpm(bpm);
  const inhaleMs = periodMs * INHALE_FRACTION;
  return { periodMs, inhaleMs, exhaleMs: periodMs - inhaleMs };
}

/** The guide follows a measured rate only when that reading is fresh, valid and confident. */
export function deriveGuidance(a: Pick<Assessment, 'usableForGuidance' | 'displayRate'>): Guidance {
  if (a.usableForGuidance && a.displayRate != null) {
    // Half-breath steps keep the target from chasing measurement jitter.
    return { mode: 'adaptive', targetBpm: clampGuideBpm(Math.round(a.displayRate * 2) / 2) };
  }
  return { mode: 'default', targetBpm: GUIDE_DEFAULT_BPM };
}

const ease = (p: number) => 0.5 - 0.5 * Math.cos(Math.PI * p);

/**
 * Breath rhythm engine. Driven by a monotonic clock, never by frame counts.
 * A new target only takes effect at a cycle boundary and moves at most
 * GUIDE_MAX_STEP_BPM per cycle so the rhythm never jumps.
 */
export class BreathPacer {
  private cycleStart: number;
  private cycleBpm: number;
  private desired: number;
  private cycleIndex = 0;

  constructor(
    now: number,
    initialBpm: number = GUIDE_DEFAULT_BPM,
    private readonly maxStep: number = GUIDE_MAX_STEP_BPM,
  ) {
    this.cycleStart = now;
    this.cycleBpm = clampGuideBpm(initialBpm);
    this.desired = this.cycleBpm;
  }

  setDesired(bpm: number): void {
    this.desired = clampGuideBpm(bpm);
  }

  /** Restart a cycle at `now` with the default rhythm (used by Reset and new sessions). */
  reset(now: number, bpm: number = GUIDE_DEFAULT_BPM): void {
    this.cycleStart = now;
    this.cycleBpm = clampGuideBpm(bpm);
    this.desired = this.cycleBpm;
    this.cycleIndex = 0;
  }

  frame(now: number): PacerFrame {
    if (now < this.cycleStart) this.cycleStart = now; // clock restarted: re-anchor
    let guard = 0;
    for (;;) {
      const { periodMs } = cycleTimings(this.cycleBpm);
      if (now < this.cycleStart + periodMs) break;
      this.cycleStart += periodMs;
      this.cycleIndex++;
      this.cycleBpm = this.stepToward(this.cycleBpm, this.desired);
      if (++guard > 200) {
        // Window was hidden for a long time: re-anchor instead of spinning.
        this.cycleStart = now;
        break;
      }
    }
    const { periodMs, inhaleMs, exhaleMs } = cycleTimings(this.cycleBpm);
    const t = Math.min(now - this.cycleStart, periodMs);
    if (t < inhaleMs) {
      const p = t / inhaleMs;
      return { phase: 'inhale', phaseProgress: p, level: ease(p), phaseRemainingMs: inhaleMs - t, cycleBpm: this.cycleBpm, cycleIndex: this.cycleIndex };
    }
    const p = (t - inhaleMs) / exhaleMs;
    return { phase: 'exhale', phaseProgress: p, level: 1 - ease(p), phaseRemainingMs: periodMs - t, cycleBpm: this.cycleBpm, cycleIndex: this.cycleIndex };
  }

  private stepToward(current: number, target: number): number {
    const d = target - current;
    if (Math.abs(d) <= this.maxStep) return target;
    return current + Math.sign(d) * this.maxStep;
  }
}
