import { assess, type Assessment } from '../domain/measurement';
import { deriveGuidance, type Guidance } from '../domain/pacer';
import type { Phase } from '../domain/sessionMachine';
import type { KeyStatus } from '../shared/bridge';
import type { RateSample, SimScenario, SourceError, SourceKind, ValidationKind } from '../shared/types';

export type Screen = 'welcome' | 'setup' | 'main';
export type Overlay = 'none' | 'privacy' | 'settings';

export interface Prefs {
  showCountdown: boolean;
  soundOn: boolean;
  cameraVisible: boolean;
  /** Surrounds the window with a bright warm frame so the screen lights the user's face. */
  lightBoost: boolean;
  /** Raise the camera's own brightness setting (when it has one) so dim rooms still give a usable image. */
  cameraBoost: boolean;
  /** 'native': the SDK opens the camera itself (fast path). 'browser': Chromium opens it and frames are forwarded. */
  engine: 'native' | 'browser';
  /** While measuring: pause the orb animation, the wave drawing and the camera preview, to leave CPU to the measurement engine. */
  lowLoad: boolean;
}

export const DEFAULT_PREFS: Prefs = { showCountdown: true, soundOn: false, cameraVisible: true, lightBoost: false, cameraBoost: true, engine: 'browser', lowLoad: false };

export interface AppState {
  ready: boolean;
  screen: Screen;
  overlay: Overlay;
  consent: boolean;
  mode: SourceKind;
  prefs: Prefs;

  /** `null` until the main process has answered. */
  sdkAvailable: boolean | null;
  keyStatus: KeyStatus;
  /** A key is available for this session (stored or typed). The key itself is never kept in this store. */
  hasKey: boolean;

  phase: Phase;
  error: SourceError | null;
  runningSince: number | null;
  /** Length of the session that just ended, for the "stopped" summary. */
  lastSessionMs: number | null;
  validation: { kind: ValidationKind; at: number } | null;
  rate: RateSample | null;
  stream: MediaStream | null;
  /** A native thumbnail preview is available. */
  previewActive: boolean;
  scenario: SimScenario;

  assessment: Assessment;
  guidance: Guidance;
}

export function initialState(): AppState {
  const empty = { phase: 'idle', runningSince: null, now: 0, validation: null, rate: null } as const;
  const assessment = assess(empty);
  return {
    ready: false,
    screen: 'welcome',
    overlay: 'none',
    consent: false,
    mode: 'presage',
    prefs: DEFAULT_PREFS,
    sdkAvailable: null,
    keyStatus: { stored: false, encryptionAvailable: false },
    hasKey: false,
    phase: 'idle',
    error: null,
    runningSince: null,
    lastSessionMs: null,
    validation: null,
    rate: null,
    stream: null,
    previewActive: false,
    scenario: 'normal',
    assessment,
    guidance: deriveGuidance(assessment),
  };
}
