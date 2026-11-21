import { describe, expect, it } from 'vitest';
import { assess, isValidRate } from '../src/domain/measurement';
import { BreathPacer, clampGuideBpm, cycleTimings, deriveGuidance } from '../src/domain/pacer';
import { initialMachine, transition } from '../src/domain/sessionMachine';
import { RATE_STALE_AFTER_MS, WARMUP_MS } from '../src/shared/constants';
import { RingBuffer } from '../src/shared/ringBuffer';
import { SignalStore } from '../src/app/signalStore';
import type { RateSample } from '../src/shared/types';

const T0 = 1000;
const rate = (value: number, confidence: number | null, at: number): RateSample => ({ value, confidence, stable: true, at });
const run = (now: number, r: RateSample | null, validation: { kind: any; at: number } | null = null) =>
  assess({ phase: 'running', runningSince: T0, now, validation, rate: r });

describe('measurement assessment', () => {
  it('shows no number during warm-up, even if a rate has arrived', () => {
    const a = run(T0 + 10_000, rate(14, 90, T0 + 9_000));
    expect(a.status).toBe('warming-up');
    expect(a.displayRate).toBeNull();
    expect(a.usableForGuidance).toBe(false);
    expect(a.warmupProgress).toBeCloseTo(10_000 / WARMUP_MS);
  });

  it('warm-up completion alone is not a valid measurement', () => {
    const a = run(T0 + WARMUP_MS + 1, null);
    expect(a.status).toBe('waiting-for-reading');
    expect(a.displayRate).toBeNull();
  });

  it('accepts a fresh, confident reading', () => {
    const now = T0 + WARMUP_MS + 5000;
    const a = run(now, rate(13.4, 72, now - 1000));
    expect(a).toMatchObject({ status: 'live', displayRate: 13.4, usableForGuidance: true });
  });

  it('displays but does not steer with low or missing confidence (threshold is 50 percent)', () => {
    const now = T0 + WARMUP_MS + 5000;
    expect(run(now, rate(13, 49.9, now - 500))).toMatchObject({ status: 'low-confidence', displayRate: 13, usableForGuidance: false });
    expect(run(now, rate(13, 50, now - 500)).usableForGuidance).toBe(true);
    expect(run(now, rate(13, null, now - 500))).toMatchObject({ status: 'low-confidence', usableForGuidance: false, confidence: null });
  });

  it('never shows an old number as live', () => {
    const at = T0 + WARMUP_MS + 1000;
    const a = run(at + RATE_STALE_AFTER_MS + 1, rate(13, 90, at));
    expect(a.status).toBe('stale');
    expect(a.displayRate).toBeNull();
    expect(a.lastReading?.value).toBe(13);
  });

  it('rejects invalid values', () => {
    const now = T0 + WARMUP_MS + 2000;
    for (const v of [NaN, Infinity, 0, -3, 400]) {
      expect(isValidRate(v)).toBe(false);
      expect(run(now, rate(v, 90, now - 100))).toMatchObject({ status: 'invalid', displayRate: null, usableForGuidance: false });
    }
  });

  it('a blocking validation issue withdraws the live reading', () => {
    const now = T0 + WARMUP_MS + 2000;
    const a = run(now, rate(13, 90, now - 100), { kind: 'no-face', at: now - 50 });
    expect(a.status).toBe('signal-issue');
    expect(a.displayRate).toBeNull();
    expect(run(now, rate(13, 90, now - 100), { kind: 'tuning', at: now }).status).toBe('live');
  });

  it('ignores readings produced before this run started', () => {
    const now = T0 + WARMUP_MS + 2000;
    expect(run(now, rate(13, 90, T0 - 5)).status).toBe('waiting-for-reading');
  });

  it('is idle outside a running session', () => {
    expect(assess({ phase: 'idle', runningSince: null, now: 5, validation: null, rate: rate(12, 90, 1) }).displayRate).toBeNull();
  });
});

describe('guidance target vs measured rate', () => {
  it('clamps only the guide, and the measured value stays untouched', () => {
    const now = T0 + WARMUP_MS + 3000;
    const a = run(now, rate(20.3, 80, now - 200));
    expect(a.displayRate).toBe(20.3);
    expect(deriveGuidance(a)).toEqual({ mode: 'adaptive', targetBpm: 12 });
    expect(deriveGuidance(run(now, rate(3, 80, now - 200))).targetBpm).toBe(6);
    expect(deriveGuidance(run(now, rate(9.26, 80, now - 200))).targetBpm).toBe(9.5);
  });

  it('falls back to the 6/min default without a reliable reading', () => {
    expect(deriveGuidance(run(T0 + 1000, null))).toEqual({ mode: 'default', targetBpm: 6 });
    const now = T0 + WARMUP_MS + 3000;
    expect(deriveGuidance(run(now, rate(10, 20, now - 100)))).toEqual({ mode: 'default', targetBpm: 6 });
  });

  it('clamps sensibly', () => {
    expect(clampGuideBpm(NaN)).toBe(6);
    expect(clampGuideBpm(5)).toBe(6);
    expect(clampGuideBpm(13)).toBe(12);
  });
});

describe('breath pacer', () => {
  it('splits every cycle 40% inhale / 60% exhale, with no hold', () => {
    for (const bpm of [6, 7.5, 12]) {
      const t = cycleTimings(bpm);
      expect(t.inhaleMs / t.periodMs).toBeCloseTo(0.4);
      expect(t.exhaleMs / t.periodMs).toBeCloseTo(0.6);
      expect(t.inhaleMs + t.exhaleMs).toBeCloseTo(t.periodMs);
    }
  });

  it('is driven by the clock: phase and level at known times (6/min → 10 s cycle)', () => {
    const p = new BreathPacer(0, 6);
    expect(p.frame(0)).toMatchObject({ phase: 'inhale', level: 0 });
    expect(p.frame(2000).level).toBeCloseTo(0.5);
    expect(p.frame(3999)).toMatchObject({ phase: 'inhale' });
    expect(p.frame(4000)).toMatchObject({ phase: 'exhale' });
    expect(p.frame(4000).level).toBeCloseTo(1);
    expect(p.frame(7000).level).toBeCloseTo(0.5);
    expect(p.frame(10_000)).toMatchObject({ phase: 'inhale', cycleIndex: 1 });
  });

  it('changes rhythm only at a cycle boundary, and gradually', () => {
    const p = new BreathPacer(0, 6, 1);
    p.setDesired(12);
    expect(p.frame(5000).cycleBpm).toBe(6); // mid-cycle: unchanged
    expect(p.frame(10_000).cycleBpm).toBe(7); // next boundary: one step
    let t = 10_000;
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      t += 60_000 / (seen.at(-1) ?? 7);
      seen.push(p.frame(t + 1).cycleBpm);
    }
    expect(Math.max(...seen)).toBe(12);
    for (let i = 1; i < seen.length; i++) expect(Math.abs(seen[i]! - seen[i - 1]!)).toBeLessThanOrEqual(1);
  });

  it('survives a long gap (minimised window) and a clock restart without spinning or throwing', () => {
    const p = new BreathPacer(0, 6);
    const f = p.frame(3_600_000);
    expect(f.level).toBeGreaterThanOrEqual(0);
    expect(f.level).toBeLessThanOrEqual(1);
    expect(p.frame(10).phase).toBe('inhale');
  });
});

describe('session machine', () => {
  it('walks the happy path', () => {
    let s = initialMachine;
    s = transition(s, { type: 'START' });
    expect(s.phase).toBe('starting');
    s = transition(s, { type: 'RUNNING' });
    s = transition(s, { type: 'STOP' });
    expect(s.phase).toBe('stopping');
    s = transition(s, { type: 'STOPPED' });
    expect(s.phase).toBe('idle');
  });

  it('ignores illegal events so repeated clicks are harmless', () => {
    expect(transition(initialMachine, { type: 'STOP' })).toBe(initialMachine);
    const starting = transition(initialMachine, { type: 'START' });
    expect(transition(starting, { type: 'START' })).toBe(starting);
    const stopping = transition(transition(starting, { type: 'RUNNING' }), { type: 'STOP' });
    expect(transition(stopping, { type: 'START' })).toBe(stopping);
    expect(transition(stopping, { type: 'RESET' })).toBe(stopping);
  });

  it('records errors and can restart from them', () => {
    const e = { kind: 'invalid-key', retryable: false } as const;
    let s = transition(transition(initialMachine, { type: 'START' }), { type: 'FAIL', error: e });
    expect(s).toEqual({ phase: 'error', error: e });
    s = transition(s, { type: 'START' });
    expect(s).toEqual({ phase: 'starting', error: null });
  });
});

describe('bounded memory', () => {
  it('ring buffer never exceeds capacity and keeps the newest', () => {
    const r = new RingBuffer<number>(3);
    for (let i = 0; i < 10; i++) r.push(i);
    expect(r.toArray()).toEqual([7, 8, 9]);
    expect(r.length).toBe(3);
    r.clear();
    expect(r.length).toBe(0);
  });

  it('signal store stays bounded, drops non-increasing/invalid points, and clears', () => {
    const s = new SignalStore();
    s.push(Array.from({ length: 5000 }, (_, i) => ({ t: i, v: Math.sin(i) })), 1);
    expect(s.size).toBeLessThanOrEqual(1200);
    s.push([{ t: 10, v: 1 }, { t: NaN, v: 1 }, { t: 6000, v: Infinity }], 2);
    expect(s.size).toBeLessThanOrEqual(1200);
    s.clear();
    expect(s.size).toBe(0);
    expect(s.lastReceivedAt).toBe(-Infinity);
  });
});
