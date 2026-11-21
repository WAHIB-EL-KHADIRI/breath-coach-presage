import { SIGNAL_BUFFER_CAPACITY } from '../shared/constants';
import { RingBuffer } from '../shared/ringBuffer';
import type { SignalPoint } from '../shared/types';

/**
 * Bounded, in-memory respiration trace. It lives outside React state: the
 * canvas reads it every animation frame, and a new sample never re-renders the app.
 * It is cleared at the end of every session and is never written anywhere.
 */
export class SignalStore {
  private readonly buffer = new RingBuffer<SignalPoint>(SIGNAL_BUFFER_CAPACITY);
  /** Renderer-clock time at which the newest point arrived. */
  lastReceivedAt = -Infinity;

  push(points: readonly SignalPoint[], receivedAt: number): void {
    let lastT = this.buffer.last()?.t ?? -Infinity;
    let accepted = false;
    for (const p of points) {
      // Strictly increasing only: this also drops overlap if the source re-sends a window.
      if (Number.isFinite(p.t) && Number.isFinite(p.v) && p.t > lastT) {
        this.buffer.push(p);
        lastT = p.t;
        accepted = true;
      }
    }
    if (accepted) this.lastReceivedAt = receivedAt;
  }

  /** Points no older than `windowMs` before the newest point, oldest first. */
  window(windowMs: number): SignalPoint[] {
    const all = this.buffer.toArray();
    const newest = all[all.length - 1];
    if (!newest) return all;
    const from = newest.t - windowMs;
    let i = 0;
    while (i < all.length && (all[i] as SignalPoint).t < from) i++;
    return i === 0 ? all : all.slice(i);
  }

  get size(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer.clear();
    this.lastReceivedAt = -Infinity;
  }
}
