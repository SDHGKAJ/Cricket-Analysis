import React, { useCallback } from 'react';
import { WaveSeries, PHASE_ORDER } from '../services/reportMapper';
import { MetricStatus } from '../types/cricket';

interface WaveChartProps {
  series: WaveSeries[];
  markers: Array<{ id: string; label: string; startMs: number; endMs?: number; kind: 'phase' | 'point' }>;
  currentTimeMs: number;
  totalDurationMs: number;
  onSeekTime: (ms: number) => void;
  onMarkerClick?: (id: string) => void;
  tooltip?: { phase: string; timeMs: number; speed: number } | null;
}

interface WavePoint {
  t: number;
  speed: number;
}

/**
 * WaveChart — smooth layered area chart (translucent teal, purple, red waves)
 * showing wrist speed over the shot timeline. Phase bands across the bottom.
 * Dot marker on current time; clicking a phase jumps the video.
 */
export const WaveChart: React.FC<WaveChartProps> = ({
  series,
  markers,
  currentTimeMs,
  totalDurationMs,
  onSeekTime,
  onMarkerClick,
  tooltip,
}) => {
  const safeDur = Math.max(1, totalDurationMs);
  const width = 640;
  const height = 160;
  const pad = 40;
  const plotW = width - pad * 2;
  const plotH = height - pad * 2;

  const x = (t: number) => pad + (t / safeDur) * plotW;
  const yMax = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.speed)));
  const y = (v: number) => pad + plotH - (v / yMax) * plotH;

  const areaPath = (points: WavePoint[]) => {
    if (points.length < 2) return '';
    return `M${x(points[0].t)},${y(points[0].speed)}` +
      points.slice(1).map((p) => `L${x(p.t)},${y(p.speed)}`).join(' ') +
      `L${x(points[points.length - 1].t)},${pad + plotH}L${pad},${pad + plotH}Z`;
  };

  const currentMarker = markers.find(
    (m) => currentTimeMs >= m.startMs && (m.endMs == null ? true : currentTimeMs <= m.endMs)
  );

  const handleMarkerClick = useCallback(
    (id: string) => {
      const m = markers.find((x) => x.id === id);
      if (m) onSeekTime(m.startMs);
    },
    [markers, onSeekTime]
  );

  const handleScrub = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSeekTime(Number(e.target.value));
    },
    [onSeekTime]
  );

  return (
    <section className="panel p-5 space-y-4 fade-in" aria-label="Shot wave chart">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold text-[#AAB0BD] uppercase tracking-wider">Wrist speed over shot</h3>
          <p className="text-[11px] text-[#6E7486] mt-0.5">
            Layered waves: teal = wrist speed · purple = bat path · red = weight shift
          </p>
        </div>
        {tooltip && (
          <div className="bg-[#3A3F4E] border border-[rgba(255,255,255,0.06)] rounded-[8px] px-3 py-2">
            <p className="text-[11px] font-bold text-[#FFFFFF]">{tooltip.phase}</p>
            <p className="text-[11px] text-[#AAB0BD]">
              {tooltip.timeMs.toFixed(0)} ms · {tooltip.speed.toFixed(1)} m/s
            </p>
          </div>
        )}
      </div>

      {/* SVG area chart */}
      <div className="relative bg-[#242833] rounded-[12px] border border-[rgba(255,255,255,0.04)] overflow-hidden h-[160px] w-full">
        <svg width={width} height={height} className="block">
          {[0.5, 1, 2, 3, 4]
            .filter((v) => v <= yMax)
            .map((v) => (
              <line
                key={v}
                x1={pad}
                y1={y(v)}
                x2={pad + plotW}
                y2={y(v)}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={1}
              />
            ))}
          {/* Layered waves */}
          {series.map((s, i) => (
            <path
              key={s.label}
              d={areaPath(s.points)}
              fill={s.color}
              fillOpacity={0.16 - i * 0.05}
              stroke={s.color}
              strokeOpacity={0.9}
              strokeWidth={2}
              strokeLinejoin="round"
              className="filter blur-sm"
            />
          ))}
          {/* Current-time dot */}
          {(() => {
            const first = series[0];
            const idx = first?.points
              ? Math.floor((currentTimeMs / safeDur) * first.points.length)
              : 0;
            const speed = first?.points?.[Math.max(0, Math.min(idx, (first.points.length ?? 1) - 1))]?.speed ?? 0;
            return (
              <circle
                cx={x(currentTimeMs)}
                cy={y(Math.max(0, Math.min(yMax, speed)))}
                r={5}
                fill="#FFFFFF"
                stroke="#2B2F3A"
                strokeWidth={2}
                className="shadow-[0_0_12px_rgba(255,255,255,0.6)]"
              />
            );
          })()}
          <line
            x1={x(currentTimeMs)}
            y1={pad}
            x2={x(currentTimeMs)}
            y2={pad + plotH}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        </svg>
      </div>

      {/* Phase bands */}
      <div className="flex gap-0.5 h-8">
        {markers.map((m) => {
          const color = PHASE_ORDER.find((p) => p.id === m.id)?.color ?? '#444A5B';
          const widthPct = m.endMs != null
            ? Math.max(4, ((m.endMs - m.startMs) / safeDur) * 100)
            : 4;
          return (
            <button
              key={m.id}
              onClick={() => onMarkerClick(m.id)}
              className="flex-1 rounded-[6px] flex flex-col items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-tighter border border-white/10 transition-all hover:border-white/30"
              style={{ backgroundColor: color + '22', color, flexBasis: `${widthPct}%` }}
              title={`${m.label} · ${m.startMs.toFixed(0)} ms`}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Scrubber */}
      <div className="relative h-3">
        <input
          type="range"
          min={0}
          max={safeDur}
          value={currentTimeMs}
          onChange={handleScrub}
          className="w-full h-2 bg-[#3A3F4E] rounded-full appearance-none cursor-pointer accent-[#1FB5D6]"
          aria-label="Playback position"
        />
      </div>
      <div className="flex justify-between text-[11px] text-[#6E7486] font-numeric">
        <span>{(currentTimeMs / 1000).toFixed(2)} s</span>
        <span>{(safeDur / 1000).toFixed(2)} s</span>
      </div>
    </section>
  );
};
