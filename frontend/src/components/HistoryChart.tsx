import React, { useState } from 'react';
import { ShotAnalysis } from '../types/cricket';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import {
  History, TrendingUp, TrendingDown, Minus, Filter, CheckCircle2, Eye,
  Clock, Flag,
} from 'lucide-react';

interface HistoryChartProps {
  shotsHistory: ShotAnalysis[];
  onSelectShot: (shot: ShotAnalysis) => void;
  activeShotId?: string;
}

function getTrend(idx: number, history: ShotAnalysis[]) {
  if (idx === 0) return <Minus className="w-3.5 h-3.5 text-slate-400" />;
  const prev = history[idx - 1]?.overall_score ?? 0;
  const curr = history[idx]?.overall_score ?? 0;
  if (curr > prev) return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
  if (curr < prev) return <TrendingDown className="w-3.5 h-3.5 text-rose-400" />;
  return <Minus className="w-3.5 h-3.5 text-slate-400" />;
}

function scoreBadge(s: number) {
  if (s >= 8) return 'cv-badge-green';
  if (s >= 5) return 'cv-badge-amber';
  return 'cv-badge-red';
}

export const HistoryChart: React.FC<HistoryChartProps> = ({
  shotsHistory,
  onSelectShot,
  activeShotId,
}) => {
  const [filter, setFilter] = useState('all');

  const shotTypes = Array.from(new Set(shotsHistory.map((s) => s.shot_type)));

  const chartData = shotsHistory.map((s, i) => ({
    label: `S${i + 1}`,
    score: +s.overall_score.toFixed(2),
    timing: +s.timing_score.toFixed(2),
    type: s.shot_type,
  }));

  const filtered = shotsHistory.filter((s) =>
    filter === 'all' || s.shot_type.toLowerCase() === filter.toLowerCase()
  );

  const avgScore = shotsHistory.length
    ? shotsHistory.reduce((a, s) => a + s.overall_score, 0) / shotsHistory.length
    : 0;

  return (
    <div className="cv-card p-5 space-y-5 fade-in fade-in-delay-2">
      <div className="cv-section-head">
        <div className="flex items-center gap-2.5">
          <div className="cv-icon-wrap">
            <History className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Session progression & shot log</h3>
            <p className="text-[11px] text-slate-400">Average score per session & per shot type</p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-white/6 text-[10px] font-semibold">
          <Filter className="w-3 h-3 text-slate-500 mx-1" />
          {['all', ...shotTypes].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-1 rounded-lg transition-all capitalize ${
                filter === f ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* KPI chips row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KPI label="Session avg" value={avgScore.toFixed(1)} unit="/ 10" color="text-emerald-400" />
        <KPI label="Best stroke" value={shotsHistory.length ? Math.max(...shotsHistory.map((s) => s.overall_score)).toFixed(1) : '0.0'} unit="/ 10" color="text-amber-400" />
        <KPI label="Shots logged" value={shotsHistory.length} unit="" color="text-sky-400" />
        <KPI label="Avg timing" value={shotsHistory.length ? (shotsHistory.reduce((a, s) => a + s.timing_score, 0) / shotsHistory.length).toFixed(1) : '0.0'} unit="/ 10" color="text-slate-400" />
      </div>

      {/* Line chart */}
      <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/6 space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-bold text-slate-300 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            Stroke score progression
          </span>
          <div className="flex items-center gap-3 text-[10px] font-numeric font-semibold">
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-4 h-0.5 bg-emerald-400 inline-block rounded" /> Overall
            </span>
            <span className="flex items-center gap-1 text-amber-400">
              <span className="w-4 h-0.5 bg-amber-400 inline-block rounded" /> Timing
            </span>
          </div>
        </div>

        {chartData.length > 0 && (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: -20, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#475569', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  stroke="transparent"
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 10]}
                  ticks={[0, 2.5, 5, 7.5, 10]}
                  tick={{ fill: '#475569', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  stroke="transparent"
                  axisLine={false}
                />
                <ReferenceLine
                  y={avgScore}
                  stroke="rgba(255,255,255,0.18)"
                  strokeDasharray="4 4"
                  label={{ value: 'Session avg', fill: '#94A3B8', fontSize: 9, fontFamily: 'JetBrains Mono' }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload?.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-slate-900/95 border border-slate-700 p-2.5 rounded-xl shadow-xl text-xs font-numeric">
                          <div className="font-bold text-white mb-1">{d.label} · {d.type.replace('_', ' ')}</div>
                          <div className="text-emerald-400 font-bold">Overall: {d.score}/10</div>
                          <div className="text-amber-400 font-semibold">Timing: {d.timing}/10</div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Line type="monotone" dataKey="score" stroke="#10B981" strokeWidth={2.5}
                  dot={{ r: 4, fill: '#10B981', stroke: '#0B1220', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="timing" stroke="#F59E0B" strokeWidth={1.5}
                  strokeDasharray="4 4" dot={{ r: 3, fill: '#F59E0B' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Shot log table */}
      <div className="space-y-2">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between pb-1">
          <span>Logged stroke records</span>
          <span className="font-numeric text-slate-500 text-[11px]">{filtered.length} recorded</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/6">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-numeric text-[10px] uppercase border-b border-white/5">
              <tr>
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Shot</th>
                <th className="py-2.5 px-3">Score</th>
                <th className="py-2.5 px-3">Top flaw</th>
                <th className="py-2.5 px-3">Trend</th>
                <th className="py-2.5 px-3 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/4 font-numeric">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                    No shots logged yet. Capture a stroke above to start tracking.
                  </td>
                </tr>
              ) : (
                filtered.slice().reverse().map((shot, idx) => {
                  const origIdx = filtered.length - 1 - idx;
                  const topFlaw = shot.flaws?.length ? shot.flaws[0].name : null;
                  const isSelected = activeShotId === shot.shot_id;
                  return (
                    <tr
                      key={idx}
                      onClick={() => onSelectShot(shot)}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-emerald-500/8' : 'hover:bg-slate-800/40'}`}
                    >
                      <td className="py-2.5 px-3 text-slate-500">#{origIdx + 1}</td>
                      <td className="py-2.5 px-3 font-bold text-white capitalize font-sans">
                        {shot.shot_type.replace('_', ' ')}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`cv-badge ${scoreBadge(shot.overall_score)}`}>
                          {shot.overall_score.toFixed(1)}/10
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-sans max-w-[170px]">
                        {topFlaw ? (
                          <span className="text-amber-300 truncate block">{topFlaw}</span>
                        ) : (
                          <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Clean
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">{getTrend(origIdx, filtered)}</td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); onSelectShot(shot); }}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-sans font-semibold border border-white/8 transition-all inline-flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3 text-emerald-400" /> View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

function KPI({ label, value, unit, color }: { label: string; value: string | number; unit: string; color: string }) {
  return (
    <div className="bg-slate-900/50 rounded-xl p-3 border border-white/5">
      <div className="cv-label">{label}</div>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className={`text-xl font-black font-numeric ${color}`}>{value}</span>
        <span className="text-[10px] text-slate-500 font-numeric">{unit}</span>
      </div>
    </div>
  );
}
