/** Pixel formats the SDK reports for processed frames (PixelFormat in @smartspectra/node-sdk). */
const RGB = 0;
const BGR = 1;
const RGBA = 2;
const BGRA = 3;

export interface PreviewFrame {
  width: number;
  height: number;
  /** RGBA, width*height*4 bytes. */
  data: Uint8Array;
}

/**
 * Shrinks an SDK frame to a small RGBA thumbnail by nearest-neighbour sampling.
 * Cheap enough (≈ 19k pixels) to run on the main process without disturbing the measurement.
 * Returns null for formats that are not packed 3/4-byte colour.
 */
export function downscaleToRgba(
  src: Uint8Array,
  width: number,
  height: number,
  stride: number,
  pixelFormat: number,
  maxWidth = 160,
): PreviewFrame | null {
  const bytesPerPixel = pixelFormat === RGB || pixelFormat === BGR ? 3 : pixelFormat === RGBA || pixelFormat === BGRA ? 4 : 0;
  if (bytesPerPixel === 0 || width <= 0 || height <= 0 || stride < width * bytesPerPixel) return null;
  if (src.length < stride * (height - 1) + width * bytesPerPixel) return null;

  const outW = Math.min(maxWidth, width);
  const outH = Math.max(1, Math.round((height * outW) / width));
  const out = new Uint8Array(outW * outH * 4);
  const swap = pixelFormat === BGR || pixelFormat === BGRA;
  for (let y = 0; y < outH; y++) {
    const sy = Math.min(height - 1, Math.floor((y * height) / outH));
    for (let x = 0; x < outW; x++) {
      const sx = Math.min(width - 1, Math.floor((x * width) / outW));
      const i = sy * stride + sx * bytesPerPixel;
      const o = (y * outW + x) * 4;
      out[o] = src[swap ? i + 2 : i] as number;
      out[o + 1] = src[i + 1] as number;
      out[o + 2] = src[swap ? i : i + 2] as number;
      out[o + 3] = 255;
    }
  }
  return { width: outW, height: outH, data: out };
}
