import type { SourceError, SourceErrorKind, ValidationKind } from '../shared/types';

/** Short, human guidance per validation problem. Never the SDK's raw hint text. */
export const VALIDATION_COPY: Record<ValidationKind, { title: string; tip: string }> = {
  ok: { title: 'Signal looks good', tip: 'Stay relaxed and keep still.' },
  tuning: { title: 'Adjusting the camera', tip: 'Hold still for a moment while the camera settles.' },
  'no-face': { title: 'No face found', tip: 'Face the camera so your face and shoulders are in the frame.' },
  'multiple-faces': { title: 'More than one face', tip: 'Only you should be in view of the camera.' },
  'off-center': { title: 'Move toward the centre', tip: 'Centre yourself in the frame.' },
  'too-close': { title: 'A little too close', tip: 'Sit back a little so your shoulders and chest fit.' },
  'too-far': { title: 'A little too far', tip: 'Move closer so your face fills more of the frame.' },
  'face-high': { title: 'Frame sits too high', tip: 'Lower the screen a little or sit slightly higher.' },
  'face-low': { title: 'Frame sits too low', tip: 'Raise the screen a little or sit slightly lower.' },
  'face-angle': { title: 'Face the camera', tip: 'Turn your face toward the camera.' },
  'too-dark': { title: 'Too dark', tip: 'Add soft light facing you. Avoid a bright window behind you.' },
  'too-bright': { title: 'Too bright', tip: 'Reduce glare or direct light on your face.' },
  'chest-hidden': { title: 'Chest not visible', tip: 'Show your shoulders and upper chest in the frame.' },
  motion: { title: 'Too much movement', tip: 'Rest your hands and keep your head and shoulders still.' },
  'low-frame-rate': { title: 'Camera is running slowly', tip: 'Close other apps that use the camera or the processor.' },
  unknown: { title: 'Signal unclear', tip: 'Check lighting and that your face and chest are visible.' },
};

export type NoticeAction = 'retry' | 'open-settings' | 'use-simulation';

export interface ErrorCopy {
  title: string;
  body: string;
  steps: string[];
  /** Fallbacks to the simulation are always offered as an explicit user choice, never automatic. */
  actions: NoticeAction[];
}

const COPY: Record<SourceErrorKind, ErrorCopy> = {
  'permission-denied': {
    title: 'Camera access is blocked',
    body: 'Breath Coach could not open the camera because access was denied.',
    steps: [
      'Open Windows Settings → Privacy & security → Camera.',
      'Turn on “Let desktop apps access your camera”.',
      'Come back and press Try again.',
    ],
    actions: ['retry', 'use-simulation'],
  },
  'camera-not-found': {
    title: 'No camera found',
    body: 'No camera is connected or enabled on this computer.',
    steps: ['Connect or enable a camera.', 'Press Try again.'],
    actions: ['retry', 'use-simulation'],
  },
  'camera-busy': {
    title: 'Camera is in use',
    body: 'Another app is using the camera, so Breath Coach cannot open it.',
    steps: ['Close video-call or camera apps.', 'Press Try again.'],
    actions: ['retry', 'use-simulation'],
  },
  'camera-lost': {
    title: 'Camera disconnected',
    body: 'The camera stopped sending video, so the session was ended and the camera released.',
    steps: ['Check the cable or the camera switch.', 'Press Try again to start a new session.'],
    actions: ['retry', 'use-simulation'],
  },
  'missing-key': {
    title: 'An API key is needed',
    body: 'Measuring with the camera needs a Presage API key. Nothing was started.',
    steps: ['Open Settings and add your key.', 'Or explore with the clearly labelled simulation.'],
    actions: ['open-settings', 'use-simulation'],
  },
  'invalid-key': {
    title: 'The API key was not accepted',
    body: 'Presage did not accept this key. The camera was released.',
    steps: ['Check the key for typos or extra spaces.', 'Create a fresh key in the Presage console if needed.'],
    actions: ['open-settings', 'use-simulation'],
  },
  'metric-not-authorized': {
    title: 'Breathing is not enabled for this key',
    body: 'This key is not authorised for breathing metrics.',
    steps: ['Check the key’s permissions in the Presage console.'],
    actions: ['open-settings', 'use-simulation'],
  },
  credits: {
    title: 'No measurement credits left',
    body: 'The Presage account for this key has no remaining credits.',
    steps: ['Review your plan in the Presage console.'],
    actions: ['open-settings', 'use-simulation'],
  },
  network: {
    title: 'Can’t reach Presage',
    body: 'The connection to the measurement service failed.',
    steps: ['Check your internet connection.', 'Press Try again.'],
    actions: ['retry', 'use-simulation'],
  },
  server: {
    title: 'The measurement service had a problem',
    body: 'Presage reported a service error. This is not caused by your camera or key.',
    steps: ['Wait a moment and press Try again.'],
    actions: ['retry', 'use-simulation'],
  },
  'low-frame-rate': {
    title: 'The camera feed is too slow',
    body: 'The video frame rate stayed too low to measure reliably, so the session ended.',
    steps: ['Close heavy apps and make sure the room is well lit.', 'Press Try again for a fresh start.'],
    actions: ['retry'],
  },
  'sdk-unavailable': {
    title: 'The measurement engine could not start',
    body: 'The SmartSpectra runtime failed to load on this computer.',
    steps: ['Reinstall Breath Coach.', 'The simulation still works for exploring the interface.'],
    actions: ['use-simulation'],
  },
  processing: {
    title: 'The measurement stopped',
    body: 'The measurement engine reported a problem and the session was ended.',
    steps: ['Press Try again to start a fresh session.'],
    actions: ['retry', 'use-simulation'],
  },
  unknown: {
    title: 'Something went wrong',
    body: 'The session ended unexpectedly and the camera was released.',
    steps: ['Press Try again.'],
    actions: ['retry', 'use-simulation'],
  },
};

export function describeError(error: SourceError): ErrorCopy & { reference: string | null } {
  return { ...COPY[error.kind], reference: error.code != null ? `Ref ${error.code}` : null };
}
