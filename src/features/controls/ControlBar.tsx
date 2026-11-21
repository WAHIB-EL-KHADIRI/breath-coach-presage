import { LoaderCircle, Play, RotateCcw, Square } from 'lucide-react';
import { controller } from '../../app/runtime';
import { useApp } from '../../app/hooks';
import { canStart, canStop } from '../../domain/sessionMachine';

export function ControlBar() {
  const phase = useApp((s) => s.phase);
  const mode = useApp((s) => s.mode);
  const busy = phase === 'starting' || phase === 'stopping';
  const running = phase === 'running';

  return (
    <div className="controls">
      <div className="controls__row" role="group" aria-label="Session controls">
        <button
          className={`btn btn--lg ${running || phase === 'starting' ? '' : 'btn--primary'}`}
          disabled={!canStart(phase)}
          onClick={() => void controller.start()}
        >
          {phase === 'starting' ? <LoaderCircle size={18} className="spin" aria-hidden /> : <Play size={18} aria-hidden />}
          {phase === 'starting' ? 'Starting…' : phase === 'error' ? 'Try again' : mode === 'simulated' ? 'Start simulation' : 'Start session'}
        </button>
        <button
          className={`btn btn--lg ${running || phase === 'starting' ? 'btn--primary' : ''}`}
          disabled={!canStop(phase)}
          onClick={() => void controller.stop()}
        >
          {phase === 'stopping' ? <LoaderCircle size={18} className="spin" aria-hidden /> : <Square size={16} aria-hidden />}
          {phase === 'stopping' ? 'Stopping…' : 'Stop'}
        </button>
        <button className="btn btn--lg btn--ghost" disabled={phase === 'stopping'} onClick={() => void controller.reset()}>
          <RotateCcw size={16} aria-hidden />
          Reset
        </button>
      </div>
      <p className="controls__hint" aria-live="polite">
        {busy ? 'One moment…' : 'Breathe comfortably — you can stop the session at any time.'}
      </p>
    </div>
  );
}
