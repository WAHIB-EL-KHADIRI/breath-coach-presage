import type { SignalPoint, SourceError, SourceEvent, ValidationKind } from '../../shared/types';

/**
 * Numeric values come from @smartspectra/node-sdk 3.5.0 (`ValidationCode`,
 * `SmartSpectraErrorCode`). They are mirrored here, instead of imported, so the
 * mapping stays testable without loading the SDK's browser-only renderer module.
 * `tests/presage-mapping.test.ts` pins them against the SDK's own constants.
 */
export const VALIDATION_CODE_TO_KIND: Readonly<Record<number, ValidationKind>> = {
  0: 'ok',
  1: 'no-face',
  2: 'multiple-faces',
  3: 'off-center',
  4: 'unknown', // kFaceSizeOutOfRange — deprecated by the SDK in favour of 13/14
  5: 'too-dark',
  6: 'too-bright',
  7: 'chest-hidden',
  10: 'tuning',
  11: 'low-frame-rate',
  12: 'motion',
  13: 'too-close',
  14: 'too-far',
  15: 'face-high',
  16: 'face-low',
  17: 'face-angle',
};

export function mapValidationCode(code: number): ValidationKind {
  return VALIDATION_CODE_TO_KIND[code] ?? 'unknown';
}

/** Per-frame glitches the SDK reports that do not end a session. */
const NON_FATAL_ERROR_CODES: ReadonlySet<number> = new Set([10 /* non-monotonic ts */, 11 /* ts gap */]);

export function isNonFatalSdkError(code: number): boolean {
  return NON_FATAL_ERROR_CODES.has(code);
}

export function mapSdkErrorCode(code: number, retryable: boolean): SourceError {
  switch (code) {
    case 2:
      return { kind: 'invalid-key', code, retryable: false };
    case 4:
      return { kind: 'credits', code, retryable: false };
    case 5:
      return { kind: 'network', code, retryable: true };
    case 6:
      return { kind: 'server', code, retryable: true };
    case 7:
      return { kind: 'camera-not-found', code, retryable: true };
    case 13:
      return { kind: 'metric-not-authorized', code, retryable: false };
    case 14:
      return { kind: 'low-frame-rate', code, retryable: true };
    case 3:
    case 8:
    case 9:
      return { kind: 'processing', code, retryable };
    default:
      return { kind: 'unknown', code: code || undefined, retryable };
  }
}

/** Turns whatever `start()` rejected with into a user-facing SourceError. Raw text is never forwarded. */
export function mapThrown(err: unknown): SourceError {
  const e = err as { code?: unknown; retryable?: unknown; name?: unknown; message?: unknown; cause?: { name?: unknown } } | null;
  const domName = String(e?.cause?.name ?? e?.name ?? '');
  const message = String(e?.message ?? '');
  const camName = /NotAllowedError|PermissionDenied|SecurityError/.test(domName + message)
    ? 'denied'
    : /NotFoundError|DevicesNotFound|OverconstrainedError/.test(domName + message)
      ? 'missing'
      : /NotReadableError|TrackStartError|AbortError/.test(domName + message)
        ? 'busy'
        : null;
  if (camName === 'denied') return { kind: 'permission-denied', retryable: true };
  if (camName === 'missing') return { kind: 'camera-not-found', retryable: true };
  if (camName === 'busy') return { kind: 'camera-busy', retryable: true };
  if (e?.code === 'SMARTSPECTRA_IPC_TIMEOUT') return { kind: 'processing', retryable: true };
  if (typeof e?.code === 'number') return mapSdkErrorCode(e.code, Boolean(e.retryable));
  if (/native runtime|koffi|LoadLibrary|shared object|bridge is unavailable/i.test(message)) {
    return { kind: 'sdk-unavailable', retryable: false };
  }
  return { kind: 'unknown', retryable: true };
}

type LongLike = number | { toNumber(): number } | null | undefined;

export function toNumber(v: LongLike): number {
  if (v == null) return NaN;
  return typeof v === 'number' ? v : v.toNumber();
}

export interface DecodedBreathing {
  rate?: ({ value?: number | null; confidence?: number | null; stable?: boolean | null; timestamp?: LongLike }[]) | null;
  upperTrace?: ({ value?: number | null; timestamp?: LongLike }[]) | null;
  lowerTrace?: ({ value?: number | null; timestamp?: LongLike }[]) | null;
}

/**
 * Converts one decoded Metrics.breathing message into source events.
 *  - rate: the newest entry of `breathing.rate` (value, confidence in percent, stable flag).
 *  - trace: the chest trace, or the abdomen trace when the chest one is empty.
 * `at` is the receipt time on the renderer's monotonic clock.
 */
export function mapBreathing(breathing: DecodedBreathing | null | undefined, at: number): SourceEvent[] {
  const events: SourceEvent[] = [];
  if (!breathing) return events;

  const trace = (breathing.upperTrace?.length ? breathing.upperTrace : breathing.lowerTrace) ?? [];
  const points: SignalPoint[] = [];
  for (const p of trace) {
    const v = p.value;
    const t = toNumber(p.timestamp) / 1000; // µs → ms
    if (typeof v === 'number' && Number.isFinite(v) && Number.isFinite(t)) points.push({ t, v });
  }
  if (points.length > 0) events.push({ type: 'trace', points, at });

  const rates = breathing.rate ?? [];
  let newest: (typeof rates)[number] | undefined;
  let newestT = -Infinity;
  for (const r of rates) {
    const t = toNumber(r.timestamp);
    if (typeof r.value === 'number' && (newest === undefined || t >= newestT)) {
      newest = r;
      newestT = t;
    }
  }
  if (newest && typeof newest.value === 'number') {
    const c = newest.confidence;
    events.push({
      type: 'rate',
      value: newest.value,
      confidence: typeof c === 'number' && Number.isFinite(c) ? c : null,
      stable: Boolean(newest.stable),
      at,
    });
  }
  return events;
}
