import { useEffect, useState, type RefObject } from 'react';
import { meanLuma } from '../../domain/lighting';

/**
 * Smoothed brightness (0–255) of the live preview, sampled twice a second from a tiny
 * 32×24 copy of the frame. Nothing is stored and nothing leaves the component.
 */
export function useLuma(video: RefObject<HTMLVideoElement | null>, active: boolean): number | null {
  const [luma, setLuma] = useState<number | null>(null);

  useEffect(() => {
    if (!active) {
      setLuma(null);
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 24;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let smoothed: number | null = null;
    const id = setInterval(() => {
      const v = video.current;
      if (!ctx || !v || v.readyState < 2) return;
      try {
        ctx.drawImage(v, 0, 0, 32, 24);
        const m = meanLuma(ctx.getImageData(0, 0, 32, 24).data, 32, 24);
        if (m == null) return;
        smoothed = smoothed == null ? m : smoothed * 0.6 + m * 0.4;
        setLuma(Math.round(smoothed));
      } catch {
        /* a frame that can't be read is skipped */
      }
    }, 500);
    return () => clearInterval(id);
  }, [video, active]);

  return luma;
}
