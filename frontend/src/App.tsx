import React, { useState, useEffect, useCallback } from 'react';
import { Download, Play, RotateCcw } from 'lucide-react';
import { CameraAngle, BatterHand, ShotAnalysis, CricketReport, MetricStatus } from './types/cricket';

import { SideNav } from './components/SideNav';
import { UploadDropzone } from './components/UploadDropzone';
import { VideoPlayer } from './components/VideoPlayer';
import { WaveChart } from './components/WaveChart';
import { MetricTile } from './components/MetricTile';
import { StatusBadge } from './components/StatusBadge';
import { FeedbackPanel } from './components/FeedbackPanel';
import { buildMetricTiles, buildPhaseMarkers, groupFeedback, buildWaveSeries } from './services/reportMapper';
import { uploadVideoShot, createBattingSession } from './services/api';

type Page = 'video' | 'drills';
type AppState = 'empty' | 'processing' | 'results' | 'error';

const ANALYSIS_STEPS = [
  { id: 'uploading', label: 'Uploading' },
  { id: 'pose', label: 'Detecting pose' },
  { id: 'shot', label: 'Analysing shot' },
  { id: 'render', label: 'Rendering video' },
] as const;

export const App: React.FC = () => {
  const [page, setPage] = useState<Page>('video');
  const [cameraAngle, setCameraAngle] = useState<CameraAngle>('front_on');
  const [batterHand, setBatterHand] = useState<BatterHand>('right');

  const [appState, setAppState] = useState<AppState>('empty');
  const [errorMessage, setErrorMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const [activeShot, setActiveShot] = useState<ShotAnalysis | null>(null);
  const [cricketReport, setCricketReport] = useState<CricketReport | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  /* Video player state */
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [showSkeleton, setShowSkeleton] = useState(true);

  useEffect(() => {
    createBattingSession('Batter 01', cameraAngle, batterHand)
      .then((s) => setSessionId(s.id))
      .catch(() => {});
  }, [cameraAngle, batterHand]);

  const totalDurationMs = activeShot?.total_frames
    ? activeShot.total_frames * (1000 / 29.75)
    : 0;

  useEffect(() => {
    if (!activeShot?.cricket_report_url) {
      setCricketReport(null);
      return;
    }
    let cancelled = false;
    fetch(activeShot.cricket_report_url)
      .then((r) => {
        if (!r.ok) throw new Error('Report unavailable');
        return r.json();
      })
      .then((data) => { if (!cancelled) setCricketReport(data); })
      .catch(() => { if (!cancelled) setCricketReport(null); });
    return () => { cancelled = true; };
  }, [activeShot?.cricket_report_url]);

  useEffect(() => {
    setIsProcessing(appState === 'processing');
  }, [appState]);

  /* Video time sync while playing */
  useEffect(() => {
    if (!playing || appState !== 'results') return;
    const t = setInterval(() => {
      setCurrentTimeMs((prev) => {
        const next = prev + 100;
        if (next >= totalDurationMs) return totalDurationMs;
        return next;
      });
    }, 100);
    return () => clearInterval(t);
  }, [playing, appState, totalDurationMs]);

  const report = cricketReport;
  const metricTiles = buildMetricTiles(report);
  const markers = buildPhaseMarkers(report);
  const series = buildWaveSeries(report);
  const feedbackItems = groupFeedback(activeShot?.feedback ?? []);
  const currentMarker = markers.find(
    (m) => currentTimeMs >= m.startMs && (m.endMs == null ? true : currentTimeMs <= m.endMs)
  );
  const tooltip = currentMarker && report
    ? {
        phase: currentMarker.label,
        timeMs: currentTimeMs,
        speed: report.timing?.swing_speed_mps ?? 2.5,
      }
    : null;

  const handleReset = () => {
    setAppState('empty');
    setActiveShot(null);
    setCricketReport(null);
    setPreviewUrl(null);
    setErrorMessage('');
    setPlaying(false);
    setCurrentTimeMs(0);
  };

  const handleVideoComplete = (result: ShotAnalysis) => {
    setActiveShot(result);
    setAppState('results');
    setPlaying(true);
  };

  const handleUploadError = (err: string) => {
    setErrorMessage(err);
    setAppState('error');
  };

  const handleUpload = (files: FileList) => {
    const file = files[0];
    const err = validateFile(file);
    if (err) { handleUploadError(err); return; }
    setAppState('processing');
    setErrorMessage('');
    // Keep previewUrl so the original video can be shown in results state
    // as a fallback when the backend cannot generate annotated video.
    uploadVideoShot(file, cameraAngle, batterHand, sessionId)
      .then(handleVideoComplete)
      .catch((e) => handleUploadError(e.message || 'Upload failed'));
  };

  const validateFile = (file: File): string | null => {
    const name = file.name.toLowerCase();
    const okType =
      file.type.includes('mp4') || file.type.includes('quicktime') || file.type.includes('msvideo') ||
      name.endsWith('.mp4') || name.endsWith('.mov') || name.endsWith('.avi');
    if (!okType) return 'Only MP4, MOV and AVI video files are accepted.';
    if (file.size > 200 * 1024 * 1024) return 'File too large — max 200 MB.';
    return null;
  };

  const ratingStatus = (score: number | null | undefined): MetricStatus => {
    if (score == null) return 'not_detected';
    if (score >= 8) return 'good';
    if (score >= 5) return 'medium';
    return 'bad';
  };

  const ratingLabel = (score: number | null | undefined): string => {
    if (score == null) return 'Not rated';
    if (score >= 8) return 'Excellent';
    if (score >= 6) return 'Strong';
    if (score >= 5) return 'Fair';
    return 'Needs work';
  };

  const overallScore = activeShot?.overall_score ?? null;

  return (
    <div className="min-h-screen bg-[#2B2F3A] text-[#AAB0BD] font-sans selection:bg-[#1FB5D6]/30 selection:text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-30 h-14 bg-[#242833] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between px-4 lg:px-6 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[#FFFFFF] tracking-tight">Overview</span>
        </div>
        <div className="flex items-center gap-3">
          <button className="text-xs text-[#6E7486] hover:text-[#FFFFFF] underline underline-offset-2">Help</button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-[8px] border border-[rgba(255,255,255,0.10)] bg-[#323744]/50 text-[11px] text-[#FFFFFF] font-semibold">
            🏏 CricVision Pro
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-56px)]">
        {/* Sidebar */}
        <SideNav
          active={page}
          onSelect={setPage}
          cameraAngle={cameraAngle}
          onCameraAngleChange={setCameraAngle}
          batterHand={batterHand}
          onBatterHandChange={setBatterHand}
        />

        <main className="flex-1 overflow-y-auto bg-[#2B2F3A] p-4 lg:p-6">
          {/* Drills page (minimal, UI-only) */}
          {page === 'drills' && (
            <section className="max-w-5xl mx-auto space-y-6 fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-[#FFFFFF]">Coach Drills</h1>
                  <p className="text-xs text-[#6E7486] mt-1">Targeted practice prescriptions for every stroke flaw.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { id: 'elbow', title: 'Top-Hand Tee Drives', desc: 'Fix collapsed front elbow by leading with the top hand on a batting tee.', duration: '15 min', reps: '3 × 15 drives' },
                  { id: 'head', title: 'Drop-Ball Target Driving', desc: 'Keep head dead-still over the bounce point to stop falling away off-side.', duration: '20 min', reps: '4 × 12 reps' },
                  { id: 'line', title: 'Shadow Step & Freeze', desc: 'Commit front stride toward the line; freeze at impact for 2 seconds.', duration: '15 min', reps: '3 × 20 reps' },
                ].map((d) => (
                  <article key={d.id} className="panel p-4 flex flex-col h-full fade-in">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-8 h-8 rounded-[8px] bg-[#1FB5D6]/15 border border-[#1FB5D6]/30 flex items-center justify-center text-[#1FB5D6]">
                        <Play className="w-4 h-4" />
                      </span>
                      <span className="text-[10px] font-bold border border-[#1FB5D6]/30 text-[#1FB5D6] bg-[#1FB5D6]/10 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                        {d.duration}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-[#FFFFFF]">{d.title}</h3>
                    <p className="text-[12px] text-[#6E7486] leading-relaxed mb-2 flex-1">{d.desc}</p>
                    <div className="mt-auto flex items-center justify-between text-[11px] text-[#6E7486] font-numeric">
                      <span>{d.reps}</span>
                      <button className="text-[#1FB5D6] hover:text-[#5CC8E0] underline underline-offset-2 font-semibold">Start</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Video analysis page */}
          {page === 'video' && (
            <section className="max-w-5xl mx-auto space-y-6 fade-in">
              {/* EMPTY — upload */}
              {appState === 'empty' && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <h1 className="text-2xl font-bold text-[#FFFFFF]">Analyse a shot</h1>
                      <p className="text-xs text-[#6E7486] mt-1">
                        Upload a single-batsman practice clip. Pose overlay and shot HUD are generated automatically.
                      </p>
                    </div>
                  </div>
                  <UploadDropzone
                    onFiles={handleUpload}
                    onPreviewUrl={setPreviewUrl}
                    disabled={isProcessing}
                    error={errorMessage}
                    setError={setErrorMessage}
                  />
                  {previewUrl && (
                    <section className="panel p-4 flex flex-col gap-3 fade-in">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-[#FFFFFF] uppercase tracking-wider">Video preview</h3>
                        <span className="text-[10px] text-[#6E7486] font-numeric">Select a clip to play</span>
                      </div>
                      <VideoPlayer
                        src={previewUrl}
                        landmarks={[]}
                        showSkeleton={false}
                        totalFrames={0}
                        currentTimeMs={currentTimeMs}
                        onSeekTime={setCurrentTimeMs}
                        playbackRate={playbackRate}
                        onRateChange={setPlaybackRate}
                        playing={playing}
                        onTogglePlay={() => setPlaying((p) => !p)}
                        onVideoEnded={() => setPlaying(false)}
                      />
                    </section>
                  )}
                </>
              )}

              {/* ERROR — shown whenever upload fails */}
              {appState === 'error' && (
                <div className="mt-4 panel p-4 border-[#F4533F]/30 bg-[#F4533F]/10 text-[12px] text-[#F4533F] flex items-start gap-2">
                  <RotateCcw className="w-4 h-4 shrink-0 mt-0.5 text-[#F4533F]" />
                  <div>
                    <p className="font-semibold text-[#FFFFFF]">{errorMessage}</p>
                    <button
                      onClick={handleReset}
                      className="mt-2 text-xs text-[#1FB5D6] hover:text-[#5CC8E0] underline underline-offset-1"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              )}

              {/* PROCESSING */}
              {appState === 'processing' && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <h1 className="text-2xl font-bold text-[#FFFFFF]">Analysing your shot</h1>
                      <p className="text-xs text-[#6E7486] mt-1">
                        Pose detection, shot metrics and annotated video are being generated.
                      </p>
                    </div>
                    <button
                      onClick={handleReset}
                      className="text-xs text-[#6E7486] hover:text-[#FFFFFF] underline underline-offset-1"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="space-y-3">
                    {ANALYSIS_STEPS.map((step, i) => (
                      <div key={step.id} className="flex items-center gap-3">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                            i === 0
                              ? 'border-[#1FB5D6] bg-[#1FB5D6]/15 text-[#1FB5D6] animate-pulse'
                              : 'border-[rgba(255,255,255,0.12)] text-[#6E7486]'
                          }`}
                        >
                          {i + 1}
                        </div>
                        <span className={`text-sm font-medium ${i === 0 ? 'text-[#FFFFFF]' : 'text-[#6E7486]'}`}>
                          {step.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="panel p-8 text-center text-[#6E7486] text-sm">
                    Converting video and running analysis — please wait…
                  </div>
                </>
              )}

              {/* RESULTS */}
              {appState === 'results' && activeShot && (
                <>
                  {/* Summary card */}
                  <section className="panel p-5 rounded-[16px] relative overflow-hidden bg-gradient-to-br from-[#323744] to-[#2B2F3A] border border-[rgba(255,255,255,0.08)] fade-in">
                    <div className="absolute inset-0 bg-gradient-to-r from-[#1FB5D6]/10 to-[#7B7FE0]/10 -z-10" />
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-[10px] font-bold text-[#1FB5D6] uppercase tracking-wider mb-1">Overall rating</div>
                        <div className="flex items-end gap-1">
                          <span className="text-4xl font-bold text-[#FFFFFF] font-numeric leading-none">
                            {overallScore == null ? '—' : overallScore.toFixed(1)}
                          </span>
                          <span className="text-xs text-[#6E7486] font-numeric">/ 10</span>
                        </div>
                        <StatusBadge
                          status={ratingStatus(overallScore)}
                          label={ratingLabel(overallScore)}
                        />
                        <p className="text-[11px] text-[#6E7486] mt-2">
                          {activeShot.shot_type ? `Shot: ${activeShot.shot_type.replace(/_/g, ' ')}` : ''}
                          {activeShot.confidence != null ? ` · confidence ${activeShot.confidence.toFixed(0)}%` : ''}
                          {activeShot.total_frames ? ` · ${activeShot.total_frames} frames` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        {activeShot.cricket_report_url && (
                          <a
                            href={activeShot.cricket_report_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] border border-[rgba(255,255,255,0.10)] bg-[#242833]/60 text-[11px] font-semibold text-[#FFFFFF] hover:bg-[#323744] transition-colors"
                          >
                            <Download className="w-3 h-3" /> Download JSON
                          </a>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* Wave chart */}
                  <WaveChart
                    series={series}
                    markers={markers}
                    currentTimeMs={currentTimeMs}
                    totalDurationMs={totalDurationMs}
                    onSeekTime={setCurrentTimeMs}
                    tooltip={tooltip}
                  />

                  {/* Metric tiles grid */}
                  <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-label="Metric tiles">
                    {metricTiles.map((t) => (
                      <MetricTile key={t.key} tile={t} />
                    ))}
                  </section>

                  {/* Videos + Feedback panel */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left: videos (7 cols) */}
                    <div className="lg:col-span-7 space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-[#AAB0BD] uppercase tracking-wider">Skeleton overlay</span>
                        <button
                          onClick={() => setShowSkeleton((s) => !s)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[10px] font-bold border ${
                            showSkeleton
                              ? 'bg-[#1FB5D6] text-[#052E16] border-[#1FB5D6]'
                              : 'border-[rgba(255,255,255,0.08)] text-[#6E7486] bg-[#242833] hover:bg-[#3A3F4E]'
                          }`}
                          aria-pressed={showSkeleton}
                        >
                          <span className="w-3 h-3 rounded-full bg-[#052E16]"></span>
                          {showSkeleton ? 'ON' : 'OFF'}
                        </button>
                      </div>
                      {/* Determine which video to show: annotated > original upload */}
                      {activeShot.pose_video_url && (
                        <section className="panel p-4 flex flex-col gap-3 fade-in">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold text-[#FFFFFF] uppercase tracking-wider">Pose overlay</h3>
                            <span className="text-[10px] text-[#6E7486] font-numeric">MediaPipe · 33 landmarks</span>
                          </div>
                          <VideoPlayer
                            src={activeShot.pose_video_url}
                            landmarks={activeShot.frames}
                            showSkeleton={showSkeleton}
                            totalFrames={activeShot.total_frames ?? 0}
                            currentTimeMs={currentTimeMs}
                            onSeekTime={setCurrentTimeMs}
                            playbackRate={playbackRate}
                            onRateChange={setPlaybackRate}
                            playing={playing}
                            onTogglePlay={() => setPlaying((p) => !p)}
                            onVideoEnded={() => setPlaying(false)}
                          />
                        </section>
                      )}
                      {!activeShot.pose_video_url && activeShot.video_url && (
                        <section className="panel p-4 flex flex-col gap-3 fade-in">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold text-[#FFFFFF] uppercase tracking-wider">Pose overlay</h3>
                            <span className="text-[10px] text-[#6E7486] font-numeric">MediaPipe · 33 landmarks · normalized video</span>
                          </div>
                          <VideoPlayer
                            src={activeShot.video_url}
                            landmarks={activeShot.frames}
                            showSkeleton={showSkeleton}
                            totalFrames={activeShot.total_frames ?? 0}
                            currentTimeMs={currentTimeMs}
                            onSeekTime={setCurrentTimeMs}
                            playbackRate={playbackRate}
                            onRateChange={setPlaybackRate}
                            playing={playing}
                            onTogglePlay={() => setPlaying((p) => !p)}
                            onVideoEnded={() => setPlaying(false)}
                          />
                        </section>
                      )}
                      {!activeShot.pose_video_url && !activeShot.video_url && previewUrl && (
                        <section className="panel p-4 flex flex-col gap-3 fade-in">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold text-[#FFFFFF] uppercase tracking-wider">Pose overlay</h3>
                            <span className="text-[10px] text-[#6E7486] font-numeric">MediaPipe · 33 landmarks · original video</span>
                          </div>
                          <VideoPlayer
                            src={previewUrl}
                            landmarks={activeShot.frames}
                            showSkeleton={showSkeleton}
                            totalFrames={activeShot.total_frames ?? 0}
                            currentTimeMs={currentTimeMs}
                            onSeekTime={setCurrentTimeMs}
                            playbackRate={playbackRate}
                            onRateChange={setPlaybackRate}
                            playing={playing}
                            onTogglePlay={() => setPlaying((p) => !p)}
                            onVideoEnded={() => setPlaying(false)}
                          />
                          <p className="text-[11px] text-[#6E7486] mt-1">
                            Annotated video unavailable — showing original upload with skeleton overlay.
                          </p>
                        </section>
                      )}
                      {activeShot.cricket_video_url && (
                        <section className="panel p-4 flex flex-col gap-3 fade-in">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold text-[#FFFFFF] uppercase tracking-wider">Shot analysis (HUD)</h3>
                            <span className="text-[10px] text-[#6E7486] font-numeric">Weight · contact · phases</span>
                          </div>
                          <VideoPlayer
                            src={activeShot.cricket_video_url}
                            landmarks={activeShot.frames}
                            showSkeleton={showSkeleton}
                            totalFrames={activeShot.total_frames ?? 0}
                            currentTimeMs={currentTimeMs}
                            onSeekTime={setCurrentTimeMs}
                            playbackRate={playbackRate}
                            onRateChange={setPlaybackRate}
                            playing={playing}
                            onTogglePlay={() => setPlaying((p) => !p)}
                            onVideoEnded={() => setPlaying(false)}
                          />
                        </section>
                      )}
                      {!activeShot.cricket_video_url && activeShot.video_url && !activeShot.pose_video_url && (
                        <section className="panel p-4 flex flex-col gap-3 fade-in">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold text-[#FFFFFF] uppercase tracking-wider">Shot analysis (HUD)</h3>
                            <span className="text-[10px] text-[#6E7486] font-numeric">Weight · contact · phases</span>
                          </div>
                          <VideoPlayer
                            src={activeShot.video_url}
                            landmarks={activeShot.frames}
                            showSkeleton={showSkeleton}
                            totalFrames={activeShot.total_frames ?? 0}
                            currentTimeMs={currentTimeMs}
                            onSeekTime={setCurrentTimeMs}
                            playbackRate={playbackRate}
                            onRateChange={setPlaybackRate}
                            playing={playing}
                            onTogglePlay={() => setPlaying((p) => !p)}
                            onVideoEnded={() => setPlaying(false)}
                          />
                        </section>
                      )}
                      {!activeShot.cricket_video_url && !activeShot.video_url && previewUrl && !activeShot.pose_video_url && (
                        <section className="panel p-4 flex flex-col gap-3 fade-in">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold text-[#FFFFFF] uppercase tracking-wider">Shot analysis (HUD)</h3>
                            <span className="text-[10px] text-[#6E7486] font-numeric">Weight · contact · phases</span>
                          </div>
                          <VideoPlayer
                            src={previewUrl}
                            landmarks={activeShot.frames}
                            showSkeleton={showSkeleton}
                            totalFrames={activeShot.total_frames ?? 0}
                            currentTimeMs={currentTimeMs}
                            onSeekTime={setCurrentTimeMs}
                            playbackRate={playbackRate}
                            onRateChange={setPlaybackRate}
                            playing={playing}
                            onTogglePlay={() => setPlaying((p) => !p)}
                            onVideoEnded={() => setPlaying(false)}
                          />
                          <p className="text-[11px] text-[#6E7486] mt-1">
                            Annotated video unavailable — showing original upload with skeleton overlay.
                          </p>
                        </section>
                      )}
                      {!activeShot.pose_video_url && !activeShot.cricket_video_url && !activeShot.video_url && !previewUrl && (
                        <div className="panel p-12 text-center">
                          <span className="text-[12px] text-[#6E7486]">No video available.</span>
                        </div>
                      )}
                    </div>

                    {/* Right: feedback panel (5 cols) */}
                    <div className="lg:col-span-5">
                      <FeedbackPanel items={feedbackItems} />
                    </div>
                  </div>

                  {/* Collapsible raw report */}
                  <details className="panel p-3 fade-in text-xs">
                    <summary className="flex items-center gap-2 cursor-pointer text-[#6E7486] font-semibold">
                      Raw report (JSON)
                    </summary>
                    <pre className="mt-2 p-3 rounded-[8px] bg-[#161920] border border-[rgba(255,255,255,0.04)] text-[10px] text-[#6E7486] overflow-x-auto max-h-64 font-numeric">
                      {JSON.stringify(report ?? activeShot?.feedback ?? null, null, 2)}
                    </pre>
                  </details>
                </>
              )}

              {/* ERROR */}
              {appState === 'error' && !activeShot && (
                <div className="panel p-8 text-center">
                  <RotateCcw className="w-10 h-10 text-[#F4533F] mx-auto mb-3 animate-spin" />
                  <h2 className="text-lg font-bold text-[#FFFFFF]">Upload failed</h2>
                  <p className="text-xs text-[#6E7486] mt-1">{errorMessage || 'Please try again.'}</p>
                  <button onClick={handleReset} className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] border border-[#1FB5D6] bg-[#1FB5D6] text-[#052E16] font-bold text-sm hover:bg-[#5CC8E0] transition-colors">
                    <RotateCcw className="w-3 h-3" /> Try again
                  </button>
                </div>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
