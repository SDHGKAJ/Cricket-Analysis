import React from 'react';
import { MetricStatus, MetricTileModel } from '../types/cricket';
import { StatusBadge } from './StatusBadge';

const BAR: Record<MetricStatus, string> = {
  good: 'var(--good)',
  medium: 'var(--warn)',
  bad: 'var(--bad)',
  not_detected: 'var(--line-strong)',
};

const CONF_LEVEL: Record<string, number> = { Low: 1, Medium: 2, High: 3 };

/** MetricTile — one measured metric: value, status, what it means, confidence. */
export const MetricTile: React.FC<{ tile: MetricTileModel }> = ({ tile }) => {
  const missing = tile.status === 'not_detected' || tile.value == null;
  const level = CONF_LEVEL[tile.confidence] ?? 1;

  return (
    <article
      className="card relative overflow-hidden p-4 pl-5 flex flex-col gap-2 animate-fade-in"
      aria-label={`${tile.name}: ${tile.value ?? 'not measured'}`}
    >
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: BAR[tile.status] }} aria-hidden="true" />
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-ink">
          <span className="text-mute">{tile.icon}</span>
          {tile.name}
        </h3>
        <StatusBadge status={tile.status} label={tile.badge} />
      </div>

      <div className={`num leading-none ${missing ? 'text-3xl text-mute' : 'text-[40px] text-ink'}`}>
        {missing ? '—' : tile.value}
      </div>

      <p className="text-[13px] text-body leading-snug flex-1">
        {missing ? tile.reason ?? 'Not measurable in this clip.' : tile.explanation}
      </p>

      <div className="flex items-center gap-2 text-[11px] text-mute" title={`Confidence: ${tile.confidence}`}>
        <span>Confidence</span>
        <span className="flex gap-0.5" aria-hidden="true">
          {[1, 2, 3].map((i) => (
            <span key={i} className="w-3 h-1.5 rounded-sm" style={{ background: i <= level ? 'var(--body)' : 'var(--line-strong)' }} />
          ))}
        </span>
        <span>{tile.confidence}</span>
      </div>
    </article>
  );
};

export default MetricTile;
