import { useState } from 'react';
import { Camera, HeartPulse, KeyRound, ShieldCheck, Undo2 } from 'lucide-react';
import { controller } from '../../app/runtime';
import { BreathOrb } from '../guidance/BreathOrb';

const now = () => performance.now();

export function WelcomeScreen() {
  const [agreed, setAgreed] = useState(false);
  return (
    <main className="flow enter">
      <div className="flow__visual" aria-hidden>
        <PreviewOrb />
      </div>
      <div className="flow__copy">
        <p className="steps">Welcome</p>
        <h1 className="display">
          A quieter way to <em>slow your breath.</em>
        </h1>
        <p className="lede">
          Breath Coach reads your breathing through your laptop camera and shapes a gentle, steady guide around it.
        </p>

        <ul className="facts">
          <li>
            <Camera size={18} aria-hidden />
            <span>
              <strong>Camera, only when you say so.</strong> It opens when you press Start and closes when you stop. No audio, no recordings, nothing saved.
            </span>
          </li>
          <li>
            <ShieldCheck size={18} aria-hidden />
            <span>
              <strong>Measurement uses Presage’s service.</strong> It needs an internet connection and your API key. We turn Presage’s optional telemetry off, and we don’t claim more about what the measurement itself sends than we have verified.
            </span>
          </li>
          <li>
            <KeyRound size={18} aria-hidden />
            <span>
              <strong>Your key stays yours.</strong> Kept only for this run, unless you choose to remember it on this device.
            </span>
          </li>
          <li>
            <HeartPulse size={18} aria-hidden />
            <span>
              <strong>For relaxation, not medicine.</strong> Readings are estimates, not a diagnosis.
            </span>
          </li>
          <li>
            <Undo2 size={18} aria-hidden />
            <span>
              <strong>Withdraw any time</strong> in Settings. The camera stops immediately.
            </span>
          </li>
        </ul>

        <label className="check">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>I agree to let Breath Coach use my camera to measure my breathing during sessions I start.</span>
        </label>

        <div className="actions">
          <button className="btn btn--primary btn--lg" disabled={!agreed} onClick={() => controller.grantConsent()}>
            Continue
          </button>
          <button className="btn btn--ghost" onClick={() => controller.setOverlay('privacy')}>
            Read the privacy details
          </button>
        </div>
      </div>
    </main>
  );
}

function PreviewOrb() {
  return <BreathOrb pacer={controller.pacer} now={now} showCountdown={false} />;
}
