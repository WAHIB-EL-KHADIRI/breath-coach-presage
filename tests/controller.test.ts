import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionController, type Persistence } from '../src/app/sessionController';
import { SignalStore } from '../src/app/signalStore';
import { PreviewStore } from '../src/app/previewStore';
import { initialState } from '../src/app/state';
import { createStore } from '../src/shared/store';
import { WARMUP_MS } from '../src/shared/constants';
import type { BreathCoachBridge } from '../src/shared/bridge';
import type { MeasurementSource, SourceEvent } from '../src/shared/types';

class FakeSource implements MeasurementSource {
  kind: 'presage' | 'simulated' = 'presage';
  listeners = new Set<(e: SourceEvent) => void>();
  started = false;
  stopped = 0;
  destroyed = 0;
  failStart: unknown = null;
  subscribe(l: (e: SourceEvent) => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  async start() {
    this.started = true;
    if (this.failStart) throw this.failStart;
  }
  async stop() {
    this.stopped++;
  }
  destroy() {
    this.destroyed++;
  }
  emit(e: SourceEvent) {
    for (const l of [...this.listeners]) l(e);
  }
}

let clock = 0;
function setup(opts: { key?: boolean; consent?: boolean; sdk?: boolean } = {}) {
  const sources: FakeSource[] = [];
  const armed: boolean[] = [];
  const mem = new Map<string, string>();
  if (opts.consent !== false) mem.set('breathcoach.consent.v1', JSON.stringify({ v: 1 }));
  const persistence: Persistence = { get: (k) => mem.get(k) ?? null, set: (k, v) => void mem.set(k, v), remove: (k) => void mem.delete(k) };
  const bridge: BreathCoachBridge = {
    platform: 'win32',
    version: 'test',
    key: {
      status: async () => ({ stored: opts.key !== false, encryptionAvailable: true }),
      save: async () => ({ stored: true, encryptionAvailable: true }),
      load: async () => (opts.key !== false ? 'stored-key-12345' : null),
      remove: async () => ({ stored: false, encryptionAvailable: true }),
    },
    armCamera: async (a) => void armed.push(a),
    sdkStatus: async () => ({ available: opts.sdk !== false }),
    openExternal: async () => {},
    native: { start: async () => ({ ok: true }), stop: async () => {}, onEvent: () => () => {} },
  };
  const store = createStore(initialState());
  const signal = new SignalStore();
  const c = new SessionController({
    store,
    signal,
    preview: new PreviewStore(),
    bridge,
    createPresage: () => {
      const s = new FakeSource();
      sources.push(s);
      return s;
    },
    createSimulated: () => {
      const s = new FakeSource();
      s.kind = 'simulated';
      sources.push(s);
      return s;
    },
    persistence,
    now: () => clock,
  });
  return { c, store, signal, sources, armed };
}

beforeEach(() => {
  clock = 1000;
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('SessionController', () => {
  it('never touches the camera before consent and an explicit Start', async () => {
    const { c, sources, armed } = setup({ consent: false });
    await c.init();
    expect(sources).toHaveLength(0);
    expect(armed).toEqual([]);
    await c.start(); // no consent → refused
    expect(sources).toHaveLength(0);
    expect(armed).toEqual([]);
  });

  it('arms the camera gate only for the session and disarms on stop', async () => {
    const { c, store, sources, armed } = setup();
    await c.init();
    await c.start();
    expect(armed).toEqual([true]);
    sources[0]!.emit({ type: 'running' });
    expect(store.getState().phase).toBe('running');
    await c.stop();
    expect(armed.at(-1)).toBe(false);
    expect(sources[0]!.stopped).toBe(1);
    expect(sources[0]!.destroyed).toBe(1);
    expect(store.getState().phase).toBe('idle');
    expect(store.getState().stream).toBeNull();
  });

  it('missing key: error without opening the camera', async () => {
    const { c, store, sources, armed } = setup({ key: false });
    await c.init();
    await c.start();
    expect(store.getState().phase).toBe('error');
    expect(store.getState().error?.kind).toBe('missing-key');
    expect(sources).toHaveLength(0);
    expect(armed).not.toContain(true);
  });

  it('unavailable SDK runtime is reported, not hung', async () => {
    const { c, store } = setup({ sdk: false });
    await c.init();
    await c.start();
    expect(store.getState().error?.kind).toBe('sdk-unavailable');
  });

  it('start failure releases everything and allows retry', async () => {
    const { c, store, sources, armed } = setup();
    await c.init();
    const first = c.start();
    await flush();
    sources[0]!.failStart = { kind: 'permission-denied', retryable: true };
    // failure is injected before start() runs on the source:
    await first.catch(() => {});
    await c.reset();
    sources.length = 0;
    const p = c.start();
    await flush();
    sources[0]!.emit({ type: 'error', error: { kind: 'camera-busy', retryable: true } });
    await p;
    await flush();
    expect(store.getState().phase).toBe('error');
    expect(armed.at(-1)).toBe(false);
    expect(sources[0]!.destroyed).toBe(1);
    await c.start();
    expect(store.getState().phase).toBe('starting');
  });

  it('drops late events from a stopped or reset session', async () => {
    const { c, store, signal, sources } = setup();
    await c.init();
    await c.start();
    const old = sources[0]!;
    old.emit({ type: 'running' });
    old.emit({ type: 'trace', points: [{ t: 1, v: 1 }], at: clock });
    await c.reset();
    expect(signal.size).toBe(0);
    // the old source still holds a stale callback in this simulated race
    old.emit({ type: 'rate', value: 14, confidence: 90, stable: true, at: clock });
    old.emit({ type: 'validation', kind: 'no-face', at: clock });
    old.emit({ type: 'trace', points: [{ t: 9, v: 1 }], at: clock });
    expect(store.getState().rate).toBeNull();
    expect(store.getState().validation).toBeNull();
    expect(signal.size).toBe(0);
    // a new session is unaffected by the old one
    await c.start();
    sources[1]!.emit({ type: 'running' });
    old.emit({ type: 'rate', value: 99, confidence: 99, stable: true, at: clock });
    expect(store.getState().rate).toBeNull();
  });

  it('repeated Start / Stop / Reset never creates concurrent sessions', async () => {
    const { c, sources, store } = setup();
    await c.init();
    await Promise.all([c.start(), c.start(), c.start()]);
    expect(sources).toHaveLength(1);
    await Promise.all([c.stop(), c.stop(), c.reset(), c.reset()]);
    expect(store.getState().phase).toBe('idle');
    expect(sources[0]!.destroyed).toBe(1);
    await Promise.all([c.start(), c.reset(), c.start()]);
    await c.reset();
    expect(store.getState().phase).toBe('idle');
    expect(sources.every((s) => s.destroyed >= 1)).toBe(true);
  });

  it('warm-up shows no rate; a reading only counts after warm-up and validation', async () => {
    const { c, store, sources } = setup();
    await c.init();
    await c.start();
    sources[0]!.emit({ type: 'running' });
    sources[0]!.emit({ type: 'rate', value: 15, confidence: 90, stable: true, at: clock });
    c.tick();
    expect(store.getState().assessment).toMatchObject({ status: 'warming-up', displayRate: null });
    expect(store.getState().guidance).toEqual({ mode: 'default', targetBpm: 6 });

    clock += WARMUP_MS + 100;
    sources[0]!.emit({ type: 'rate', value: 9.2, confidence: 80, stable: true, at: clock });
    expect(store.getState().assessment).toMatchObject({ status: 'live', displayRate: 9.2 });
    expect(store.getState().guidance).toEqual({ mode: 'adaptive', targetBpm: 9 });

    sources[0]!.emit({ type: 'validation', kind: 'no-face', at: clock });
    expect(store.getState().assessment.status).toBe('signal-issue');
    expect(store.getState().guidance.mode).toBe('default');
  });

  it('withdrawing consent stops the camera immediately and returns to welcome', async () => {
    const { c, store, sources, armed } = setup();
    await c.init();
    await c.start();
    sources[0]!.emit({ type: 'running' });
    await c.withdrawConsent();
    expect(store.getState()).toMatchObject({ consent: false, screen: 'welcome', phase: 'idle' });
    expect(sources[0]!.destroyed).toBe(1);
    expect(armed.at(-1)).toBe(false);
  });

  it('a start still in flight when consent is withdrawn is cancelled', async () => {
    const { c, store, sources, armed } = setup();
    await c.init();
    const p = c.start();
    await c.withdrawConsent();
    await p;
    await flush();
    expect(store.getState().phase).toBe('idle');
    expect(armed.at(-1)).toBe(false);
    for (const s of sources) expect(s.destroyed).toBeGreaterThanOrEqual(1);
  });

  it('switching source clears data so real and simulated never mix', async () => {
    const { c, store, signal, sources } = setup();
    await c.init();
    await c.start();
    sources[0]!.emit({ type: 'running' });
    sources[0]!.emit({ type: 'trace', points: [{ t: 1, v: 1 }], at: clock });
    await c.setMode('simulated'); // refused while running
    expect(store.getState().mode).toBe('presage');
    await c.stop();
    expect(signal.size).toBe(0);
    await c.setMode('simulated');
    expect(store.getState().mode).toBe('simulated');
    await c.start();
    expect(sources.at(-1)!.kind).toBe('simulated');
  });

  it('the API key never enters the store', async () => {
    const { c, store } = setup();
    await c.init();
    await c.saveKey('super-secret-key-123', false);
    expect(JSON.stringify(store.getState())).not.toContain('super-secret-key-123');
    expect(JSON.stringify(store.getState())).not.toContain('stored-key-12345');
  });
});
