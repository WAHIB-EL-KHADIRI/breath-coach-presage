/** Seconds the measurement engine needs before a rate can be trusted. Time-based, NOT a confidence value. */
export const WARMUP_MS = 30_000;

/** Minimum source confidence (percent, 0–100) before a rate may steer the guidance. */
export const MIN_GUIDANCE_CONFIDENCE = 50;

/** A rate older than this is stale and is never shown as a live reading. */
export const RATE_STALE_AFTER_MS = 10_000;

/** After this long without a rate we stop mentioning the previous reading at all. */
export const LAST_READING_FORGET_MS = 120_000;

/** Readings outside (0, MAX] are treated as invalid and never displayed. */
export const MAX_PLAUSIBLE_RATE = 100;

/** Guidance target bounds, breaths per minute. Only the guide is clamped, never the measured value. */
export const GUIDE_MIN_BPM = 6;
export const GUIDE_MAX_BPM = 12;
export const GUIDE_DEFAULT_BPM = 6;
export const INHALE_FRACTION = 0.4;
/** Largest change of the guide's rhythm between two cycles. */
export const GUIDE_MAX_STEP_BPM = 1;

/** Signal buffer: roughly 40 s at 30 Hz. Bounded so long sessions never grow memory. */
export const SIGNAL_BUFFER_CAPACITY = 1200;
export const SIGNAL_WINDOW_MS = 20_000;
/** No trace sample for this long means the wave shows "waiting for signal". */
export const SIGNAL_STALE_AFTER_MS = 3_000;

export const CONSENT_VERSION = 1;
export const PRESAGE_CONSOLE_ID = 'presage-console';
