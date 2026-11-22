import { useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';

/** Above this the measurement engine is likely to be starved of frames (measured: ≈5–7 fps reached the SDK at ≈100 %). */
const BUSY_ABOVE = 75;

/**
 * Whole-computer CPU load, polled every 2 s from the main process. The SDK needs about 27 frames/s to reach it;
 * on a busy computer (Windows Update, an IDE, scanners) it gets a fraction of that and ends the session with error 14.
 */
export function LoadMeter({ measuring = false }: { measuring?: boolean }) {
  const [load, setLoad] = useState<number | null>(null);

  useEffect(() => {
    const bridge = window.breathCoach;
    if (!bridge) return;
    let alive = true;
    const poll = () =>
      bridge.system
        .load()
        .then((r) => alive && setLoad(r.cpuPercent))
        .catch(() => undefined);
    void poll();
    const id = setInterval(poll, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (load == null) return null;
  const busy = load > (measuring ? 95 : BUSY_ABOVE);
  return (
    <div className="light" data-level={busy ? 'dark' : 'ok'} role="status" aria-live="polite">
      <div className="light__head">
        <span>
          <Cpu size={12} aria-hidden style={{ verticalAlign: -2, marginRight: 4 }} />
          Computer load
        </span>
        <strong className="num">{load}%</strong>
      </div>
      <div className="light__track" role="img" aria-label={`Computer load ${load} percent`}>
        <i className="light__zone" style={{ left: 0, width: `${BUSY_ABOVE}%` }} />
        <i className="light__dot" style={{ left: `${Math.min(100, load)}%` }} />
      </div>
      {busy && (
        <p className="light__hint">
          {measuring ? 'Includes this app while it measures. If the session stops, close other apps.' : 'Too busy to measure reliably. Close other apps, or let Windows Update finish.'}
        </p>
      )}
    </div>
  );
}
