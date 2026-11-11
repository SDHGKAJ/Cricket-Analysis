import React, { useRef, useCallback, useEffect, useState } from 'react';
import { FrameLandmarks } from '../types/cricket';

/**
 * VideoPlayer — shared custom player:
 *   play/pause · speed 0.25x / 0.5x / 1x · frame step · scrubber
 *   optional canvas skeleton overlay synced to playback time
 * Caller owns frame/time state.
 */
interface VideoPlayerProps {
  src: string | null;
  totalFrames: number;
  currentTimeMs: number;
  onSeekTime: (ms: number) => void;
  playbackRate: number;
  onRateChange: (rate: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
  className?: string;
  /** Called when the video reaches its end */
  onVideoEnded?: () => void;
  /** Per-frame pose landmarks from backend (normalised 0–1 coords) */
  landmarks?: FrameLandmarks[];
  /** Show/hide the skeleton overlay */
  showSkeleton?: boolean;
}

const SPEEDS = [0.25, 0.5, 1];

function timeToFrame(currentTime: number, duration: number, total: number): number {
  if (!duration || total <= 1) return 0;
  return Math.round((currentTime / duration) * (total - 1));
}

/* ───────────────────────────────────────────────────────────────────────────
   MediaPipe pose landmark indices (33 points, normalised 0–1)
   0 nose, 11 L-shoulder, 12 R-shoulder,
   13 L-elbow, 14 R-elbow, 15 L-wrist, 16 R-wrist,
   23 L-hip, 24 R-hip, 25 L-knee, 26 R-knee, 27 L-ankle, 28 R-ankle
   ─────────────────────────────────────────────────────────────────────────── */
const L_SHOULDER = 11, R_SHOULDER = 12, L_ELBOW = 13, R_ELBOW = 14,
      L_WRIST = 15, R_WRIST = 16, L_HIP = 23, R_HIP = 24,
      L_KNEE = 25, R_KNEE = 26, L_ANKLE = 27, R_ANKLE = 28;

const LIMBS: [number, number][] = [
  [L_SHOULDER, R_SHOULDER],       // shoulders
  [L_SHOULDER, L_ELBOW], [L_ELBOW, L_WRIST],   // left arm
  [R_SHOULDER, R_ELBOW], [R_ELBOW, R_WRIST],   // right arm
  [L_SHOULDER, L_HIP], [R_SHOULDER, R_HIP],    // torso
  [L_HIP, R_HIP],                             // hip line
  [L_HIP, L_KNEE], [L_KNEE, L_ANKLE],         // left leg
  [R_HIP, R_KNEE], [R_KNEE, R_ANKLE],         // right leg
];

/* Joint triples [A, B, C] — angle measured at B */
const JOINT_ANGLES = [
  { id: 'l-elbow', pts: [L_SHOULDER, L_ELBOW, L_WRIST], label: 'L elbow' },
  { id: 'r-elbow', pts: [R_SHOULDER, R_ELBOW, R_WRIST], label: 'R elbow' },
  { id: 'l-shoulder', pts: [L_HIP, L_SHOULDER, L_ELBOW], label: 'L shoulder' },
  { id: 'r-shoulder', pts: [R_HIP, R_SHOULDER, R_ELBOW], label: 'R shoulder' },
  { id: 'l-hip', pts: [L_SHOULDER, L_HIP, L_KNEE], label: 'L hip' },
  { id: 'r-hip', pts: [R_SHOULDER, R_HIP, R_KNEE], label: 'R hip' },
  { id: 'l-knee', pts: [L_HIP, L_KNEE, L_ANKLE], label: 'L knee' },
  { id: 'r-knee', pts: [R_HIP, R_KNEE, R_ANKLE], label: 'R knee' },
];

interface Point { x: number; y: number; visibility?: number }

/** Angle at point B between A-B-C, in degrees. */
function angleAt(a: Point | null, b: Point | null, c: Point | null): number | null {
  if (!a || !b || !c) return null;
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const n1 = Math.hypot(v1x, v1y), n2 = Math.hypot(v2x, v2y);
  if (n1 < 1e-6 || n2 < 1e-6) return null;
  let cos = dot / (n1 * n2);
  cos = Math.max(-1, Math.min(1, cos));
  return (Math.acos(cos) * 180) / Math.PI;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  totalFrames,
  currentTimeMs,
  onSeekTime,
  playbackRate,
  onRateChange,
  playing,
  onTogglePlay,
  onVideoEnded,
  className = '',
  landmarks,
  showSkeleton = true,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [duration, setDuration] = useState(0);
  const [isPaused, setIsPaused] = useState(true);
  const [vidW, setVidW] = useState(0);
  const [vidH, setVidH] = useState(0);
  /** true when currentTimeMs change came from a user scrub (scrubber / step) → needs a video seek */
  const isUserSeek = useRef(false);

  /* Canvas drawing loop — redraw skeleton every animation frame while playing */
  const drawSkeleton = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !showSkeleton || !landmarks || landmarks.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match canvas to video element's rendered size
    canvas.width = video.videoWidth || vidW;
    canvas.height = video.videoHeight || vidH;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Find the landmark frame closest to current video time
    const curTime = video.currentTime * 1000; // ms
    let best: FrameLandmarks | null = null;
    let bestDiff = Infinity;
    for (const fr of landmarks) {
      const diff = Math.abs(fr.timestamp_ms - curTime);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = fr;
      }
    }
    if (!best) return;

    const pts: (Point | null)[] = best.landmarks.map((lm) => ({
      x: lm.x,
      y: lm.y,
      visibility: lm.visibility,
    }));

    const VIS_MIN = 0.15;
    const JOINT_R = 6;
    const LIMB_W = 4;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw limbs
    ctx.strokeStyle = 'rgba(31, 181, 214, 0.8)';
    ctx.lineWidth = LIMB_W;
    for (const [i, j] of LIMBS) {
      const p1 = pts[i], p2 = pts[j];
      if (!p1 || !p2) continue;
      if ((p1.visibility ?? 1) < VIS_MIN || (p2.visibility ?? 1) < VIS_MIN) continue;
      ctx.beginPath();
      ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
      ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
      ctx.stroke();
    }

    // Draw joints + angle labels
    ctx.fillStyle = '#1FB5D6';
    for (const { id, pts: triple, label } of JOINT_ANGLES) {
      const [ai, bi, ci] = triple;
      const a = pts[ai], b = pts[bi], c = pts[ci];
      if (!a || !b || !c) continue;
      if ((a.visibility ?? 1) < VIS_MIN || (b.visibility ?? 1) < VIS_MIN || (c.visibility ?? 1) < VIS_MIN) continue;

      // joint dot with white glow behind for visibility on any background
      ctx.beginPath();
      ctx.arc(b.x * canvas.width, b.y * canvas.height, JOINT_R + 1.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(b.x * canvas.width, b.y * canvas.height, JOINT_R, 0, Math.PI * 2);
      ctx.fillStyle = '#1FB5D6';
      ctx.fill();

      // angle label above the joint
      const ang = angleAt(a, b, c);
      if (ang != null) {
        const angleRounded = Math.round(ang);
        const lx = b.x * canvas.width;
        const ly = b.y * canvas.height - 10;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(lx - 22, ly - 14, 44, 16);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${label} ${angleRounded}°`, lx, ly);
        ctx.fillStyle = '#1FB5D6';
      }
    }
  }, [landmarks, showSkeleton, vidW, vidH]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [playing]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // Only seek the video on user-initiated scrubs. During natural playback
    // the video drives itself; React only reads time via timeupdate. Seeking
    // on every currentTimeMs change pauses the video, which is why the video
    // appeared stuck after ~100ms of playback.
    if (isUserSeek.current) {
      isUserSeek.current = false;
      video.currentTime = currentTimeMs / 1000;
      if (playing) {
        video.play().catch(() => {});
      }
    }
  }, [currentTimeMs, playing]);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration);
    setVidW(video.videoWidth);
    setVidH(video.videoHeight);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const f = timeToFrame(video.currentTime, duration, totalFrames);
    const ms = (f / Math.max(1, totalFrames - 1)) * duration;
    setIsPaused(video.paused);
    onSeekTime(ms);
    drawSkeleton();
  }, [duration, totalFrames, onSeekTime, drawSkeleton]);

  const handlePause = useCallback(() => setIsPaused(true), []);
  const handlePlay = useCallback(() => setIsPaused(false), []);
  const handleEnded = useCallback(() => {
    setIsPaused(true);
    onVideoEnded?.();
  }, [onVideoEnded]);

  const handleScrub = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const target = Number(e.target.value);
      const ms = (target / Math.max(1, totalFrames - 1)) * duration;
      isUserSeek.current = true;
      onSeekTime(ms);
    },
    [duration, totalFrames, onSeekTime]
  );

  const handleStep = useCallback(
    (deltaMs: number) => {
      isUserSeek.current = true;
      onSeekTime(Math.max(0, Math.min(totalFrames > 0 ? totalFrames * 100 : 0, currentTimeMs + deltaMs)));
    },
    [currentTimeMs, totalFrames, onSeekTime]
  );

  if (!src) {
    return (
      <div className={`flex items-center justify-center h-64 rounded-[16px] bg-[#242833] border border-[rgba(255,255,255,0.04)] ${className}`}>
        <span className="text-[12px] text-[#6E7486]">No video</span>
      </div>
    );
  }

  return (
    <section className={`rounded-[16px] overflow-hidden border border-[rgba(255,255,255,0.04)] ${className}`}>
      <div className="relative bg-[#161920] aspect-video">
        <video
          ref={videoRef}
          src={src}
          autoPlay
          playsInline
          muted
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onPause={handlePause}
          onPlay={handlePlay}
          onEnded={handleEnded}
          className="w-full h-full object-contain"
          aria-label="Shot video"
        />
        {showSkeleton && landmarks && landmarks.length > 0 ? (
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
            aria-hidden="true"
          />
        ) : null}
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 hover:opacity-100 transition-opacity p-3">
          <button
            onClick={onTogglePlay}
            className="w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <span className="flex flex-col gap-1"><span className="w-1 h-3 bg-current" /><span className="w-1 h-3 bg-current" /></span>
            ) : (
              <span className="w-0 h-0 border-l-4 border-r-2 border-transparent border-t-current border-b-current" />
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 p-3 bg-[#242833] border-t border-[rgba(255,255,255,0.04)]">
        <div className="flex items-center gap-3 text-[12px] text-[#6E7486]">
          <span className="font-numeric text-[#AAB0BD]">{Math.floor(currentTimeMs / 1000).toFixed(0)}</span>
          <span className="text-[#6E7486]">s</span>
        </div>

        <div className="flex-1 px-2">
          <input
            type="range"
            min={0}
            max={totalFrames > 0 ? totalFrames - 1 : 0}
            value={timeToFrame(currentTimeMs, duration, totalFrames)}
            onChange={handleScrub}
            className="w-full h-2 bg-[#3A3F4E] rounded-full appearance-none cursor-pointer accent-[#1FB5D6]"
            aria-label="Scrub video"
          />
        </div>

        <div className="flex items-center gap-2 text-[12px]">
          <button
            onClick={() => handleStep(-1000)}
            className="p-1.5 rounded-[8px] bg-[#242833] border border-[rgba(255,255,255,0.08)] text-[#AAB0BD] hover:bg-[#3A3F4E]"
            title="Previous second"
            aria-label="Previous second"
          >
            ‹
          </button>
          <span className="px-2 text-[#6E7486] font-numeric">{Math.round(playbackRate * 100)}%</span>
          <div className="flex gap-1">
            {SPEEDS.map((rate) => (
              <button
                key={rate}
                onClick={() => onRateChange(rate)}
                className={`px-2 py-1 rounded-[8px] text-[10px] font-bold border ${
                  rate === playbackRate
                    ? 'bg-[#1FB5D6] text-[#052E16] border-[#1FB5D6]'
                    : 'border-[rgba(255,255,255,0.08)] text-[#6E7486] bg-[#242833] hover:bg-[#3A3F4E]'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>
          <button
            onClick={() => handleStep(1000)}
            className="p-1.5 rounded-[8px] bg-[#242833] border border-[rgba(255,255,255,0.08)] text-[#AAB0BD] hover:bg-[#3A3F4E]"
            title="Next second"
            aria-label="Next second"
          >
            ›
          </button>
        </div>
      </div>
    </section>
  );
};
