import { useEffect, useRef } from 'react';
import { signal } from '../../app/runtime';
import { useApp } from '../../app/hooks';
import { SIGNAL_STALE_AFTER_MS, SIGNAL_WINDOW_MS } from '../../shared/constants';

const MIN_SPAN = 0.6;

/** Draws the real respiration trace. Reads the bounded buffer on every animation frame; React is not involved per sample. */
export function SignalWave() {
  const phase = useApp((s) => s.phase);
  const simulated = useApp((s) => s.mode === 'simulated');
  const canvas = useRef<HTMLCanvasElement>(null);
  const empty = useRef<HTMLDivElement>(null);
  const running = phase === 'running';

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let lo = -1;
    let hi = 1;
    let showEmpty = true;
    let lastDraw = -Infinity;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const r = el.getBoundingClientRect();
      el.width = Math.max(1, Math.round(r.width * dpr));
      el.height = Math.max(1, Math.round(r.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const nowT = performance.now();
      if (nowT - lastDraw < 45) return; // ~22 fps is plenty for a slow respiration wave
      lastDraw = nowT;
      const w = el.clientWidth;
      const h = el.clientHeight;
      ctx.clearRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(148,178,222,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < 4; i++) {
        const y = Math.round((h * i) / 4) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      const fresh = running && performance.now() - signal.lastReceivedAt < SIGNAL_STALE_AFTER_MS;
      const pts = fresh ? signal.window(SIGNAL_WINDOW_MS) : [];
      const wantEmpty = pts.length < 2;
      if (wantEmpty !== showEmpty) {
        showEmpty = wantEmpty;
        if (empty.current) empty.current.hidden = !wantEmpty;
      }

      if (!wantEmpty) {
        let mn = Infinity;
        let mx = -Infinity;
        for (const p of pts) {
          if (p.v < mn) mn = p.v;
          if (p.v > mx) mx = p.v;
        }
        const mid = (mn + mx) / 2;
        const half = Math.max(MIN_SPAN, (mx - mn) / 2) * 1.15;
        lo += (mid - half - lo) * 0.08; // eased autoscale: no jumpy axis
        hi += (mid + half - hi) * 0.08;

        const t1 = (pts[pts.length - 1] as { t: number }).t;
        const t0 = t1 - SIGNAL_WINDOW_MS;
        const pad = 10;
        const X = (t: number) => ((t - t0) / SIGNAL_WINDOW_MS) * (w - 14);
        const Y = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (h - 2 * pad);

        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, 'rgba(56,220,196,0)');
        grad.addColorStop(0.35, 'rgba(56,220,196,0.85)');
        grad.addColorStop(1, 'rgba(125,240,214,1)');

        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(X(p.t), Y(p.v)) : ctx.moveTo(X(p.t), Y(p.v))));
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        // Soft glow without shadowBlur (which is expensive on integrated graphics): a wide translucent pass under the line.
        ctx.globalAlpha = 0.18;
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2;
        ctx.stroke();

        const last = pts[pts.length - 1] as { t: number; v: number };
        ctx.fillStyle = '#c8fbef';
        ctx.beginPath();
        ctx.arc(X(last.t), Y(last.v), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [running]);

  const message = phase === 'running' ? 'Waiting for signal…' : phase === 'starting' ? 'Starting…' : 'The live signal appears here during a session.';

  return (
    <section className="panel" aria-labelledby="wave-h">
      <div className="eyebrow">
        <span id="wave-h">Respiration signal</span>
        <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 450 }}>last {SIGNAL_WINDOW_MS / 1000} s · relative</span>
      </div>
      <div className="wave__frame">
        <canvas ref={canvas} className="wave__canvas" role="img" aria-label="Live respiration signal" />
        <div ref={empty} className="wave__empty">
          {message}
        </div>
        {simulated && <span className="sim-watermark">SIMULATED</span>}
      </div>
    </section>
  );
}
