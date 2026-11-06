import React from 'react';
import { FrameLandmarks } from '../types/cricket';
import {
  UploadCloud, FileVideo, AlertCircle, Loader2, CheckCircle2, TrendingUp, Camera, Zap,
} from 'lucide-react';

interface EmptyStateProps {
  onAnalyze: (frames: any[]) => void;
  onUpload: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onAnalyze, onUpload }) => (
  <div className="cv-card p-12 text-center space-y-6 fade-in">
    <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400 shadow-glow-green">
      <UploadCloud className="w-7 h-7" />
    </div>
    <h2 className="text-2xl font-black text-white">No shots analyzed yet</h2>
    <p className="text-slate-400 text-sm max-w-md mx-auto leading-relaxed">
      Upload a match or practice clip, or run a live stroke capture, to see your overall score, flaws, and drills at a glance.
    </p>
    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
      <button
        onClick={() => onUpload()}
        className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-glow-green transition-all flex items-center gap-2"
      >
        <FileVideo className="w-4 h-4" /> Upload clip
      </button>
      <button
        onClick={() => onAnalyze([])}
        className="px-6 py-3 rounded-xl border border-white/8 bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-sm font-bold transition-all flex items-center gap-2"
      >
        <Camera className="w-4 h-4 text-emerald-400" /> Live capture
      </button>
    </div>
  </div>
);

interface AnalyzingStateProps {
  shot: any;
  frames: FrameLandmarks[];
}

export const AnalyzingState: React.FC<AnalyzingStateProps> = ({ shot, frames }) => (
  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 space-y-0">
    <div className="lg:col-span-6">
      <div className="cv-card p-6 flex flex-col justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="text-sm text-slate-300 font-medium">Analyzing stroke biomechanics…</p>
        </div>
        <div className="mt-6 w-full space-y-3">
          {['Pose estimation', 'Shot detection', 'Biomechanical scoring'].map((step, i) => (
            <div key={step} className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/50 border border-white/5">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                i === 0 ? 'bg-emerald-500 text-slate-950 font-bold shadow-glow-green' : 'bg-slate-800 text-slate-500'
              }`}>{i + 1}</div>
              <div>
                <div className="text-xs font-semibold text-slate-200">{step}</div>
                <div className="text-[11px] text-slate-500 font-numeric">{i === 0 ? 'Active' : 'Queued'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
    <div className="lg:col-span-6">
      <div className="cv-card p-6 h-full">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-white">Preview: {shot.shot_type.replace('_', ' ')}</h3>
        </div>
        <div className="text-center">
          <span className="text-4xl font-black font-numeric text-white">{shot.overall_score.toFixed(1)}</span>
          <span className="text-xs font-semibold text-slate-400 ml-1">/ 10</span>
        </div>
        <p className="text-xs text-slate-400 mt-2 text-center">{shot.tips.length} flaw(s) detected · drills ready below</p>
      </div>
    </div>
  </div>
);

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry }) => (
  <div className="cv-card p-8 text-center fade-in">
    <AlertCircle className="w-10 h-10 mx-auto mb-3 text-rose-400" />
    <h2 className="text-lg font-bold text-white">Analysis error</h2>
    <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">{message}</p>
    <button
      onClick={onRetry}
      className="mt-5 px-5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold text-sm shadow-glow-red transition-all"
    >
      Try again
    </button>
  </div>
);

interface NoFlawsStateProps {}

export const NoFlawsState: React.FC<NoFlawsStateProps> = () => (
  <div className="cv-card p-6 border-emerald-500/20 bg-emerald-500/5 flex items-center gap-3 fade-in">
    <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
      <CheckCircle2 className="w-5 h-5" />
    </div>
    <div>
      <h4 className="text-sm font-bold text-white">Clean technique</h4>
      <p className="text-xs text-slate-400 mt-0.5">
        No biomechanical flaws detected. Head alignment, front elbow elevation, and weight transfer all remained optimal.
      </p>
    </div>
    <div className="ml-auto flex items-center gap-1 text-emerald-400 font-numeric text-xs font-bold">
      <TrendingUp className="w-3 h-3" /> Maintain
    </div>
  </div>
);

/* Compact live-mode strip used when app is in live mode */
interface LiveModeProps {
  score: number;
  shotType: string;
  onCapture: () => void;
}

export const LiveMode: React.FC<LiveModeProps> = ({ score, shotType, onCapture }) => (
  <div className="cv-card p-3 flex items-center gap-4 fade-in">
    <div className="flex items-center gap-2 text-slate-400 font-numeric text-xs">
      <Camera className="w-3 h-3" /> LIVE
    </div>
    <div className="flex-1">
      <div className="text-[11px] text-slate-500 uppercase tracking-wider font-bold">Live score</div>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-black font-numeric ${score >= 8 ? 'text-emerald-400' : score >= 5 ? 'text-amber-400' : 'text-rose-400'}`}>
          {score.toFixed(1)}
        </span>
        <span className="text-xs font-semibold text-slate-500">/ 10</span>
      </div>
      <div className="text-[11px] text-slate-400 font-sans capitalize mt-0.5">{shotType.replace('_', ' ')}</div>
    </div>
    <button onClick={onCapture} className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-glow-green transition-all flex items-center gap-1.5">
      <Zap className="w-3.5 h-3.5" /> Capture
    </button>
  </div>
);
