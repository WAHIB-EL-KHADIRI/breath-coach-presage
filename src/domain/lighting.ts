/**
 * Light estimate taken from the camera preview, to help people fix the room BEFORE
 * the SDK complains. It is a hint only: the SDK's own validation ("Too dark", "Too bright")
 * remains the authority and is always shown as such.
 */
export type LightLevel = 'dark' | 'ok' | 'bright';

export const LIGHT_DARK_BELOW = 70; // mean luma 0–255
export const LIGHT_BRIGHT_ABOVE = 200;

/** Mean luma (Rec. 601) of the central `region` fraction of an RGBA image. Returns null for empty input. */
export function meanLuma(rgba: ArrayLike<number>, width: number, height: number, region = 0.6): number | null {
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) return null;
  const x0 = Math.floor((width * (1 - region)) / 2);
  const x1 = Math.ceil(width - x0);
  const y0 = Math.floor((height * (1 - region)) / 2);
  const y1 = Math.ceil(height - y0);
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      sum += 0.299 * (rgba[i] as number) + 0.587 * (rgba[i + 1] as number) + 0.114 * (rgba[i + 2] as number);
      n++;
    }
  }
  return n === 0 ? null : sum / n;
}

export function lightLevel(luma: number): LightLevel {
  return luma < LIGHT_DARK_BELOW ? 'dark' : luma > LIGHT_BRIGHT_ABOVE ? 'bright' : 'ok';
}
