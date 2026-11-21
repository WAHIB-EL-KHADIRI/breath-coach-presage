// The only file that imports the SmartSpectra renderer module (browser-only; it needs the preload bridge).
import { SmartSpectraSDK, breathingMetrics } from '@smartspectra/node-sdk/renderer';
import { decodeMetrics } from '@smartspectra/node-sdk/messages';
import { PresageSource, type MetricsDecoder, type SdkFactory } from './presageSource';
import { boostBrightness } from './cameraTuning';
import { NativePresageSource } from './nativeSource';
import type { MeasurementSource } from '../../shared/types';

const createSdk: SdkFactory = (options) =>
  new SmartSpectraSDK({
    apiKey: options.apiKey,
    requestedMetrics: options.requestedMetrics,
    enableTelemetry: options.enableTelemetry,
    enableAccumulatedOutput: options.enableAccumulatedOutput,
  }) as unknown as ReturnType<SdkFactory>;

/** 640×480 @ 30 fps, front camera, video only (no audio is ever requested). */
export const CAPTURE_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: 'user' },
};

export interface PresageOptions {
  /** Read at the moment the camera opens, so the setting can change between sessions. */
  brightnessBoost: () => boolean;
}

export function createPresageSource(apiKey: string, options: PresageOptions): MeasurementSource {
  return new PresageSource({
    apiKey,
    createSdk,
    acquireStream: async () => {
      const stream = await navigator.mediaDevices.getUserMedia(CAPTURE_CONSTRAINTS);
      // Diagnostic only (no frames, no key): what the camera itself reports. Visible with SMARTSPECTRA_DIAGNOSTICS=1.
      const track = stream.getVideoTracks()[0];
      if (track && options.brightnessBoost()) {
        const applied = await boostBrightness(track);
        console.info(`[breath-coach] camera brightness boost: ${applied ?? 'not supported'}`);
      }
      if (track) {
        const caps = (track.getCapabilities?.() ?? {}) as { frameRate?: { max?: number } };
        const st = track.getSettings();
        console.info(`[breath-coach] camera reports ${st.width}x${st.height} @${st.frameRate}fps (device max ${caps.frameRate?.max ?? '?'}fps)`);
      }
      return stream;
    },
    decodeMetrics: decodeMetrics as unknown as MetricsDecoder,
    breathingMetrics,
    now: () => performance.now(),
  });
}

/** Opens the camera for a moment only to raise its hardware brightness, then releases it before the SDK opens it. */
async function prepareCamera(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 320 }, height: { ideal: 240 } }, audio: false });
  try {
    const track = stream.getVideoTracks()[0];
    if (track) {
      const applied = await boostBrightness(track);
      console.info(`[breath-coach] camera brightness boost: ${applied ?? 'not supported'}`);
      await new Promise((r) => setTimeout(r, 400));
    }
  } finally {
    for (const t of stream.getTracks()) t.stop();
  }
  await new Promise((r) => setTimeout(r, 300)); // let the driver release the device
}

/** Native engine: the SDK captures from the camera itself in the main process. */
export function createNativeSource(apiKey: string, options: PresageOptions): MeasurementSource {
  const bridge = window.breathCoach;
  if (!bridge) throw new Error('bridge unavailable');
  return new NativePresageSource({
    apiKey,
    native: bridge.native,
    decodeMetrics: decodeMetrics as unknown as MetricsDecoder,
    now: () => performance.now(),
    prepare: options.brightnessBoost() ? prepareCamera : undefined,
  });
}
