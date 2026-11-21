import { Compass, Waves } from 'lucide-react';
import { useApp } from '../../app/hooks';
import { GUIDE_MAX_BPM, GUIDE_MIN_BPM } from '../../shared/constants';

/** Explains what the circle is doing, and keeps "guidance target" visibly separate from the measured rate. */
export function GuidanceCaption() {
  const guidance = useApp((s) => s.guidance);
  const phase = useApp((s) => s.phase);
  const adaptive = guidance.mode === 'adaptive';
  const active = phase === 'running' || phase === 'starting';

  return (
    <div className="caption">
      <div className="caption__rhythm">
        <span>Guide rhythm</span>
        <span className="num">{guidance.targetBpm.toFixed(1)}</span>
        <span>breaths / min</span>
      </div>
      <span className="caption__badge" data-mode={guidance.mode}>
        {adaptive ? <Waves size={13} aria-hidden /> : <Compass size={13} aria-hidden />}
        {adaptive ? 'Following your measured rate' : active ? 'Default rhythm · no reliable reading yet' : 'Default rhythm'}
      </span>
      <p className="caption__note">
        {adaptive
          ? `The guide follows your measured average, kept between ${GUIDE_MIN_BPM} and ${GUIDE_MAX_BPM}. It doesn’t track each breath you take.`
          : 'A steady, gentle pace to follow. It is a suggestion, not a measurement of you. Breathe comfortably and stop whenever you like.'}
      </p>
    </div>
  );
}
