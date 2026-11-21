import type { MeasurementSource, SourceError, SourceEvent } from '../../shared/types';
import { isNonFatalSdkError, mapBreathing, mapSdkErrorCode, mapThrown, mapValidationCode, type DecodedBreathing } from './mapping';

/** The slice of the SmartSpectra renderer SDK this adapter relies on (see @smartspectra/node-sdk/renderer). */
export interface SdkLike {
  on(event: string, callback: (...args: never[]) => void): unknown;
  /** Optional: lets the host own the camera stream (official renderer API `useMediaStream`). */
  useMediaStream?(stream: MediaStream): unknown;
  start(): Promise<void>;
  stop(): Promise<void>;
  destroy(): void;
}

export interface SdkOptions {
  apiKey: string;
  requestedMetrics: number[];
  enableTelemetry: boolean;
  enableAccumulatedOutput: boolean;
}

export type SdkFactory = (options: SdkOptions) => SdkLike;
export type MetricsDecoder = (buf: Uint8Array) => { breathing?: DecodedBreathing | null };

export interface PresageSourceDeps {
  apiKey: string;
  /**
   * Opens the camera at a resolution this computer can pump at the SDK's required frame rate.
   * The SDK's own default is 1280×720; copying 720p frames to the SDK was measured to cap
   * out near 17 fps on a laptop (the SDK then ends the session: error 14). When omitted,
   * the SDK acquires its default stream itself.
   */
  acquireStream?: () => Promise<MediaStream>;
  createSdk: SdkFactory;
  decodeMetrics: MetricsDecoder;
  /** Metrics to request. Breathing only: the app never asks for cardio, face or other families. */
  breathingMetrics: readonly number[];
  now: () => number;
}

const STATUS_RUNNING = 3;
const STATUS_ERROR = 5;

/**
 * Adapter between the official SmartSpectra renderer SDK and the app's
 * MeasurementSource contract.
 *
 *  - One SDK instance per session; it is destroyed on stop, so no listener or
 *    camera outlives a session and late events from an old session are dropped.
 *  - The SDK acquires the camera once and hands the same MediaStream to the
 *    preview (`streamAvailable`); the app never opens the camera a second time.
 */
export class PresageSource implements MeasurementSource {
  readonly kind = 'presage' as const;

  private readonly listeners = new Set<(e: SourceEvent) => void>();
  private sdk: SdkLike | null = null;
  private stream: MediaStream | null = null;
  private trackCleanup: (() => void) | null = null;
  private destroyed = false;
  private errored = false;
  private stopping: Promise<void> | null = null;
  private used = false;

  constructor(private readonly deps: PresageSourceDeps) {}

  subscribe(listener: (e: SourceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    if (this.destroyed || this.used) throw { kind: 'unknown', retryable: false } satisfies SourceError;
    this.used = true;
    let sdk: SdkLike;
    try {
      sdk = this.deps.createSdk({
        apiKey: this.deps.apiKey,
        requestedMetrics: [...this.deps.breathingMetrics],
        // Aggregate SDK telemetry is opted out of. See docs/PRIVACY.md for what this does and does not cover.
        enableTelemetry: false,
        enableAccumulatedOutput: false,
      });
    } catch (err) {
      throw mapThrown(err);
    }
    this.sdk = sdk;
    this.wire(sdk);
    try {
      if (this.deps.acquireStream && sdk.useMediaStream) {
        const stream = await this.deps.acquireStream();
        if (this.destroyed || this.sdk !== sdk) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        this.watchStream(stream); // from here on release() stops these tracks, whatever happens next
        sdk.useMediaStream(stream);
        this.emit({ type: 'stream', stream });
      }
      await sdk.start();
    } catch (err) {
      const mapped = mapThrown(err);
      await this.release();
      throw mapped;
    }
    if (this.destroyed || this.sdk !== sdk) await this.release();
  }

  stop(): Promise<void> {
    this.stopping ??= (async () => {
      const sdk = this.sdk;
      if (sdk) {
        try {
          await sdk.stop();
        } catch {
          /* the SDK is destroyed right after; a failing stop must not keep the camera open */
        }
      }
      await this.release();
    })();
    return this.stopping;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.listeners.clear();
    void this.release();
  }

  private emit(event: SourceEvent): void {
    if (this.destroyed) return;
    for (const l of [...this.listeners]) l(event);
  }

  private fail(error: SourceError): void {
    if (this.errored || this.destroyed) return;
    this.errored = true;
    this.emit({ type: 'error', error });
  }

  private wire(sdk: SdkLike): void {
    const live = () => this.sdk === sdk && !this.destroyed;

    sdk.on('processingStatus', ((status: number) => {
      if (!live()) return;
      if (status === STATUS_RUNNING) this.emit({ type: 'running' });
      else if (status === STATUS_ERROR) this.fail({ kind: 'processing', retryable: true });
    }) as never);

    sdk.on('validationStatus', ((code: number) => {
      if (!live()) return;
      this.emit({ type: 'validation', kind: mapValidationCode(code), at: this.deps.now() });
    }) as never);

    sdk.on('metrics', ((buf: Uint8Array) => {
      if (!live()) return;
      try {
        for (const e of mapBreathing(this.deps.decodeMetrics(buf).breathing, this.deps.now())) this.emit(e);
      } catch {
        /* a malformed packet is skipped; it is never shown */
      }
    }) as never);

    sdk.on('error', ((code: number, _message: string, retryable: boolean) => {
      if (!live() || isNonFatalSdkError(code)) return;
      this.fail(mapSdkErrorCode(code, retryable));
    }) as never);

    sdk.on('streamAvailable', ((stream: MediaStream) => {
      if (!live()) return;
      this.watchStream(stream);
      this.emit({ type: 'stream', stream });
    }) as never);
  }

  /** A track that ends on its own means the camera was unplugged or revoked. */
  private watchStream(stream: MediaStream): void {
    this.trackCleanup?.();
    this.stream = stream;
    const tracks = stream.getVideoTracks();
    const onEnded = () => this.fail({ kind: 'camera-lost', retryable: true });
    for (const t of tracks) t.addEventListener('ended', onEnded);
    this.trackCleanup = () => {
      for (const t of tracks) t.removeEventListener('ended', onEnded);
    };
  }

  /** Stops the SDK + camera and forgets them. Safe to call repeatedly. */
  private async release(): Promise<void> {
    const sdk = this.sdk;
    const stream = this.stream;
    this.sdk = null;
    this.stream = null;
    this.trackCleanup?.();
    this.trackCleanup = null;
    if (sdk) {
      try {
        sdk.destroy();
      } catch {
        /* already torn down */
      }
    }
    // Belt and braces: the SDK owns this stream, but the camera must be off after a session regardless.
    if (stream) for (const t of stream.getTracks()) t.stop();
    if (stream) this.emit({ type: 'stream', stream: null });
  }
}
