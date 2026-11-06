import React from 'react';
import {
  RadarChart as RechartsRadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import { Target } from 'lucide-react';

interface RadarChartProps {
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
  { key: 'head_position', label: 'Head' },
  { key: 'front_elbow', label: 'Elbow' },
  { key: 'bat_swing_path', label: 'Swing' },
  { key: 'timing', label: 'Timing' },
  { key: 'follow_through', label: 'Finish' },
  { key: 'balance', label: 'Balance' },
  { key: 'footwork', label: 'Stride' },
  { key: 'backlift', label: 'Backlift' },
];

const IDEAL = 9.0;

function getSemanticColor(val: number) {
  if (val >= 8.0) return '#10B981';
  if (val >= 5.0) return '#F59E0B';
  return '#EF4444';
}

export const RadarChart: React.FC<RadarChartProps> = ({ metrics }) => {
  const data = DIMS.map((d) => ({
    axis: d.label.replace('_', ' '),
    value: metrics[d.key] ?? IDEAL,
  }));

  const actualVals = data.map((d) => d.value);
  const avgScore = actualVals.reduce((a, b) => a + b, 0) / actualVals.length;
  const avgColor = getSemanticColor(avgScore);

  const weakest = DIMS.reduce((prev, curr) => {
    const pv = metrics[prev.key] ?? IDEAL;
    const cv = metrics[curr.key] ?? IDEAL;
    return cv < pv ? curr : prev;
  }, DIMS[0]);
  const weakestVal = metrics[weakest.key] ?? IDEAL;

  return (
    <div className="cv-card p-5 flex flex-col h-full fade-in">
      <div className="cv-section-head">
        <div className="flex items-center gap-2.5">
          <div className="cv-icon-wrap">
            <Target className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Biomechanical Radar</h3>
            <p className="text-[11px] text-slate-400">Vs. ICC Pro Benchmark (9.0)</p>
          </div>
        </div>
        <div
          className={`text-[11px] font-numeric font-bold flex items-center gap-1.5 ${
            avgColor === '#10B981'
              ? 'text-emerald-400'
              : avgColor === '#F59E0B'
                ? 'text-amber-400'
                : 'text-rose-400'
          }`}
        >
          {avgScore.toFixed(1)} / 10 avg
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center min-h-[260px]">
        <RechartsRadarChart
          width={260}
          height={260}
          data={data}
          outerRadius={105}
          margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <defs>
            <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={avgColor} stopOpacity="0.35" />
              <stop offset="100%" stopColor={avgColor} stopOpacity="0.08" />
            </linearGradient>
          </defs>

          <PolarGrid gridType="circle" stroke="rgba(255,255,255,0.06)" />
          <PolarGrid gridType="polygon" stroke="rgba(255,255,255,0.04)" />

          {/* Ideal benchmark — dashed overlay */}
          <Radar
            name="Pro"
            stroke="rgba(56,189,248,0.45)"
            strokeDasharray="4 3"
            strokeWidth="1.5"
            fill="rgba(56,189,248,0.04)"
          />

          {/* Batter profile */}
          <Radar
            dataKey="value"
            stroke={avgColor}
            strokeWidth="2.5"
            fill="url(#gradActual)"
          />

          <PolarAngleAxis
            dataKey="axis"
            tick={{ fontSize: 9, fill: '#64748B', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}
            stroke="transparent"
            axisLine={false}
            tickLine={false}
          />
          <PolarRadiusAxis
            domain={[0, 10]}
            tick={{ fontSize: 8, fill: '#475569', fontFamily: 'JetBrains Mono, monospace' }}
            stroke="transparent"
            axisLine={false}
            tickLine={false}
          />
        </RechartsRadarChart>
      </div>

      {/* Footer: average + weakest dimension callout */}
      <div className="mt-3 pt-3 border-t border-white/6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-[11px] font-numeric">
          <span className={`w-2 h-2 rounded-full`} style={{ backgroundColor: avgColor }} />
          <span className="font-bold">{avgScore.toFixed(1)} / 10</span>
          <span className="text-slate-400">radar average</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-numeric text-slate-500">
          <span className="w-1 h-1 rounded-full bg-rose-500" />
          <span>Weakest: {weakest.label} ({weakestVal.toFixed(1)})</span>
        </div>
      </div>
    </div>
  );
};
