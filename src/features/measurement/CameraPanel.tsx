import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Eye, EyeOff, Lightbulb, Move, ScanFace, Sofa, Sun, TriangleAlert } from 'lucide-react';
import { controller, preview } from '../../app/runtime';
import { useApp } from '../../app/hooks';
import { VALIDATION_COPY } from '../../domain/messages';
import { isBlockingIssue } from '../../domain/measurement';
import { LIGHT_BRIGHT_ABOVE, LIGHT_DARK_BELOW, lightLevel, meanLuma } from '../../domain/lighting';
import type { SimScenario } from '../../shared/types';
import { useLuma } from './useLuma';
import { LoadMeter } from './LoadMeter';

const SCENARIOS: { id: SimScenario; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'signal-lost', label: 'Signal lost' },
  { id: 'low-confidence', label: 'Low confidence' },
  { id: 'motion', label: 'Movement' },
  { id: 'connection-error', label: 'Connection error' },
];

const SETUP_TIPS = [
  { icon: ScanFace, text: 'Face the camera' },
  { icon: Move, text: 'Shoulders and chest in frame' },
  { icon: Lightbulb, text: 'Soft light on your face' },
  { icon: Sofa, text: 'Sit still' },
];

const LIGHT_COPY = {
  dark: { label: 'Too dark', hint: 'Use screen light or a lamp facing you.' },
  ok: { label: 'Good', hint: '' },
  bright: { label: 'Too bright', hint: 'Reduce glare, or turn off Brighten camera image in Settings.' },
} as const;

export function CameraPanel() {
  const stream = useApp((s) => s.stream);
  const visible = useApp((s) => s.prefs.cameraVisible);
  const lightBoost = useApp((s) => s.prefs.lightBoost);
  const lowLoad = useApp((s) => s.prefs.lowLoad);
  const mode = useApp((s) => s.mode);
  const phase = useApp((s) => s.phase);
  const validation = useApp((s) => s.validation);
  const scenario = useApp((s) => s.scenario);
  const video = useRef<HTMLVideoElement>(null);
  const previewActive = useApp((s) => s.previewActive);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [nativeLuma, setNativeLuma] = useState<number | null>(null);

  // Native engine: the SDK sends a small thumbnail ~5 times a second. Draw it, and estimate the light from it.
  useEffect(() => {
    if (!previewActive) {
      setNativeLuma(null);
      return;
    }
    let last = -1;
    let smoothed: number | null = null;
    const id = setInterval(() => {
      const f = preview.frame;
      const c = canvas.current;
      if (!f || !c || preview.version === last) return;
      last = preview.version;
      c.width = f.width;
      c.height = f.height;
      c.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(f.rgba.buffer as ArrayBuffer, f.rgba.byteOffset, f.width * f.height * 4), f.width, f.height), 0, 0);
      const m = meanLuma(f.rgba, f.width, f.height);
      if (m != null) {
        smoothed = smoothed == null ? m : smoothed * 0.6 + m * 0.4;
        setNativeLuma(Math.round(smoothed));
      }
    }, 200);
    return () => clearInterval(id);
  }, [previewActive]);

  // The preview shows the stream the SDK already uses: the camera is never opened a second time.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.srcObject = stream;
    if (stream) void v.play().catch(() => undefined);
  }, [stream]);

  const running = phase === 'running' || phase === 'starting';
  const shown = visible && !(lowLoad && running); // performance mode hides the preview only while measuring
  const simulated = mode === 'simulated';
  const issue = isBlockingIssue(validation?.kind) ? validation!.kind : null;
  const videoLuma = useLuma(video, Boolean(stream) && shown);
  const luma = previewActive ? nativeLuma : videoLuma;
  const live = Boolean(stream) || previewActive;
  const level = luma == null ? null : lightLevel(luma);

  return (
    <section className="panel" aria-labelledby="cam-h">
      <div className="eyebrow">
        <span id="cam-h">Camera &amp; light</span>
        <span className="eyebrow__actions">
          <button
            className="icon-btn"
            style={{ width: 30, height: 30 }}
            aria-pressed={lightBoost}
            aria-label={lightBoost ? 'Turn screen light off' : 'Turn screen light on'}
            title="Screen light: surrounds the window with a warm white frame to light your face"
            data-active={lightBoost}
            onClick={() => controller.setPrefs({ lightBoost: !lightBoost })}
          >
            <Sun size={16} aria-hidden />
          </button>
          <button
            className="icon-btn"
            style={{ width: 30, height: 30 }}
            aria-pressed={!visible}
            aria-label={visible ? 'Hide camera preview (measurement continues)' : 'Show camera preview'}
            title={visible ? 'Hide preview — measurement continues' : 'Show preview'}
            onClick={() => controller.setPrefs({ cameraVisible: !visible })}
          >
            {visible ? <Eye size={16} aria-hidden /> : <EyeOff size={16} aria-hidden />}
          </button>
        </span>
      </div>

      <div className="camera__layout" data-sim={simulated}>
        {shown ? (
          <div className="camera__body">
            <video ref={video} className="camera__video" muted playsInline autoPlay aria-label="Camera preview" hidden={!stream} />
            <canvas ref={canvas} className="camera__video" aria-label="Camera preview" hidden={!previewActive} />
            {live && (
              <span className="camera__live">
                <i /> LIVE
              </span>
            )}
            {!live && (
              <div className="camera__placeholder">
                {simulated ? <Camera size={22} aria-hidden /> : <CameraOff size={22} aria-hidden />}
                <span>{simulated ? 'Simulated feed — no camera used' : running ? 'Waiting for the camera…' : 'Camera is off'}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="tip" style={{ margin: 0 }}>
            <EyeOff size={16} aria-hidden />
            <span>Preview hidden. {live ? 'The camera and measurement are still running.' : 'The camera is off.'}</span>
          </p>
        )}

        <div className="camera__side">
          {simulated ? (
            <div className="scenario" role="group" aria-label="Simulation scenarios">
              {SCENARIOS.map((s) => (
                <button key={s.id} aria-pressed={scenario === s.id} onClick={() => controller.setScenario(s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
          ) : (
            <>
              <LoadMeter measuring={running} />
              <div className="light" data-level={level ?? 'none'} role="status" aria-live="polite">
                <div className="light__head">
                  <span>Light</span>
                  <strong>{level ? LIGHT_COPY[level].label : live && shown ? 'Checking…' : live ? 'Paused' : '—'}</strong>
                </div>
                <div className="light__track" role="img" aria-label={luma == null ? 'Light level unknown' : `Brightness ${Math.round((luma / 255) * 100)} percent`}>
                  <i className="light__zone" style={{ left: `${(LIGHT_DARK_BELOW / 255) * 100}%`, width: `${((LIGHT_BRIGHT_ABOVE - LIGHT_DARK_BELOW) / 255) * 100}%` }} />
                  {luma != null && <i className="light__dot" style={{ left: `${(luma / 255) * 100}%` }} />}
                </div>
                {(!level || level !== 'ok') && <p className="light__hint">{level ? LIGHT_COPY[level].hint : 'Estimated from the preview.'}</p>}
              </div>
              {running && issue ? (
                <p className="tip" data-tone="warn" role="status">
                  <TriangleAlert size={16} aria-hidden />
                  <span>
                    <strong>{VALIDATION_COPY[issue].title}</strong>
                    {VALIDATION_COPY[issue].tip}
                    {issue === 'too-dark' && !lightBoost && (
                      <button className="link-btn" style={{ display: 'block', marginTop: 4 }} onClick={() => controller.setPrefs({ lightBoost: true })}>
                        Turn on screen light
                      </button>
                    )}
                  </span>
                </p>
              ) : (
                <ul className="tips" aria-label="Positioning tips">
                  {SETUP_TIPS.map(({ icon: Icon, text }) => (
                    <li key={text}>
                      <Icon size={13} aria-hidden /> {text}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
