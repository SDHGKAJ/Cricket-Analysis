import React from 'react';
import { PhaseMarker } from '../services/reportMapper';

/**
 * PhaseTimeline — the measured stroke phases laid out on the clip's real
 * timeline (no synthetic curves). Click a phase or anywhere on the bar to seek.
 */
interface PhaseTimelineProps {
  markers: PhaseMarker[];
  durationMs: number;
  timeMs: number;
  onSeek: (ms: number) => void;
}

const PHASE_COLOR: Record<string, string> = {
  stance: 'var(--phase-stance)',
  backlift: 'var(--phase-backlift)',
  downswing: 'var(--phase-downswing)',
  contact: 'var(--phase-contact)',
  follow: 'var(--phase-follow)',
};

export const PhaseTimeline: React.FC<PhaseTimelineProps> = ({ markers, durationMs, timeMs, onSeek }) => {
  const phases = markers.filter((m) => m.kind === 'phase');
  const contact = markers.find((m) => m.id === 'contact');
  const total = Math.max(
    durationMs,
    ...markers.map((m) => m.endMs ?? m.startMs),
    1
  );
  const pct = (ms: number) => `${Math.max(0, Math.min(100, (ms / total) * 100))}%`;
  const current = phases.find((p) => timeMs >= p.startMs && timeMs <= (p.endMs ?? p.startMs));

  const onBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(((e.clientX - r.left) / r.width) * total);
  };

  return (
    <section className="card p-4" aria-label="Stroke phases">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="eyebrow">Stroke phases</h3>
        <span className="text-xs text-body">
          {current ? <>Now: <span className="text-ink font-semibold">{current.label}</span></> : phases.length ? 'Tap a phase to jump to it' : ''}
        </span>
      </div>

      {phases.length === 0 && !contact ? (
        <p className="text-sm text-mute">Stroke phases could not be measured for this clip.</p>
      ) : (
        <>
          <div
            className="relative h-9 rounded-lg bg-bg border border-line overflow-hidden cursor-pointer"
            onClick={onBarClick}
            role="presentation"
          >
            {phases.map((p) => (
              <div
                key={p.id}
                className="absolute top-0 bottom-0 opacity-80 hover:opacity-100 transition-opacity"
                style={{
                  left: pct(p.startMs),
                  width: `calc(${pct((p.endMs ?? p.startMs) - p.startMs)} - 2px)`,
                  background: `color-mix(in srgb, ${PHASE_COLOR[p.id]} 55%, transparent)`,
                  borderTop: `3px solid ${PHASE_COLOR[p.id]}`,
                }}
                title={`${p.label}: ${(p.startMs / 1000).toFixed(2)}–${((p.endMs ?? p.startMs) / 1000).toFixed(2)} s`}
              />
            ))}
            {contact && (
              <div className="absolute top-0 bottom-0 w-0.5 bg-ball" style={{ left: pct(contact.startMs) }} title="Ball contact">
                <span className="absolute -top-px left-1 text-[10px] font-bold text-ball">●</span>
              </div>
            )}
            <div className="absolute top-0 bottom-0 w-0.5 bg-ink shadow-[0_0_0_1px_rgba(0,0,0,0.5)] pointer-events-none" style={{ left: pct(timeMs) }} />
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            {phases.map((p) => (
              <button
                key={p.id}
                onClick={() => onSeek(p.startMs)}
                className={`inline-flex items-center gap-2 min-h-[32px] px-2.5 rounded-lg border text-xs transition-colors ${
                  current?.id === p.id ? 'border-line-strong bg-raised text-ink' : 'border-line text-body hover:text-ink'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: PHASE_COLOR[p.id] }} />
                {p.label}
                <span className="num text-mute text-[13px]">{(((p.endMs ?? p.startMs) - p.startMs) / 1000).toFixed(2)}s</span>
              </button>
            ))}
            {contact && (
              <button
                onClick={() => onSeek(contact.startMs)}
                className="inline-flex items-center gap-2 min-h-[32px] px-2.5 rounded-lg border border-line text-xs text-body hover:text-ink"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-ball" />
                Contact
                <span className="num text-mute text-[13px]">@{(contact.startMs / 1000).toFixed(2)}s</span>
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
};

export default PhaseTimeline;
