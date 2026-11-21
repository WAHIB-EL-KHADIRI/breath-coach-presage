import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CredentialStore, type SafeStorageLike } from '../electron/credentials';
import { allowCamera, isAllowedRequestUrl, isTrustedUrl, normalizeApiKey } from '../electron/security';
import { SimulatedSource } from '../src/infrastructure/simulation/simulatedSource';
import type { SourceEvent } from '../src/shared/types';

const trusted = { fileUrl: 'file:///C:/app/dist/index.html' };

describe('main-process trust rules', () => {
  it('trusts only the app page (case-insensitive drive letter, query and hash ignored)', () => {
    expect(isTrustedUrl('file:///c:/app/dist/index.html#x', trusted)).toBe(true);
    expect(isTrustedUrl('file:///C:/app/dist/other.html', trusted)).toBe(false);
    expect(isTrustedUrl('https://evil.example/', trusted)).toBe(false);
    expect(isTrustedUrl('', trusted)).toBe(false);
    expect(isTrustedUrl('not a url', trusted)).toBe(false);
    expect(isTrustedUrl('http://localhost:5173/x', { ...trusted, devOrigin: 'http://localhost:5173/' })).toBe(true);
    expect(isTrustedUrl('http://localhost:5173/x', trusted)).toBe(false);
  });

  const base = { permission: 'media', armed: true, senderIsMainWindow: true, requestingUrl: trusted.fileUrl, details: { mediaTypes: ['video'] }, trusted };
  it('camera gate: allowed only when armed, from our window, for video only', () => {
    expect(allowCamera(base)).toBe(true);
    expect(allowCamera({ ...base, armed: false })).toBe(false);
    expect(allowCamera({ ...base, senderIsMainWindow: false })).toBe(false);
    expect(allowCamera({ ...base, requestingUrl: 'https://evil.example/' })).toBe(false);
    expect(allowCamera({ ...base, details: { mediaTypes: ['video', 'audio'] } })).toBe(false);
    expect(allowCamera({ ...base, details: { mediaTypes: ['audio'] } })).toBe(false);
    expect(allowCamera({ ...base, details: undefined })).toBe(false);
    expect(allowCamera({ ...base, permission: 'geolocation' })).toBe(false);
    expect(allowCamera({ ...base, permission: 'notifications' })).toBe(false);
  });

  it('api key shape', () => {
    expect(normalizeApiKey('  abcDEF123456  ')).toBe('abcDEF123456');
    for (const bad of ['short', 'has space inside1', 'new\nline12345', 123, null, 'x'.repeat(600)]) expect(normalizeApiKey(bad)).toBeNull();
  });
});

describe('credential store', () => {
  const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bc-cred-'));
  const safe = (available: boolean, backend?: string): SafeStorageLike => ({
    isEncryptionAvailable: () => available,
    encryptString: (s) => Buffer.from('enc:' + s.split('').reverse().join('')),
    decryptString: (b) => b.toString().slice(4).split('').reverse().join(''),
    getSelectedStorageBackend: backend ? () => backend : undefined,
  });

  it('round-trips and never writes the plaintext key', () => {
    const d = dir();
    const store = new CredentialStore(d, safe(true));
    store.save('plain-secret-key-1');
    expect(fs.readFileSync(path.join(d, 'credentials.bin'), 'utf8')).not.toContain('plain-secret-key-1');
    expect(store.load()).toBe('plain-secret-key-1');
    expect(store.status()).toEqual({ stored: true, encryptionAvailable: true });
    expect(store.remove().stored).toBe(false);
    expect(store.load()).toBeNull();
  });

  it('writes nothing when the OS cannot protect the key', () => {
    for (const s of [safe(false), safe(true, 'basic_text')]) {
      const d = dir();
      const store = new CredentialStore(d, s);
      expect(() => store.save('plain-secret-key-1')).toThrow('encryption-unavailable');
      expect(fs.existsSync(path.join(d, 'credentials.bin'))).toBe(false);
    }
  });

  it('rejects malformed keys and treats an unreadable file as "no key"', () => {
    const d = dir();
    const store = new CredentialStore(d, safe(true));
    expect(() => store.save('bad key')).toThrow('invalid-key-shape');
    fs.writeFileSync(path.join(d, 'credentials.bin'), 'garbage');
    const broken = new CredentialStore(d, { ...safe(true), decryptString: () => { throw new Error('nope'); } });
    expect(broken.load()).toBeNull();
  });
});

describe('simulated source', () => {
  it('produces warm-up-gated rates, honours scenarios, and stops cleanly', async () => {
    let t = 0;
    const src = new SimulatedSource({ now: () => t, warmupMs: 2000, tickMs: 100 });
    const events: SourceEvent[] = [];
    src.subscribe((e) => events.push(e));
    const { vi } = await import('vitest');
    vi.useFakeTimers();
    const started = src.start();
    await vi.advanceTimersByTimeAsync(500);
    await started;
    for (let i = 0; i < 40; i++) {
      t += 100;
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(events.some((e) => e.type === 'running')).toBe(true);
    expect(events.some((e) => e.type === 'trace')).toBe(true);
    expect(events.some((e) => e.type === 'rate')).toBe(true);
    const n = events.length;
    src.setScenario('signal-lost');
    for (let i = 0; i < 20; i++) {
      t += 100;
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(events.slice(n).filter((e) => e.type === 'rate' || e.type === 'trace')).toHaveLength(0);
    expect(events.slice(n)[0]).toMatchObject({ type: 'validation', kind: 'no-face' });
    src.destroy();
    const m = events.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(events.length).toBe(m);
    vi.useRealTimers();
  });
});

describe('renderer request filter', () => {
  const prod = { fileUrl: 'file:///C:/app/dist/index.html' };
  const dev = { ...prod, devOrigin: 'http://localhost:5173/' };

  it('allows only the bundle and in-memory URLs in production', () => {
    expect(isAllowedRequestUrl('file:///c:/app/dist/assets/font.woff2', prod)).toBe(true);
    expect(isAllowedRequestUrl('blob:file:///abc', prod)).toBe(true);
    expect(isAllowedRequestUrl('data:image/png;base64,AAAA', prod)).toBe(true);
    for (const bad of [
      'https://example.com/x',
      'http://localhost:5173/',
      'wss://example.com/',
      'ftp://example.com/',
      'file:///C:/Users/someone/secret.txt',
      'chrome-extension://abc/x.js',
      'not a url',
    ])
      expect(isAllowedRequestUrl(bad, prod)).toBe(false);
  });

  it('allows the dev server only while developing', () => {
    expect(isAllowedRequestUrl('http://localhost:5173/src/main.tsx', dev)).toBe(true);
    expect(isAllowedRequestUrl('ws://localhost:5173/', dev)).toBe(true);
    expect(isAllowedRequestUrl('http://localhost:9999/', dev)).toBe(false);
    expect(isAllowedRequestUrl('https://example.com/', dev)).toBe(false);
  });
});
