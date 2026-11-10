import React from 'react';
import { MetricTileModel } from '../types/cricket';
import { DonutRing } from './DonutRing';
import { StatusBadge } from './StatusBadge';

interface MetricTileProps {
  tile: MetricTileModel;
}

/**
 * MetricTile — flat vivid gradient tile with a central donut ring,
 * big value inside, name + detail at bottom, small status badge,
 * confidence label. Not-detected tiles are dark grey with dashed ring.
 */
export const MetricTile: React.FC<MetricTileProps> = ({ tile }) => {
  const notDetected = tile.status === 'not_detected';
  const fillClass = `tile-${tile.accent}-fill`;

  return (
    <article className="tile fade-in" role="region" aria-label={`${tile.name}: ${tile.value ?? 'not detected'}`}>
      <div className={`tile-fill ${fillClass}`} />
      <div className="relative z-10 p-5 h-full flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-white tracking-tighter uppercase">{tile.name}</h3>
          <StatusBadge status={tile.status} label={tile.badge} className="flex-shrink-0" />
        </div>

        {/* Donut ring + value */}
        <div className="relative flex-1 flex items-center justify-center mb-3">
          <DonutRing
            score={notDetected || tile.value == null ? null : Number(tile.value.replace(/[^\d.]/g, '')) || null}
            size={88}
            accent={tile.accent}
          />
          {notDetected ? (
            <span className="absolute text-[10px] font-bold text-white/90">—</span>
          ) : (
            <span className="absolute text-xl font-bold text-white font-numeric leading-none">
              {tile.value}
            </span>
          )}
        </div>

        {/* Detail line */}
        <p className="text-[12px] text-white/90 leading-relaxed mb-3 flex-1">
          {notDetected ? (tile.reason ?? 'Metric not available for this clip.') : tile.explanation}
        </p>

        {/* Confidence label */}
        <div className="flex items-center gap-1 text-[11px] text-white/60 font-numeric">
          <span className="uppercase tracking-wide font-semibold">Confidence</span>
          <span className="text-white/40 font-medium">{tile.confidence}</span>
        </div>
      </div>
    </article>
  );
};

export default MetricTile;
