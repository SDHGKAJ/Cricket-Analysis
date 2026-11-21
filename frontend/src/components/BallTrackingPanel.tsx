import React, { useMemo } from 'react';
import { BallTrackingReport, FrameLandmarks, MetricStatus } from '../types/cricket';
import { StatusBadge } from './StatusBadge';

/**
 * BallTrackingPanel — what the ball detector actually found:
 *   headline status, detection stats, a per-frame detection strip
 *   (click to seek) and the ball's path plotted in frame coordinates.
 */
interface BallTrackingPanelProps {
  tracking?: BallTrackingReport | null;
  frames: FrameLandmarks[];
  aspect: number;
  timeMs: number;
  durationMs: number;
  contactFrame?: number | null;
  onSeek: (ms: number) => void;
}

function verdict(t?: BallTrackingReport | null): { status: MetricStatus; label: string; note: string } {
  if (!t || !t.frames_total) {
    return { status: 'not_detected', label: 'No data', note: 'Ball tracking did not run for this clip.' };
  }
  if (t.frames_with_ball === 0 || /^not/i.test(t.status ?? '')) {
    return {
      status: 'not_detected',
      label: 'Ball not found',
      note: 'No ball was detected. If one was bowled, try brighter light, a steadier camera, or a closer framing of the pitch.',
    };
  }
  if (t.detection_rate >= 0.3) {
    return { status: 'good', label: 'Tracked', note: 'The ball was tracked through most of the delivery.' };
  }
  return {
    status: 'medium',
    label: 'Partly tracked',
    note: 'The ball was seen in a few frames only, so ball-based metrics may be less reliable.',
  };
}

export const BallTrackingPanel: React.FC<BallTrackingPanelProps> = ({
  tracking, frames, aspect, timeMs, durationMs, contactFrame, onSeek,
}) => {
  const v = verdict(tracking);

  const pts = useMemo(
    () => frames
      .map((f) => (f.ball_position ? { i: f.frame_index, t: f.timestamp_ms, x: f.ball_position.x, y: f.ball_position.y } : null))
      .filter((p): p is { i: number; t: number; x: number; y: number } => p != null),
    [frames]
  );

  const W = 100, H = 100 / (aspect || 16 / 9);
  const segments = useMemo(() => {
    const segs: string[] = [];
    let cur: string[] = [];
    pts.forEach((p, k) => {
      const prev = pts[k - 1];
      if (prev && p.i - prev.i > 3) { if (cur.length > 1) segs.push(cur.join(' ')); cur = []; }
      cur.push(`${(p.x * W).toFixed(2)},${(p.y * H).toFixed(2)}`);
    });
    if (cur.length > 1) segs.push(cur.join(' '));
    return segs;
  }, [pts, H]);

  const currentPt = [...pts].reverse().find((p) => p.t <= timeMs + 1);
  const contactPt = contactFrame != null ? pts.find((p) => p.i === contactFrame) : undefined;

  const n = frames.length;
  const total = durationMs || (n ? frames[n - 1].timestamp_ms : 1) || 1;
  const rate = tracking?.detection_rate ?? (n ? pts.length / n : 0);

  const onStripClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(((e.clientX - r.left) / r.width) * total);
  };

  return (
    <section className="card p-4 space-y-4" aria-label="Ball tracking">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="eyebrow mb-1">Ball tracking</h3>
          <p className="text-[13px] text-body leading-snug">{v.note}</p>
        </div>
        <StatusBadge status={v.status} label={v.label} />
      </div>

      <dl className="grid grid-cols-3 gap-2">
        {[
          { k: 'Detected', v: `${Math.round(rate * 100)}%`, sub: 'of frames' },
          { k: 'Frames', v: `${tracking?.frames_with_ball ?? pts.length}`, sub: `of ${tracking?.frames_total ?? n}` },
          { k: 'Confidence', v: tracking?.avg_confidence ? `${Math.round(tracking.avg_confidence * 100)}%` : '—', sub: 'average' },
        ].map((s) => (
          <div key={s.k} className="rounded-lg bg-bg border border-line px-3 py-2">
            <dt className="text-[11px] text-mute">{s.k}</dt>
            <dd className="num text-2xl text-ink leading-tight">{s.v}</dd>
            <dd className="text-[11px] text-mute">{s.sub}</dd>
          </div>
        ))}
      </dl>

      {n > 0 && (
        <div>
          <div className="flex justify-between text-[11px] text-mute mb-1">
            <span>Detections per frame</span>
            <span>tap to jump</span>
          </div>
          <div
            className="relative h-6 rounded-md bg-bg border border-line overflow-hidden cursor-pointer"
            onClick={onStripClick}
            role="presentation"
          >
            {pts.map((p) => (
              <div
                key={p.i}
                className="absolute top-1 bottom-1 bg-ball"
                style={{ left: `${(p.t / total) * 100}%`, width: `max(2px, ${100 / Math.max(n, 1)}%)` }}
              />
            ))}
            <div className="absolute top-0 bottom-0 w-0.5 bg-ink pointer-events-none" style={{ left: `${Math.min(100, (timeMs / total) * 100)}%` }} />
          </div>
        </div>
      )}

      {pts.length > 0 && (
        <div>
          <div className="text-[11px] text-mute mb-1">Ball path in frame</div>
          <svg
            viewBox={`0 0 ${W} ${H.toFixed(2)}`}
            className="w-full max-h-64 rounded-md bg-bg border border-line"
            role="img"
            aria-label={`Ball path with ${pts.length} detected positions`}
          >
            {segments.map((s, k) => (
              <polyline key={k} points={s} fill="none" stroke="var(--ball)" strokeOpacity={0.55} strokeWidth={0.8} strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {pts.map((p) => (
              <circle key={p.i} cx={p.x * W} cy={p.y * H} r={0.6} fill="var(--ball)" fillOpacity={0.8} />
            ))}
            {contactPt && (
              <g>
                <circle cx={contactPt.x * W} cy={contactPt.y * H} r={2.6} fill="none" stroke="var(--warn)" strokeWidth={0.6} />
                <text x={contactPt.x * W + 3.5} y={contactPt.y * H + 1} fontSize={3} fill="var(--warn)">contact</text>
              </g>
            )}
            {currentPt && (
              <circle cx={currentPt.x * W} cy={currentPt.y * H} r={1.8} fill="var(--ink)" stroke="var(--ball)" strokeWidth={0.7} />
            )}
          </svg>
        </div>
      )}

      {tracking?.model && (
        <p className="text-[11px] text-mute">
          Model <span className="text-body">{tracking.model}</span>
          {tracking.conf_threshold ? <> · min confidence {Math.round(tracking.conf_threshold * 100)}%</> : null}
        </p>
      )}
    </section>
  );
};

export default BallTrackingPanel;
