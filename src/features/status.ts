import type { Assessment } from '../domain/measurement';
import type { Phase } from '../domain/sessionMachine';

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger';

export interface StatusView {
  label: string;
  tone: Tone;
}

/** One plain-language status for the header, derived from the session phase and the measurement assessment. */
export function statusView(phase: Phase, a: Assessment, lastSessionMs: number | null): StatusView {
  switch (phase) {
    case 'starting':
      return { label: 'Starting…', tone: 'neutral' };
    case 'stopping':
      return { label: 'Stopping…', tone: 'neutral' };
    case 'error':
      return { label: 'Needs attention', tone: 'danger' };
    case 'idle':
      return { label: lastSessionMs != null ? `Session ended · ${formatDuration(lastSessionMs)}` : 'Ready', tone: 'neutral' };
    case 'running':
      switch (a.status) {
        case 'warming-up':
          return { label: 'Warming up', tone: 'neutral' };
        case 'live':
          return { label: 'Measuring', tone: 'ok' };
        case 'low-confidence':
          return { label: 'Low confidence', tone: 'warn' };
        case 'signal-issue':
          return { label: 'Signal lost', tone: 'warn' };
        case 'stale':
          return { label: 'Reading is stale', tone: 'warn' };
        case 'invalid':
          return { label: 'Reading rejected', tone: 'warn' };
        default:
          return { label: 'Waiting for a reading', tone: 'neutral' };
      }
  }
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}
