import { assess, sameAssessment } from '../domain/measurement';
import { BreathPacer, deriveGuidance } from '../domain/pacer';
import { canStart, canStop, initialMachine, transition, type MachineEvent, type MachineState } from '../domain/sessionMachine';
import { normalizeApiKey } from '../shared/apiKey';
import type { BreathCoachBridge } from '../shared/bridge';
import type { Store } from '../shared/store';
import type { MeasurementSource, SimScenario, SourceError, SourceEvent, SourceKind } from '../shared/types';
import { DEFAULT_PREFS, type AppState, type Overlay, type Prefs } from './state';
import type { SignalStore } from './signalStore';
import type { PreviewStore } from './previewStore';

/** If the pipeline has not reported "running" after this long, the start is treated as failed. */
const START_TIMEOUT_MS = 45_000;
const TICK_MS = 500;

export interface Persistence {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface ControllerDeps {
  store: Store<AppState>;
  signal: SignalStore;
  preview: PreviewStore;
  bridge: BreathCoachBridge | undefined;
  createPresage: (apiKey: string, engine: 'native' | 'browser') => MeasurementSource;
  createSimulated: () => MeasurementSource;
  persistence: Persistence;
  now: () => number;
}

const CONSENT_KEY = 'breathcoach.consent.v1';
const PREFS_KEY = 'breathcoach.prefs.v1';

/**
 * Owns the session lifecycle. Every source gets a generation number; events and
 * results from an older generation are discarded, which is what prevents a late
 * packet from a stopped or reset session from ever reaching the screen.
 */
export class SessionController {
  readonly pacer: BreathPacer;
  private machine: MachineState = initialMachine;
  private source: MeasurementSource | null = null;
  private unsubscribe: (() => void) | null = null;
  private generation = 0;
  private apiKey: string | null = null;
  private teardownInFlight: Promise<void> | null = null;
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly d: ControllerDeps) {
    this.pacer = new BreathPacer(d.now());
  }

  private get state(): AppState {
    return this.d.store.getState();
  }

  // ───────────────────────── lifecycle ─────────────────────────

  async init(): Promise<void> {
    const consent = this.readConsent();
    const prefs = this.readPrefs();
    this.d.store.setState({ consent, prefs });

    const { bridge } = this.d;
    if (bridge) {
      const [keyStatus, sdk] = await Promise.all([
        bridge.key.status().catch(() => ({ stored: false, encryptionAvailable: false })),
        bridge.sdkStatus().catch(() => ({ available: false })),
      ]);
      this.d.store.setState({ keyStatus, sdkAvailable: sdk.available });
      if (keyStatus.stored) {
        this.apiKey = await bridge.key.load().catch(() => null);
      }
    } else {
      this.d.store.setState({ sdkAvailable: false });
    }
    this.d.store.setState({
      hasKey: this.apiKey != null,
      ready: true,
      screen: !consent ? 'welcome' : 'main',
    });
    this.ticker = setInterval(() => this.tick(), TICK_MS);
    this.tick();
    window.addEventListener('pagehide', this.onPageHide);
  }

  dispose(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    window.removeEventListener('pagehide', this.onPageHide);
    this.generation++;
    void this.shutdownSession();
  }

  private onPageHide = () => {
    this.generation++;
    void this.shutdownSession();
  };

  // ───────────────────────── consent & navigation ─────────────────────────

  grantConsent(): void {
    this.d.persistence.set(CONSENT_KEY, JSON.stringify({ v: 1, at: new Date().toISOString() }));
    this.d.store.setState({ consent: true, screen: this.state.hasKey || this.state.mode === 'simulated' ? 'main' : 'setup' });
  }

  /** Withdrawing consent stops the camera immediately and returns to the welcome screen. */
  async withdrawConsent(): Promise<void> {
    this.d.persistence.remove(CONSENT_KEY);
    this.d.store.setState({ consent: false, overlay: 'none', screen: 'welcome' });
    this.generation++; // invalidates a start that is still in flight
    await this.shutdownSession();
    this.clearData();
    this.setMachine({ type: 'RESET' });
  }

  goto(screen: AppState['screen']): void {
    this.d.store.setState({ screen });
  }

  setOverlay(overlay: Overlay): void {
    this.d.store.setState({ overlay });
  }

  // ───────────────────────── settings ─────────────────────────

  setPrefs(patch: Partial<Prefs>): void {
    const prefs = { ...this.state.prefs, ...patch };
    this.d.store.setState({ prefs });
    this.d.persistence.set(PREFS_KEY, JSON.stringify(prefs));
  }

  async saveKey(raw: string, remember: boolean): Promise<{ ok: true } | { ok: false; reason: 'shape' | 'storage' }> {
    const key = normalizeApiKey(raw);
    if (!key) return { ok: false, reason: 'shape' };
    let keyStatus = this.state.keyStatus;
    if (remember && this.d.bridge) {
      try {
        keyStatus = await this.d.bridge.key.save(key);
      } catch {
        return { ok: false, reason: 'storage' };
      }
    }
    this.apiKey = key;
    this.d.store.setState({ hasKey: true, keyStatus, error: this.state.error?.kind === 'invalid-key' || this.state.error?.kind === 'missing-key' ? null : this.state.error });
    if (this.state.phase === 'error' && (this.machine.error?.kind === 'invalid-key' || this.machine.error?.kind === 'missing-key')) {
      this.setMachine({ type: 'RESET' });
    }
    return { ok: true };
  }

  async removeKey(): Promise<void> {
    this.apiKey = null;
    let keyStatus = this.state.keyStatus;
    try {
      keyStatus = (await this.d.bridge?.key.remove()) ?? keyStatus;
    } catch {
      /* nothing stored */
    }
    this.d.store.setState({ hasKey: false, keyStatus });
  }

  /** Switching source clears everything so real and simulated results are never mixed. */
  async setMode(mode: SourceKind): Promise<void> {
    if (mode === this.state.mode) return;
    if (!canStart(this.machine.phase)) return;
    this.clearData();
    this.setMachine({ type: 'RESET' });
    this.d.store.setState({ mode, scenario: 'normal', lastSessionMs: null });
  }

  setScenario(scenario: SimScenario): void {
    this.d.store.setState({ scenario });
    const src = this.source as (MeasurementSource & { setScenario?: (s: SimScenario) => void }) | null;
    if (src?.kind === 'simulated') src.setScenario?.(scenario);
  }

  // ───────────────────────── session commands ─────────────────────────

  async start(): Promise<void> {
    const s = this.state;
    if (!s.consent || !canStart(this.machine.phase)) return;

    const gen = ++this.generation;
    this.clearData();
    this.d.store.setState({ lastSessionMs: null });
    this.setMachine({ type: 'START' });

    try {
      let source: MeasurementSource;
      if (s.mode === 'presage') {
        if (!this.apiKey) throw { kind: 'missing-key', retryable: false } satisfies SourceError;
        const sdk = await this.d.bridge?.sdkStatus().catch(() => ({ available: false }));
        if (!sdk?.available) throw { kind: 'sdk-unavailable', retryable: false } satisfies SourceError;
        // The camera gate in the main process only opens for the span of this session.
        await this.d.bridge?.armCamera(true);
        if (gen !== this.generation) {
          // Stopped while we were arming: make sure the gate does not stay open.
          await this.d.bridge?.armCamera(false).catch(() => undefined);
          return;
        }
        source = this.d.createPresage(this.apiKey, s.prefs.engine);
      } else {
        source = this.d.createSimulated();
        (source as MeasurementSource & { setScenario?: (x: SimScenario) => void }).setScenario?.(s.scenario);
      }

      this.source = source;
      this.unsubscribe = source.subscribe((e) => this.onSourceEvent(gen, e));
      this.startTimer = setTimeout(() => {
        if (gen === this.generation && this.machine.phase === 'starting') void this.fail(gen, { kind: 'processing', retryable: true });
      }, START_TIMEOUT_MS);
      await source.start();
    } catch (err) {
      if (gen !== this.generation) return;
      await this.fail(gen, asSourceError(err));
    }
  }

  async stop(): Promise<void> {
    if (!canStop(this.machine.phase)) return;
    const startedAt = this.state.runningSince;
    this.generation++;
    this.setMachine({ type: 'STOP' });
    await this.shutdownSession();
    const lastSessionMs = startedAt != null ? Math.max(0, this.d.now() - startedAt) : null;
    this.clearData();
    this.d.store.setState({ lastSessionMs });
    this.setMachine({ type: 'STOPPED' });
    this.tick();
  }

  /** Reset = stop if needed, then return to a clean "ready" state: no data, no error, default rhythm. */
  async reset(): Promise<void> {
    if (this.machine.phase === 'stopping') return;
    if (canStop(this.machine.phase)) await this.stop();
    this.generation++;
    await this.shutdownSession();
    this.clearData();
    this.pacer.reset(this.d.now());
    this.d.store.setState({ lastSessionMs: null });
    this.setMachine({ type: 'RESET' });
    this.tick();
  }

  // ───────────────────────── internals ─────────────────────────

  private onSourceEvent(gen: number, e: SourceEvent): void {
    if (gen !== this.generation) return; // late event from a previous session
    const { store, signal } = this.d;
    switch (e.type) {
      case 'running':
        if (this.machine.phase !== 'starting') return;
        this.clearStartTimer();
        this.setMachine({ type: 'RUNNING' });
        store.setState({ runningSince: this.d.now() });
        break;
      case 'validation':
        store.setState({ validation: { kind: e.kind, at: e.at } });
        break;
      case 'rate':
        if (this.machine.phase === 'running') store.setState({ rate: { value: e.value, confidence: e.confidence, stable: e.stable, at: e.at } });
        break;
      case 'trace':
        if (this.machine.phase === 'running') signal.push(e.points, e.at);
        return; // no store change: the canvas reads the buffer directly
      case 'stream':
        store.setState({ stream: e.stream });
        return;
      case 'preview':
        this.d.preview.set(e.width > 0 ? { width: e.width, height: e.height, rgba: e.rgba } : null);
        store.setState({ previewActive: e.width > 0 });
        return;
      case 'error':
        void this.fail(gen, e.error);
        return;
    }
    this.tick();
  }

  private async fail(gen: number, error: SourceError): Promise<void> {
    if (gen !== this.generation) return;
    this.generation++;
    // Coarse diagnostic only: error kind and numeric code, never SDK message text or the key.
    console.warn(`[breath-coach] session failed: kind=${error.kind} code=${error.code ?? '-'}`);
    this.setMachine({ type: 'FAIL', error });
    await this.shutdownSession();
    this.clearData();
    this.d.store.setState({ error });
    this.tick();
  }

  /** Stops and destroys the current source, closes the camera gate and clears the preview. Single-flight. */
  private shutdownSession(): Promise<void> {
    this.teardownInFlight ??= this.teardown().finally(() => {
      this.teardownInFlight = null;
    });
    return this.teardownInFlight;
  }

  private teardown = async (): Promise<void> => {
    this.clearStartTimer();
    const source = this.source;
    this.source = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (source) {
      try {
        await source.stop();
      } catch {
        /* the camera is released below regardless */
      }
      source.destroy();
    }
    try {
      await this.d.bridge?.armCamera(false);
    } catch {
      /* gate stays closed by default */
    }
    this.d.preview.clear();
    this.d.store.setState({ stream: null, previewActive: false });
  };

  private clearData(): void {
    this.d.signal.clear();
    this.d.store.setState({ rate: null, validation: null, runningSince: null, error: null });
  }

  private clearStartTimer(): void {
    if (this.startTimer) clearTimeout(this.startTimer);
    this.startTimer = null;
  }

  private setMachine(e: MachineEvent): void {
    this.machine = transition(this.machine, e);
    this.d.store.setState({ phase: this.machine.phase, error: this.machine.error });
  }

  /** Recomputes what may be claimed about the measurement and what the guide should do. */
  tick(): void {
    const s = this.state;
    const assessment = assess({ phase: s.phase, runningSince: s.runningSince, now: this.d.now(), validation: s.validation, rate: s.rate });
    const guidance = deriveGuidance(assessment);
    this.pacer.setDesired(guidance.targetBpm);
    const patch: Partial<AppState> = {};
    if (!sameAssessment(s.assessment, assessment)) patch.assessment = assessment;
    if (s.guidance.mode !== guidance.mode || s.guidance.targetBpm !== guidance.targetBpm) patch.guidance = guidance;
    if (patch.assessment || patch.guidance) this.d.store.setState(patch);
  }

  // ───────────────────────── persistence ─────────────────────────

  private readConsent(): boolean {
    try {
      const raw = this.d.persistence.get(CONSENT_KEY);
      return raw != null && JSON.parse(raw)?.v === 1;
    } catch {
      return false;
    }
  }

  private readPrefs(): Prefs {
    try {
      const raw = this.d.persistence.get(PREFS_KEY);
      const p = raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
      return {
        showCountdown: typeof p.showCountdown === 'boolean' ? p.showCountdown : DEFAULT_PREFS.showCountdown,
        soundOn: typeof p.soundOn === 'boolean' ? p.soundOn : DEFAULT_PREFS.soundOn,
        cameraVisible: typeof p.cameraVisible === 'boolean' ? p.cameraVisible : DEFAULT_PREFS.cameraVisible,
        lightBoost: typeof p.lightBoost === 'boolean' ? p.lightBoost : DEFAULT_PREFS.lightBoost,
        cameraBoost: typeof p.cameraBoost === 'boolean' ? p.cameraBoost : DEFAULT_PREFS.cameraBoost,
        engine: p.engine === 'browser' || p.engine === 'native' ? p.engine : DEFAULT_PREFS.engine,
      };
    } catch {
      return DEFAULT_PREFS;
    }
  }
}

function asSourceError(err: unknown): SourceError {
  const e = err as Partial<SourceError> | null;
  if (e && typeof e.kind === 'string' && typeof e.retryable === 'boolean') return e as SourceError;
  return { kind: 'unknown', retryable: true };
}
