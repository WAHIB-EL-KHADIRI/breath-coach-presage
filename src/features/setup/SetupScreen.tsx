import { useState } from 'react';
import { Eye, EyeOff, ExternalLink, Lightbulb, Move, ScanFace, Sofa } from 'lucide-react';
import { controller } from '../../app/runtime';
import { useApp } from '../../app/hooks';

export function KeyField({ onSaved }: { onSaved?: () => void }) {
  const keyStatus = useApp((s) => s.keyStatus);
  const hasKey = useApp((s) => s.hasKey);
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const canRemember = keyStatus.encryptionAvailable;

  const save = async () => {
    setProblem(null);
    const r = await controller.saveKey(value, remember && canRemember);
    if (r.ok) {
      setValue('');
      onSaved?.();
    } else {
      setProblem(
        r.reason === 'shape'
          ? 'That doesn’t look like an API key. Check for spaces or missing characters.'
          : 'The key could not be stored securely, so it was not saved.',
      );
    }
  };

  return (
    <div>
      <div className="field">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && value && void save()}
          placeholder={hasKey ? '•••••••••••• (a key is set)' : 'Paste your Presage API key'}
          aria-label="Presage API key"
          autoComplete="off"
          spellCheck={false}
        />
        <button className="icon-btn" style={{ border: 0 }} aria-label={show ? 'Hide key' : 'Show key'} aria-pressed={show} onClick={() => setShow(!show)}>
          {show ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
        </button>
      </div>
      {problem && (
        <p className="help" data-tone="danger" role="alert">
          {problem}
        </p>
      )}
      <label className="check" style={{ marginTop: 12, opacity: canRemember ? 1 : 0.55 }}>
        <input type="checkbox" disabled={!canRemember} checked={remember && canRemember} onChange={(e) => setRemember(e.target.checked)} />
        <span>
          Remember on this device
          <small className="help" style={{ display: 'block', marginTop: 2 }}>
            {canRemember
              ? 'Encrypted with your operating system’s protection. Off: the key is forgotten when the app closes.'
              : 'Unavailable: this system can’t protect a stored key, so it will only be kept until you close the app.'}
          </small>
        </span>
      </label>
      <div className="actions" style={{ marginTop: 14 }}>
        <button className="btn btn--primary btn--sm" disabled={!value} onClick={() => void save()}>
          Save key
        </button>
        <button className="btn btn--ghost btn--sm" onClick={() => void window.breathCoach?.openExternal('presage-console')}>
          Get a key <ExternalLink size={13} aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function SetupScreen() {
  const hasKey = useApp((s) => s.hasKey);
  return (
    <main className="flow enter" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
      <div className="flow__copy" style={{ justifySelf: 'end' }}>
        <p className="steps">Step 1 of 2 · Connect</p>
        <h1 className="display">
          Connect <em>Presage.</em>
        </h1>
        <p className="lede">An API key lets the SmartSpectra engine measure your breathing. It’s checked by Presage and never written to logs.</p>
        <KeyField onSaved={() => controller.goto('main')} />
        <div className="actions" style={{ marginTop: 6 }}>
          {hasKey && (
            <button className="btn" onClick={() => controller.goto('main')}>
              Continue with the saved key
            </button>
          )}
          <button
            className="btn btn--ghost"
            title="Synthetic data, no camera, labelled SIMULATED at all times"
            onClick={() => {
              void controller.setMode('simulated').then(() => controller.goto('main'));
            }}
          >
            Explore without a camera (simulated)
          </button>
          {!hasKey && (
            <button className="btn btn--ghost" onClick={() => controller.goto('main')}>
              Skip for now
            </button>
          )}
        </div>
      </div>

      <div className="flow__copy" style={{ justifySelf: 'start' }}>
        <p className="steps">Step 2 of 2 · Position</p>
        <h2 className="display" style={{ fontSize: 'clamp(1.7rem,2.4vw,2.2rem)' }}>
          Find a calm frame.
        </h2>
        <FramingIllustration />
        <ul className="facts">
          <li>
            <ScanFace size={18} aria-hidden />
            <span>Face the camera with your face in the upper part of the frame.</span>
          </li>
          <li>
            <Move size={18} aria-hidden />
            <span>Keep your shoulders and upper chest visible.</span>
          </li>
          <li>
            <Lightbulb size={18} aria-hidden />
            <span>Soft, even light on your face; no bright window behind you.</span>
          </li>
          <li>
            <Sofa size={18} aria-hidden />
            <span>Sit comfortably, rest your hands, and keep still.</span>
          </li>
        </ul>
      </div>
    </main>
  );
}

function FramingIllustration() {
  return (
    <svg viewBox="0 0 320 170" width="100%" style={{ maxWidth: 360, borderRadius: 14, border: '1px solid var(--line)', background: 'rgba(4,7,14,.6)' }} role="img" aria-label="Illustration: head and shoulders centred in the frame">
      <rect x="60" y="14" width="200" height="142" rx="10" fill="none" stroke="rgba(125,240,214,.45)" strokeDasharray="5 5" />
      <circle cx="160" cy="68" r="26" fill="rgba(125,240,214,.14)" stroke="rgba(125,240,214,.7)" />
      <path d="M96 156 C100 112 128 102 160 102 C192 102 220 112 224 156" fill="rgba(169,148,255,.12)" stroke="rgba(169,148,255,.7)" />
      <path d="M130 124 h60" stroke="rgba(125,240,214,.5)" strokeLinecap="round" />
    </svg>
  );
}
