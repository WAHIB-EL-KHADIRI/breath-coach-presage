import { useEffect, useRef, useState } from 'react';
import type { BreathPacer, BreathPhase } from '../../domain/pacer';
import { useReducedMotion } from '../../app/hooks';

interface Props {
  pacer: BreathPacer;
  now: () => number;
  showCountdown: boolean;
  dim?: boolean;
  /** Called when the phase flips (used for the optional sound cue). */
  onPhase?: (phase: BreathPhase) => void;
  subLabel?: string;
}

/**
 * The centre of the experience. The scale is written straight to a CSS variable
 * every animation frame from the time-based pacer, so React re-renders only
 * twice per breath (phase word) plus once per second (countdown).
 */
export function BreathOrb({ pacer, now, showCountdown, dim, onPhase, subLabel }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<BreathPhase>('inhale');
  const [count, setCount] = useState(0);
  const onPhaseRef = useRef(onPhase);
  onPhaseRef.current = onPhase;

  useEffect(() => {
    let raf = 0;
    let lastPhase: BreathPhase | null = null;
    let lastCount = -1;
    let lastWrite = -Infinity;
    const loop = () => {
      const t = now();
      const f = pacer.frame(t);
      const el = root.current;
      // ~30 updates/s are visually identical for a slow breath and leave CPU to the measurement engine.
      if (el && t - lastWrite >= 32) {
        lastWrite = t;
        el.style.setProperty('--b', f.level.toFixed(4));
        el.style.setProperty('--p', f.phaseProgress.toFixed(4));
      }
      if (f.phase !== lastPhase) {
        lastPhase = f.phase;
        setPhase(f.phase);
        onPhaseRef.current?.(f.phase);
      }
      const c = Math.max(1, Math.ceil(f.phaseRemainingMs / 1000));
      if (c !== lastCount) {
        lastCount = c;
        setCount(c);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pacer, now]);

  return (
    <div
      ref={root}
      className="orb"
      role="group"
      aria-label="Breathing guide"
      data-phase={phase}
      data-dim={dim ? 'true' : 'false'}
      data-reduced={reduced ? 'true' : 'false'}
    >
      <div className="orb__aura" />
      <div className="orb__ring orb__ring--3" />
      <div className="orb__ring orb__ring--2" />
      <div className="orb__ring orb__ring--1" />
      <div className="orb__core" />
      <svg className="orb__progress" viewBox="0 0 100 100" aria-hidden="true">
        <circle className="orb__track" cx="50" cy="50" r="48" />
        <circle className="orb__arc" cx="50" cy="50" r="48" pathLength={100} />
      </svg>
      <div className="orb__label">
        <div className="orb__phase">{phase === 'inhale' ? 'Breathe in' : 'Breathe out'}</div>
        <div className="orb__count num" aria-hidden="true">
          {showCountdown ? count : ''}
        </div>
        {subLabel && <div className="orb__sub">{subLabel}</div>}
      </div>
    </div>
  );
}
