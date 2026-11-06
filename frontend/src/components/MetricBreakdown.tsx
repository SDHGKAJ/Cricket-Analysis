import React from 'react';
import { SlidersHorizontal } from 'lucide-react';

interface MetricBreakdownProps {
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

const METRIC_SPECS = [
  { key: 'head_position', label: 'Head over front knee', focus: 'Chin tucked; stillness at impact', ideal: 8.5 },
  { key: 'front_elbow', label: 'Front elbow elevation', focus: 'High top-hand angle (85°–115°)', ideal: 8.5 },
  { key: 'bat_swing_path', label: 'Bat swing arc & line', focus: 'Down from second slip through extra cover', ideal: 8.5 },
  { key: 'footwork', label: 'Stride to pitch of ball', focus: 'Positive stride reaching line and bounce', ideal: 8.0 },
  { key: 'balance', label: 'Weight transfer & COM', focus: '70–80% weight onto flexed front foot', ideal: 8.0 },
  { key: 'timing', label: 'Sweet-spot contact timing', focus: 'Peak bat acceleration at ball arrival', ideal: 8.5 },
  { key: 'backlift', label: 'Backlift height & angle', focus: 'Apex pointing toward keeper/slips', ideal: 8.0 },
  { key: 'follow_through', label: 'Follow-through completion', focus: 'High finishing posture held without wobble', ideal: 7.5 },
];

function getColors(val: number) {
  if (val >= 8.0) return { bar: 'bg-emerald-400', text: 'text-emerald-400', badge: 'cv-badge-green' };
  if (val >= 5.0) return { bar: 'bg-amber-400', text: 'text-amber-400', badge: 'cv-badge-amber' };
  return { bar: 'bg-rose-500', text: 'text-rose-400', badge: 'cv-badge-red' };
}

export const MetricBreakdown: React.FC<MetricBreakdownProps> = ({ metrics }) => {
  return (
    <div className="cv-card p-5 space-y-4 fade-in fade-in-delay-1">
      <div className="cv-section-head">
        <div className="flex items-center gap-2.5">
          <div className="cv-icon-wrap">
            <SlidersHorizontal className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Metric breakdown</h3>
            <p className="text-[11px] text-slate-400">8 kinematic dimensions vs. ICC pro benchmarks</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-[10px] font-semibold">
          <span className="flex items-center gap-1 text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Optimal ≥ 8.0</span>
          <span className="flex items-center gap-1 text-amber-400"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Developing 5–7.9</span>
          <span className="flex items-center gap-1 text-rose-400"><span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Critical &lt; 5.0</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {METRIC_SPECS.map((spec) => {
          const score = metrics[spec.key] ?? 7.0;
          const colors = getColors(score);
          const idealPct = (spec.ideal / 10) * 100;
          const scorePct = Math.min(100, Math.max(3, score * 10));
          const delta = score - spec.ideal;

          return (
            <div key={spec.key} className="bg-slate-900/50 rounded-xl p-3.5 border border-white/5 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-slate-200">{spec.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{spec.focus}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-base font-black font-numeric ${colors.text}`}>
                    {score.toFixed(1)}<span className="text-[11px] font-normal text-slate-500"> /10</span>
                  </div>
                  <span className={`cv-badge mt-1 inline-block ${delta >= 0 ? 'cv-badge-green' : 'cv-badge-amber'}`}>
                    {delta >= 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)} pro
                  </span>
                </div>
              </div>

              <div className="relative h-2">
                <div className="w-full h-full bg-slate-800 rounded-full overflow-hidden border border-white/5" />
                <div
                  className={`h-full rounded-full bar-animated ${colors.bar}`}
                  style={{ width: `${scorePct}%` }}
                />
                {/* Ideal benchmark tick */}
                <div
                  className="absolute top-0 h-2 w-0.5 bg-white/70 rounded-full pointer-events-none"
                  style={{ left: `${idealPct}%` }}
                  title={`Benchmark: ${spec.ideal.toFixed(1)}`}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] font-numeric text-slate-500">
                <span>0.0</span>
                <span className="text-slate-400">Target {spec.ideal.toFixed(1)}</span>
                <span>10.0</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
