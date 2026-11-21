import type { BreathPhase } from '../../domain/pacer';

/**
 * Optional, off by default. A very soft sine tone at each phase change:
 * rising for breathe in, falling for breathe out. Nothing in the app depends on it.
 */
let ctx: AudioContext | null = null;

export function playCue(phase: BreathPhase): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const [from, to] = phase === 'inhale' ? [330, 392] : [392, 262];
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + 0.9);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.05, t + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 1.2);
  } catch {
    /* audio is optional */
  }
}

export function disposeCue(): void {
  void ctx?.close().catch(() => undefined);
  ctx = null;
}
