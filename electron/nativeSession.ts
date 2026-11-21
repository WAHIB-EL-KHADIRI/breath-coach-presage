import { normalizeApiKey } from './security';
import { downscaleToRgba } from './preview';

/** Events sent to the renderer. Only plain data: codes, a metrics buffer and a tiny thumbnail. */
export type NativeEvent =
  | { k: 'status'; status: number }
  | { k: 'validation'; code: number }
  | { k: 'metrics'; data: Uint8Array }
  | { k: 'error'; code: number; retryable: boolean }
  | { k: 'preview'; width: number; height: number; data: Uint8Array };

export type NativeStartResult = { ok: true } | { ok: false; code: number; retryable: boolean };

interface SdkInstance {
  on(event: string, cb: (...args: never[]) => void): unknown;
  useCamera(selection: unknown, options?: unknown): unknown;
  start(): void;
  stopAsync(): Promise<void>;
  destroy(): Promise<void>;
}
interface SdkModule {
  SmartSpectraSDK: new (options: Record<string, unknown>) => SdkInstance;
  CameraSelection: { default: unknown };
  breathingMetrics: readonly number[];
}

const PREVIEW_INTERVAL_MS = 180; // ≈ 5 thumbnails per second

/**
 * Runs the SmartSpectra session in the main process with the SDK's OWN camera capture. No frame ever crosses
 * a process boundary except a tiny thumbnail, which removes the renderer → IPC → main copy chain that kept
 * slower computers below the frame rate the SDK requires.
 */
export class NativeSession {
  private sdk: SdkInstance | null = null;
  private generation = 0;
  private teardown: Promise<void> = Promise.resolve();
  private lastPreviewAt = 0;

  constructor(
    private readonly emit: (e: NativeEvent) => void,
    private readonly loadSdk: () => SdkModule = () => require('@smartspectra/node-sdk') as SdkModule,
  ) {}

  async start(rawKey: unknown): Promise<NativeStartResult> {
    const key = normalizeApiKey(rawKey);
    if (!key) return { ok: false, code: 2, retryable: false }; // treated as an authentication failure
    await this.stop();
    await this.teardown; // native state is process-global: never overlap two sessions

    const gen = ++this.generation;
    const live = () => this.generation === gen && this.sdk != null;
    let sdk: SdkInstance;
    try {
      const m = this.loadSdk();
      sdk = new m.SmartSpectraSDK({
        apiKey: key,
        requestedMetrics: [...m.breathingMetrics],
        enableTelemetry: false,
        enableAccumulatedOutput: false,
      });
      sdk.useCamera(m.CameraSelection.default, { width: 640, height: 480, fps: 30 });
    } catch (e) {
      return failure(e);
    }
    this.sdk = sdk;

    sdk.on('processingStatus', ((status: number) => live() && this.emit({ k: 'status', status })) as never);
    sdk.on('validationStatus', ((code: number) => live() && this.emit({ k: 'validation', code })) as never);
    sdk.on('metrics', ((buf: Uint8Array) => live() && this.emit({ k: 'metrics', data: new Uint8Array(buf) })) as never);
    sdk.on('error', ((code: number, _m: string, retryable: boolean) => live() && this.emit({ k: 'error', code, retryable })) as never);
    sdk.on('videoOutput', ((buf: Uint8Array, w: number, h: number, stride: number, fmt: number) => {
      if (!live()) return;
      const now = Date.now();
      if (now - this.lastPreviewAt < PREVIEW_INTERVAL_MS) return;
      this.lastPreviewAt = now;
      const f = downscaleToRgba(buf, w, h, stride, fmt);
      if (f) this.emit({ k: 'preview', width: f.width, height: f.height, data: f.data });
    }) as never);

    try {
      sdk.start(); // opens the camera and the pipeline; may take a few seconds on first use
      return { ok: true };
    } catch (e) {
      await this.stop();
      return failure(e);
    }
  }

  /** Idempotent. Always releases the camera. */
  stop(): Promise<void> {
    const sdk = this.sdk;
    this.sdk = null;
    this.generation++;
    if (!sdk) return this.teardown;
    this.teardown = (async () => {
      try {
        await sdk.stopAsync();
      } catch {
        /* destroyed below regardless */
      }
      try {
        await sdk.destroy();
      } catch {
        /* already gone */
      }
    })();
    return this.teardown;
  }

  get active(): boolean {
    return this.sdk != null;
  }
}

function failure(e: unknown): NativeStartResult {
  const err = e as { code?: unknown; retryable?: unknown } | null;
  return { ok: false, code: typeof err?.code === 'number' ? err.code : 0, retryable: Boolean(err?.retryable) };
}
