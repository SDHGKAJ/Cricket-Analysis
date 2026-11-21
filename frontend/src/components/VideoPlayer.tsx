import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { FrameLandmarks } from '../types/cricket';

/**
 * VideoPlayer — one player for every view.
 *  - sizes itself to the clip's real aspect ratio (portrait phone clips stay tall)
 *  - touch-friendly controls: tap video to play/pause, frame step, 0.25/0.5/1x
 *  - optional live skeleton overlay drawn from backend landmarks
 *  - reports playback time to the parent (throttled) and accepts external seeks
 */
export interface SeekRequest {
  ms: number;
  id: number; // bump to re-trigger a seek to the same time
}

interface VideoPlayerProps {
  src: string;
  totalFrames: number;
  initialTimeMs?: number;
  seek?: SeekRequest | null;
  onTime: (ms: number) => void;
  onDuration?: (ms: number) => void;
  onAspect?: (aspect: number) => void;
  playbackRate: number;
  onRateChange: (rate: number) => void;
  landmarks?: FrameLandmarks[];
  showSkeleton?: boolean;
  autoPlay?: boolean;
}

const SPEEDS = [0.25, 0.5, 1];

const L_SHOULDER = 11, R_SHOULDER = 12, L_ELBOW = 13, R_ELBOW = 14,
  L_WRIST = 15, R_WRIST = 16, L_HIP = 23, R_HIP = 24,
  L_KNEE = 25, R_KNEE = 26, L_ANKLE = 27, R_ANKLE = 28;

const LIMBS: [number, number][] = [
  [L_SHOULDER, R_SHOULDER],
  [L_SHOULDER, L_ELBOW], [L_ELBOW, L_WRIST],
  [R_SHOULDER, R_ELBOW], [R_ELBOW, R_WRIST],
  [L_SHOULDER, L_HIP], [R_SHOULDER, R_HIP],
  [L_HIP, R_HIP],
  [L_HIP, L_KNEE], [L_KNEE, L_ANKLE],
  [R_HIP, R_KNEE], [R_KNEE, R_ANKLE],
];

const JOINT_ANGLES = [
  { pts: [L_SHOULDER, L_ELBOW, L_WRIST], label: 'L elbow' },
  { pts: [R_SHOULDER, R_ELBOW, R_WRIST], label: 'R elbow' },
  { pts: [L_HIP, L_KNEE, L_ANKLE], label: 'L knee' },
  { pts: [R_HIP, R_KNEE, R_ANKLE], label: 'R knee' },
];

interface Pt { x: number; y: number; visibility?: number }

function angleAt(a: Pt, b: Pt, c: Pt): number | null {
  const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
  const n1 = Math.hypot(v1x, v1y), n2 = Math.hypot(v2x, v2y);
  if (n1 < 1e-6 || n2 < 1e-6) return null;
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (n1 * n2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function nearestFrame(frames: FrameLandmarks[], ms: number): FrameLandmarks | null {
  let best: FrameLandmarks | null = null;
  let diff = Infinity;
  for (const f of frames) {
    const d = Math.abs(f.timestamp_ms - ms);
    if (d < diff) { diff = d; best = f; }
  }
  return best;
}

const fmt = (ms: number) => (ms / 1000).toFixed(2);

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  totalFrames,
  initialTimeMs = 0,
  seek,
  onTime,
  onDuration,
  onAspect,
  playbackRate,
  onRateChange,
  landmarks,
  showSkeleton = false,
  autoPlay = true,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastReport = useRef(0);

  const [paused, setPaused] = useState(true);
  const [durationMs, setDurationMs] = useState(0);
  const [timeMs, setTimeMs] = useState(initialTimeMs);
  const [aspect, setAspect] = useState(16 / 9);
  const [error, setError] = useState<string | null>(null);

  const drawOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    if (!showSkeleton || !landmarks?.length) return;

    const fr = nearestFrame(landmarks, video.currentTime * 1000);
    if (!fr) return;
    const pts = fr.landmarks as Pt[];
    const vis = (p?: Pt) => !!p && (p.visibility ?? 1) >= 0.15;
    const scale = Math.max(1, Math.min(w, h) / 480);

    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(91, 140, 255, 0.9)';
    ctx.lineWidth = 3.5 * scale;
    for (const [i, j] of LIMBS) {
      const a = pts[i], b = pts[j];
      if (!vis(a) || !vis(b)) continue;
      ctx.beginPath();
      ctx.moveTo(a.x * w, a.y * h);
      ctx.lineTo(b.x * w, b.y * h);
      ctx.stroke();
    }
    for (const p of pts) {
      if (!vis(p)) continue;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 3 * scale, 0, Math.PI * 2);
      ctx.fillStyle = '#F3F5F8';
      ctx.fill();
    }
    ctx.font = `600 ${11 * scale}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const { pts: [ai, bi, ci], label } of JOINT_ANGLES) {
      const a = pts[ai], b = pts[bi], c = pts[ci];
      if (!vis(a) || !vis(b) || !vis(c)) continue;
      const ang = angleAt(a, b, c);
      if (ang == null) continue;
      const text = `${label} ${Math.round(ang)}°`;
      const tw = ctx.measureText(text).width + 10 * scale;
      const x = b.x * w + 14 * scale + tw / 2, y = b.y * h;
      ctx.fillStyle = 'rgba(13, 16, 21, 0.75)';
      ctx.fillRect(x - tw / 2, y - 9 * scale, tw, 18 * scale);
      ctx.fillStyle = '#F3F5F8';
      ctx.fillText(text, x, y);
    }
  }, [landmarks, showSkeleton]);

  const report = useCallback((force = false) => {
    const video = videoRef.current;
    if (!video) return;
    const ms = video.currentTime * 1000;
    const now = performance.now();
    if (force || now - lastReport.current > 60) {
      lastReport.current = now;
      setTimeMs(ms);
      onTime(ms);
    }
  }, [onTime]);

  /* Animation loop while playing: smooth overlay + playhead */
  const tick = useCallback(() => {
    drawOverlay();
    report();
    rafRef.current = requestAnimationFrame(tick);
  }, [drawOverlay, report]);

  useEffect(() => {
    if (paused) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      drawOverlay();
      report(true);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [paused, tick, drawOverlay, report]);

  useEffect(() => { drawOverlay(); }, [drawOverlay]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  /* External seek (phase timeline, ball strip) */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !seek) return;
    video.currentTime = seek.ms / 1000;
    report(true);
  }, [seek, report]);

  const onLoaded = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.videoWidth && video.videoHeight) {
      const a = video.videoWidth / video.videoHeight;
      setAspect(a);
      onAspect?.(a);
    }
    const d = video.duration * 1000;
    if (Number.isFinite(d)) { setDurationMs(d); onDuration?.(d); }
    video.playbackRate = playbackRate;
    if (initialTimeMs > 0 && initialTimeMs < d) video.currentTime = initialTimeMs / 1000;
    if (autoPlay) video.play().catch(() => {});
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) video.play().catch(() => {});
    else video.pause();
  };

  const fps = durationMs > 0 && totalFrames > 1 ? totalFrames / (durationMs / 1000) : 30;
  const stepFrame = (dir: 1 | -1) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + dir / fps));
  };

  const onScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Number(e.target.value) / 1000;
    report(true);
  };

  /* Keyboard: space = play/pause, arrows = frame step */
  const onKey = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); stepFrame(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); stepFrame(-1); }
  };

  const frameNo = Math.min(Math.max(totalFrames - 1, 0), Math.round((timeMs / 1000) * fps));
  const fill = durationMs > 0 ? `${(timeMs / durationMs) * 100}%` : '0%';

  return (
    <div className="flex flex-col" onKeyDown={onKey}>
      <div className="bg-black rounded-t-[13px] overflow-hidden flex justify-center">
        <div
          className="relative w-full"
          style={{ aspectRatio: String(aspect), maxWidth: `calc(min(68vh, 620px) * ${aspect})` }}
        >
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-bad">
              {error}
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                src={src}
                playsInline
                muted
                preload="auto"
                onLoadedMetadata={onLoaded}
                onPlay={() => setPaused(false)}
                onPause={() => setPaused(true)}
                onEnded={() => setPaused(true)}
                onSeeked={() => { drawOverlay(); report(true); }}
                onError={() => setError('This video could not be played. Try an H.264 MP4.')}
                onClick={togglePlay}
                className="absolute inset-0 w-full h-full cursor-pointer"
                aria-label="Shot video — click to play or pause"
              />
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" />
              {paused && (
                <button
                  onClick={togglePlay}
                  className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-black/55 backdrop-blur flex items-center justify-center text-white border border-white/20"
                  aria-label="Play"
                >
                  <Play className="w-7 h-7 translate-x-0.5" fill="currentColor" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 border-t border-line bg-raised rounded-b-[13px]">
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.round(durationMs))}
          step={1}
          value={Math.round(timeMs)}
          onChange={onScrub}
          style={{ ['--fill' as string]: fill }}
          className="order-first basis-full sm:order-none sm:basis-0 sm:flex-1 w-full"
          aria-label="Scrub video"
        />
        <div className="flex items-center gap-1 sm:order-first">
          <button className="btn btn-ghost btn-icon border-0" onClick={() => stepFrame(-1)} aria-label="Previous frame" title="Previous frame (←)">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button className="btn btn-primary btn-icon" onClick={togglePlay} aria-label={paused ? 'Play' : 'Pause'} title="Play / pause (space)">
            {paused ? <Play className="w-4 h-4" fill="currentColor" /> : <Pause className="w-4 h-4" fill="currentColor" />}
          </button>
          <button className="btn btn-ghost btn-icon border-0" onClick={() => stepFrame(1)} aria-label="Next frame" title="Next frame (→)">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <div className="num text-[15px] text-body whitespace-nowrap">
          <span className="text-ink">{fmt(timeMs)}</span> / {fmt(durationMs)} s
          {totalFrames > 0 && <span className="text-mute ml-2">F{frameNo}</span>}
        </div>
        <div className="seg ml-auto" role="group" aria-label="Playback speed">
          {SPEEDS.map((r) => (
            <button key={r} aria-pressed={r === playbackRate} onClick={() => onRateChange(r)}>
              {r}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
