import { useCallback } from 'react';
import { controller } from './runtime';
import { useApp } from './hooks';
import { WelcomeScreen } from '../features/consent/WelcomeScreen';
import { SetupScreen } from '../features/setup/SetupScreen';
import { PrivacySheet, SettingsSheet } from '../features/settings/Sheets';
import { BreathOrb } from '../features/guidance/BreathOrb';
import { GuidanceCaption } from '../features/guidance/GuidanceCaption';
import { playCue } from '../features/guidance/soundCue';
import { RatePanel } from '../features/measurement/RatePanel';
import { SignalWave } from '../features/measurement/SignalWave';
import { CameraPanel } from '../features/measurement/CameraPanel';
import { ControlBar } from '../features/controls/ControlBar';
import { Footer, Header, StatusNotice } from '../features/shell/Chrome';
import type { BreathPhase } from '../domain/pacer';

const now = () => performance.now();

function Stage() {
  const showCountdown = useApp((s) => s.prefs.showCountdown);
  const soundOn = useApp((s) => s.prefs.soundOn);
  const phase = useApp((s) => s.phase);
  const error = useApp((s) => s.error);
  const active = phase === 'running' || phase === 'starting';
  const onPhase = useCallback(
    (p: BreathPhase) => {
      if (soundOn && active) playCue(p);
    },
    [soundOn, active],
  );
  return (
    <div className="stage">
      <BreathOrb pacer={controller.pacer} now={now} showCountdown={showCountdown} dim={Boolean(error)} onPhase={onPhase} />
      <GuidanceCaption />
      <StatusNotice />
    </div>
  );
}

function Main() {
  return (
    <>
      <div className="main">
        <Stage />
        <aside className="rail" aria-label="Measurement">
          <RatePanel />
          <SignalWave />
          <CameraPanel />
        </aside>
      </div>
      <ControlBar />
    </>
  );
}

export function App() {
  const ready = useApp((s) => s.ready);
  const screen = useApp((s) => s.screen);
  const overlay = useApp((s) => s.overlay);
  const light = useApp((s) => s.prefs.lightBoost);
  if (!ready) return <div className="shell"><div className="app" /></div>;
  return (
    <div className="shell" data-light={light}>
    <div className="app">
      <Header />
      {screen === 'welcome' && <WelcomeScreen />}
      {screen === 'setup' && <SetupScreen />}
      {screen === 'main' && <Main />}
      <Footer />
      {overlay === 'settings' && <SettingsSheet />}
      {overlay === 'privacy' && <PrivacySheet />}
    </div>
    </div>
  );
}
