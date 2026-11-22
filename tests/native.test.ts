import { describe, expect, it, vi } from 'vitest';
import { downscaleToRgba } from '../electron/preview';
import { NativeSession, type NativeEvent } from '../electron/nativeSession';
import { NativePresageSource } from '../src/infrastructure/presage/nativeSource';
import type { BreathCoachBridge, NativeEvent as RendererEvent } from '../src/shared/bridge';
import type { SourceEvent } from '../src/shared/types';

describe('preview thumbnail', () => {
  it('downsizes and converts BGR to RGBA', () => {
    const w = 4;
    const h = 2;
    const src = new Uint8Array(w * h * 3);
    for (let i = 0; i < w * h; i++) src.set([10, 20, 30], i * 3); // B, G, R
    const f = downscaleToRgba(src, w, h, w * 3, 1, 2)!;
    expect(f.width).toBe(2);
    expect(f.height).toBe(1);
    expect(Array.from(f.data.slice(0, 4))).toEqual([30, 20, 10, 255]);
  });

  it('rejects unsupported formats and short buffers instead of guessing', () => {
    expect(downscaleToRgba(new Uint8Array(100), 4, 4, 16, 4)).toBeNull(); // NV12
    expect(downscaleToRgba(new Uint8Array(10), 4, 4, 16, 3)).toBeNull();
  });
});

function fakeSdkModule() {
  const handlers: Record<string, (...a: any[]) => void> = {};
  const sdk = {
    handlers,
    on: vi.fn((e: string, cb: any) => void (handlers[e] = cb)),
    useCamera: vi.fn(),
    start: vi.fn(),
    stopAsync: vi.fn(async () => {}),
    destroy: vi.fn(async () => {}),
  };
  const module = { SmartSpectraSDK: vi.fn(function () { return sdk; }), CameraSelection: { default: {} }, breathingMetrics: [0, 1, 2] };
  return { sdk, module };
}

describe('NativeSession (main process)', () => {
  it('uses the SDK camera at 640x480@30, breathing metrics only, telemetry off', async () => {
    const { sdk, module } = fakeSdkModule();
    const events: NativeEvent[] = [];
    const s = new NativeSession((e) => events.push(e), () => module as never);
    expect(await s.start('abcdefgh12345')).toEqual({ ok: true });
    expect(module.SmartSpectraSDK).toHaveBeenCalledWith(expect.objectContaining({ requestedMetrics: [0, 1, 2], enableTelemetry: false }));
    expect(sdk.useCamera).toHaveBeenCalledWith(expect.anything(), { width: 640, height: 480, fps: 30 });
    sdk.handlers.validationStatus!(5);
    expect(events).toEqual([{ k: 'validation', code: 5 }]);
  });

  it('rejects a malformed key without touching the SDK', async () => {
    const { module } = fakeSdkModule();
    const s = new NativeSession(() => {}, () => module as never);
    expect(await s.start('bad key')).toMatchObject({ ok: false });
    expect(module.SmartSpectraSDK).not.toHaveBeenCalled();
  });

  it('stop releases the camera once and later events are dropped', async () => {
    const { sdk, module } = fakeSdkModule();
    const events: NativeEvent[] = [];
    const s = new NativeSession((e) => events.push(e), () => module as never);
    await s.start('abcdefgh12345');
    await Promise.all([s.stop(), s.stop()]);
    expect(sdk.stopAsync).toHaveBeenCalledTimes(1);
    expect(sdk.destroy).toHaveBeenCalledTimes(1);
    sdk.handlers.validationStatus!(1);
    expect(events).toHaveLength(0);
    expect(s.active).toBe(false);
  });

  it('a start that throws reports the SDK code and cleans up', async () => {
    const { sdk, module } = fakeSdkModule();
    sdk.start.mockImplementation(() => {
      throw Object.assign(new Error('x'), { code: 7, retryable: true });
    });
    const s = new NativeSession(() => {}, () => module as never);
    expect(await s.start('abcdefgh12345')).toEqual({ ok: false, code: 7, retryable: true });
    expect(sdk.destroy).toHaveBeenCalled();
  });
});

describe('NativePresageSource (renderer)', () => {
  function setup(startResult: any = { ok: true }) {
    let cb: (e: RendererEvent) => void = () => {};
    const native = {
      start: vi.fn(async () => startResult),
      stop: vi.fn(async () => {}),
      onEvent: vi.fn((f: (e: RendererEvent) => void) => {
        cb = f;
        return () => void (cb = () => {});
      }),
    } as unknown as BreathCoachBridge['native'];
    const src = new NativePresageSource({ apiKey: 'k', native, decodeMetrics: () => ({}), now: () => 1 });
    const events: SourceEvent[] = [];
    src.subscribe((e) => events.push(e));
    return { src, native, events, push: (e: RendererEvent) => cb(e) };
  }

  it('maps status, validation, errors and previews', async () => {
    const { src, events, push } = setup();
    await src.start();
    push({ k: 'status', status: 3 });
    push({ k: 'validation', code: 5 });
    push({ k: 'preview', width: 2, height: 1, data: new Uint8Array(8) });
    push({ k: 'error', code: 10, retryable: true }); // non-fatal timestamp glitch: ignored
    push({ k: 'error', code: 2, retryable: false });
    push({ k: 'error', code: 5, retryable: true }); // only the first fatal error is reported
    expect(events.map((e) => e.type)).toEqual(['running', 'validation', 'preview', 'error']);
    expect(events.at(-1)).toMatchObject({ error: { kind: 'invalid-key' } });
  });

  it('start failure becomes a friendly error and stops the native session', async () => {
    const { src, native } = setup({ ok: false, code: 7, retryable: true });
    await expect(src.start()).rejects.toMatchObject({ kind: 'camera-not-found' });
    expect(native.stop).toHaveBeenCalled();
  });

  it('stop is idempotent and clears the preview', async () => {
    const { src, native, events } = setup();
    await src.start();
    await src.stop();
    await src.stop();
    expect(native.stop).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toMatchObject({ type: 'preview', width: 0 });
  });
});
