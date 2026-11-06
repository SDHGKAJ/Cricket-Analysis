import React, { useState, useEffect, useCallback } from 'react';
import { Plus, ShieldAlert, Clock, Play } from 'lucide-react';
import {
  CameraAngle,
  BatterHand,
  FrameLandmarks,
  ShotAnalysis,
  FlawItem,
  TipItem,
} from './types/cricket';

import { TopBar } from './components/TopBar';
import { StickyMiniHeader } from './components/StickyMiniHeader';
import { SideNav } from './components/SideNav';
import { ScoreRing } from './components/ScoreRing';
import { RadarChart } from './components/RadarChart';
import { VideoOverlay } from './components/VideoOverlay';
import { VideoUploader } from './components/VideoUploader';
import { FlawCard } from './components/FlawCard';
import { DrillCard } from './components/DrillCard';
import { MetricBreakdown } from './components/MetricBreakdown';
import { HistoryChart } from './components/HistoryChart';
import { SessionDashboard } from './components/SessionDashboard';
import {
  EmptyState,
  AnalyzingState,
  ErrorState,
  NoFlawsState,
  LiveMode,
} from './components/StateViews';

import { evaluateCoverDriveClient } from './services/clientShotEvaluator';
import { analyzeShotOnServer, createBattingSession } from './services/api';

type AppState = 'empty' | 'analyzing' | 'error' | 'ready';

/* ── Demo seed shot (rich mock data matching the data contract) ── */
function makeDemoShot(cameraAngle: CameraAngle, batterHand: BatterHand): ShotAnalysis {
  const frames: FrameLandmarks[] = Array.from({ length: 48 }, (_, i) => ({
    frame_index: i,
    timestamp_ms: i * 33.3,
    landmarks: Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 })),
  }));

  const shot = evaluateCoverDriveClient(frames, cameraAngle, batterHand);

  /* Override with a realistic, varied mock result that exercises every UI state:
     - overall 7.6 (amber band)
     - one flaw with measured 0 -> should render "N/A" + warning
     - one medium, one low flaw */
  shot.overall_score = 7.6;
  shot.timing_score = 8.1;
  shot.shot_type = 'cover_drive';
  shot.confidence = 91.4;
  shot.delta_last_session = -0.3;
  shot.impact_frame = 28;
  shot.total_frames = 48;
  shot.metrics = {
    timing: 8.1,
    head_position: 6.2,
    front_elbow: 5.4,
    footwork: 7.9,
    balance: 8.3,
    bat_swing_path: 7.4,
    backlift: 8.0,
    follow_through: 7.7,
  };
  shot.flaws = [
    {
      name: 'Front Elbow Dropping / Collapsed Arm',
      severity: 'high',
      frame: 24,
      measured: 0, // intentionally missing telemetry -> renders N/A + warning
      ideal: '70° – 110°',
      affected_joint: batterHand === 'right' ? 'left_elbow' : 'right_elbow',
    },
    {
      name: 'Head Falling Away to Off-Side',
      severity: 'medium',
      frame: 28,
      measured: 7.2,
      ideal: '0.0% – 4.5%',
      affected_joint: 'nose',
    },
    {
      name: 'Front Foot Not Reaching Pitch of Ball',
      severity: 'low',
      frame: 18,
      measured: 0.62,
      ideal: '0.85 – 1.45 norm',
      affected_joint: batterHand === 'right' ? 'left_ankle' : 'right_ankle',
    },
  ];
  shot.tips = [
    {
      flaw: 'Front Elbow Dropping / Collapsed Arm',
      why_it_hurts:
        'A collapsed elbow forces bottom-hand domination, chipping the ball in the air toward extra cover.',
      fix: 'Point your front elbow directly at mid-off/cover throughout the downswing.',
      drill: 'Top-Hand Only Tee Drives: 25 drives on a batting tee with top hand leading exclusively.',
    },
    {
      flaw: 'Head Falling Away to Off-Side',
      why_it_hurts:
        'Eyeline tilts and hands follow the head outside the line, causing leading edges into slip/gully.',
      fix: 'Lead into the drive with your head, keeping eyes level and chin tucked over your front knee.',
      drill: 'Drop-Ball Target Driving: 25 drives freezing head dead-still over the bounce point for 2 seconds.',
    },
    {
      flaw: 'Front Foot Not Reaching Pitch of Ball',
      why_it_hurts:
        'Reaching away without footwork causes lunging with hands disconnected from body weight.',
      fix: 'Commit a positive stride toward the line and bounce, planting front toe toward cover.',
      drill: 'Shadow Step & Freeze: 30 repetitions committing the front stride toward a chalk target.',
    },
  ];
  shot.replay_url = '/replays/replay_upload_3979b792_slowmo.mp4';
  return shot;
}

function variantShot(base: ShotAnalysis, score: number, shotType: string, id: string): ShotAnalysis {
  return {
    ...base,
    shot_id: id,
    shot_type: shotType,
    overall_score: score,
    timing_score: Number((score * 0.95 + 0.4).toFixed(1)),
    delta_last_session: Number(((score - base.overall_score) * 0.5).toFixed(1)),
    flaws: score >= 8 ? [] : base.flaws.slice(0, 1),
    tips: score >= 8 ? [] : base.tips.slice(0, 1),
  } as ShotAnalysis;
}

const DRILL_LIBRARY: Record<string, { title: string; desc: string; duration: string; reps: string; color: string; icon: React.ReactNode }> = {
  elbow: {
    title: 'Top-Hand Tee Drives',
    desc: 'Fix collapsed front elbow by leading with the top hand on a batting tee.',
    duration: '15 min',
    reps: '3 × 15 drives',
    color: 'text-emerald-400',
    icon: <Play className="w-5 h-5 text-emerald-400" />,
  },
  head: {
    title: 'Drop-Ball Target Driving',
    desc: 'Keep head dead-still over bounce point to stop falling away off-side.',
    duration: '20 min',
    reps: '4 × 12 reps',
    color: 'text-amber-400',
    icon: <ShieldAlert className="w-5 h-5 text-amber-400" />,
  },
  line: {
    title: 'Shadow Step & Freeze',
    desc: 'Commit front stride toward the line; freeze at impact for 2 seconds.',
    duration: '15 min',
    reps: '3 × 20 reps',
    color: 'text-sky-400',
    icon: <Clock className="w-5 h-5 text-sky-400" />,
  },
  stride: {
    title: 'Front Foot Plant Drill',
    desc: 'Plant front toe toward cover; drive through the line with weight transfer.',
    duration: '12 min',
    reps: '3 × 15 steps',
    color: 'text-emerald-400',
    icon: <Play className="w-5 h-5 text-emerald-400" />,
  },
  balance: {
    title: 'Shadow Hold Drill',
    desc: 'Hold finish position for 3 seconds to build balance and control.',
    duration: '10 min',
    reps: '3 × 10 holds',
    color: 'text-amber-400',
    icon: <ShieldAlert className="w-5 h-5 text-amber-400" />,
  },
};

export const App: React.FC = () => {
  const [cameraAngle, setCameraAngle] = useState<CameraAngle>('front_on');
  const [batterHand, setBatterHand] = useState<BatterHand>('right');
  const [playerName, setPlayerName] = useState('CC Ludimos');
  const [playerId, setPlayerId] = useState('RHB #18');
  const [navActive, setNavActive] = useState('video');

  const [appState, setAppState] = useState<AppState>('ready');
  const [errorMessage, setErrorMessage] = useState('');

  const [activeShot, setActiveShot] = useState<ShotAnalysis | null>(null);
  const [activeFrames, setActiveFrames] = useState<FrameLandmarks[]>([]);
  const [shotsHistory, setShotsHistory] = useState<ShotAnalysis[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [uploadOpen, setUploadOpen] = useState(false);

  const [selectedJoint, setSelectedJoint] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [highlightedDrillFlaw, setHighlightedDrillFlaw] = useState<string | null>(null);
  const [replayFrame, setReplayFrame] = useState(0);

  useEffect(() => {
    createBattingSession('Batter 01', cameraAngle, batterHand)
      .then((s) => setSessionId(s.id))
      .catch(() => {});

    const demoFrames: FrameLandmarks[] = Array.from({ length: 48 }, (_, i) => ({
      frame_index: i,
      timestamp_ms: i * 33.3,
      landmarks: Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 })),
    }));
    const demo = makeDemoShot(cameraAngle, batterHand);
    setActiveShot(demo);
    setActiveFrames(demoFrames);
    setShotsHistory([demo]);
    setAppState('ready');
  }, []);

  const totalFrames = activeShot?.total_frames ?? activeFrames.length;
  const impactFrame = activeShot?.impact_frame ?? Math.floor(totalFrames * 0.55);

  /* Handle a captured / analyzed shot */
  const handleShotCaptured = useCallback(
    async (frames: FrameLandmarks[]) => {
      setAppState('analyzing');
      setIsAnalyzing(true);
      setActiveFrames(frames);
      setReplayFrame(0);
      setHighlightedDrillFlaw(null);

      try {
        const instant = evaluateCoverDriveClient(frames, cameraAngle, batterHand);
        setActiveShot(instant);
        setShotsHistory((prev) => [...prev, instant]);

        const server = await analyzeShotOnServer(
          frames,
          cameraAngle,
          batterHand,
          sessionId,
        );
        setActiveShot(server);
        setShotsHistory((prev) =>
          prev.map((s) => (s.shot_id === instant.shot_id ? server : s)),
        );
        setAppState('ready');
      } catch {
        setAppState('ready');
      } finally {
        setIsAnalyzing(false);
      }
    },
    [cameraAngle, batterHand, sessionId],
  );

  const handleVideoComplete = (result: ShotAnalysis) => {
    setActiveShot(result);
    setActiveFrames(result.frames ?? []);
    setShotsHistory((prev) => [...prev, result]);
    setAppState('ready');
  };

  const handleSelectShot = (shot: ShotAnalysis) => {
    setActiveShot(shot);
    setSelectedJoint(null);
    setReplayFrame(0);
    setHighlightedDrillFlaw(null);
  };

  /* "Fix" button: jump to the flaw frame + highlight the matching drill */
  const handleFixFlaw = (frame: number, flawName: string) => {
    setReplayFrame(frame);
    setSelectedJoint(null);
    setHighlightedDrillFlaw(flawName);
    setAppState('ready');
    const el = document.getElementById('section-drills');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleReset = () => {
    setAppState('empty');
    setActiveShot(null);
    setActiveFrames([]);
    setShotsHistory([]);
    setReplayFrame(0);
    setHighlightedDrillFlaw(null);
    setSelectedJoint(null);
  };

  const hasShots = shotsHistory.length > 0;
  const showScore = activeShot != null;

  return (
    <div className="min-h-screen text-slate-100 bg-[#0B1220] selection:bg-emerald-500/30 selection:text-white">
      {/* Sticky mini header — score + shot type on scroll */}
      <StickyMiniHeader activeShot={showScore ? activeShot : null} />

      {/* ── Layout shell: sidebar + main ── */}
      <div className="flex h-[calc(100vh-80px)]">
        {/* Left sidebar navigation */}
        <SideNav
          active={navActive}
          onSelect={setNavActive}
          playerName={playerName}
          playerId={playerId}
          onPlayerChange={() => setPlayerName(p => (p === 'CC Ludimos' ? 'Steve Smith' : 'CC Ludimos'))}
        />

        {/* Main content area */}
        <div className="flex-1 overflow-y-auto bg-[#0B1220] relative">
          {/* Top navigation bar */}
          <TopBar
            cameraAngle={cameraAngle}
            batterHand={batterHand}
            selectedPlayer={playerName}
            activeMode={navActive}
            onModeChange={setNavActive}
            onCameraAngleChange={setCameraAngle}
            onBatterHandChange={setBatterHand}
            onPlayerChange={() => setPlayerName(p => (p === 'CC Ludimos' ? 'Steve Smith' : 'CC Ludimos'))}
            totalShots={shotsHistory.length}
            onNewShot={handleReset}
            onAnalyze={handleShotCaptured}
            isAnalyzing={isAnalyzing}
          />

          <main className="max-w-screen-xl mx-auto px-4 lg:px-8 pt-6 pb-20 space-y-8">



            {/* ═════════════════════════════════════════════════════════════
                VIDEO STUDIO — full analysis dashboard
                ══════════════════════════════════════════════════════════ */}
            {navActive === 'video' && (
              <>
                {/* EMPTY / ANALYZING / ERROR / LIVE STATES */}
                {appState === 'empty' && !hasShots ? (
                  <>
                    <EmptyState onAnalyze={handleShotCaptured} onUpload={() => setUploadOpen(true)} />
                    {uploadOpen && (
                      <div className="fixed inset-0 z-50 bg-[#0B1220]/90 backdrop-blur-xl flex items-center justify-center p-4 sm:p-8">
                        <div className="bg-[#0A1020] border border-white/8 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                          <div className="px-6 py-4 border-b border-white/6 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-white">Upload shot video</h3>
                            <button
                              onClick={() => setUploadOpen(false)}
                              className="w-8 h-8 rounded-full bg-slate-900 hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center transition-all"
                            >
                              <span className="text-sm">✕</span>
                            </button>
                          </div>
                          <div className="flex-1 overflow-y-auto p-6">
                            <VideoUploader
                              cameraAngle={cameraAngle}
                              batterHand={batterHand}
                              sessionId={sessionId}
                              onAnalysisComplete={(result) => {
                                setUploadOpen(false);
                                handleVideoComplete(result);
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : null}

                {appState === 'analyzing' && activeShot ? (
                  <AnalyzingState shot={activeShot} frames={activeFrames} />
                ) : null}

                {appState === 'error' ? (
                  <ErrorState message={errorMessage || 'Analysis failed. Please try again.'} onRetry={handleReset} />
                ) : null}

                {/* DASHBOARD (single-scroll, no tabs) */}
                {showScore && appState === 'ready' && (
                  <>
                    {/* ── ROW 1: HERO — 3 columns ── */}
                    <section
                      id="section-hero"
                      className="grid grid-cols-1 lg:grid-cols-12 gap-6"
                      aria-label="Analysis hero"
                    >
                      {/* LEFT (6 cols): Video player + phase timeline */}
                      <div className="lg:col-span-6 space-y-4">
                        <VideoOverlay
                          frames={activeFrames}
                          flaws={activeShot.flaws}
                          impactFrame={impactFrame}
                          totalFrames={totalFrames}
                          replayVideoUrl={activeShot.replay_url}
                          selectedJoint={selectedJoint}
                          onJointSelect={setSelectedJoint}
                          seekToFrame={replayFrame}
                          onFrameChange={setReplayFrame}
                        />
                      </div>

                      {/* MIDDLE (3 cols): Overall Score card */}
                      <div className="lg:col-span-3 space-y-4">
                        <ScoreRing
                          overallScore={activeShot.overall_score}
                          timingScore={activeShot.timing_score}
                          shotType={activeShot.shot_type}
                          confidence={activeShot.confidence}
                          deltaLastSession={activeShot.delta_last_session}
                        />
                      </div>

                      {/* RIGHT (3 cols): Radar chart */}
                      <div className="lg:col-span-3 space-y-4">
                        {activeShot.metrics ? (
                          <RadarChart metrics={activeShot.metrics} />
                        ) : null}
                      </div>
                    </section>

                    {/* ── ROW 2: Flaws + Drills ── */}
                    <section id="section-flaws" className="grid grid-cols-1 lg:grid-cols-2 gap-6" aria-label="Flaws and drills">
                      <div className="space-y-4">
                        {activeShot.flaws.length === 0 ? (
                          <NoFlawsState />
                        ) : (
                          <FlawCard
                            flaws={activeShot.flaws}
                            tips={activeShot.tips}
                            onFixClick={handleFixFlaw}
                            selectedJoint={selectedJoint}
                            onJointSelect={setSelectedJoint}
                          />
                        )}
                      </div>
                      <div id="section-drills" className="space-y-4">
                        <DrillCard
                          tips={activeShot.tips}
                          highlightedDrillFlaw={highlightedDrillFlaw}
                        />
                      </div>
                    </section>

                    {/* ── ROW 3: Metric breakdown + History ── */}
                    <section id="section-row3" className="grid grid-cols-1 lg:grid-cols-2 gap-6" aria-label="Breakdown and history">
                      <div className="space-y-4">
                        {activeShot.metrics ? (
                          <MetricBreakdown metrics={activeShot.metrics} />
                        ) : null}
                      </div>
                      <div className="space-y-4">
                        <HistoryChart
                          shotsHistory={shotsHistory}
                          onSelectShot={handleSelectShot}
                          activeShotId={activeShot.shot_id}
                        />
                      </div>
                    </section>
                  </>
                )}
              </>
            )}

            {/* ══════════════════════════════════════════════════════════════
                COACH DRILLS — drill library & practice plan
                ══════════════════════════════════════════════════════════ */}
            {navActive === 'drills' && (
              <section className="space-y-6" aria-label="Coach Drills">
                <div className="glass-panel rounded-2xl p-6 border border-slate-700/60 shadow-xl">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-xl font-extrabold text-white tracking-tight">Coach Drills</h2>
                      <p className="text-xs text-slate-400 mt-1">Targeted practice prescriptions for every stroke flaw</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(DRILL_LIBRARY).map(([key, drill]) => (
                      <div key={key} className="cv-card p-4 flex flex-col h-full fade-in">
                        <div className="flex items-center gap-2 mb-3">
                          <div className={`cv-icon-wrap ${drill.color}`}>
                            {drill.icon}
                          </div>
                          <span className="cv-badge cv-badge-outline text-[10px]">{drill.duration}</span>
                        </div>
                        <h3 className="text-sm font-bold text-white">{drill.title}</h3>
                        <p className="text-[11px] text-slate-400 leading-relaxed mb-3">{drill.desc}</p>
                        <div className="flex items-center justify-between text-[10px] font-numeric text-slate-400 mt-auto">
                          <span>
                            <Clock className="w-3 h-3 text-slate-500 shrink-0 mr-1" />
                            {drill.reps}
                          </span>
                          <button className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-all">
                            <Play className="w-3 h-3" /> Start
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {activeShot && activeShot.tips.length > 0 && (
                  <div className="glass-panel rounded-2xl p-6 border border-slate-700/60 shadow-xl">
                    <h3 className="text-sm font-bold text-white mb-4">Prescribed for your latest shot</h3>
                    <DrillCard
                      tips={activeShot.tips}
                      highlightedDrillFlaw={highlightedDrillFlaw}
                    />
                  </div>
                )}
              </section>
            )}

            {/* ═════════════════════════════════════════════════════════════
                DASHBOARD — session analytics & history
                ══════════════════════════════════════════════════════════ */}
            {navActive === 'dashboard' && (
              <section className="space-y-6" aria-label="Dashboard">
                <div className="glass-panel rounded-2xl p-6 border border-slate-700/60 shadow-xl">
                  <SessionDashboard
                    shotsHistory={shotsHistory}
                    onSelectShot={handleSelectShot}
                    activeShotId={activeShot?.shot_id}
                  />
                </div>
                <div className="glass-panel rounded-2xl p-6 border border-slate-700/60 shadow-xl">
                  <HistoryChart
                    shotsHistory={shotsHistory}
                    onSelectShot={handleSelectShot}
                    activeShotId={activeShot?.shot_id}
                  />
                </div>
              </section>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

export default App;
