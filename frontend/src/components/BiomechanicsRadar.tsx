import React from 'react';
import { Target, Activity } from 'lucide-react';

interface BiomechanicsRadarProps {
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

export const BiomechanicsRadar: React.FC<BiomechanicsRadarProps> = ({ metrics }) => {
  const radarDimensions = [
    { key: 'head_position', label: 'Head Pos' },
    { key: 'front_elbow', label: 'High Elbow' },
    { key: 'bat_swing_path', label: 'Swing Line' },
    { key: 'timing', label: 'Timing' },
    { key: 'follow_through', label: 'Finish' },
    { key: 'balance', label: 'Balance' },
    { key: 'footwork', label: 'Stride' },
    { key: 'backlift', label: 'Backlift' },
  ];

  const size = 260;
  const center = size / 2;
  const radius = center - 36;
  const numAxes = radarDimensions.length;

  const getCoordinates = (value: number, index: number) => {
    const angle = (Math.PI * 2 / numAxes) * index - Math.PI / 2;
    const r = (value / 10) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  // Ideal benchmark polygon (all 9.0)
  const idealPoints = radarDimensions
    .map((_, i) => {
      const { x, y } = getCoordinates(9.0, i);
      return `${x},${y}`;
    })
    .join(' ');

  // Actual batsman polygon
  const actualPoints = radarDimensions
    .map((dim, i) => {
      const val = metrics[dim.key] ?? 7.0;
      const { x, y } = getCoordinates(val, i);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="pro-card rounded-2xl p-5 border border-slate-700/60 shadow-xl relative overflow-hidden">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
            <Target className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">Biomechanical Radar</h3>
            <p className="text-[10px] text-slate-400">Current Shot vs. ICC Pro Benchmark</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-semibold">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Batter
          </span>
          <span className="flex items-center gap-1.5 text-sky-400/80">
            <span className="w-2 h-2 rounded-full border border-sky-400/80" />
            Pro (9.0)
          </span>
        </div>
      </div>

      <div className="flex items-center justify-center py-1">
        <svg width={size} height={size} className="overflow-visible">
          {/* Concentric Grid Rings */}
          {[2.5, 5.0, 7.5, 10.0].map((level) => (
            <circle
              key={level}
              cx={center}
              cy={center}
              r={(level / 10) * radius}
              fill="none"
              stroke="#1E293B"
              strokeWidth="1"
              strokeDasharray={level < 10 ? '3 3' : undefined}
            />
          ))}

          {/* Axis Spokes */}
          {radarDimensions.map((_, i) => {
            const { x, y } = getCoordinates(10.0, i);
            return (
              <line
                key={i}
                x1={center}
                y1={center}
                x2={x}
                y2={y}
                stroke="#1E293B"
                strokeWidth="1"
              />
            );
          })}

          {/* Pro Benchmark Ideal Polygon */}
          <polygon
            points={idealPoints}
            fill="rgba(56, 189, 248, 0.06)"
            stroke="rgba(56, 189, 248, 0.4)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />

          {/* Current Batsman Polygon */}
          <polygon
            points={actualPoints}
            fill="rgba(16, 185, 129, 0.28)"
            stroke="#10B981"
            strokeWidth="2.5"
          />

          {/* Points & Labels */}
          {radarDimensions.map((dim, i) => {
            const val = metrics[dim.key] ?? 7.0;
            const pt = getCoordinates(val, i);
            const labelCoord = getCoordinates(11.8, i);

            return (
              <g key={dim.key}>
                {/* Vertex circle */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r="3.5"
                  fill="#10B981"
                  stroke="#04070E"
                  strokeWidth="1.5"
                />
                {/* Axis Label */}
                <text
                  x={labelCoord.x}
                  y={labelCoord.y + 3}
                  textAnchor="middle"
                  className="fill-slate-400 font-mono text-[9px] font-semibold"
                >
                  {dim.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
