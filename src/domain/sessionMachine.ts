import type { SourceError } from '../shared/types';

/**
 * Lifecycle of one measurement session. "Warming up" and "live" are not phases:
 * they are derived from elapsed time and data validity in `assess()`.
 */
export type Phase = 'idle' | 'starting' | 'running' | 'stopping' | 'error';

export type MachineEvent =
  | { type: 'START' }
  | { type: 'RUNNING' }
  | { type: 'STOP' }
  | { type: 'STOPPED' }
  | { type: 'FAIL'; error: SourceError }
  | { type: 'RESET' };

export interface MachineState {
  phase: Phase;
  error: SourceError | null;
}

export const initialMachine: MachineState = { phase: 'idle', error: null };

/** Pure transition function. Illegal events are ignored, which makes repeated clicks harmless. */
export function transition(s: MachineState, e: MachineEvent): MachineState {
  switch (e.type) {
    case 'START':
      return s.phase === 'idle' || s.phase === 'error' ? { phase: 'starting', error: null } : s;
    case 'RUNNING':
      return s.phase === 'starting' ? { phase: 'running', error: null } : s;
    case 'STOP':
      return s.phase === 'starting' || s.phase === 'running' ? { phase: 'stopping', error: null } : s;
    case 'STOPPED':
      return s.phase === 'stopping' ? { phase: 'idle', error: null } : s;
    case 'FAIL':
      return s.phase === 'starting' || s.phase === 'running' || s.phase === 'stopping'
        ? { phase: 'error', error: e.error }
        : s;
    case 'RESET':
      return s.phase === 'stopping' ? s : { phase: 'idle', error: null };
  }
}

export const canStart = (p: Phase) => p === 'idle' || p === 'error';
export const canStop = (p: Phase) => p === 'starting' || p === 'running';
export const isBusy = (p: Phase) => p === 'starting' || p === 'stopping';
