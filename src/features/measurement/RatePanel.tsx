import type { ReactElement } from 'react';
import { CircleCheck, Hourglass, Info, SignalLow, TriangleAlert } from 'lucide-react';
import { useApp } from '../../app/hooks';
import { WARMUP_MS } from '../../shared/constants';
import type { Assessment } from '../../domain/measurement';
import { VALIDATION_COPY } from '../../domain/messages';

function chip(a: Assessment): { text: string; tone: 'neutral' | 'ok' | 'warn'; icon: ReactElement } | null {
  switch (a.status) {
    case 'live':
      return { text: 'Valid reading', tone: 'ok', icon: <CircleCheck size={13} aria-hidden /> };
    case 'low-confidence':
      return { text: 'Low confidence', tone: 'warn', icon: <TriangleAlert size={13} aria-hidden /> };
    case 'warming-up':
      return { text: 'Warming up', tone: 'neutral', icon: <Hourglass size={13} aria-hidden /> };
    case 'signal-issue':
      return { text: 'Signal lost', tone: 'warn', icon: <SignalLow size={13} aria-hidden /> };
    case 'stale':
      return { text: 'Reading is stale', tone: 'warn', icon: <TriangleAlert size={13} aria-hidden /> };
    case 'invalid':
      return { text: 'Reading rejected', tone: 'warn', icon: <TriangleAlert size={13} aria-hidden /> };
    case 'waiting-for-reading':
      return { text: 'Waiting for a reading', tone: 'neutral', icon: <Hourglass size={13} aria-hidden /> };
    default:
      return null;
  }
}

function note(a: Assessment, simulated: boolean): string {
  switch (a.status) {
    case 'idle':
      return 'Press Start to begin. Your measured rate will appear here.';
    case 'starting':
      return 'Opening the camera…';
    case 'warming-up':
      return 'Gathering enough signal to measure. No number is shown until then.';
    case 'waiting-for-reading':
      return 'Warm-up is complete. Waiting for the first valid reading.';
    case 'signal-issue':
      return a.issue ? VALIDATION_COPY[a.issue].title + ' — no live reading.' : 'No live reading.';
    case 'stale':
      return 'No fresh reading for a while, so nothing is shown as live.';
    case 'invalid':
      return 'The last value was outside a plausible range and was discarded.';
    case 'low-confidence':
      return a.confidence == null
        ? 'The source gave no confidence for this value, so it does not steer the guide.'
        : 'Shown as measured, but confidence is too low to steer the guide.';
    case 'live':
      return simulated ? 'Synthetic value from the simulation.' : 'An average over recent breaths, not each single breath.';
  }
}

export function RatePanel() {
  const a = useApp((s) => s.assessment);
  const simulated = useApp((s) => s.mode === 'simulated');
  const c = chip(a);
  const empty = a.displayRate == null;
  const warm = a.status === 'warming-up';
  const secs = Math.round(a.warmupProgress * (WARMUP_MS / 1000));

  return (
    <section className="panel" aria-labelledby="rate-h">
      <div className="eyebrow">
        <span id="rate-h">Measured breathing rate</span>
        {c && (
          <span className="chip" data-tone={c.tone}>
            {c.icon}
            {c.text}
          </span>
        )}
      </div>

      <div className="rate__value">
        <span className="rate__number num" data-empty={empty} aria-label={empty ? 'No reading' : `${a.displayRate!.toFixed(1)} breaths per minute`}>
          {empty ? '– –' : a.displayRate!.toFixed(1)}
        </span>
        <span className="rate__unit">breaths / min</span>
      </div>
      <p className="rate__note" role="status">
        {note(a, simulated)}
      </p>

      {warm && (
        <div className="meter">
          <div className="meter__head">
            <span>Warm-up progress</span>
            <span className="num">{secs} s / {WARMUP_MS / 1000} s</span>
          </div>
          <div
            className="meter__track"
            role="progressbar"
            aria-label="Warm-up progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(a.warmupProgress * 100)}
          >
            <div className="meter__fill" data-tone="violet" style={{ ['--v' as string]: a.warmupProgress }} />
          </div>
        </div>
      )}

      {!warm && a.status !== 'idle' && a.status !== 'starting' && (
        <div className="meter">
          <div className="meter__head">
            <span>Signal confidence (from source)</span>
            <span className="num">{a.confidence == null ? 'n/a' : `${Math.round(a.confidence)}%`}</span>
          </div>
          <div className="meter__track" role="img" aria-label={a.confidence == null ? 'Confidence not available' : `Confidence ${Math.round(a.confidence)} percent`}>
            <div className="meter__fill" data-tone={a.usableForGuidance ? undefined : 'warn'} style={{ ['--v' as string]: (a.confidence ?? 0) / 100 }} />
          </div>
        </div>
      )}

      {a.lastReading && a.displayRate == null && (
        <p className="rate__note" style={{ marginTop: 8 }}>
          <Info size={12} aria-hidden style={{ verticalAlign: -2, marginRight: 4 }} />
          Previous reading {a.lastReading.value.toFixed(1)} · {Math.round(a.lastReading.ageMs / 1000)} s ago — not live.
        </p>
      )}
    </section>
  );
}
