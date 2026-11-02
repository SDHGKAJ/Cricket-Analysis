import React, { useState, useEffect } from 'react';
import { CameraAngle, BatterHand, FrameLandmarks, ShotAnalysis } from './types/cricket';
import { LiveCameraFeed } from './components/LiveCameraFeed';
import { ScoreCard } from './components/ScoreCard';
import { FlawList } from './components/FlawList';
import { ImprovementCoach } from './components/ImprovementCoach';
import { SlowMoReplay } from './components/SlowMoReplay';
import { SessionDashboard } from './components/SessionDashboard';
import { VideoUploader } from './components/VideoUploader';
import { ViewSettingsModal } from './components/ViewSettingsModal';
import { BiomechanicsRadar } from './components/BiomechanicsRadar';
import { evaluateCoverDriveClient } from './services/clientShotEvaluator';
import { analyzeShotOnServer, createBattingSession } from './services/api';
import {
  Camera,
  UploadCloud,
  Settings2,
  Activity,
  Layers,
  Sparkles,
  Target
} from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'live' | 'upload'>('live');
  const [cameraAngle, setCameraAngle] = useState<CameraAngle>('front_on');
  const [batterHand, setBatterHand] = useState<BatterHand>('right');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const [activeShot, setActiveShot] = useState<ShotAnalysis | null>(null);
  const [activeFrames, setActiveFrames] = useState<FrameLandmarks[]>([]);
  const [shotsHistory, setShotsHistory] = useState<ShotAnalysis[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [selectedJointHighlight, setSelectedJointHighlight] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  // Initialize session on mount
  useEffect(() => {
    createBattingSession('Batter 01', cameraAngle, batterHand)
      .then((sess) => setSessionId(sess.id))
      .catch((e) => console.log('Running in client-standalone mode', e));
  }, []);

  // Handle shot captured from live webcam or presets
  const handleShotCaptured = async (frames: FrameLandmarks[]) => {
    setIsAnalyzing(true);
    setActiveFrames(frames);

    // 1. Instant client-side analysis (< 50ms)
    const instantResult = evaluateCoverDriveClient(frames, cameraAngle, batterHand);
    setActiveShot(instantResult);
    setShotsHistory((prev) => [...prev, instantResult]);

    // 2. Sync with FastAPI backend asynchronously
    try {
      const serverResult = await analyzeShotOnServer(frames, cameraAngle, batterHand, sessionId);
      setActiveShot(serverResult);
      setShotsHistory((prev) =>
        prev.map((s) => (s.shot_id === instantResult.shot_id ? serverResult : s))
      );
    } catch (err) {
      console.warn('Backend sync notice (using client calculation):', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleVideoAnalysisComplete = (result: ShotAnalysis) => {
    setActiveShot(result);
    setShotsHistory((prev) => [...prev, result]);
  };

  const handleSelectHistoricalShot = (shot: ShotAnalysis) => {
    setActiveShot(shot);
    setSelectedJointHighlight(null);
  };

  return (
    <div className="min-h-screen text-slate-100 flex flex-col bg-[#070B14]">
      {/* Top Broadcast Navigation Header */}
      <header className="sticky top-0 z-40 bg-[#0B101D]/90 backdrop-blur-xl border-b border-slate-800/80 px-4 lg:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo & Tagline */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-glow-green text-slate-950 font-black text-xl">
              🏏
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-white uppercase">
                  Cricket Vision AI
                </h1>
                <span className="text-[10px] font-mono font-bold tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                  PRO SUITE 1.0
                </span>
                <span className="text-[10px] font-mono font-semibold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20 hidden sm:inline-block">
                  COVER DRIVE MVP
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Optical Pose Biomechanics • High-FPS Kinematic Scoring • Stroke Flaw Coach
              </p>
            </div>
          </div>

          {/* Perspective & Configuration Controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-xs font-semibold text-slate-200 border border-slate-700/80 transition-all shadow-sm group"
            >
              <Settings2 className="w-4 h-4 text-emerald-400 group-hover:rotate-45 transition-transform duration-300" />
              <span className="capitalize">{cameraAngle.replace('_', ' ')}</span>
              <span className="text-slate-500">•</span>
              <span className="capitalize">{batterHand}-hand</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mode Selector Tabs (Live Stream vs Video Upload) */}
      <div className="max-w-7xl mx-auto w-full px-4 lg:px-8 pt-5">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('live')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'live'
                  ? 'bg-emerald-500 text-slate-950 shadow-glow-green font-extrabold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
              }`}
            >
              <Camera className="w-4 h-4" />
              Live Camera Stream (60 FPS MediaPipe)
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'upload'
                  ? 'bg-emerald-500 text-slate-950 shadow-glow-green font-extrabold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
              }`}
            >
              <UploadCloud className="w-4 h-4" />
              Upload Practice Video (MP4 / MOV)
            </button>
          </div>

          {/* Quick Status */}
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-400 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>AI INFERENCE ENGINE READY</span>
          </div>
        </div>
      </div>

      {/* Main Analysis Workspace Layout */}
      <main className="max-w-7xl mx-auto w-full px-4 lg:px-8 py-6 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Live Capture / Video Upload & Slow-Mo Replay (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {activeTab === 'live' ? (
            <LiveCameraFeed
              cameraAngle={cameraAngle}
              batterHand={batterHand}
              onShotCompleted={handleShotCaptured}
              highlightJoint={selectedJointHighlight}
              isAnalyzing={isAnalyzing}
            />
          ) : (
            <VideoUploader
              cameraAngle={cameraAngle}
              batterHand={batterHand}
              sessionId={sessionId}
              onAnalysisComplete={handleVideoAnalysisComplete}
            />
          )}

          {/* Slow-Motion Replay Canvas with Frame Stepper & Angle Annotations */}
          <SlowMoReplay
            frames={activeFrames}
            flaws={activeShot?.flaws || []}
            impactFrame={activeShot?.impact_frame}
            replayVideoUrl={activeShot?.replay_url}
            selectedJoint={selectedJointHighlight}
          />
        </div>

        {/* Right Column: Score Card, Radar, Flaws, Coach Tips & Session Dashboard (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* 1. Score Card with /10 rating & timing sub-score */}
          <ScoreCard analysis={activeShot} />

          {/* 2. Biomechanical Spider Radar Chart (Current vs Pro Benchmark) */}
          {activeShot && <BiomechanicsRadar metrics={activeShot.metrics} />}

          {/* 3. Detected Flaws with Measured vs Ideal values */}
          {activeShot && (
            <FlawList
              flaws={activeShot.flaws}
              selectedJoint={selectedJointHighlight}
              onSelectFlaw={(flaw) => {
                setSelectedJointHighlight(
                  selectedJointHighlight === flaw.affected_joint ? null : (flaw.affected_joint || null)
                );
              }}
            />
          )}

          {/* 4. Coach Insights: Why it hurts, 1-line fix, and prescribed drills */}
          {activeShot && <ImprovementCoach tips={activeShot.tips} />}

          {/* 5. Session Dashboard with historical trend */}
          <SessionDashboard
            shotsHistory={shotsHistory}
            onSelectShot={handleSelectHistoricalShot}
            activeShotId={activeShot?.shot_id}
          />
        </div>
      </main>

      {/* Calibration Settings Modal */}
      <ViewSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        cameraAngle={cameraAngle}
        onCameraAngleChange={setCameraAngle}
        batterHand={batterHand}
        onBatterHandChange={setBatterHand}
      />
    </div>
  );
};

export default App;
