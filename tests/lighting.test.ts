import { describe, expect, it } from 'vitest';
import { LIGHT_BRIGHT_ABOVE, LIGHT_DARK_BELOW, lightLevel, meanLuma } from '../src/domain/lighting';

const solid = (w: number, h: number, r: number, g: number, b: number) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < d.length; i += 4) d.set([r, g, b, 255], i);
  return d;
};

describe('light estimate', () => {
  it('measures brightness of a solid frame', () => {
    expect(meanLuma(solid(8, 6, 0, 0, 0), 8, 6)).toBe(0);
    expect(meanLuma(solid(8, 6, 255, 255, 255), 8, 6)).toBeCloseTo(255);
    expect(meanLuma(solid(8, 6, 100, 100, 100), 8, 6)).toBeCloseTo(100);
  });

  it('looks at the centre, where the face is, not the borders', () => {
    const w = 10;
    const h = 10;
    const d = solid(w, h, 0, 0, 0);
    for (let y = 2; y < 8; y++) for (let x = 2; x < 8; x++) d.set([220, 220, 220, 255], (y * w + x) * 4);
    expect(meanLuma(d, w, h)!).toBeGreaterThan(200);
  });

  it('rejects empty or short input instead of guessing', () => {
    expect(meanLuma(new Uint8ClampedArray(0), 0, 0)).toBeNull();
    expect(meanLuma(new Uint8ClampedArray(8), 4, 4)).toBeNull();
  });

  it('classifies dark, good and bright', () => {
    expect(lightLevel(LIGHT_DARK_BELOW - 1)).toBe('dark');
    expect(lightLevel(LIGHT_DARK_BELOW)).toBe('ok');
    expect(lightLevel(LIGHT_BRIGHT_ABOVE)).toBe('ok');
    expect(lightLevel(LIGHT_BRIGHT_ABOVE + 1)).toBe('bright');
  });
});

import { boostBrightness } from '../src/infrastructure/presage/cameraTuning';

describe('camera brightness boost', () => {
  const track = (caps: unknown, applyConstraints: (c: unknown) => Promise<void>) =>
    ({ getCapabilities: () => caps, applyConstraints }) as unknown as MediaStreamTrack;

  it('sets the hardware maximum when the camera supports it', async () => {
    let applied: any;
    const v = await boostBrightness(track({ brightness: { max: 100 } }, async (c) => void (applied = c)));
    expect(v).toBe(100);
    expect(applied).toEqual({ advanced: [{ brightness: 100 }] });
  });

  it('does nothing for cameras without the control, or that refuse it', async () => {
    expect(await boostBrightness(track({}, async () => {}))).toBeNull();
    expect(await boostBrightness(track({ brightness: { max: 100 } }, async () => { throw new Error('refused'); }))).toBeNull();
  });
});
