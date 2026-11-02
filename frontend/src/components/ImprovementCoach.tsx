import React from 'react';
import { TipItem } from '../types/cricket';
import { Compass, Lightbulb, Dumbbell, ShieldAlert } from 'lucide-react';

interface ImprovementCoachProps {
  tips: TipItem[];
}

export const ImprovementCoach: React.FC<ImprovementCoachProps> = ({ tips }) => {
  if (!tips || tips.length === 0) {
    return null;
  }

  return (
    <div className="glass-panel rounded-2xl p-6 border border-emerald-500/30 shadow-xl relative overflow-hidden">
      {/* Header with Coach Badge */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-700/50 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Batting Masterclass &amp; Drills</h3>
            <p className="text-xs text-slate-400">Biomechanics feedback tailored by expert coaches</p>
          </div>
        </div>
        <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
          Coach Insights
        </span>
      </div>

      <div className="space-y-4">
        {tips.map((tip, idx) => (
          <div
            key={idx}
            className="bg-slate-900/70 rounded-xl p-4 border border-slate-800 space-y-3"
          >
            {/* Flaw Title */}
            <div className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5 text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Addressing: {tip.flaw}
            </div>

            {/* Why it hurts */}
            {tip.why_it_hurts && (
              <div className="flex items-start gap-2.5 text-xs text-rose-300/90 bg-rose-500/5 p-2.5 rounded-lg border border-rose-500/10">
                <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <div>
                  <strong className="text-rose-300 block font-semibold mb-0.5">Why this hurts your stroke:</strong>
                  {tip.why_it_hurts}
                </div>
              </div>
            )}

            {/* One-Line Fix */}
            <div className="flex items-start gap-2.5 text-xs text-emerald-300 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
              <Lightbulb className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              <div>
                <strong className="text-emerald-300 block font-semibold mb-0.5">The Coach Cue (Quick Fix):</strong>
                "{tip.fix}"
              </div>
            </div>

            {/* Recommended Drill */}
            <div className="flex items-start gap-2.5 text-xs text-blue-300 bg-blue-500/10 p-2.5 rounded-lg border border-blue-500/20">
              <Dumbbell className="w-4 h-4 shrink-0 text-blue-400 mt-0.5" />
              <div>
                <strong className="text-blue-300 block font-semibold mb-0.5">Prescribed Practice Drill:</strong>
                {tip.drill}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
