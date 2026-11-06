import React from 'react';
import { CameraAngle, BatterHand } from '../types/cricket';
import {
  Settings2,
  Share2,
  Sliders,
  ChevronDown,
  User,
  Download,
  Dumbbell,
  Radio
} from 'lucide-react';

interface EnterpriseHeaderProps {
  cameraAngle: CameraAngle;
  batterHand: BatterHand;
  onOpenSettings: () => void;
  onOpenDrillsModal: () => void;
  activeModule: 'video' | 'drills';
  onModuleChange: (mod: 'video' | 'drills') => void;
  selectedPlayer: string;
  onPlayerChange: (player: string) => void;
  totalShots: number;
}

export const EnterpriseHeader: React.FC<EnterpriseHeaderProps> = ({
  cameraAngle,
  batterHand,
  onOpenSettings,
  onOpenDrillsModal,
  activeModule,
  onModuleChange,
  selectedPlayer,
  onPlayerChange,
  totalShots
}) => {
  return (
    <header className="sticky top-0 z-50 bg-[#070B14]/90 backdrop-blur-2xl border-b border-slate-800/80 px-4 lg:px-8 py-3">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Left: Brand Identity & Active Status */}
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-sky-400 p-[1.5px] shadow-glow-green">
            <div className="w-full h-full bg-[#080D1A] rounded-[14px] flex items-center justify-center text-xl">
              🏏
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-lg tracking-tight text-white flex items-center gap-1.5">
                CRICVISION <span className="text-emerald-400 font-extrabold text-sm tracking-wider">PRO</span>
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                ENTERPRISE LAB
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium">
              <span>High-Speed Optical Telemetry</span>
              <span>•</span>
              <span className="text-slate-300 font-mono">60 FPS REAL-TIME</span>
              <span>•</span>
              <span className="text-emerald-400 font-mono font-semibold">{totalShots} Shots Logged</span>
            </div>
          </div>
        </div>

        {/* Center: Module Navigation Tabs */}
        <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs font-semibold self-start md:self-auto">
          <button
            onClick={() => onModuleChange('video')}
            className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeModule === 'video'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            Video Studio
          </button>

          <button
            onClick={() => onOpenDrillsModal()}
            className="px-3.5 py-1.5 rounded-lg text-slate-400 hover:text-white transition-all flex items-center gap-1.5"
          >
            <Dumbbell className="w-3.5 h-3.5 text-amber-400" />
            Coach Drills
          </button>
        </div>

        {/* Right: Player Profile & Calibration Settings */}
        <div className="flex items-center gap-2.5">
          {/* Player Switcher */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
            <User className="w-3.5 h-3.5 text-emerald-400" />
            <select
              value={selectedPlayer}
              onChange={(e) => onPlayerChange(e.target.value)}
              className="bg-transparent text-slate-200 font-semibold text-xs focus:outline-none cursor-pointer"
            >
              <option value="Virat Kohli (RHB #18)" className="bg-slate-900 text-white">Virat Kohli (RHB #18)</option>
              <option value="Steve Smith (RHB #49)" className="bg-slate-900 text-white">Steve Smith (RHB #49)</option>
              <option value="Rohit Sharma (RHB #45)" className="bg-slate-900 text-white">Rohit Sharma (RHB #45)</option>
              <option value="Custom Academy Batter" className="bg-slate-900 text-white">Custom Academy Batter</option>
            </select>
          </div>

          {/* Perspective Button */}
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-xs font-semibold text-slate-200 border border-slate-800 transition-all group"
          >
            <Settings2 className="w-3.5 h-3.5 text-emerald-400 group-hover:rotate-45 transition-transform duration-300" />
            <span className="capitalize">{cameraAngle.replace('_', ' ')}</span>
            <span className="text-slate-500">•</span>
            <span className="capitalize">{batterHand}-hand</span>
          </button>
        </div>
      </div>
    </header>
  );
};
