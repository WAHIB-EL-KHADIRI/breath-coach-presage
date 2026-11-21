import {
  LAST_READING_FORGET_MS,
  MAX_PLAUSIBLE_RATE,
  MIN_GUIDANCE_CONFIDENCE,
  RATE_STALE_AFTER_MS,
  WARMUP_MS,
} from '../shared/constants';
import type { RateSample, ValidationKind } from '../shared/types';
import type { Phase } from './sessionMachine';

export type MeasurementStatus =
  | 'idle'
  | 'starting'
  | 'warming-up'
  | 'waiting-for-reading'
  | 'live'
  | 'low-confidence'
  | 'stale'
  | 'signal-issue'
  | 'invalid';

export interface Assessment {
  status: MeasurementStatus;
  /** 0–1, purely elapsed-time based. Not a confidence value. */
  warmupProgress: number;
  /** What the rate display may show, as measured. null → show dashes. */
  displayRate: number | null;
  /** Source-reported confidence (percent) of the displayed reading, or null when unavailable. */
  confidence: number | null;
  /** True only for a fresh, valid reading with confidence ≥ MIN_GUIDANCE_CONFIDENCE. */
  usableForGuidance: boolean;
  /** A previous valid reading to mention (muted, with its age) when no live value can be shown. */
  lastReading: { value: number; ageMs: number } | null;
  issue: ValidationKind | null;
}

export interface AssessInput {
  phase: Phase;
  runningSince: number | null;
  now: number;
  validation: { kind: ValidationKind; at: number } | null;
  rate: RateSample | null;
}

/** Validation kinds that do not stop a measurement. */
const NON_BLOCKING: ReadonlySet<ValidationKind> = new Set(['ok', 'tuning']);

export function isBlockingIssue(kind: ValidationKind | null | undefined): kind is ValidationKind {
  return kind != null && !NON_BLOCKING.has(kind);
}

export function isValidRate(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= MAX_PLAUSIBLE_RATE;
}

const EMPTY = {
  warmupProgress: 0,
  displayRate: null,
  confidence: null,
  usableForGuidance: false,
  lastReading: null,
  issue: null,
} as const;

/**
 * Decides what the app may claim about the measurement right now. Pure: every
 * time-dependent judgement takes `now` explicitly, so it is testable and the
 * UI can never show an old number as if it were live.
 */
export function assess(input: AssessInput): Assessment {
  const { phase, runningSince, now, validation, rate } = input;

  if (phase === 'starting') return { ...EMPTY, status: 'starting' };
  if (phase !== 'running' || runningSince == null) return { ...EMPTY, status: 'idle' };

  const elapsed = Math.max(0, now - runningSince);
  const warmupProgress = Math.min(1, elapsed / WARMUP_MS);
  const issue = isBlockingIssue(validation?.kind) ? validation.kind : null;

  // A reading is only a candidate if it was produced during this run.
  const candidate = rate && rate.at >= runningSince ? rate : null;
  const age = candidate ? Math.max(0, now - candidate.at) : 0;
  const lastReading =
    candidate && isValidRate(candidate.value) && age <= LAST_READING_FORGET_MS
      ? { value: candidate.value, ageMs: age }
      : null;

  const base = { warmupProgress, issue, lastReading } as const;
  const none = { displayRate: null, confidence: null, usableForGuidance: false } as const;

  // Finishing the warm-up is necessary but never sufficient: validity is judged below.
  if (warmupProgress < 1) return { ...base, ...none, status: 'warming-up', lastReading: null };
  if (issue) return { ...base, ...none, status: 'signal-issue' };
  if (!candidate) return { ...base, ...none, status: 'waiting-for-reading' };
  if (!isValidRate(candidate.value)) return { ...base, ...none, status: 'invalid', lastReading: null };
  if (age > RATE_STALE_AFTER_MS) return { ...base, ...none, status: 'stale' };

  const confidence =
    candidate.confidence != null && Number.isFinite(candidate.confidence)
      ? Math.min(100, Math.max(0, candidate.confidence))
      : null;
  if (confidence == null || confidence < MIN_GUIDANCE_CONFIDENCE) {
    return { ...base, status: 'low-confidence', displayRate: candidate.value, confidence, usableForGuidance: false, lastReading: null };
  }
  return { ...base, status: 'live', displayRate: candidate.value, confidence, usableForGuidance: true, lastReading: null };
}

export function sameAssessment(a: Assessment, b: Assessment): boolean {
  return (
    a.status === b.status &&
    a.displayRate === b.displayRate &&
    a.confidence === b.confidence &&
    a.usableForGuidance === b.usableForGuidance &&
    a.issue === b.issue &&
    Math.round(a.warmupProgress * 100) === Math.round(b.warmupProgress * 100) &&
    (a.lastReading?.value ?? null) === (b.lastReading?.value ?? null) &&
    Math.floor((a.lastReading?.ageMs ?? 0) / 1000) === Math.floor((b.lastReading?.ageMs ?? 0) / 1000)
  );
}
