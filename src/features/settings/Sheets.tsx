import { useEffect } from 'react';
import { Trash2, X } from 'lucide-react';
import { controller } from '../../app/runtime';
import { useApp } from '../../app/hooks';
import { canStart } from '../../domain/sessionMachine';
import { PrivacyContent } from '../consent/PrivacyContent';
import { KeyField } from '../setup/SetupScreen';

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet__head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose} autoFocus>
            <X size={17} aria-hidden />
          </button>
        </div>
        <div className="sheet__body">{children}</div>
      </aside>
    </>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="row">
      <div className="row__text">
        {label}
        {hint && <small>{hint}</small>}
      </div>
      <button className="switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />
    </div>
  );
}

export function PrivacySheet() {
  return (
    <Sheet title="Privacy" onClose={() => controller.setOverlay('none')}>
      <PrivacyContent />
    </Sheet>
  );
}

export function SettingsSheet() {
  const prefs = useApp((s) => s.prefs);
  const mode = useApp((s) => s.mode);
  const phase = useApp((s) => s.phase);
  const hasKey = useApp((s) => s.hasKey);
  const stored = useApp((s) => s.keyStatus.stored);
  const idle = canStart(phase);

  return (
    <Sheet title="Settings" onClose={() => controller.setOverlay('none')}>
      <section className="section">
        <h3>Measurement source</h3>
        <div className="segmented" role="group" aria-label="Measurement source">
          <button aria-pressed={mode === 'presage'} disabled={!idle} onClick={() => void controller.setMode('presage')}>
            Camera (Presage)
          </button>
          <button aria-pressed={mode === 'simulated'} disabled={!idle} onClick={() => void controller.setMode('simulated')}>
            Simulation
          </button>
        </div>
        <p className="help">{idle ? 'Switching clears the current data so real and simulated values never mix.' : 'Stop the session to change the source.'}</p>
      </section>

      <section className="section">
        <h3>Presage API key</h3>
        <p style={{ marginBottom: 10 }}>
          {hasKey ? (stored ? 'A key is stored on this device (encrypted).' : 'A key is set for this run only.') : 'No key set.'}
        </p>
        <KeyField />
        {hasKey && (
          <button className="btn btn--danger btn--sm" style={{ marginTop: 12 }} onClick={() => void controller.removeKey()}>
            <Trash2 size={14} aria-hidden /> Delete key
          </button>
        )}
      </section>

      <section className="section">
        <h3>Display & sound</h3>
        <Toggle label="Show countdown" hint="Seconds left in each breath phase." checked={prefs.showCountdown} onChange={(v) => controller.setPrefs({ showCountdown: v })} />
        <Toggle label="Camera preview" hint="Hiding it never stops the measurement." checked={prefs.cameraVisible} onChange={(v) => controller.setPrefs({ cameraVisible: v })} />
        <Toggle label="SDK camera engine (experimental)" hint="The SDK opens the camera itself instead of the browser forwarding frames. Not verified to be faster; off is the documented default." checked={prefs.engine === 'native'} onChange={(v) => controller.setPrefs({ engine: v ? 'native' : 'browser' })} />
        <Toggle label="Brighten camera image" hint="Uses the camera's own brightness setting in dim rooms. Turn off if the light meter says Too bright." checked={prefs.cameraBoost} onChange={(v) => controller.setPrefs({ cameraBoost: v })} />
        <Toggle label="Screen light" hint="A warm white frame around the window to light your face in a dark room." checked={prefs.lightBoost} onChange={(v) => controller.setPrefs({ lightBoost: v })} />
        <Toggle label="Soft sound cue" hint="Off by default. Nothing depends on it." checked={prefs.soundOn} onChange={(v) => controller.setPrefs({ soundOn: v })} />
      </section>

      <section className="section">
        <h3>Privacy & consent</h3>
        <div className="actions">
          <button className="btn btn--sm" onClick={() => controller.setOverlay('privacy')}>
            Privacy details
          </button>
          <button className="btn btn--danger btn--sm" onClick={() => void controller.withdrawConsent()}>
            Withdraw consent
          </button>
        </div>
        <p className="help">Withdrawing stops the camera immediately and returns to the welcome screen.</p>
      </section>
    </Sheet>
  );
}
