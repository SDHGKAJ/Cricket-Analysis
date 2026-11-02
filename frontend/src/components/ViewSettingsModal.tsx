import React from 'react';
import { CameraAngle, BatterHand } from '../types/cricket';
import { Settings2, X, Check, Camera, User, Sliders } from 'lucide-react';

interface ViewSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  cameraAngle: CameraAngle;
  onCameraAngleChange: (angle: CameraAngle) => void;
  batterHand: BatterHand;
  onBatterHandChange: (hand: BatterHand) => void;
}

export const ViewSettingsModal: React.FC<ViewSettingsModalProps> = ({
  isOpen,
  onClose,
  cameraAngle,
  onCameraAngleChange,
  batterHand,
  onBatterHandChange,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="glass-panel-glow rounded-3xl max-w-md w-full p-6 border border-slate-700 shadow-2xl relative">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Settings2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Camera &amp; Batter Calibration</h3>
              <p className="text-xs text-slate-400">Configure computer vision perspective</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Camera Angle Selector */}
        <div className="mb-6">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2.5 flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 text-emerald-400" />
            Camera View Perspective
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div
              onClick={() => onCameraAngleChange('front_on')}
              className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                cameraAngle === 'front_on'
                  ? 'bg-emerald-500/15 border-emerald-500 shadow-glow-green text-white'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-sm text-slate-100">Front-On View</span>
                {cameraAngle === 'front_on' && <Check className="w-4 h-4 text-emerald-400" />}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Bowler / Umpire perspective. Best for head lateral lean, bat swing line to extra cover, and foot alignment.
              </p>
            </div>

            <div
              onClick={() => onCameraAngleChange('side_on')}
              className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                cameraAngle === 'side_on'
                  ? 'bg-emerald-500/15 border-emerald-500 shadow-glow-green text-white'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-sm text-slate-100">Side-On View</span>
                {cameraAngle === 'side_on' && <Check className="w-4 h-4 text-emerald-400" />}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Profile view from crease/point. Ideal for knee flexion angle, backlift apex, and stride reach along crease.
              </p>
            </div>
          </div>
        </div>

        {/* Batter Stance Handedness */}
        <div className="mb-6">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2.5 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-amber-400" />
            Batter Stance / Handedness
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onBatterHandChange('right')}
              className={`py-3 px-4 rounded-xl font-bold text-xs border transition-all flex items-center justify-center gap-2 ${
                batterHand === 'right'
                  ? 'bg-emerald-500 text-slate-950 font-bold border-emerald-400 shadow-sm'
                  : 'bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-800'
              }`}
            >
              Right-Handed
            </button>
            <button
              onClick={() => onBatterHandChange('left')}
              className={`py-3 px-4 rounded-xl font-bold text-xs border transition-all flex items-center justify-center gap-2 ${
                batterHand === 'left'
                  ? 'bg-emerald-500 text-slate-950 font-bold border-emerald-400 shadow-sm'
                  : 'bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-800'
              }`}
            >
              Left-Handed
            </button>
          </div>
        </div>

        {/* Biomechanical Calibration Notice */}
        <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-800 text-xs text-slate-400 mb-6 flex items-start gap-2">
          <Sliders className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>
            Weights and ideal biomechanical ranges are loaded from <code className="text-emerald-300 font-mono">shots_config.json</code> and <code className="text-emerald-300 font-mono">flaws_drills.json</code>.
          </span>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-glow-green transition-all"
        >
          Save &amp; Return to Practice
        </button>
      </div>
    </div>
  );
};
