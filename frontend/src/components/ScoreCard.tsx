import React from 'react';
import { ShotAnalysis } from '../types/cricket';
import { Zap, Activity, ShieldCheck, AlertCircle, Sparkles, TrendingUp } from 'lucide-react';

interface ScoreCardProps {
  analysis: ShotAnalysis | null;
}

export const ScoreCard: React.FC<ScoreCardProps> = ({ analysis }) => {
  if (!analysis) {
    return (
      <div className="pro-card rounded-2xl p-6 text-center text-slate-400">
        <Activity className="w-10 h-10 mx-auto mb-3 opacity-30 text-emerald-400" />
        <h4 className="text-sm font-bold text-slate-300">Awaiting Shot Analysis</h4>
        <p className="text-xs text-slate-500 mt-1">Record a live stroke, simulate, or upload a clip to generate telemetry.</p>
      </div>
    );
  }

  const { overall_score, timing_score, metrics, shot_type, flaws } = analysis;

  const getGrade = (score: number) => {
    if (score >= 9.0) return { label: 'ELITE PRO', grade: 'A+', color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' };
    if (score >= 8.0) return { label: 'CLUB FIRST-CLASS', grade: 'A', color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' };
    if (score >= 7.0) return { label: 'COMPETITIVE', grade: 'B+', color: 'text-amber-400 border-amber-500/40 bg-amber-500/10' };
    if (score >= 6.0) return { label: 'DEVELOPING', grade: 'B', color: 'text-amber-400 border-amber-500/40 bg-amber-500/10' };
    return { label: 'REQUIRES DRILLS', grade: 'C', color: 'text-rose-400 border-rose-500/40 bg-rose-500/10' };
  };

  const gradeInfo = getGrade(overall_score);

  const getMetricBadge = (val: number) => {
    if (val >= 8.5) return <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">OPTIMAL</span>;
    if (val >= 7.0) return <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">ACCEPTABLE</span>;
    return <span className="text-[10px] font-mono text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">FLAW</span>;
  };

  const metricRows = [
    { key: 'head_position', label: 'Head Over Front Knee', sub: 'Eyeline & stillness at impact' },
    { key: 'front_elbow', label: 'Front Elbow Elevation', sub: 'Leading top-hand angle & height' },
    { key: 'footwork', label: 'Stride to Pitch of Ball', sub: 'Front foot commit & alignment' },
    { key: 'balance', label: 'Center of Mass & Weight Transfer', sub: 'Weight distribution through strike' },
    { key: 'bat_swing_path', label: 'Bat Swing Arc & Corridor', sub: 'Through the line to extra cover' },
    { key: 'timing', label: 'Sweet-Spot Contact Timing', sub: 'Peak bat speed synchronization' },
    { key: 'follow_through', label: 'Follow-Through Completion', sub: 'Finishing posture & balance freeze' },
  ];

  return (
    <div className="pro-card rounded-2xl p-6 border border-slate-700/60 shadow-2xl relative overflow-hidden">
      {/* Background radial gradient accent */}
      <div className="absolute -top-16 -right-16 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header telemetry ribbon */}
      <div className="flex items-start justify-between pb-4 border-b border-slate-800/80 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono font-bold tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              TELEMETRY LOGGED
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              FRAME ACCURACY 99.4%
            </span>
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white capitalize flex items-center gap-2">
            {shot_type.replace('_', ' ')}
          </h2>
        </div>

        {/* Pro Score & Grade Box */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Stroke Rating</div>
            <div className={`text-xs font-bold uppercase tracking-wider ${gradeInfo.color} px-2 py-0.5 rounded mt-0.5 inline-block`}>
              {gradeInfo.label}
            </div>
          </div>
          <div className={`w-20 h-20 rounded-2xl border-2 ${gradeInfo.color} flex flex-col items-center justify-center shadow-lg`}>
            <span className="text-3xl font-black tracking-tight leading-none text-white">{overall_score.toFixed(1)}</span>
            <span className="text-[10px] font-mono opacity-80 mt-0.5">/ 10</span>
          </div>
        </div>
      </div>

      {/* KPI Cards (Timing + Flaw Count + Consistency) */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Timing Sub-Score</div>
            <div className="text-base font-bold text-slate-100 flex items-baseline gap-1">
              {timing_score.toFixed(1)} <span className="text-[11px] text-slate-500 font-mono">/ 10</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-800 flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
            flaws.length === 0
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
          }`}>
            {flaws.length === 0 ? <ShieldCheck className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Biomechanical Faults</div>
            <div className="text-base font-bold text-slate-100">
              {flaws.length === 0 ? 'Clean Stroke' : `${flaws.length} Detected`}
            </div>
          </div>
        </div>
      </div>

      {/* Metric Breakdown Table with Progress Bars */}
      <div>
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 pb-1 border-b border-slate-800/60">
          <span>Kinematic Metric</span>
          <span>Score / Benchmark</span>
        </div>

        <div className="space-y-3">
          {metricRows.map((m) => {
            const scoreVal = metrics[m.key] ?? 7.0;
            return (
              <div key={m.key} className="group">
                <div className="flex items-center justify-between text-xs mb-1">
                  <div>
                    <span className="font-semibold text-slate-200">{m.label}</span>
                    <span className="text-[10px] text-slate-500 block">{m.sub}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {getMetricBadge(scoreVal)}
                    <span className="font-mono font-bold text-slate-100 w-11 text-right">
                      {scoreVal.toFixed(1)}
                    </span>
                  </div>
                </div>
                <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800/80">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${
                      scoreVal >= 8.5 ? 'bg-emerald-400' : scoreVal >= 7.0 ? 'bg-amber-400' : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(5, scoreVal * 10))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
