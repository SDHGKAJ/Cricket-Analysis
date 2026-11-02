import React from 'react';
import { ShotAnalysis, SessionRecord } from '../types/cricket';
import { BarChart3, TrendingUp, History, Award, CheckCircle, Clock } from 'lucide-react';

interface SessionDashboardProps {
  shotsHistory: ShotAnalysis[];
  onSelectShot: (shot: ShotAnalysis) => void;
  activeShotId?: string;
}

export const SessionDashboard: React.FC<SessionDashboardProps> = ({
  shotsHistory,
  onSelectShot,
  activeShotId
}) => {
  const totalShots = shotsHistory.length;
  const avgScore =
    totalShots > 0
      ? (shotsHistory.reduce((acc, s) => acc + s.overall_score, 0) / totalShots).toFixed(1)
      : '0.0';

  const bestScore =
    totalShots > 0
      ? Math.max(...shotsHistory.map((s) => s.overall_score)).toFixed(1)
      : '0.0';

  const avgTiming =
    totalShots > 0
      ? (shotsHistory.reduce((acc, s) => acc + s.timing_score, 0) / totalShots).toFixed(1)
      : '0.0';

  return (
    <div className="glass-panel rounded-2xl p-6 border border-slate-700/60 shadow-xl">
      <div className="flex items-center justify-between pb-4 border-b border-slate-700/50 mb-5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Batting Session Analytics</h3>
            <p className="text-xs text-slate-400">Live progress &amp; consistency trends</p>
          </div>
        </div>
        <span className="text-xs font-mono bg-slate-900 px-3 py-1 rounded-lg border border-slate-800 text-slate-300">
          Session #1
        </span>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-slate-900/70 p-3.5 rounded-xl border border-slate-800">
          <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Shots Logged</div>
          <div className="text-2xl font-extrabold text-white mt-1">{totalShots}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Recorded strokes</div>
        </div>

        <div className="bg-slate-900/70 p-3.5 rounded-xl border border-slate-800">
          <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Session Avg</div>
          <div className="text-2xl font-extrabold text-emerald-400 mt-1">{avgScore}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Target &gt; 8.0/10</div>
        </div>

        <div className="bg-slate-900/70 p-3.5 rounded-xl border border-slate-800">
          <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Best Stroke</div>
          <div className="text-2xl font-extrabold text-amber-400 mt-1">{bestScore}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Peak rating</div>
        </div>

        <div className="bg-slate-900/70 p-3.5 rounded-xl border border-slate-800">
          <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Timing Score</div>
          <div className="text-2xl font-extrabold text-sky-400 mt-1">{avgTiming}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Sweet-spot contact</div>
        </div>
      </div>

      {/* Improvement Trend Progress */}
      {totalShots > 1 && (
        <div className="mb-6 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-2">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <TrendingUp className="w-4 h-4" />
              Stroke Score Progression
            </span>
            <span className="text-slate-400 font-mono text-[11px]">Last {totalShots} shots</span>
          </div>

          {/* Bar Trend representation */}
          <div className="flex items-end gap-1.5 h-16 pt-2">
            {shotsHistory.map((s, idx) => {
              const hPct = Math.min(100, Math.max(15, (s.overall_score / 10) * 100));
              const isSelected = activeShotId === s.shot_id;
              return (
                <div
                  key={idx}
                  onClick={() => onSelectShot(s)}
                  className="flex-1 flex flex-col items-center gap-1 cursor-pointer group"
                >
                  <div className="w-full bg-slate-950 rounded-t h-full flex items-end">
                    <div
                      className={`w-full rounded-t transition-all duration-300 ${
                        isSelected
                          ? 'bg-emerald-400 shadow-glow-green'
                          : s.overall_score >= 8
                          ? 'bg-emerald-500/80 group-hover:bg-emerald-400'
                          : 'bg-amber-500/80 group-hover:bg-amber-400'
                      }`}
                      style={{ height: `${hPct}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-slate-400 group-hover:text-white">
                    #{idx + 1}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Shot History Feed */}
      <div>
        <h4 className="text-xs uppercase font-bold tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
          <History className="w-3.5 h-3.5 text-slate-400" />
          Recent Shots History
        </h4>

        {totalShots === 0 ? (
          <div className="text-center py-6 text-xs text-slate-400 bg-slate-900/40 rounded-xl border border-slate-800/80">
            No shots registered in this session yet. Start batting above!
          </div>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {shotsHistory.slice().reverse().map((s, idx) => {
              const isSelected = activeShotId === s.shot_id;
              return (
                <div
                  key={idx}
                  onClick={() => onSelectShot(s)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? 'bg-emerald-500/10 border-emerald-500/50'
                      : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-800/50 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center font-extrabold text-sm border ${
                        s.overall_score >= 8
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                          : s.overall_score >= 6.5
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                          : 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                      }`}
                    >
                      {s.overall_score.toFixed(1)}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white capitalize">
                        {s.shot_type.replace('_', ' ')}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span>Timing: {s.timing_score.toFixed(1)}/10</span>
                        <span>•</span>
                        <span className={s.flaws.length === 0 ? 'text-emerald-400' : 'text-amber-400'}>
                          {s.flaws.length === 0 ? '0 flaws' : `${s.flaws.length} flaw(s)`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <span className="text-[10px] text-slate-400 font-mono">
                    Shot #{shotsHistory.length - idx}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
