import type { BreathCoachBridge, NativeEvent } from '../../shared/bridge';
import type { MeasurementSource, SourceError, SourceEvent } from '../../shared/types';
import { isNonFatalSdkError, mapBreathing, mapSdkErrorCode, mapValidationCode, type DecodedBreathing } from './mapping';

export interface NativeSourceDeps {
  apiKey: string;
  native: BreathCoachBridge['native'];
  decodeMetrics: (buf: Uint8Array) => { breathing?: DecodedBreathing | null };
  now: () => number;
  /** Optional step before the SDK opens the camera (e.g. raising the camera's brightness setting). Must release the camera. */
  prepare?: () => Promise<void>;
}

const STATUS_RUNNING = 3;
const STATUS_ERROR = 5;

/**
 * MeasurementSource backed by the SDK's own camera capture in the main process. The renderer receives only
 * codes, metrics packets and a small preview thumbnail, never full frames.
 */
export class NativePresageSource implements MeasurementSource {
  readonly kind = 'presage' as const;

  private readonly listeners = new Set<(e: SourceEvent) => void>();
  private unsubscribe: (() => void) | null = null;
  private destroyed = false;
  private used = false;
  private errored = false;
  private stopping: Promise<void> | null = null;

  constructor(private readonly deps: NativeSourceDeps) {}

  subscribe(listener: (e: SourceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    if (this.destroyed || this.used) throw { kind: 'unknown', retryable: false } satisfies SourceError;
    this.used = true;
    this.unsubscribe = this.deps.native.onEvent((e) => this.onEvent(e));
    try {
      await this.deps.prepare?.();
    } catch {
      /* optional tuning only */
    }
    if (this.destroyed) return;
    const r = await this.deps.native.start(this.deps.apiKey);
    if (!r.ok) {
      await this.release();
      throw mapSdkErrorCode(r.code, r.retryable);
    }
    if (this.destroyed) await this.release();
  }

  stop(): Promise<void> {
    this.stopping ??= this.release();
    return this.stopping;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.listeners.clear();
    void this.release();
  }

  private emit(e: SourceEvent): void {
    if (this.destroyed) return;
    for (const l of [...this.listeners]) l(e);
  }

  private fail(error: SourceError): void {
    if (this.errored || this.destroyed) return;
    this.errored = true;
    this.emit({ type: 'error', error });
  }

  private onEvent(e: NativeEvent): void {
    if (this.destroyed) return;
    switch (e.k) {
      case 'status':
        if (e.status === STATUS_RUNNING) this.emit({ type: 'running' });
        else if (e.status === STATUS_ERROR) this.fail({ kind: 'processing', retryable: true });
        break;
      case 'validation':
        this.emit({ type: 'validation', kind: mapValidationCode(e.code), at: this.deps.now() });
        break;
      case 'metrics':
        try {
          for (const ev of mapBreathing(this.deps.decodeMetrics(e.data).breathing, this.deps.now())) this.emit(ev);
        } catch {
          /* a malformed packet is skipped; it is never shown */
        }
        break;
      case 'error':
        if (!isNonFatalSdkError(e.code)) this.fail(mapSdkErrorCode(e.code, e.retryable));
        break;
      case 'preview':
        this.emit({ type: 'preview', width: e.width, height: e.height, rgba: e.data });
        break;
    }
  }

  private async release(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    try {
      await this.deps.native.stop();
    } catch {
      /* the main process also stops on disarm */
    }
    this.emit({ type: 'preview', width: 0, height: 0, rgba: new Uint8Array(0) }); // clears the preview
  }
}
