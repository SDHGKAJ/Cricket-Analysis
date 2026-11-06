import React, { useState } from 'react';
import { FlawItem, TipItem } from '../types/cricket';
import { AlertCircle, AlertTriangle, ChevronDown, ChevronUp, Wrench, HelpCircle, Target, Play } from 'lucide-react';

interface FlawCardProps {
  flaws: FlawItem[];
  tips: TipItem[];
  onFixClick: (frame: number, flawName: string) => void;
  selectedJoint?: string | null;
  onJointSelect?: (joint: string | null) => void;
}

/* Severity rank: high > medium > low */
const SEV_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

function sevColor(sev: string) {
  if (sev === 'high') return { dot: '#EF4444', text: 'text-rose-400', badge: 'cv-badge-red', ring: 'bg-rose-500/10 border-rose-500/25 text-rose-400' };
  if (sev === 'medium') return { dot: '#F59E0B', text: 'text-amber-400', badge: 'cv-badge-amber', ring: 'bg-amber-500/10 border-amber-500/25 text-amber-400' };
  return { dot: '#34D399', text: 'text-emerald-400', badge: 'cv-badge-green', ring: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' };
}

/** True when a measurement is missing (0 / null / undefined / "0") */
function isMissing(v: number | string | undefined): boolean {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '' || v === '0';
  return v === 0;
}

function plainEnglish(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('elbow'))
    return 'Your front elbow collapsed during the downswing, letting the bottom hand dominate and lifting the ball skyward toward extra cover.';
  if (n.includes('head'))
    return 'Your head drifted outside the line of off-stump, tilting your eyeline and pushing the bat across the ball toward the slips.';
  if (n.includes('foot') || n.includes('stride'))
    return 'Your front foot did not reach the pitch of the ball, forcing a reach with your hands disconnected from body weight.';
  if (n.includes('balance'))
    return 'Your centre of mass toppled backward after impact instead of holding a stable front-knee base.';
  return 'Kinematic variation outside the professional threshold is reducing power transfer and placement.';
}

/** Measured-vs-ideal mini gauge: marker on a range bar, N/A when missing */
function MeasuredGauge({ measured, ideal }: { measured: number | string | undefined; ideal: string }) {
  const missing = isMissing(measured);
  const num = typeof measured === 'number' ? measured : parseFloat(String(measured));
  const pct = missing ? 0 : Math.min(94, Math.max(6, num * 1.4));

  return (
    <div className="bg-slate-900/60 rounded-xl p-3 border border-white/5 space-y-2.5">
      <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-wider">
        <span className="text-slate-400">Measured vs. ideal</span>
        {missing && (
          <span className="flex items-center gap-1.5 text-amber-400">
            <HelpCircle className="w-3 h-3" />
            <span className="font-bold">Telemetry missing</span>
          </span>
        )}
      </div>

      <div className="relative h-2.5 bg-slate-800 rounded-full overflow-hidden border border-white/5">
        {/* Ideal zone */}
        <div className="absolute left-[42%] right-[30%] h-full bg-emerald-500/14 border-x border-emerald-500/40" />
        {/* Measured fill */}
        {!missing && (
          <div className="h-full rounded-full bg-amber-400 bar-animated" style={{ width: `${pct}%` }} />
        )}
        {/* Marker needle */}
        {!missing && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-1 bg-white shadow"
            style={{ left: `${Math.min(93, Math.max(7, pct))}%` }}
          />
        )}
      </div>

      <div className="flex items-center justify-between font-numeric text-xs">
        <div>
          <div className="cv-label">Measured</div>
          <span className={`text-sm font-bold ${missing ? 'text-amber-400' : 'text-white'}`}>
            {missing ? 'N/A' : typeof measured === 'number' ? `${measured.toFixed(1)}°` : measured}
          </span>
        </div>
        <div className="text-right">
          <div className="cv-label">Ideal range</div>
          <span className="text-sm font-bold text-emerald-400">{ideal}</span>
        </div>
      </div>
    </div>
  );
}

export const FlawCard: React.FC<FlawCardProps> = ({
  flaws,
  tips,
  onFixClick,
  selectedJoint,
  onJointSelect,
}) => {
  const sorted = [...flaws].sort((a, b) => SEV_RANK[b.severity] ?? 0 - (SEV_RANK[a.severity] ?? 0));
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  /* No-flaws state is handled by NoFlawsState, but keep a guard */
  if (!sorted.length) {
    return null;
  }

  return (
    <div className="cv-card p-0 flex flex-col h-full fade-in">
      <div className="cv-section-head">
        <div className="flex items-center gap-2.5">
          <div className="cv-icon-wrap cv-icon-wrap-amber" style={{ backgroundColor: 'rgba(245,158,11,0.10)', borderColor: 'rgba(245,158,11,0.25)', color: '#F59E0B' }}>
            <AlertCircle className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Biomechanical flaws</h3>
            <p className="text-[11px] text-slate-400">Ranked by impact — {sorted.length} detected</p>
          </div>
        </div>
        <span className="cv-badge cv-badge-outline">{sorted.length}</span>
      </div>

      <div className="p-4 space-y-3">
        {sorted.map((flaw, idx) => {
          const isExpanded = expandedIndex === idx;
          const sev = sevColor(flaw.severity);
          const missing = isMissing(flaw.measured);
          const jointName = (flaw.joint || flaw.affected_joint || 'Joint').replace(/_/g, ' ');
          const tip = tips.find((t) => t.flaw === flaw.name);
          const isHighlighted = selectedJoint && (flaw.joint || flaw.affected_joint || '').includes(selectedJoint);

          return (
            <div
              key={idx}
              className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                isExpanded
                  ? 'border-white/10 bg-slate-800/40 shadow-lg'
                  : isHighlighted
                    ? 'border-emerald-500/40 bg-emerald-500/5'
                    : 'border-white/6 bg-slate-950/50 hover:border-white/10'
              }`}
            >
              {/* Severity top bar */}
              <div
                className="h-[3px] w-full transition-all"
                style={{
                  backgroundColor: flaw.severity === 'high' ? '#EF4444' : flaw.severity === 'medium' ? '#F59E0B' : '#34D399',
                  opacity: isExpanded ? 1 : 0.5,
                }}
              />

              <div
                className="p-4 flex items-center justify-between cursor-pointer select-none"
                onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                role="button"
                aria-expanded={isExpanded}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${sev.ring} border`}>
                    {flaw.severity === 'high' ? <AlertCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-bold text-slate-100 truncate">{flaw.name}</h4>
                      <span className={`cv-badge ${sev.badge}`}>{flaw.severity}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5 font-numeric">
                      <span>Frame <span className="text-white font-bold">#{flaw.frame}</span></span>
                      <span className="text-slate-500">·</span>
                      <span className="flex items-center gap-1">
                        <Target className="w-3 h-3 text-emerald-400" />
                        {jointName}
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  className={`text-slate-500 hover:text-white p-1 shrink-0 transition-colors ${isExpanded ? 'text-emerald-400' : ''}`}
                >
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </div>

              {isExpanded && (
                <div className="px-4 pb-4 pt-1 space-y-3 border-t border-white/6">
                  {/* Plain-English explanation */}
                  <div className="flex items-start gap-2.5 bg-slate-900/60 p-3 rounded-xl border border-white/5">
                    <HelpCircle className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-300 leading-relaxed">{plainEnglish(flaw.name)}</p>
                  </div>

                  {/* Measured vs ideal gauge */}
                  <MeasuredGauge measured={flaw.measured} ideal={flaw.ideal} />

                  {/* Tip fix preview + Fix CTA */}
                  <div className="flex items-center justify-between gap-3">
                    {tip && (
                      <div className="flex items-center gap-2 bg-emerald-500/8 border border-emerald-500/15 p-2 rounded-xl text-xs text-emerald-200">
                        <Play className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="leading-tight">{tip.fix}</span>
                      </div>
                    )}
                    <button
                      onClick={() => onFixClick(flaw.frame, flaw.name)}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-xs font-bold transition-all flex items-center gap-1.5 border border-white/8"
                    >
                      <Wrench className="w-3.5 h-3.5" />
                      Fix & inspect drill
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
