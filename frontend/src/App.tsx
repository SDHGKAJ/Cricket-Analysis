import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, RotateCcw, Timer } from 'lucide-react';
import { BatterHand, CameraAngle, CricketReport, MetricStatus, ShotAnalysis } from './types/cricket';

import { AppHeader, Page } from './components/AppHeader';
import { UploadDropzone, SubjectPick } from './components/UploadDropzone';
import { VideoPlayer, SeekRequest } from './components/VideoPlayer';
import { PhaseTimeline } from './components/PhaseTimeline';
import { BallTrackingPanel } from './components/BallTrackingPanel';
import { MetricTile } from './components/MetricTile';
import { StatusBadge } from './components/StatusBadge';
import { FeedbackPanel } from './components/FeedbackPanel';
import { RecentAnalyses } from './components/RecentAnalyses';
import { buildMetricTiles, buildPhaseMarkers, groupFeedback } from './services/reportMapper';
import { createBattingSession, recalibrateTrajectory, uploadVideoShot } from './services/api';
import { HawkEyePanel, HawkView } from './components/HawkEyePanel';
import { drawCalibration, drawPitch3D, drawVideoOverlay } from './services/hawkeye';
import type { Calibration, Trajectory } from './types/trajectory';

type AppState = 'empty' | 'processing' | 'results' | 'error';
type ViewId = 'pose' | 'hud' | 'original' | 'hawkeye';

interface VideoView {
  id: ViewId;
  label: string;
  hint: string;
  src: string;
}

const DRILLS = [
  { id: 'elbow', title: 'Top-hand tee drives', desc: 'Fixes a collapsing front elbow: lead with the top hand off a batting tee.', duration: '15 min', reps: '3 × 15 drives' },
  { id: 'head', title: 'Drop-ball target driving', desc: 'Keep your head still over the bounce point so you stop falling to the off side.', duration: '20 min', reps: '4 × 12 reps' },
  { id: 'line', title: 'Shadow step and freeze', desc: 'Stride toward the line of the ball and hold the impact position for 2 seconds.', duration: '15 min', reps: '3 × 20 reps' },
];

function ratingStatus(score: number | null): MetricStatus {
  if (score == null) return 'not_detected';
  if (score >= 8) return 'good';
  if (score >= 5) return 'medium';
  return 'bad';
}

function ratingLabel(score: number | null): string {
  if (score == null) return 'Not rated';
  if (score >= 8) return 'Excellent';
  if (score >= 6) return 'Strong';
  if (score >= 5) return 'Fair';
  return 'Needs work';
}

const Segmented = <T extends string>({
  label, value, options, onChange,
}: { label: string; value: T; options: Array<{ v: T; label: string }>; onChange: (v: T) => void }) => (
  <div className="flex flex-col gap-1.5">
    <span className="eyebrow">{label}</span>
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  </div>
);

export const App: React.FC = () => {
  const [page, setPage] = useState<Page>('video');
  const [cameraAngle, setCameraAngle] = useState<CameraAngle>('front_on');
  const [batterHand, setBatterHand] = useState<BatterHand>('right');

  const [appState, setAppState] = useState<AppState>('empty');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const [shot, setShot] = useState<ShotAnalysis | null>(null);
  const [report, setReport] = useState<CricketReport | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [batterPicked, setBatterPicked] = useState(false);

  /* Player state shared across views */
  const [view, setView] = useState<ViewId>('pose');
  const [timeMs, setTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [aspect, setAspect] = useState(16 / 9);
  const [rate, setRate] = useState(1);
  const [seek, setSeek] = useState<SeekRequest | null>(null);
  const [liveSkeleton, setLiveSkeleton] = useState(false);

  /* Hawk-Eye */
  const [traj, setTraj] = useState<Trajectory | null>(null);
  const [trajLoading, setTrajLoading] = useState(false);
  const [hawkView, setHawkView] = useState<HawkView>('video');
  const [calibrating, setCalibrating] = useState(false);
  const [calibPoints, setCalibPoints] = useState<Array<[number, number]>>([]);
  const [calibError, setCalibError] = useState<string | null>(null);

  useEffect(() => {
    if (!shot?.cricket_report_url) { setReport(null); return; }
    let cancelled = false;
    fetch(shot.cricket_report_url)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { if (!cancelled) setReport(d); })
      .catch(() => { if (!cancelled) setReport(null); });
    return () => { cancelled = true; };
  }, [shot?.cricket_report_url]);

  useEffect(() => {
    if (!shot?.trajectory_url) { setTraj(null); return; }
    let cancelled = false;
    setTrajLoading(true);
    fetch(shot.trajectory_url)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { if (!cancelled) setTraj(d); })
      .catch(() => { if (!cancelled) setTraj(null); })
      .finally(() => { if (!cancelled) setTrajLoading(false); });
    return () => { cancelled = true; };
  }, [shot?.trajectory_url]);

  useEffect(() => {
    if (appState !== 'processing') return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 500);
    return () => clearInterval(t);
  }, [appState, startedAt]);

  const views: VideoView[] = useMemo(() => {
    if (!shot) return [];
    const v: VideoView[] = [];
    if (shot.pose_video_url) v.push({ id: 'pose', label: 'Pose + ball', hint: 'Skeleton and ball path', src: shot.pose_video_url });
    if (shot.cricket_video_url) v.push({ id: 'hud', label: 'Shot HUD', hint: 'Weight, contact and phases', src: shot.cricket_video_url });
    const original = shot.video_url ?? previewUrl;
    if (original) v.push({ id: 'original', label: 'Original', hint: 'Your clip', src: original });
    if (original && shot.trajectory_url) {
      v.push({ id: 'hawkeye', label: 'Hawk-Eye', hint: 'Ball path, bounce and stump prediction', src: original });
    }
    return v;
  }, [shot, previewUrl]);

  const activeView = views.find((v) => v.id === view) ?? views[0];

  const tiles = buildMetricTiles(report);
  const markers = buildPhaseMarkers(report);
  // Scored flaws (with the coach's fix + drill) lead the feedback, then the per-metric notes.
  const flawItems = (shot?.flaws ?? []).map((f) => {
    const tip = shot?.tips?.find((t) => t.flaw === f.name);
    const detail = tip ? ` — ${tip.fix}${tip.drill ? ` Drill: ${tip.drill}.` : ''}` : '';
    return { status: (f.severity === 'low' ? 'medium' : 'bad') as MetricStatus, line: `${f.name}${detail}` };
  });
  const feedback = [...flawItems, ...groupFeedback(shot?.feedback ?? report?.feedback ?? [])];
  const score = shot?.overall_score ?? null;
  const ballTracking = report?.ball_tracking ?? shot?.ball_tracking ?? null;
  // The clip's real frame count (ball tracking sees every frame); total_frames can be a sample.
  const videoFrames = ballTracking?.frames_total || shot?.total_frames || 0;

  const seekTo = useCallback((ms: number) => setSeek({ ms, id: Date.now() }), []);
  const switchView = (id: ViewId) => {
    setSeek(null);
    setView(id);
    if (id !== 'hawkeye') setCalibrating(false);
  };

  /* Hawk-Eye overlay: redrawn every animation frame by the player */
  const isHawk = activeView?.id === 'hawkeye';
  const hawkOverlay = useMemo(() => {
    if (!isHawk) return undefined;
    return (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
      if (hawkView === 'pitch' && !calibrating) drawPitch3D(ctx, w, h, t, traj);
      else if (traj) drawVideoOverlay(ctx, w, h, t, traj);
      if (calibrating) drawCalibration(ctx, w, h, calibPoints);
    };
  }, [isHawk, hawkView, traj, calibrating, calibPoints]);

  const submitCalibration = (cal: Calibration | null) => {
    if (!traj?.id) return;
    setCalibError(null);
    recalibrateTrajectory(traj.id, cal, batterHand)
      .then((t) => {
        setTraj(t);
        const ignored = t.notes.find((n) => n.startsWith('Calibration ignored'));
        if (cal && ignored) setCalibError(ignored);
      })
      .catch((e) => setCalibError(e?.message || 'Calibration failed'));
  };

  const onCalibClick = (x: number, y: number) => {
    const pts = [...calibPoints, [x, y] as [number, number]];
    if (pts.length < 5) { setCalibPoints(pts); return; }
    setCalibrating(false);
    setCalibPoints([]);
    submitCalibration({ batterEnd: [pts[0], pts[1]], bowlerEnd: [pts[2], pts[3]], stumpTop: pts[4] });
  };

  const reset = () => {
    setAppState('empty');
    setShot(null);
    setReport(null);
    setErrorMessage(null);
    setTimeMs(0);
    setDurationMs(0);
    setSeek(null);
    setTraj(null);
    setCalibrating(false);
    setCalibPoints([]);
    setCalibError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const analyze = (file: File, subject: SubjectPick | null = null) => {
    setBatterPicked(!!subject);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file)); // fallback if the server can't render video
    setFileName(file.name);
    setStartedAt(Date.now());
    setElapsed(0);
    setErrorMessage(null);
    setAppState('processing');
    // Create the session only when a clip is actually analysed (not on every page load).
    createBattingSession('Batter 01', cameraAngle, batterHand)
      .then((sess) => sess.id)
      .catch(() => undefined)
      .then((sessionId) => uploadVideoShot(file, cameraAngle, batterHand, sessionId, subject))
      .then((res) => {
        setShot(res);
        setView(res.pose_video_url ? 'pose' : res.cricket_video_url ? 'hud' : 'original');
        setTimeMs(0);
        setSeek(null);
        setAppState('results');
        window.scrollTo({ top: 0 });
      })
      .catch((e) => {
        setErrorMessage(e?.message || 'Upload failed');
        setAppState('error');
      });
  };

  return (
    <div className="min-h-screen bg-bg text-body">
      <AppHeader page={page} onPage={setPage} />

      <main className="max-w-6xl mx-auto px-4 pt-5 pb-28 sm:pb-12">
        {page === 'drills' && (
          <section className="space-y-5 animate-fade-in">
            <div>
              <h1 className="num text-4xl font-semibold">Drills</h1>
              <p className="text-sm text-mute mt-1">Short practice routines for the most common batting flaws.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {DRILLS.map((d) => (
                <article key={d.id} className="card p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-xs text-mute">
                    <Timer className="w-3.5 h-3.5" /> {d.duration} · {d.reps}
                  </div>
                  <h3 className="text-base font-semibold">{d.title}</h3>
                  <p className="text-[13px] leading-snug flex-1">{d.desc}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {page === 'video' && appState === 'empty' && (
          <section className="space-y-5 animate-fade-in">
            <div>
              <h1 className="num text-4xl sm:text-5xl font-semibold leading-none">Analyse a shot</h1>
              <p className="text-sm text-mute mt-2 max-w-xl">
                Upload a clip of one batter. You'll get pose and ball tracking, stroke phases, six technique metrics and coaching notes.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                <div className="card p-4 flex flex-wrap gap-x-6 gap-y-3">
                  <Segmented<CameraAngle>
                    label="Camera angle"
                    value={cameraAngle}
                    onChange={setCameraAngle}
                    options={[{ v: 'front_on', label: 'Front-on' }, { v: 'side_on', label: 'Side-on' }]}
                  />
                  <Segmented<BatterHand>
                    label="Batting hand"
                    value={batterHand}
                    onChange={setBatterHand}
                    options={[{ v: 'right', label: 'Right' }, { v: 'left', label: 'Left' }]}
                  />
                </div>
                <UploadDropzone onAnalyze={analyze} error={errorMessage} setError={setErrorMessage} />
              </div>
              <div className="space-y-4">
                <section className="card p-4">
                  <h3 className="eyebrow mb-2">For the best results</h3>
                  <ul className="text-[13px] space-y-1.5 list-disc pl-4 marker:text-mute">
                    <li>Keep the whole body in frame, head to feet.</li>
                    <li>Hold the camera still, ideally on a tripod.</li>
                    <li>Film in good light; 60 fps helps ball tracking.</li>
                    <li>One shot per clip, from stance to follow-through.</li>
                  </ul>
                </section>
                <RecentAnalyses />
              </div>
            </div>
          </section>
        )}

        {page === 'video' && appState === 'processing' && (
          <section className="card p-8 sm:p-12 text-center max-w-xl mx-auto animate-fade-in" aria-live="polite">
            <Loader2 className="w-10 h-10 mx-auto text-accent animate-spin" />
            <h1 className="num text-3xl font-semibold mt-4">Analysing your shot</h1>
            <p className="text-sm text-mute mt-1 truncate">{fileName}</p>
            <p className="num text-2xl text-ink mt-4">{elapsed}s</p>
            <p className="text-[13px] mt-4 leading-relaxed">
              Converting the video, finding the body pose and the ball, measuring the stroke and rendering the annotated clips.
              Longer clips take longer.
            </p>
          </section>
        )}

        {page === 'video' && appState === 'error' && (
          <section className="card p-8 text-center max-w-xl mx-auto animate-fade-in" role="alert">
            <h1 className="num text-3xl font-semibold">Analysis failed</h1>
            <p className="text-sm text-bad mt-2">{errorMessage}</p>
            <p className="text-[13px] text-mute mt-2">Check that the backend is running, then try again.</p>
            <button className="btn btn-primary mt-5" onClick={reset}>
              <RotateCcw className="w-4 h-4" /> Try again
            </button>
          </section>
        )}

        {page === 'video' && appState === 'results' && shot && (
          <div className="space-y-4 animate-fade-in">
            {/* Score hero */}
            <section className="card p-4 sm:p-5 flex flex-wrap items-center gap-x-6 gap-y-4">
              <div className="flex items-end gap-2">
                <span className="num text-[64px] sm:text-[76px] font-semibold text-ink leading-[0.85]">
                  {score == null ? '—' : score.toFixed(1)}
                </span>
                <span className="num text-xl text-mute mb-1">/10</span>
              </div>
              <div className="flex-1 min-w-[200px] space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={ratingStatus(score)} label={ratingLabel(score)} />
                  {shot.shot_type && (shot.confidence == null || shot.confidence >= 40) ? (
                    <span className="text-lg font-semibold text-ink capitalize">
                      {shot.shot_type.replace(/_/g, ' ')}
                      {shot.confidence != null && shot.confidence < 60 && (
                        <span className="text-sm font-normal text-mute normal-case"> · probably</span>
                      )}
                    </span>
                  ) : shot.shot_type ? (
                    // Below 40% the classifier is close to guessing (1 in 7 is 14%) — don't show a name.
                    <span className="text-lg font-semibold text-mute" title={`Classifier guess: ${shot.shot_type.replace(/_/g, ' ')}`}>
                      Shot type unclear
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-mute">
                  {[
                    shot.confidence != null ? `${shot.confidence.toFixed(0)}% shot-type confidence` : null,
                    videoFrames ? `${videoFrames} frames` : null,
                    cameraAngle === 'front_on' ? 'front-on' : 'side-on',
                    `${batterHand}-handed`,
                    batterPicked ? 'batter picked by you' : null,
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                {shot.cricket_report_url && (
                  <a className="btn btn-ghost flex-1 sm:flex-none" href={shot.cricket_report_url} target="_blank" rel="noreferrer">
                    <Download className="w-4 h-4" /> Report
                  </a>
                )}
                <button className="btn btn-primary flex-1 sm:flex-none" onClick={reset}>New clip</button>
              </div>
            </section>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
              <div className="space-y-4 min-w-0">
                {/* Video stage: one player, switchable views */}
                <section className="card" aria-label="Video">
                  <div className="flex flex-wrap items-center gap-2 p-2 border-b border-line">
                    <div className="seg overflow-x-auto max-w-full" role="tablist" aria-label="Video view">
                      {views.map((v) => (
                        <button key={v.id} role="tab" aria-selected={activeView?.id === v.id} onClick={() => switchView(v.id)}>
                          {v.label}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs text-mute hidden md:inline">{activeView?.hint}</span>
                    {activeView?.id === 'original' && (shot.frames?.length ?? 0) > 0 && (
                      <label className="ml-auto flex items-center gap-2 text-xs text-body cursor-pointer min-h-[34px] px-1">
                        <input type="checkbox" className="accent-[var(--accent)] w-4 h-4" checked={liveSkeleton} onChange={(e) => setLiveSkeleton(e.target.checked)} />
                        Joint angles
                      </label>
                    )}
                  </div>
                  {activeView ? (
                    <VideoPlayer
                      key={activeView.src}
                      src={activeView.src}
                      totalFrames={videoFrames}
                      initialTimeMs={timeMs}
                      seek={seek}
                      onTime={setTimeMs}
                      onDuration={setDurationMs}
                      onAspect={setAspect}
                      playbackRate={rate}
                      onRateChange={setRate}
                      landmarks={shot.frames}
                      showSkeleton={activeView.id === 'original' && liveSkeleton}
                      overlay={hawkOverlay}
                      onFrameClick={isHawk && calibrating ? onCalibClick : undefined}
                    />
                  ) : (
                    <p className="p-10 text-center text-sm text-mute">No video was returned for this clip.</p>
                  )}
                </section>

                {isHawk && (
                  <HawkEyePanel
                    traj={traj}
                    loading={trajLoading}
                    view={hawkView}
                    onView={setHawkView}
                    calibrating={calibrating}
                    calibStep={calibPoints.length}
                    calibError={calibError}
                    onStartCalibration={() => { setHawkView('video'); setCalibPoints([]); setCalibError(null); setCalibrating(true); }}
                    onUndoPoint={() => setCalibPoints((p) => p.slice(0, -1))}
                    onCancelCalibration={() => { setCalibrating(false); setCalibPoints([]); }}
                    onClearCalibration={() => submitCalibration(null)}
                  />
                )}

                <PhaseTimeline markers={markers} durationMs={durationMs} timeMs={timeMs} onSeek={seekTo} />
              </div>

              <div className="space-y-4 min-w-0">
                <FeedbackPanel items={feedback} />
                <BallTrackingPanel
                  tracking={ballTracking}
                  frames={shot.frames ?? []}
                  aspect={aspect}
                  timeMs={timeMs}
                  durationMs={durationMs}
                  contactFrame={report?.ball_contact?.frame ?? null}
                  onSeek={seekTo}
                />
              </div>
            </div>

            {tiles.length > 0 && (
              <section aria-label="Technique metrics" className="space-y-3 pt-2">
                <h2 className="num text-2xl font-semibold">Technique</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {tiles.map((t) => <MetricTile key={t.key} tile={t} />)}
                </div>
              </section>
            )}

            <div className="grid gap-4 lg:grid-cols-2 items-start">
              <RecentAnalyses refreshKey={shot.shot_id} />
              <details className="card p-4 text-xs">
                <summary className="cursor-pointer eyebrow">Raw report (JSON)</summary>
                <pre className="mt-3 p-3 rounded-lg bg-bg border border-line text-[11px] text-mute overflow-auto max-h-72">
                  {JSON.stringify(report ?? shot.feedback ?? null, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
