import React from 'react';
import { CameraAngle, BatterHand } from '../types/cricket';
import { Settings2, Radio, Dumbbell, User, Plus, Aperture } from 'lucide-react';

interface TopBarProps {
  cameraAngle: CameraAngle;
  batterHand: BatterHand;
  selectedPlayer: string;
  activeMode: string;
  onModeChange: (mode: string) => void;
  onCameraAngleChange: (angle: CameraAngle) => void;
  onBatterHandChange: (hand: BatterHand) => void;
  onPlayerChange: (player: string) => void;
  totalShots: number;
  onNewShot: () => void;
  onAnalyze: (frames: any[]) => void;
  isAnalyzing: boolean;
}

const MODES = [
  { id: 'video', label: 'Video Studio', icon: Aperture },
  { id: 'drills', label: 'Coach Drills', icon: Dumbbell },
] as const;

export const TopBar: React.FC<TopBarProps> = ({
  cameraAngle,
  batterHand,
  selectedPlayer,
  activeMode,
  onModeChange,
  onCameraAngleChange,
  onBatterHandChange,
  onPlayerChange,
  totalShots,
  onNewShot,
  onAnalyze,
  isAnalyzing,
}) => {
  return (
    <header className="sticky top-0 z-50 bg-[#070C16]/92 backdrop-blur-2xl border-b border-white/6 px-4 lg:px-8 py-3">
      <div className="max-w-screen-xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">

        {/* ── Brand ── */}
        <div className="flex items-center gap-3.5 shrink-0">
          <div className="w-9 h-9 rounded-[14px] bg-gradient-to-br from-emerald-500 via-teal-500 to-sky-400 p-px shadow-lg shadow-emerald-500/25">
            <div className="w-full h-full bg-[#0B1220] rounded-[13px] flex items-center justify-center text-lg">
              🏏
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black tracking-tight text-white">
                CRICVISION <span className="text-emerald-400 text-sm font-extrabold tracking-wider">PRO</span>
              </span>
              <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-widest bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                LIVE
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium font-numeric">
              <span>High-Speed Optical Telemetry</span>
              <span>·</span>
              <span>{totalShots} shots logged</span>
            </div>
          </div>
        </div>

        {/* ── Mode switcher ── */}
        <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-white/6 text-xs font-semibold self-start md:self-auto">
          {MODES.map((mode) => {
            const isActive = activeMode === mode.id;
            return (
              <button
                key={mode.id}
                id={`nav-${mode.id}`}
                onClick={() => onModeChange(mode.id)}
                className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold ${
                  isActive
                    ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 shadow-lg shadow-emerald-500/10'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <mode.icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span className="font-sans">{mode.label}</span>
                {isActive && <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
              </button>
            );
          })}
        </div>

        {/* ── Right controls ── */}
        <div className="flex items-center gap-2">
          {/* Player selector */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/70 border border-white/6 text-xs">
            <User className="w-3.5 h-3.5 text-emerald-400" />
            <select
              value={selectedPlayer}
              onChange={(e) => onPlayerChange(e.target.value)}
              className="bg-transparent text-slate-200 font-semibold text-xs focus:outline-none cursor-pointer"
            >
              <option value="Virat Kohli (RHB #18)" className="bg-slate-900 text-white">
                Virat Kohli (RHB #18)
              </option>
              <option value="Steve Smith (RHB #49)" className="bg-slate-900 text-white">
                Steve Smith (RHB #49)
              </option>
              <option value="Rohit Sharma (RHB #45)" className="bg-slate-900 text-white">
                Rohit Sharma (RHB #45)
              </option>
              <option value="Custom Academy Batter" className="bg-slate-900 text-white">
                Custom Academy Batter
              </option>
            </select>
          </div>

          {/* Camera angle + handedness chips */}
          <div className="flex items-center gap-2">
            <button
              id="btn-camera"
              onClick={() => onCameraAngleChange(cameraAngle === 'front_on' ? 'side_on' : 'front_on')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/70 hover:bg-slate-800 text-xs font-semibold text-slate-200 border border-white/6 transition-all group"
            >
              <Settings2 className="w-3.5 h-3.5 text-emerald-400 group-hover:rotate-45 transition-transform duration-300" />
              <span className="capitalize">{cameraAngle.replace('_', ' ')}</span>
            </button>
            <button
              id="btn-hand"
              onClick={() => onBatterHandChange(batterHand === 'right' ? 'left' : 'right')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/70 hover:bg-slate-800 text-xs font-semibold text-slate-200 border border-white/6 transition-all group"
            >
              <User className="w-3.5 h-3.5 text-amber-400" />
              <span className="capitalize">{batterHand}-hand</span>
            </button>
          </div>

          {/* Actions */}
          <button
            id="btn-new-shot"
            onClick={onNewShot}
            className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> New Shot
          </button>
          <button
            id="btn-analyze"
            disabled={isAnalyzing}
            onClick={() => onAnalyze([])}
            className={`flex items-center gap-2 px-5 py-1.5 rounded-xl font-bold text-xs shadow-lg transition-all ${
              isAnalyzing
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-glow-green border border-emerald-500/40'
            }`}
          >
            <Radio className="w-3.5 h-3.5" /> Analyze Stroke
          </button>
        </div>
      </div>
    </header>
  );
};
