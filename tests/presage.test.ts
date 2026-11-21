import { describe, expect, it, vi } from 'vitest';
import { SmartSpectraErrorCode, ValidationCode, breathingMetrics } from '@smartspectra/node-sdk/renderer';
import { Metrics, decodeMetrics } from '@smartspectra/node-sdk/messages';
import { VALIDATION_CODE_TO_KIND, isNonFatalSdkError, mapBreathing, mapSdkErrorCode, mapThrown, mapValidationCode } from '../src/infrastructure/presage/mapping';
import { PresageSource, type SdkLike } from '../src/infrastructure/presage/presageSource';
import type { SourceEvent } from '../src/shared/types';

describe('mapping is pinned to the installed SDK constants', () => {
  it('validation codes', () => {
    expect(mapValidationCode(ValidationCode.kOk)).toBe('ok');
    expect(mapValidationCode(ValidationCode.kNoFaceFound)).toBe('no-face');
    expect(mapValidationCode(ValidationCode.kMultipleFacesFound)).toBe('multiple-faces');
    expect(mapValidationCode(ValidationCode.kTooDark)).toBe('too-dark');
    expect(mapValidationCode(ValidationCode.kTooBright)).toBe('too-bright');
    expect(mapValidationCode(ValidationCode.kChestNotVisible)).toBe('chest-hidden');
    expect(mapValidationCode(ValidationCode.kCameraTuning)).toBe('tuning');
    expect(mapValidationCode(ValidationCode.kFrameRateTooLow)).toBe('low-frame-rate');
    expect(mapValidationCode(ValidationCode.kExcessiveMotion)).toBe('motion');
    expect(mapValidationCode(ValidationCode.kFaceTooClose)).toBe('too-close');
    expect(mapValidationCode(ValidationCode.kFaceTooFar)).toBe('too-far');
    expect(mapValidationCode(ValidationCode.kFaceNotForward)).toBe('face-angle');
    expect(mapValidationCode(999)).toBe('unknown');
    // every code the SDK defines has an explicit mapping
    for (const code of Object.values(ValidationCode)) expect(code in VALIDATION_CODE_TO_KIND).toBe(true);
  });

  it('error codes', () => {
    expect(mapSdkErrorCode(SmartSpectraErrorCode.kAuthenticationFailed, false).kind).toBe('invalid-key');
    expect(mapSdkErrorCode(SmartSpectraErrorCode.kCreditExhausted, false).kind).toBe('credits');
    expect(mapSdkErrorCode(SmartSpectraErrorCode.kNetworkError, true).kind).toBe('network');
    expect(mapSdkErrorCode(SmartSpectraErrorCode.kMetricNotAuthorized, false).kind).toBe('metric-not-authorized');
    expect(mapSdkErrorCode(SmartSpectraErrorCode.kSustainedLowFrameRate, true).kind).toBe('low-frame-rate');
    expect(isNonFatalSdkError(SmartSpectraErrorCode.kNonMonotonicTimestamp)).toBe(true);
    expect(isNonFatalSdkError(SmartSpectraErrorCode.kAuthenticationFailed)).toBe(false);
  });

  it('requests breathing metrics only', () => {
    expect([...breathingMetrics].sort()).toEqual([0, 1, 2]); // CHEST_BREATHING, ABDOMEN_BREATHING, BREATHING_RATE
  });

  it('maps thrown camera errors to friendly kinds', () => {
    const cam = (name: string) => Object.assign(new Error('Failed to acquire default camera'), { cause: { name } });
    expect(mapThrown(cam('NotAllowedError')).kind).toBe('permission-denied');
    expect(mapThrown(cam('NotFoundError')).kind).toBe('camera-not-found');
    expect(mapThrown(cam('NotReadableError')).kind).toBe('camera-busy');
    expect(mapThrown(Object.assign(new Error('x'), { code: 2 })).kind).toBe('invalid-key');
    expect(mapThrown(Object.assign(new Error('x'), { code: 'SMARTSPECTRA_IPC_TIMEOUT' })).kind).toBe('processing');
    expect(mapThrown('weird').kind).toBe('unknown');
  });
});

describe('decoding real protobuf payloads', () => {
  const payload = Metrics.encode(
    Metrics.create({
      breathing: {
        rate: [
          { value: 14, confidence: 40, stable: false, timestamp: 1_000_000 },
          { value: 12.5, confidence: 71, stable: true, timestamp: 2_000_000 },
        ],
        upperTrace: [
          { value: 0.1, timestamp: 1_500_000 },
          { value: 0.3, timestamp: 1_533_000 },
        ],
      },
    }),
  ).finish();

  it('takes the newest rate with its percent confidence, and the chest trace', () => {
    const events = mapBreathing(decodeMetrics(payload).breathing, 77);
    const rate = events.find((e) => e.type === 'rate');
    const trace = events.find((e) => e.type === 'trace');
    expect(rate).toMatchObject({ value: 12.5, confidence: 71, stable: true, at: 77 });
    expect(trace && trace.type === 'trace' && trace.points).toEqual([
      { t: 1500, v: expect.closeTo(0.1) },
      { t: 1533, v: expect.closeTo(0.3) },
    ]);
  });

  it('emits nothing for empty metrics (no invented values)', () => {
    expect(mapBreathing(decodeMetrics(Metrics.encode(Metrics.create({})).finish()).breathing, 1)).toEqual([]);
  });
});

function fakeSdk() {
  const handlers: Record<string, (...a: any[]) => void> = {};
  const sdk = {
    handlers,
    on: vi.fn((e: string, cb: any) => {
      handlers[e] = cb;
      return sdk;
    }),
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    destroy: vi.fn(),
  };
  return sdk;
}

function makeSource(sdk = fakeSdk(), decode: any = () => ({})) {
  const createSdk = vi.fn((_o: any) => sdk as unknown as SdkLike);
  const src = new PresageSource({ apiKey: 'k-12345678', createSdk, decodeMetrics: decode, breathingMetrics: [0, 1, 2], now: () => 5 });
  const events: SourceEvent[] = [];
  src.subscribe((e) => events.push(e));
  return { src, sdk, events, createSdk };
}

describe('PresageSource adapter', () => {
  it('opens the camera itself, hands the stream to the SDK before start, and releases its tracks', async () => {
    const order: string[] = [];
    const sdk: any = fakeSdk();
    sdk.useMediaStream = vi.fn(() => order.push('useMediaStream'));
    sdk.start.mockImplementation(async () => void order.push('start'));
    const track = { stop: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const stream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    const src = new PresageSource({ apiKey: 'k-12345678', createSdk: () => sdk, decodeMetrics: () => ({}), breathingMetrics: [0, 1, 2], now: () => 1, acquireStream: async () => stream });
    const events: SourceEvent[] = [];
    src.subscribe((e) => events.push(e));
    await src.start();
    expect(order).toEqual(['useMediaStream', 'start']);
    expect(events[0]).toEqual({ type: 'stream', stream });
    await src.stop();
    expect(track.stop).toHaveBeenCalled();
  });

  it('a camera refusal maps to a friendly error and leaves nothing open', async () => {
    const sdk: any = fakeSdk();
    sdk.useMediaStream = vi.fn();
    const err = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    const src = new PresageSource({ apiKey: 'k-12345678', createSdk: () => sdk, decodeMetrics: () => ({}), breathingMetrics: [0], now: () => 1, acquireStream: async () => { throw err; } });
    await expect(src.start()).rejects.toMatchObject({ kind: 'permission-denied' });
    expect(sdk.start).not.toHaveBeenCalled();
    expect(sdk.destroy).toHaveBeenCalledTimes(1);
  });

  it('creates the SDK with breathing metrics only and telemetry off', async () => {
    const { src, createSdk } = makeSource();
    await src.start();
    expect(createSdk.mock.calls[0]![0]).toMatchObject({ requestedMetrics: [0, 1, 2], enableTelemetry: false, enableAccumulatedOutput: false });
  });

  it('forwards running, validation and decoded metrics', async () => {
    const decode = () => ({ breathing: { rate: [{ value: 10, confidence: 80, stable: true, timestamp: 1 }] } });
    const { src, sdk, events } = makeSource(fakeSdk(), decode);
    await src.start();
    sdk.handlers.processingStatus!(3);
    sdk.handlers.validationStatus!(1, 1, 'hint');
    sdk.handlers.metrics!(new Uint8Array([1]), 1);
    expect(events.map((e) => e.type)).toEqual(['running', 'validation', 'rate']);
  });

  it('stop destroys the SDK once and releases the camera tracks; later events are dropped', async () => {
    const { src, sdk, events } = makeSource();
    await src.start();
    const track = { stop: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const stream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    sdk.handlers.streamAvailable!(stream);
    await src.stop();
    await src.stop();
    expect(sdk.stop).toHaveBeenCalledTimes(1);
    expect(sdk.destroy).toHaveBeenCalledTimes(1);
    expect(track.stop).toHaveBeenCalled();
    const before = events.length;
    sdk.handlers.validationStatus!(1, 1, '');
    sdk.handlers.metrics!(new Uint8Array(), 1);
    expect(events.length).toBe(before);
    expect(events.at(-1)).toEqual({ type: 'stream', stream: null });
  });

  it('reports only the first fatal error, and ignores per-frame timestamp glitches', async () => {
    const { src, sdk, events } = makeSource();
    await src.start();
    sdk.handlers.error!(SmartSpectraErrorCode.kNonMonotonicTimestamp, 'x', true);
    sdk.handlers.error!(SmartSpectraErrorCode.kAuthenticationFailed, 'secret text', false);
    sdk.handlers.error!(SmartSpectraErrorCode.kNetworkError, 'again', true);
    const errors = events.filter((e) => e.type === 'error');
    expect(errors).toHaveLength(1);
    expect(JSON.stringify(errors)).not.toContain('secret text');
  });

  it('treats a camera track that ends by itself as camera-lost', async () => {
    const { src, sdk, events } = makeSource();
    await src.start();
    let onEnded: () => void = () => {};
    const track = { stop: vi.fn(), addEventListener: (_: string, f: () => void) => (onEnded = f), removeEventListener: vi.fn() };
    sdk.handlers.streamAvailable!({ getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream);
    onEnded();
    expect(events.find((e) => e.type === 'error')).toMatchObject({ error: { kind: 'camera-lost' } });
  });

  it('a failed start cleans up and rejects with a friendly error', async () => {
    const sdk = fakeSdk();
    sdk.start.mockRejectedValueOnce(Object.assign(new Error('Failed to acquire default camera (NotAllowedError)'), { cause: { name: 'NotAllowedError' } }));
    const { src } = makeSource(sdk);
    await expect(src.start()).rejects.toMatchObject({ kind: 'permission-denied' });
    expect(sdk.destroy).toHaveBeenCalledTimes(1);
  });
});
