/**
 * Many UVC webcams expose a hardware "brightness" setting (0–100, default 50). Measured on a Lenovo EasyCamera:
 * raising it to the maximum lifted a very dark preview (luma 23 → 73) without lowering the frame rate (26 → 30 fps).
 * Returns the value applied, or null when the camera has no such control or refuses it.
 */
export async function boostBrightness(track: MediaStreamTrack): Promise<number | null> {
  const caps = (track.getCapabilities?.() ?? {}) as { brightness?: { max?: number } };
  const max = caps.brightness?.max;
  if (typeof max !== 'number') return null;
  try {
    await track.applyConstraints({ advanced: [{ brightness: max } as unknown as MediaTrackConstraintSet] });
    return max;
  } catch {
    return null;
  }
}
