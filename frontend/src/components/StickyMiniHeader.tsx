import React, { useEffect, useState } from 'react';
import { ShotAnalysis } from '../types/cricket';
import { Award, Zap, ChevronLeft } from 'lucide-react';

function getScoreColor(s: number) {
  if (s >= 8) return 'text-emerald-400 border-emerald-500/35 bg-emerald-500/10';
  if (s >= 5) return 'text-amber-400 border-amber-500/35 bg-amber-500/10';
  return 'text-rose-400 border-rose-500/35 bg-rose-500/10';
}

interface StickyMiniHeaderProps {
  activeShot: ShotAnalysis | null;
}

export const StickyMiniHeader: React.FC<StickyMiniHeaderProps> = ({ activeShot }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = () => setVisible(window.scrollY > 160);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  if (!activeShot) return null;

  const { overall_score, shot_type, timing_score } = activeShot;
  const scoreColor = getScoreColor(overall_score);

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
      }`}
      aria-hidden={!visible}
    >
      <div className="bg-[#0B1220]/95 backdrop-blur-2xl border-b border-white/6 px-4 lg:px-8 py-2.5">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0 cursor-pointer">
            <span className="text-sm font-black text-white tracking-tight">
              CRICVISION <span className="text-emerald-400 text-xs">PRO</span>
            </span>
          </div>

          {/* Current shot info — headline score visible at a glance */}
          <div className="flex items-center gap-3 flex-1 justify-center min-w-0">
            <span className="text-xs text-slate-400 uppercase font-semibold tracking-wider truncate capitalize">
              {shot_type.replace('_', ' ')}
            </span>

            <div className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-sm font-black font-numeric ${scoreColor}`}>
              <Award className="w-3.5 h-3.5" />
              {overall_score.toFixed(1)}<span className="text-[10px] font-normal opacity-70"> / 10</span>
            </div>

            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 font-numeric">
              <Zap className="w-3 h-3 text-amber-400" />
              Timing: <span className="font-bold text-white">{timing_score.toFixed(1)}</span>
            </div>
          </div>

          <div className="shrink-0 w-28">
            <button
              className="flex items-center justify-end gap-1.5 px-2 py-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              title="Return to upload"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[11px] font-semibold">New shot</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
