import React, { useState } from 'react';
import { TipItem } from '../types/cricket';
import { Dumbbell, Clock, Repeat, Check, Plus, Lightbulb, ShieldAlert, BookmarkCheck, Play } from 'lucide-react';

interface DrillCardProps {
  tips: TipItem[];
  highlightedDrillFlaw?: string | null;
}

const DRILL_META: Record<string, { duration: string; reps: string; icon: React.ReactNode; color: string }> = {
  elbow:   { duration: '15 min', reps: '3 × 15 drives',  icon: <Play className="w-5 h-5 text-emerald-400" />, color: 'text-emerald-400' },
  head:    { duration: '20 min', reps: '4 × 12 reps',    icon: <ShieldAlert className="w-5 h-5 text-amber-400" />, color: 'text-amber-400' },
  line:    { duration: '15 min', reps: '3 × 20 reps',    icon: <Dumbbell className="w-5 h-5 text-sky-400" />, color: 'text-sky-400' },
  stride:  { duration: '12 min', reps: '3 × 15 steps',   icon: <Dumbbell className="w-5 h-5 text-emerald-400" />, color: 'text-emerald-400' },
  balance: { duration: '10 min', reps: '3 × 10 holds',   icon: <ShieldAlert className="w-5 h-5 text-amber-400" />, color: 'text-amber-400' },
};

function getMeta(flaw: string) {
  const n = flaw.toLowerCase();
  if (n.includes('elbow')) return DRILL_META.elbow;
  if (n.includes('head')) return DRILL_META.head;
  if (n.includes('line') || n.includes('across')) return DRILL_META.line;
  if (n.includes('foot') || n.includes('stride')) return DRILL_META.stride;
  return DRILL_META.balance;
}

export const DrillCard: React.FC<DrillCardProps> = ({ tips, highlightedDrillFlaw }) => {
  const [added, setAdded] = useState<Record<string, boolean>>({});

  if (!tips?.length) {
    return (
      <div className="cv-card p-6 text-center fade-in">
        <Dumbbell className="w-10 h-10 mx-auto mb-3 opacity-25 text-emerald-400" />
        <h4 className="text-sm font-bold text-white">No correction drills required</h4>
        <p className="text-xs text-slate-400 mt-1">Technique is clean. Maintain with shadow drives.</p>
      </div>
    );
  }

  return (
    <div className="cv-card p-0 flex flex-col h-full fade-in">
      <div className="cv-section-head">
        <div className="flex items-center gap-2.5">
          <div className="cv-icon-wrap">
            <Dumbbell className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Linked practice drills</h3>
            <p className="text-[11px] text-slate-400">Targeted muscle-memory prescriptions</p>
          </div>
        </div>
        <span className="cv-badge cv-badge-outline">{tips.length} prescribed</span>
      </div>

      <div className="p-4 space-y-3">
        {tips.map((tip, idx) => {
          const meta = getMeta(tip.flaw);
          const isAdded = !!added[`d${idx}`];
          const isTargeted = highlightedDrillFlaw && tip.flaw.toLowerCase().includes(highlightedDrillFlaw.toLowerCase());

          return (
            <div
              key={idx}
              className={`rounded-xl border p-3.5 transition-all duration-250 space-y-3 ${
                isTargeted
                  ? 'bg-emerald-500/10 border-emerald-500/40 shadow-lg'
                  : 'bg-slate-950/50 border-white/6 hover:border-white/10'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-11 h-11 rounded-xl bg-slate-800 border border-white/8 flex items-center justify-center shrink-0`}>
                    {meta.icon}
                  </div>
                  <div className="min-w-0">
                    <div className={`cv-label ${meta.color} mb-0.5`}>Targets: {tip.flaw}</div>
                    <h4 className="text-sm font-bold text-white leading-tight truncate">
                      {tip.drill.split(':')[0] || 'Targeted batting drill'}
                    </h4>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0 text-[10px] font-numeric text-slate-400">
                  <span className="bg-slate-900 px-2 py-0.5 rounded border border-white/5 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-emerald-400" /> {meta.duration}
                  </span>
                  <span className="bg-slate-900 px-2 py-0.5 rounded border border-white/5 flex items-center gap-1">
                    <Repeat className="w-3 h-3 text-sky-400" /> {meta.reps}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2 bg-emerald-500/8 border border-emerald-500/15 p-2.5 rounded-xl text-xs text-emerald-300">
                <Lightbulb className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-emerald-300 font-bold block mb-0.5">Coach cue</strong>
                  "{tip.fix}"
                </div>
              </div>

              {tip.why_it_hurts && (
                <div className="flex items-start gap-2 bg-rose-500/6 border border-rose-500/10 p-2.5 rounded-xl text-xs text-rose-300/90">
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <p className="leading-tight">{tip.why_it_hurts}</p>
                </div>
              )}

              <p className="text-xs text-slate-300 leading-relaxed">
                {tip.drill.includes(':') ? tip.drill.split(':')[1].trim() : tip.drill}
              </p>

              <div className="flex items-center justify-between border-t border-white/6 pt-2.5">
                <span className="text-[11px] text-slate-500 font-numeric">
                  {isAdded ? '✓ Added to practice plan' : 'Recommended before next match'}
                </span>
                <button
                  onClick={() => setAdded((p) => ({ ...p, [`d${idx}`]: !p[`d${idx}`] }))}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 ${
                    isAdded
                      ? 'bg-emerald-500 text-slate-950 shadow-lg'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/8'
                  }`}
                >
                  {isAdded ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  {isAdded ? 'In plan' : 'Add to plan'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
