import React from 'react';
import { FlawItem } from '../types/cricket';
import { AlertCircle, AlertTriangle, CheckCircle2, Target } from 'lucide-react';

interface FlawListProps {
  flaws: FlawItem[];
  onSelectFlaw?: (flaw: FlawItem) => void;
  selectedJoint?: string | null;
}

export const FlawList: React.FC<FlawListProps> = ({ flaws, onSelectFlaw, selectedJoint }) => {
  if (!flaws || flaws.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-6 border border-emerald-500/20 bg-emerald-500/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Clean Stroke Execution</h3>
            <p className="text-xs text-slate-400">No biomechanical flaws detected! Head was still, front elbow high, and balance steady.</p>
          </div>
        </div>
      </div>
    );
  }

  const getSeverityBadge = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'high':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            High
          </span>
        );
      case 'medium':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Medium
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 border border-blue-500/40 text-blue-400 flex items-center gap-1">
            Low
          </span>
        );
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-6 border border-slate-700/60 shadow-xl">
      <div className="flex items-center justify-between pb-3 border-b border-slate-700/50 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center">
            <AlertCircle className="w-4 h-4" />
          </div>
          <h3 className="text-base font-bold text-white">Detected Stroke Flaws</h3>
        </div>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-slate-400">
          {flaws.length} {flaws.length === 1 ? 'flaw' : 'flaws'}
        </span>
      </div>

      <div className="space-y-3">
        {flaws.map((flaw, idx) => {
          const isSelected = selectedJoint && flaw.affected_joint === selectedJoint;
          return (
            <div
              key={idx}
              onClick={() => onSelectFlaw?.(flaw)}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-rose-500/10 border-rose-500/50 shadow-glow-red'
                  : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                    {flaw.name}
                  </h4>
                  <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                    <span>Frame: <strong className="text-slate-200">#{flaw.frame}</strong></span>
                    {flaw.affected_joint && (
                      <span className="flex items-center gap-1 text-emerald-400/80">
                        <Target className="w-3 h-3" />
                        Joint: {flaw.affected_joint.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                </div>
                {getSeverityBadge(flaw.severity)}
              </div>

              {/* Measured vs Ideal Box */}
              <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-800/60 text-xs">
                <div className="bg-slate-950/50 rounded-lg p-2 border border-slate-800">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">Measured Value</div>
                  <div className="font-mono font-bold text-rose-400 mt-0.5">
                    {flaw.measured}
                  </div>
                </div>
                <div className="bg-slate-950/50 rounded-lg p-2 border border-slate-800">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">Ideal Range</div>
                  <div className="font-mono font-bold text-emerald-400 mt-0.5">
                    {flaw.ideal}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
