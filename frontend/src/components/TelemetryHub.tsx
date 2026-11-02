import React, { useState } from 'react';
import { ShotAnalysis, FlawItem } from '../types/cricket';
import { ScoreCard } from './ScoreCard';
import { BiomechanicsRadar } from './BiomechanicsRadar';
import { FlawList } from './FlawList';
import { ImprovementCoach } from './ImprovementCoach';
import { SessionDashboard } from './SessionDashboard';
import {
  Activity,
  AlertTriangle,
  Lightbulb,
  BarChart3,
  Target,
  Sparkles
} from 'lucide-react';

interface TelemetryHubProps {
  activeShot: ShotAnalysis | null;
  shotsHistory: ShotAnalysis[];
  onSelectShot: (shot: ShotAnalysis) => void;
  selectedJointHighlight: string | null;
  onSelectJointHighlight: (joint: string | null) => void;
  onOpenDrillModal: () => void;
}

export const TelemetryHub: React.FC<TelemetryHubProps> = ({
  activeShot,
  shotsHistory,
  onSelectShot,
  selectedJointHighlight,
  onSelectJointHighlight,
  onOpenDrillModal,
}) => {
  const [activeTab, setActiveTab] = useState<'metrics' | 'flaws' | 'coach' | 'session'>('metrics');

  const flawCount = activeShot?.flaws?.length || 0;

  return (
    <div className="space-y-4">
      {/* Enterprise Sub-Navigation Bar */}
      <div className="enterprise-card rounded-2xl p-1.5 flex items-center justify-between border border-slate-800">
        <div className="grid grid-cols-4 gap-1 w-full text-xs font-semibold">
          <button
            onClick={() => setActiveTab('metrics')}
            className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'metrics'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-glow-green'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Telemetry</span>
          </button>

          <button
            onClick={() => setActiveTab('flaws')}
            className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'flaws'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-glow-green'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Flaws</span>
            {flawCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'flaws' ? 'bg-slate-950 text-white' : 'bg-rose-500/20 text-rose-400'
              }`}>
                {flawCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('coach')}
            className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'coach'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-glow-green'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Lightbulb className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Drills</span>
          </button>

          <button
            onClick={() => setActiveTab('session')}
            className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'session'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-glow-green'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">History</span>
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      {activeTab === 'metrics' && (
        <div className="space-y-4">
          <ScoreCard analysis={activeShot} />
          {activeShot && <BiomechanicsRadar metrics={activeShot.metrics} />}
        </div>
      )}

      {activeTab === 'flaws' && (
        <div className="space-y-4">
          <FlawList
            flaws={activeShot?.flaws || []}
            selectedJoint={selectedJointHighlight}
            onSelectFlaw={(flaw: FlawItem) => {
              onSelectJointHighlight(
                selectedJointHighlight === flaw.affected_joint ? null : (flaw.affected_joint || null)
              );
            }}
          />
          {flawCount > 0 && (
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-300">Need practice drills for these faults?</span>
              <button
                onClick={onOpenDrillModal}
                className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all shadow-sm"
              >
                View Correction Drills
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'coach' && (
        <div className="space-y-4">
          <ImprovementCoach tips={activeShot?.tips || []} />
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-slate-300 flex items-center justify-between">
            <div>
              <span className="font-bold text-emerald-400 block mb-0.5">Explore Full Coach Playbook</span>
              <span>Access all 4 certified batting drills with step-by-step cues.</span>
            </div>
            <button
              onClick={onOpenDrillModal}
              className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-all shrink-0 ml-3"
            >
              Open Playbook
            </button>
          </div>
        </div>
      )}

      {activeTab === 'session' && (
        <SessionDashboard
          shotsHistory={shotsHistory}
          onSelectShot={onSelectShot}
          activeShotId={activeShot?.shot_id}
        />
      )}
    </div>
  );
};
