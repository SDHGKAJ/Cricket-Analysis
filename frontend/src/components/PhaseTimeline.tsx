import React from 'react';
import { FlawItem } from '../types/cricket';
import { AlertCircle, AlertTriangle, Zap } from 'lucide-react';

interface PhaseTimelineProps {
  currentFrame: number;
  totalFrames: number;
  impactFrame: number;
  flaws: FlawItem[];
  onSeekFrame: (frame: number) => void;
}

export const PhaseTimeline: React.FC<PhaseTimelineProps> = ({
  currentFrame,
  totalFrames,
  impactFrame,
  flaws,
  onSeekFrame,
}) => {
  const safeTotal = Math.max(1, totalFrames);
  const backliftApex = Math.max(0, Math.floor(impactFrame * 0.6));

  // 5 Phases definition
  const phases = [
    { id: 'stance', label: 'Stance', start: 0, end: Math.floor(backliftApex * 0.5) },
    { id: 'backlift', label: 'Backlift', start: Math.floor(backliftApex * 0.5), end: backliftApex },
    { id: 'downswing', label: 'Downswing', start: backliftApex, end: impactFrame },
    { id: 'impact', label: 'Impact', start: impactFrame, end: Math.min(safeTotal - 1, impactFrame + 2) },
    { id: 'follow_through', label: 'Follow-Through', start: Math.min(safeTotal - 1, impactFrame + 2), end: safeTotal - 1 },
  ];

  const currentPhase = phases.find((p) => currentFrame >= p.start && currentFrame <= p.end) || phases[0];

  return (
    <div className="bg-slate-900/90 rounded-2xl p-4 border border-slate-800 space-y-3">
      {/* Phase Indicator Bar */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">Phase:</span>
          <span className="font-bold text-white uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 border border-slate-700 flex items-center gap-1">
            {currentPhase.id === 'impact' && <Zap className="w-3.5 h-3.5 text-amber-400" />}
            {currentPhase.label}
          </span>
        </div>

        <div className="text-slate-400 font-numeric text-xs">
          Frame <strong className="text-white">{currentFrame + 1}</strong> / {safeTotal}
        </div>
      </div>

      {/* Segmented Phase Stepper */}
      <div className="grid grid-cols-5 gap-1.5">
        {phases.map((phase) => {
          const isActive = currentPhase.id === phase.id;
          const isImpact = phase.id === 'impact';
          return (
            <button
              key={phase.id}
              onClick={() => onSeekFrame(phase.start)}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-all text-center truncate ${
                isActive
                  ? isImpact
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                  : 'bg-slate-950/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {phase.label}
            </button>
          );
        })}
      </div>

      {/* Interactive Timeline Track with Exact Flaw Markers */}
      <div className="relative pt-2 pb-1">
        {/* Track */}
        <input
          type="range"
          min={0}
          max={safeTotal - 1}
          value={currentFrame}
          onChange={(e) => onSeekFrame(Number(e.target.value))}
          className="w-full h-2.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-emerald-500 border border-slate-800"
        />

        {/* Flaw Markers on Exact Frames */}
        <div className="relative h-6 mt-1 pointer-events-auto">
          {flaws.map((flaw, idx) => {
            const leftPct = Math.min(98, Math.max(2, (flaw.frame / safeTotal) * 100));
            const isCritical = flaw.severity === 'high';
            return (
              <button
                key={idx}
                onClick={(e) => {
                  e.stopPropagation();
                  onSeekFrame(flaw.frame);
                }}
                style={{ left: `${leftPct}%` }}
                title={`Frame #${flaw.frame}: ${flaw.name} (${flaw.severity.toUpperCase()})`}
                className={`absolute top-0 -translate-x-1/2 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-numeric font-bold transition-transform hover:scale-110 shadow-lg ${
                  isCritical
                    ? 'bg-rose-500/90 text-white border border-rose-400/80'
                    : 'bg-amber-500/90 text-slate-950 border border-amber-300'
                }`}
              >
                {isCritical ? <AlertCircle className="w-2.5 h-2.5" /> : <AlertTriangle className="w-2.5 h-2.5" />}
                <span>#{flaw.frame}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
