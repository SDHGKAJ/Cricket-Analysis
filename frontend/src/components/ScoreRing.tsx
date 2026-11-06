import React, { useEffect, useRef } from 'react';
import { Award, Zap, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ScoreRingProps {
  overallScore: number;
  timingScore: number;
  shotType: string;
  confidence?: number;
  deltaLastSession?: number;
}

const RADIUS = 56;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function getSemanticColor(score: number) {
  if (score >= 8.0) return { stroke: '#10B981', ring: 'text-emerald-400', glow: 'rgba(16,185,129,0.25)' };
  if (score >= 5.0) return { stroke: '#F59E0B', ring: 'text-amber-400', glow: 'rgba(245,158,11,0.22)' };
  return { stroke: '#EF4444', ring: 'text-rose-400', glow: 'rgba(239,68,68,0.22)' };
}

function getVerdict(score: number): { title: string; sub: string; grade: string } {
  if (score >= 9.5) return { title: 'World-Class', sub: 'International standard — tournament-ready', grade: 'A+' };
  if (score >= 9.0) return { title: 'Elite Pro Stroke', sub: 'Match-ready; textbook mechanics', grade: 'A+' };
  if (score >= 8.0) return { title: 'First-Class Control', sub: 'Solid base, crisp top-hand guidance', grade: 'A' };
  if (score >= 7.0) return { title: 'Good — Needs Work', sub: 'Positive footwork; address highlighted flaws', grade: 'B+' };
  if (score >= 5.0) return { title: 'Developing Stance', sub: 'Timing and balance require correction drills', grade: 'B' };
  return { title: 'Critical Fault Detected', sub: 'Major alignment collapse; inspect drills below', grade: 'C' };
}

export const ScoreRing: React.FC<ScoreRingProps> = ({
  overallScore,
  timingScore,
  shotType,
  confidence = 94.2,
  deltaLastSession = 0,
}) => {
  const colors = getSemanticColor(overallScore);
  const verdict = getVerdict(overallScore);
  const pct = Math.min(10, Math.max(0, overallScore)) / 10;
  const offset = CIRCUMFERENCE * (1 - pct);
  const ringRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    const el = ringRef.current;
    if (!el) return;
    el.style.strokeDashoffset = String(CIRCUMFERENCE);
    const id = requestAnimationFrame(() => {
      el.style.transition = 'stroke-dashoffset 1.4s cubic-bezier(0.16,1,0.3,1)';
      el.style.strokeDashoffset = String(offset);
    });
    return () => cancelAnimationFrame(id);
  }, [overallScore, offset]);

  return (
    <div className="cv-card p-6 flex flex-col gap-5 relative overflow-hidden h-full fade-in">
      {/* Ambient glow matched to score band */}
      <div
        className="absolute -top-20 -right-20 w-64 h-64 rounded-full blur-[96px] opacity-25 pointer-events-none"
        style={{ backgroundColor: colors.stroke }}
      />

      {/* Header: shot type + confidence */}
      <div className="flex items-start justify-between">
        <div>
          <div className="cv-label flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors.stroke }} />
            Stroke analysis · {confidence.toFixed(1)}% confidence
          </div>
          <h2 className="text-xl font-black text-white capitalize tracking-tight">
            {shotType.replace('_', ' ')}
          </h2>
        </div>
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-bold font-numeric ${colors.ring === 'text-emerald-400' ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' : colors.ring === 'text-amber-400' ? 'bg-amber-500/10 border-amber-500/25 text-amber-400' : 'bg-rose-500/10 border-rose-500/25 text-rose-400'}`}>
          {verdict.grade}
        </div>
      </div>

      {/* ── Hero Ring Gauge ── */}
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-48 h-48 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 136 136" aria-label={`Score: ${overallScore.toFixed(1)} out of 10`}>
            {/* Track */}
            <circle cx="68" cy="68" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
            {/* Secondary glow ring */}
            <circle
              cx="68" cy="68" r={RADIUS}
              fill="none" stroke={colors.stroke} strokeWidth="13"
              strokeDasharray={CIRCUMFERENCE} strokeDashoffset={offset}
              strokeLinecap="round" opacity="0.12"
            />
            {/* Primary animated ring */}
            <circle
              ref={ringRef}
              cx="68" cy="68" r={RADIUS}
              fill="none" stroke={colors.stroke} strokeWidth="10"
              strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE}
              strokeLinecap="round" className="ring-animated"
            />
          </svg>

          {/* Inner content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            <span className={`text-[36px] font-black font-numeric leading-none tracking-tight ${colors.ring}`}>
              {overallScore.toFixed(1)}
            </span>
            <span className="text-[11px] font-semibold text-slate-400 mt-1 uppercase tracking-wider">/ 10</span>
            <div className={`mt-2 cv-badge ${overallScore >= 8 ? 'cv-badge-green' : overallScore >= 5 ? 'cv-badge-amber' : 'cv-badge-red'}`}>
              {verdict.grade}
            </div>
          </div>
        </div>

        {/* Verdict */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-bold mb-1.5 transition-colors duration-300
            ${colors.ring === 'text-emerald-400' ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' : colors.ring === 'text-amber-400' ? 'bg-amber-500/10 border-amber-500/25 text-amber-400' : 'bg-rose-500/10 border-rose-500/25 text-rose-400'}"
          >
            <Award className="w-3.5 h-3.5" />
            {verdict.title}
          </div>
          <p className="text-xs text-slate-400 max-w-[230px] mx-auto leading-relaxed">{verdict.sub}</p>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 gap-2.5 pt-4 border-t border-white/6">
        {/* Timing */}
        <div className="bg-slate-900/60 rounded-xl p-3 border border-white/5">
          <div className="cv-label flex items-center gap-1 mb-1">
            <Zap className="w-3 h-3 text-amber-400" /> Timing score
          </div>
          <div className="text-lg font-black font-numeric text-white">
            {timingScore.toFixed(1)}<span className="text-[11px] font-normal text-slate-500"> / 10</span>
          </div>
        </div>

        {/* Delta vs last session */}
        <div className="bg-slate-900/60 rounded-xl p-3 border border-white/5">
          <div className="cv-label mb-1">vs. last session</div>
          <div className="text-lg font-black font-numeric flex items-center gap-1.5">
            {deltaLastSession > 0 ? (
              <><TrendingUp className="w-4 h-4 text-emerald-400" /><span className="text-emerald-400">+{deltaLastSession.toFixed(1)}</span></>
            ) : deltaLastSession < 0 ? (
              <><TrendingDown className="w-4 h-4 text-rose-400" /><span className="text-rose-400">{deltaLastSession.toFixed(1)}</span></>
            ) : (
              <><Minus className="w-4 h-4 text-slate-400" /><span className="text-slate-400">–</span></>
            )}
            <span className="text-[11px] font-normal text-slate-500">pts</span>
          </div>
        </div>
      </div>
    </div>
  );
};
