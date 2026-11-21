/** Latest small camera thumbnail from the native session. In memory only; cleared when the session ends. */
export interface PreviewFrame {
  width: number;
  height: number;
  rgba: Uint8Array;
}

export class PreviewStore {
  frame: PreviewFrame | null = null;
  version = 0;

  set(f: PreviewFrame | null): void {
    this.frame = f && f.width > 0 && f.height > 0 && f.rgba.length >= f.width * f.height * 4 ? f : null;
    this.version++;
  }

  clear(): void {
    this.set(null);
  }
}
