import React from 'react';
import { Target } from 'lucide-react';

interface RadarChartComponentProps {
  metrics: {
    timing?: number;
    head_position?: number;
    front_elbow?: number;
    footwork?: number;
    balance?: number;
    bat_swing_path?: number;
    backlift?: number;
    follow_through?: number;
    [key: string]: number | undefined;
  };
}

const DIMS = [
  { key: 'head_position',  label: 'Head' },
  { key: 'front_elbow',    label: 'Elbow' },
  { key: 'bat_swing_path', label: 'Swing' },
  { key: 'timing',         label: 'Timing' },
  { key: 'follow_through', label: 'Finish' },
  { key: 'balance',        label: 'Balance' },
  { key: 'footwork',       label: 'Stride' },
  { key: 'backlift',       label: 'Backlift' },
];

function polarPoint(value: number, index: number, total: number, radius: number, cx: number, cy: number) {
  const angle = (Math.PI * 2 / total) * index - Math.PI / 2;
  const r = (value / 10) * radius;
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

function toPolyPoints(values: number[], radius: number, cx: number, cy: number) {
  return values
    .map((v, i) => {
      const pt = polarPoint(v, i, values.length, radius, cx, cy);
      return `${pt.x},${pt.y}`;
    })
    .join(' ');
}

function getSemanticColor(val: number) {
  if (val >= 8.0) return '#10B981';
  if (val >= 5.0) return '#F59E0B';
  return '#EF4444';
}

export const RadarChartComponent: React.FC<RadarChartComponentProps> = ({ metrics }) => {
  const SIZE = 280;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const RADIUS = CX - 48;
  const n = DIMS.length;

  const actualVals = DIMS.map(d => metrics[d.key] ?? 7.0);
  const idealVals  = DIMS.map(() => 9.0);

  const actualPoints = toPolyPoints(actualVals, RADIUS, CX, CY);
  const idealPoints  = toPolyPoints(idealVals, RADIUS, CX, CY);

  const avgScore = actualVals.reduce((a, b) => a + b, 0) / actualVals.length;
  const avgColor = getSemanticColor(avgScore);

  return (
    <div className="cv-card p-5 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="cv-icon-wrap">
            <Target className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Biomechanical Radar</h3>
            <p className="text-[11px] text-slate-400">vs. ICC Pro Benchmark</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-semibold">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400" /> Batter
          </span>
          <span className="flex items-center gap-1.5 text-sky-400/80">
            <span className="w-2 h-2 rounded-full border border-sky-400/80" /> Pro (9.0)
          </span>
        </div>
      </div>

      {/* SVG Radar */}
      <div className="flex items-center justify-center flex-1">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="overflow-visible"
          role="img"
          aria-label="Biomechanical radar chart"
        >
          {/* Rings */}
          {[2.5, 5.0, 7.5, 10.0].map(level => {
            const r = (level / 10) * RADIUS;
            return (
              <circle
                key={level}
                cx={CX} cy={CY} r={r}
                fill="none"
                stroke={level === 10 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)'}
                strokeWidth="1"
                strokeDasharray={level < 10 ? '3 3' : undefined}
              />
            );
          })}

          {/* Spokes */}
          {DIMS.map((_, i) => {
            const outer = polarPoint(10, i, n, RADIUS, CX, CY);
            return (
              <line key={i} x1={CX} y1={CY} x2={outer.x} y2={outer.y}
                stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            );
          })}

          {/* Pro benchmark polygon */}
          <polygon
            points={idealPoints}
            fill="rgba(56,189,248,0.05)"
            stroke="rgba(56,189,248,0.35)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />

          {/* Batter polygon */}
          <polygon
            points={actualPoints}
            fill={`${avgColor}22`}
            stroke={avgColor}
            strokeWidth="2.5"
          />

          {/* Vertex dots + labels */}
          {DIMS.map((dim, i) => {
            const val = metrics[dim.key] ?? 7.0;
            const pt = polarPoint(val, i, n, RADIUS, CX, CY);
            const lblPt = polarPoint(13.2, i, n, RADIUS, CX, CY);
            const dotColor = getSemanticColor(val);

            return (
              <g key={dim.key}>
                {/* Glow halo */}
                <circle cx={pt.x} cy={pt.y} r="6" fill={dotColor} opacity="0.18" />
                {/* Dot */}
                <circle cx={pt.x} cy={pt.y} r="3.5" fill={dotColor} stroke="#070C16" strokeWidth="1.5" />
                {/* Label */}
                <text
                  x={lblPt.x} y={lblPt.y + 3.5}
                  textAnchor="middle"
                  fill="#64748B"
                  fontSize="9.5"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="600"
                >
                  {dim.label}
                </text>
                {/* Value text near vertex */}
                <text
                  x={pt.x} y={pt.y - 7}
                  textAnchor="middle"
                  fill={dotColor}
                  fontSize="8"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="700"
                >
                  {val.toFixed(1)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Average footer */}
      <div className="mt-2 pt-3 border-t border-white/5 flex items-center justify-between text-xs font-numeric">
        <span className="text-slate-400">Radar Average</span>
        <span className="font-bold" style={{ color: avgColor }}>{avgScore.toFixed(1)} / 10</span>
      </div>
    </div>
  );
};
