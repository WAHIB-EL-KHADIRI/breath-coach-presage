/** Where measurements come from. Never mixed within a session. */
export type SourceKind = 'presage' | 'simulated';

/** Domain-level meaning of the SDK's validation codes (one per readiness problem). */
export type ValidationKind =
  | 'ok'
  | 'tuning'
  | 'no-face'
  | 'multiple-faces'
  | 'off-center'
  | 'too-close'
  | 'too-far'
  | 'face-high'
  | 'face-low'
  | 'face-angle'
  | 'too-dark'
  | 'too-bright'
  | 'chest-hidden'
  | 'motion'
  | 'low-frame-rate'
  | 'unknown';

/** A point of the real respiration trace. `t` is milliseconds on the source's own timeline. */
export interface SignalPoint {
  t: number;
  v: number;
}

export type SourceErrorKind =
  | 'permission-denied'
  | 'camera-not-found'
  | 'camera-busy'
  | 'camera-lost'
  | 'invalid-key'
  | 'missing-key'
  | 'metric-not-authorized'
  | 'credits'
  | 'network'
  | 'server'
  | 'low-frame-rate'
  | 'sdk-unavailable'
  | 'processing'
  | 'unknown';

export interface SourceError {
  kind: SourceErrorKind;
  /** Numeric SDK error code when there is one. Shown as a short reference, never as raw text. */
  code?: number;
  retryable: boolean;
}

/**
 * Events a measurement source emits. `at` is the renderer's monotonic clock
 * (performance.now) at the moment the event was received, so freshness is
 * judged on one timeline regardless of the source's own timestamps.
 */
export type SourceEvent =
  | { type: 'running' }
  | { type: 'validation'; kind: ValidationKind; at: number }
  | { type: 'rate'; value: number; confidence: number | null; stable: boolean; at: number }
  | { type: 'trace'; points: SignalPoint[]; at: number }
  | { type: 'stream'; stream: MediaStream | null }
  /** Small RGBA camera thumbnail from the native session. width 0 clears it. */
  | { type: 'preview'; width: number; height: number; rgba: Uint8Array }
  | { type: 'error'; error: SourceError };

/** The one contract both the real Presage adapter and the simulator implement. */
export interface MeasurementSource {
  readonly kind: SourceKind;
  subscribe(listener: (event: SourceEvent) => void): () => void;
  /** Acquire input and begin measuring. Rejects with a SourceError-shaped object. */
  start(): Promise<void>;
  /** Release the camera and stop measuring. Idempotent. */
  stop(): Promise<void>;
  /** Drop every listener and resource. Idempotent. After this no event is delivered. */
  destroy(): void;
}

export type SimScenario = 'normal' | 'signal-lost' | 'low-confidence' | 'motion' | 'connection-error';

export interface RateSample {
  value: number;
  /** Percentage 0–100 as reported by the source, or null when the source gave none. */
  confidence: number | null;
  stable: boolean;
  at: number;
}
