const KEY_PATTERN = /^[\x21-\x7E]{8,512}$/;

/**
 * Shape check only: printable ASCII, no spaces, a sensible length. Whether the
 * key is valid is decided by Presage, never guessed here.
 */
export function normalizeApiKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return KEY_PATTERN.test(trimmed) ? trimmed : null;
}
