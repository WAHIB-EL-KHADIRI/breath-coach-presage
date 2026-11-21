import fs from 'node:fs';
import path from 'node:path';
import type { KeyStatus } from '../src/shared/bridge';
import { normalizeApiKey } from './security';

/** The subset of Electron's safeStorage used here (injectable for tests). */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(cipher: Buffer): string;
  /** Linux only: 'basic_text' means "not actually protected". */
  getSelectedStorageBackend?(): string;
}

/**
 * Optional local storage of the API key, encrypted with the operating system's
 * protection (DPAPI on Windows, Keychain on macOS, the desktop secret store on
 * Linux). If the OS cannot protect it, the key is NOT written to disk at all.
 */
export class CredentialStore {
  private readonly file: string;

  constructor(
    userDataDir: string,
    private readonly safe: SafeStorageLike,
  ) {
    this.file = path.join(userDataDir, 'credentials.bin');
  }

  encryptionAvailable(): boolean {
    try {
      if (!this.safe.isEncryptionAvailable()) return false;
      return this.safe.getSelectedStorageBackend?.() !== 'basic_text';
    } catch {
      return false;
    }
  }

  status(): KeyStatus {
    return { stored: fs.existsSync(this.file), encryptionAvailable: this.encryptionAvailable() };
  }

  save(raw: unknown): KeyStatus {
    const key = normalizeApiKey(raw);
    if (!key) throw new Error('invalid-key-shape');
    if (!this.encryptionAvailable()) throw new Error('encryption-unavailable');
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, this.safe.encryptString(key), { mode: 0o600 });
    return this.status();
  }

  load(): string | null {
    if (!fs.existsSync(this.file)) return null;
    try {
      return this.safe.decryptString(fs.readFileSync(this.file));
    } catch {
      return null; // unreadable (other user / other machine): behave as "no key"
    }
  }

  remove(): KeyStatus {
    fs.rmSync(this.file, { force: true });
    return this.status();
  }
}
