import React from 'react';
import { ShotAnalysis } from '../types/cricket';
import { Award, Zap, ChevronRight, Activity } from 'lucide-react';

interface ScoreCardProps {
  analysis: ShotAnalysis | null;
}

export const ScoreCard: React.FC<ScoreCardProps> = ({ analysis }) => {
  if (!analysis) {
    return (
      <div className="glass-panel rounded-2xl p-6 text-center text-slate-400">
        <Activity className="w-10 h-10 mx-auto mb-3 opacity-40 text-emerald-400" />
        <p className="text-sm">Perform a stroke or upload a clip to view score card &amp; metric breakdown.</p>
      </div>
    );
  }

  const { overall_score, timing_score, metrics, shot_type } = analysis;

  const getScoreColor = (score: number) => {
    if (score >= 8.5) return 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10';
    if (score >= 7.0) return 'text-amber-400 border-amber-500/40 bg-amber-500/10';
    return 'text-rose-400 border-rose-500/40 bg-rose-500/10';
  };

  const getBarColor = (score: number) => {
    if (score >= 8.5) return 'bg-emerald-500';
    if (score >= 7.0) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const metricLabels: Record<string, string> = {
    head_position: 'Head Over Front Knee',
    front_elbow: 'Front Elbow Angle & Height',
    footwork: 'Footwork & Stride to Pitch',
    balance: 'Balance & Weight Transfer',
    timing: 'Timing (Contact vs Peak Speed)',
    bat_swing_path: 'Bat Swing Arc & Line',
    backlift: 'Backlift Height & Angle',
    follow_through: 'Follow-Through High Finish',
  };

  return (
    <div className="glass-panel rounded-2xl p-6 border border-slate-700/60 shadow-xl relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute -top-12 -right-12 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-700/50 mb-5">
        <div>
          <span className="text-xs uppercase tracking-wider text-emerald-400 font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Analyzed Shot
          </span>
          <h2 className="text-2xl font-bold text-white capitalize mt-0.5">
            {shot_type.replace('_', ' ')}
          </h2>
        </div>

        {/* Big Overall Score Badge */}
        <div className={`flex flex-col items-center justify-center w-20 h-20 rounded-2xl border-2 ${getScoreColor(overall_score)} shadow-lg`}>
          <span className="text-3xl font-extrabold tracking-tight leading-none">{overall_score.toFixed(1)}</span>
          <span className="text-[11px] font-medium opacity-80 mt-0.5">/ 10</span>
        </div>
      </div>

      {/* Timing Sub-score Pill */}
      <div className="bg-slate-900/60 rounded-xl p-3.5 mb-5 border border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Timing Sub-Score</div>
            <div className="text-sm font-semibold text-slate-200">Bat Speed at Ball Contact</div>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xl font-bold text-amber-400">{timing_score.toFixed(1)}</span>
          <span className="text-xs text-slate-400"> /10</span>
        </div>
      </div>

      {/* Metrics Breakdown Grid */}
      <div>
        <h3 className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-3 flex items-center justify-between">
          <span>Biomechanics Breakdown</span>
          <span className="text-[10px] lowercase text-slate-500">ideal benchmark &gt; 8.0</span>
        </h3>

        <div className="space-y-3">
          {Object.entries(metrics).map(([key, val]) => {
            const scoreVal = val ?? 7.0;
            const label = metricLabels[key] || key.replace('_', ' ');
            return (
              <div key={key} className="group">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300 font-medium">{label}</span>
                  <span className={`font-mono font-semibold ${scoreVal >= 8 ? 'text-emerald-400' : scoreVal >= 6.5 ? 'text-amber-400' : 'text-rose-400'}`}>
                    {scoreVal.toFixed(1)}/10
                  </span>
                </div>
                <div className="w-full bg-slate-900/80 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${getBarColor(scoreVal)}`}
                    style={{ width: `${Math.min(100, Math.max(8, scoreVal * 10))}%` }}
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
