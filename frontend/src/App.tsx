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
import { evaluateCoverDriveClient } from './services/clientShotEvaluator';
import { analyzeShotOnServer, createBattingSession } from './services/api';
import {
  Activity,
  Camera,
  UploadCloud,
  Settings2,
  Sparkles,
  Trophy,
  CheckCircle2,
  ShieldAlert
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

  // Handle shot captured from live webcam or simulation
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
      // Replace with server-enhanced result
      setShotsHistory((prev) =>
        prev.map((s) => (s.shot_id === instantResult.shot_id ? serverResult : s))
      );
    } catch (err) {
      console.warn('Backend sync notice (using client calculation):', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle uploaded video analysis completion
  const handleVideoAnalysisComplete = (result: ShotAnalysis) => {
    setActiveShot(result);
    setShotsHistory((prev) => [...prev, result]);
  };

  // Select historical shot
  const handleSelectHistoricalShot = (shot: ShotAnalysis) => {
    setActiveShot(shot);
    setSelectedJointHighlight(null);
  };

  return (
    <div className="min-h-screen text-slate-100 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80 px-4 lg:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo & Tagline */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-glow-green text-slate-950 font-black text-xl">
              🏏
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-extrabold tracking-tight text-white">
                  Cricket Vision AI
                </h1>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  MVP 1.0 • Cover Drive
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Real-Time Pose &amp; YOLO Biomechanics Scoring, Flaw Analysis &amp; Coaching
              </p>
            </div>
          </div>

          {/* Perspective & Configuration Controls */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-200 border border-slate-800 transition-all shadow-sm"
            >
              <Settings2 className="w-4 h-4 text-emerald-400" />
              <span className="capitalize">{cameraAngle.replace('_', ' ')}</span>
              <span className="text-slate-500">•</span>
              <span className="capitalize">{batterHand}-hand</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mode Selector Tabs (Live Stream vs Video Upload) */}
      <div className="max-w-7xl mx-auto w-full px-4 lg:px-8 pt-6">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <button
            onClick={() => setActiveTab('live')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'live'
                ? 'bg-emerald-500 text-slate-950 shadow-glow-green'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
            }`}
          >
            <Camera className="w-4 h-4" />
            Live Webcam Stream (60 FPS MediaPipe)
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'upload'
                ? 'bg-emerald-500 text-slate-950 shadow-glow-green'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            Upload Video File (MP4 Analysis)
          </button>
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

          {/* Slow-Motion Replay Canvas with Angle Annotations */}
          <SlowMoReplay
            frames={activeFrames}
            flaws={activeShot?.flaws || []}
            impactFrame={activeShot?.impact_frame}
            replayVideoUrl={activeShot?.replay_url}
            selectedJoint={selectedJointHighlight}
          />
        </div>

        {/* Right Column: Score Card, Flaw List, Coach Insights & Session Dashboard (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* 1. Score Card with /10 rating & timing sub-score */}
          <ScoreCard analysis={activeShot} />

          {/* 2. Detected Flaws with Measured vs Ideal values */}
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

          {/* 3. Coach Insights: Why it hurts, 1-line fix, and drills */}
          {activeShot && <ImprovementCoach tips={activeShot.tips} />}

          {/* 4. Session Dashboard with historical trend */}
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
