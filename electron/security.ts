/** Pure helpers for the main process's trust decisions. Kept free of Electron imports so they are unit-testable. */

export interface TrustedOrigins {
  /** file:// URL of the packaged index.html (compared without query or hash). */
  fileUrl: string;
  /** Vite dev server origin, only set when running unpackaged. */
  devOrigin?: string;
}

export function isTrustedUrl(raw: string | undefined | null, trusted: TrustedOrigins): boolean {
  if (!raw) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol === 'file:') {
    u.search = '';
    u.hash = '';
    // Windows drive letters differ in case between Node paths ("c:") and Chromium URLs ("C:").
    return u.href.toLowerCase() === trusted.fileUrl.toLowerCase();
  }
  if (trusted.devOrigin) return u.origin === new URL(trusted.devOrigin).origin;
  return false;
}

export interface MediaRequestDetails {
  mediaTypes?: readonly string[];
  mediaType?: string;
}

/** Only video, never audio — Breath Coach does not request the microphone. */
export function isVideoOnly(details: MediaRequestDetails | undefined): boolean {
  if (!details) return false;
  if (Array.isArray(details.mediaTypes)) return details.mediaTypes.length > 0 && details.mediaTypes.every((t) => t === 'video');
  return details.mediaType === 'video';
}

export interface CameraGateInput {
  permission: string;
  armed: boolean;
  senderIsMainWindow: boolean;
  requestingUrl: string | undefined | null;
  details: MediaRequestDetails | undefined;
  trusted: TrustedOrigins;
}

/** The single rule for camera access. Everything else is denied. */
export function allowCamera(i: CameraGateInput): boolean {
  return (
    i.permission === 'media' &&
    i.armed &&
    i.senderIsMainWindow &&
    isTrustedUrl(i.requestingUrl, i.trusted) &&
    isVideoOnly(i.details)
  );
}

export { normalizeApiKey } from '../src/shared/apiKey';
