/** Contract of `window.breathCoach`, exposed by electron/preload.ts through contextBridge. */
export interface KeyStatus {
  /** A key is stored on this device (encrypted with the operating system's protection). */
  stored: boolean;
  /** Whether the OS can protect a stored key. When false, "remember" is unavailable. */
  encryptionAvailable: boolean;
}

export interface SdkStatus {
  available: boolean;
}

/** Events from the main-process native session (the SDK's own camera capture). */
export type NativeEvent =
  | { k: 'status'; status: number }
  | { k: 'validation'; code: number }
  | { k: 'metrics'; data: Uint8Array }
  | { k: 'error'; code: number; retryable: boolean }
  | { k: 'preview'; width: number; height: number; data: Uint8Array };

export type NativeStartResult = { ok: true } | { ok: false; code: number; retryable: boolean };

export type ExternalLinkId = 'presage-console';

export interface BreathCoachBridge {
  readonly platform: string;
  readonly version: string;
  readonly key: {
    status(): Promise<KeyStatus>;
    save(key: string): Promise<KeyStatus>;
    load(): Promise<string | null>;
    remove(): Promise<KeyStatus>;
  };
  /**
   * Arms or disarms the camera at the main-process permission gate. The gate
   * refuses every camera request while disarmed, so the camera can only open
   * between an explicit Start and the end of that session.
   */
  armCamera(armed: boolean): Promise<void>;
  sdkStatus(): Promise<SdkStatus>;
  openExternal(id: ExternalLinkId): Promise<void>;
  /** Whole-computer CPU load, for telling the user when the machine is too busy to measure. */
  readonly system: {
    load(): Promise<{ cpuPercent: number | null }>;
  };
  /** The SDK captures from the camera itself in the main process; only codes, metrics and a thumbnail come back. */
  readonly native: {
    start(key: string): Promise<NativeStartResult>;
    stop(): Promise<void>;
    onEvent(cb: (e: NativeEvent) => void): () => void;
  };
}

declare global {
  interface Window {
    breathCoach?: BreathCoachBridge;
  }
}
