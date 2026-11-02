import React, { useState, useEffect } from 'react';
import { CameraAngle, BatterHand, FrameLandmarks, ShotAnalysis } from './types/cricket';
import { EnterpriseHeader } from './components/EnterpriseHeader';
import { LiveCameraFeed } from './components/LiveCameraFeed';
import { SlowMoReplay } from './components/SlowMoReplay';
import { TelemetryHub } from './components/TelemetryHub';
import { VideoUploader } from './components/VideoUploader';
import { ViewSettingsModal } from './components/ViewSettingsModal';
import { DrillPlaybookModal } from './components/DrillPlaybookModal';
import { evaluateCoverDriveClient } from './services/clientShotEvaluator';
import { analyzeShotOnServer, createBattingSession } from './services/api';

export const App: React.FC = () => {
  const [activeModule, setActiveModule] = useState<'lab' | 'video' | 'drills'>('lab');
  const [cameraAngle, setCameraAngle] = useState<CameraAngle>('front_on');
  const [batterHand, setBatterHand] = useState<BatterHand>('right');
  const [selectedPlayer, setSelectedPlayer] = useState<string>('Virat Kohli (RHB #18)');

  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isDrillsOpen, setIsDrillsOpen] = useState<boolean>(false);

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

    // Pre-populate with an initial demo stroke so the page opens up rich, full, and vibrant immediately!
    const initialDemo = evaluateCoverDriveClient(
      Array.from({ length: 45 }, (_, i) => ({
        frame_index: i,
        timestamp_ms: i * 33.3,
        landmarks: Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 })),
      })),
      cameraAngle,
      batterHand
    );
    // Enrich with realistic cover drive metrics
    initialDemo.overall_score = 8.8;
    initialDemo.timing_score = 9.2;
    initialDemo.metrics = {
      timing: 9.2,
      head_position: 8.9,
      front_elbow: 8.6,
      footwork: 9.0,
      balance: 8.7,
      bat_swing_path: 8.8,
      backlift: 8.5,
      follow_through: 8.7,
    };
    initialDemo.flaws = [
      {
        name: 'Front Elbow Dropping / Collapsed Arm',
        severity: 'medium',
        frame: 24,
        measured: 64.5,
        ideal: '70.0° - 110.0°',
        affected_joint: 'left_elbow',
      },
    ];
    initialDemo.tips = [
      {
        flaw: 'Front Elbow Dropping / Collapsed Arm',
        why_it_hurts: 'A collapsed elbow forces bottom-hand domination, chipping the ball in the air towards extra cover.',
        fix: 'Point your front elbow directly at the mid-off/cover region throughout the downswing.',
        drill: 'Top-Hand Only Tee Drives: 25 drives on a batting tee with top hand leading exclusively.',
      },
    ];
    setActiveShot(initialDemo);
    setShotsHistory([initialDemo]);
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
    <div className="min-h-screen text-slate-100 flex flex-col bg-[#050811]">
      {/* Enterprise SaaS Navigation Header */}
      <EnterpriseHeader
        cameraAngle={cameraAngle}
        batterHand={batterHand}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenDrillsModal={() => setIsDrillsOpen(true)}
        activeModule={activeModule}
        onModuleChange={setActiveModule}
        selectedPlayer={selectedPlayer}
        onPlayerChange={setSelectedPlayer}
        totalShots={shotsHistory.length}
      />

      {/* Main Workspace Layout */}
      <main className="max-w-7xl mx-auto w-full px-4 lg:px-8 py-6 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Studio Column: Live Optical Tracking Feed & Slow-Mo Replay (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {activeModule === 'lab' ? (
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

        {/* Right Telemetry Hub Column: Multi-Tab Analytics Center (5 Cols) */}
        <div className="lg:col-span-5">
          <TelemetryHub
            activeShot={activeShot}
            shotsHistory={shotsHistory}
            onSelectShot={handleSelectHistoricalShot}
            selectedJointHighlight={selectedJointHighlight}
            onSelectJointHighlight={setSelectedJointHighlight}
            onOpenDrillModal={() => setIsDrillsOpen(true)}
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

      {/* Masterclass Drills Playbook Modal */}
      <DrillPlaybookModal
        isOpen={isDrillsOpen}
        onClose={() => setIsDrillsOpen(false)}
      />
    </div>
  );
};

export default App;
