import { Settings, TriangleAlert } from 'lucide-react';
import { controller } from '../../app/runtime';
import { useApp } from '../../app/hooks';
import { describeError } from '../../domain/messages';
import { statusView } from '../status';

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7df0d6" />
          <stop offset="1" stopColor="#a994ff" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="14" fill="none" stroke="url(#lg)" strokeWidth="1.4" opacity="0.5" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="url(#lg)" strokeWidth="1.4" opacity="0.8" />
      <circle cx="16" cy="16" r="4.6" fill="url(#lg)" />
    </svg>
  );
}

export function Header() {
  const phase = useApp((s) => s.phase);
  const assessment = useApp((s) => s.assessment);
  const last = useApp((s) => s.lastSessionMs);
  const mode = useApp((s) => s.mode);
  const showSettings = useApp((s) => s.screen === 'main');
  const view = statusView(phase, assessment, last);

  return (
    <header className="header">
      <div className="brand">
        <Logo />
        <span>Breath Coach</span>
      </div>
      <div className="header__right">
        {mode === 'simulated' && (
          <span className="sim-badge" title="All values on screen are synthetic. No camera is used.">
            SIMULATED
          </span>
        )}
        <div className="status-pill" data-tone={view.tone === 'neutral' ? undefined : view.tone} role="status" aria-live="polite">
          <span className="status-pill__dot" aria-hidden />
          <span>{view.label}</span>
        </div>
        {showSettings && (
          <button className="icon-btn" aria-label="Settings" title="Settings" onClick={() => controller.setOverlay('settings')}>
            <Settings size={17} aria-hidden />
          </button>
        )}
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <span>Breath Coach is for relaxation. It is not a medical device and doesn’t diagnose or treat anything.</span>
      <button className="link-btn" onClick={() => controller.setOverlay('privacy')}>
        How your privacy is handled
      </button>
    </footer>
  );
}

/** Error and recovery card. Always plain language with a next step; raw SDK text never appears. */
export function StatusNotice() {
  const error = useApp((s) => s.error);
  if (!error) return null;
  const copy = describeError(error);
  return (
    <div className="notice" role="alert">
      <h2>
        <TriangleAlert size={20} aria-hidden />
        {copy.title}
      </h2>
      <p>{copy.body}</p>
      <ol>
        {copy.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <div className="notice__actions">
        {copy.actions.includes('retry') && (
          <button className="btn btn--primary btn--sm" onClick={() => void controller.start()}>
            Try again
          </button>
        )}
        {copy.actions.includes('open-settings') && (
          <button className="btn btn--primary btn--sm" onClick={() => controller.setOverlay('settings')}>
            Open settings
          </button>
        )}
        {copy.actions.includes('use-simulation') && (
          <button className="btn btn--sm" onClick={() => void controller.setMode('simulated')} title="Switches to clearly labelled synthetic data">
            Use simulation instead
          </button>
        )}
        <button className="btn btn--ghost btn--sm" onClick={() => void controller.reset()}>
          Dismiss
        </button>
      </div>
      {copy.reference && <p className="notice__ref">{copy.reference}</p>}
    </div>
  );
}
