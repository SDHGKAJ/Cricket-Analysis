import React, { useState, useEffect, useRef } from 'react';
import { FrameLandmarks, FlawItem, LandmarkPoint } from '../types/cricket';
import { Play, Pause, RotateCcw, FastForward, Sliders, Eye } from 'lucide-react';

interface SlowMoReplayProps {
  frames: FrameLandmarks[];
  flaws: FlawItem[];
  impactFrame?: number;
  replayVideoUrl?: string;
  selectedJoint?: string | null;
}

const POSE_CONNECTIONS: [number, number][] = [
  // Torso
  [11, 12], [11, 23], [12, 24], [23, 24],
  // Left arm
  [11, 13], [13, 15],
  // Right arm
  [12, 14], [14, 16],
  // Left leg
  [23, 25], [25, 27],
  // Right leg
  [24, 26], [26, 28],
  // Head
  [0, 11], [0, 12]
];

export const SlowMoReplay: React.FC<SlowMoReplayProps> = ({
  frames,
  flaws,
  impactFrame = 0,
  replayVideoUrl,
  selectedJoint
}) => {
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(0.25);
  const [showAngles, setShowAngles] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // Reset current frame to start of downswing when new shot arrives
  useEffect(() => {
    if (frames.length > 0) {
      setCurrentFrameIndex(0);
      setIsPlaying(true);
    }
  }, [frames]);

  // Animation playback loop
  useEffect(() => {
    if (!isPlaying || frames.length === 0) return;

    const frameDurationMs = (1000 / 30) / playbackSpeed;

    const loop = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const elapsed = timestamp - lastTimeRef.current;

      if (elapsed >= frameDurationMs) {
        lastTimeRef.current = timestamp;
        setCurrentFrameIndex((prev) => {
          if (prev >= frames.length - 1) {
            return 0; // Loop replay
          }
          return prev + 1;
        });
      }
      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying, playbackSpeed, frames]);

  // Draw current frame on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || frames.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const frameData = frames[currentFrameIndex];
    if (!frameData) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear dark sports background
    ctx.fillStyle = '#080D18';
    ctx.fillRect(0, 0, width, height);

    // Subtle pitch alignment grid
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(width * 0.1, height * 0.9);
    ctx.lineTo(width * 0.9, height * 0.9); // Crease line
    ctx.stroke();

    const landmarks = frameData.landmarks;
    if (!landmarks || landmarks.length < 33) return;

    // Helper to get pixel coords
    const getPx = (idx: number) => {
      const pt = landmarks[idx] || { x: 0.5, y: 0.5 };
      return { x: pt.x * width, y: pt.y * height };
    };

    // Draw Skeleton Bones
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';

    POSE_CONNECTIONS.forEach(([i1, i2]) => {
      const p1 = getPx(i1);
      const p2 = getPx(i2);
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.7)'; // Emerald green bones
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    });

    // Draw Bat Trajectory Proxy (wrists to bat blade)
    const fWr = getPx(15);
    const fEl = getPx(13);
    const batDx = fWr.x - fEl.x;
    const batDy = fWr.y - fEl.y;
    const batLen = Math.sqrt(batDx * batDx + batDy * batDy) * 1.35;
    const tipX = fWr.x + (batDx / (Math.sqrt(batDx * batDx + batDy * batDy) || 1)) * batLen;
    const tipY = fWr.y + (batDy / (Math.sqrt(batDx * batDx + batDy * batDy) || 1)) * batLen;

    // Bat blade
    ctx.strokeStyle = '#EAB308'; // Cricket willow gold
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(fWr.x, fWr.y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // Draw Joints
    landmarks.forEach((lm, idx) => {
      if (idx > 28 && idx !== 31 && idx !== 32) return;
      const px = lm.x * width;
      const py = lm.y * height;

      // Check if this joint has an active flaw
      let isFlawJoint = false;
      if (idx === 0 && flaws.some((f) => f.affected_joint === 'nose')) isFlawJoint = true;
      if (idx === 13 && flaws.some((f) => f.affected_joint?.includes('elbow'))) isFlawJoint = true;
      if (idx === 27 && flaws.some((f) => f.affected_joint?.includes('ankle'))) isFlawJoint = true;

      ctx.beginPath();
      ctx.arc(px, py, isFlawJoint ? 8 : 5, 0, Math.PI * 2);

      if (isFlawJoint) {
        ctx.fillStyle = '#EF4444'; // Flaw joint Red
        ctx.strokeStyle = '#FCA5A5';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();

        // Pulsing flaw indicator
        ctx.beginPath();
        ctx.arc(px, py, 14, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = '#34D399';
        ctx.fill();
      }
    });

    // Angle Annotations
    if (showAngles) {
      const sh = getPx(11);
      const el = getPx(13);
      const wr = getPx(15);
      const kn = getPx(25);
      const head = getPx(0);

      // Elbow angle text
      const v1 = { x: sh.x - el.x, y: sh.y - el.y };
      const v2 = { x: wr.x - el.x, y: wr.y - el.y };
      const dot = v1.x * v2.x + v1.y * v2.y;
      const mag = Math.sqrt(v1.x * v1.x + v1.y * v1.y) * Math.sqrt(v2.x * v2.x + v2.y * v2.y);
      const angle = mag > 0 ? (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI : 90;

      ctx.fillStyle = '#38BDF8';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`Elbow: ${angle.toFixed(0)}°`, el.x + 12, el.y - 8);

      // Head-over-knee vertical guideline
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(head.x, head.y);
      ctx.lineTo(head.x, height * 0.9);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Phase Overlay Tag
    const isImpact = Math.abs(currentFrameIndex - impactFrame) <= 1;
    ctx.fillStyle = isImpact ? '#EF4444' : '#10B981';
    ctx.font = 'bold 13px Outfit, sans-serif';
    const phaseLabel = isImpact ? '⚡ IMPACT CONTACT' : currentFrameIndex < impactFrame ? 'DOWNSWING' : 'FOLLOW-THROUGH';
    ctx.fillText(`${phaseLabel} (Frame ${currentFrameIndex}/${frames.length})`, 20, 30);
  }, [currentFrameIndex, frames, flaws, impactFrame, showAngles]);

  if (frames.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-6 text-center text-slate-400">
        <Sliders className="w-8 h-8 mx-auto mb-2 opacity-40 text-emerald-400" />
        <p className="text-sm">Slow-motion kinematic replay will activate once a shot is analyzed.</p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl p-6 border border-slate-700/60 shadow-xl">
      <div className="flex items-center justify-between pb-3 border-b border-slate-700/50 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
            <Sliders className="w-4 h-4" />
          </div>
          <h3 className="text-base font-bold text-white">Slow-Mo Shot Replay &amp; Angles</h3>
        </div>

        {/* Speed Controls */}
        <div className="flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
          {[0.25, 0.5, 1.0].map((speed) => (
            <button
              key={speed}
              onClick={() => setPlaybackSpeed(speed)}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                playbackSpeed === speed
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>

      {/* Canvas Player */}
      <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 aspect-[4/3] flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="w-full h-full object-contain"
        />

        {/* Video replay alternate link if available */}
        {replayVideoUrl && (
          <a
            href={replayVideoUrl}
            target="_blank"
            rel="noreferrer"
            className="absolute bottom-3 right-3 text-xs bg-slate-900/90 hover:bg-slate-800 text-emerald-400 px-3 py-1.5 rounded-lg border border-emerald-500/30 flex items-center gap-1.5 transition-all shadow-lg"
          >
            Download Annotated MP4
          </a>
        )}
      </div>

      {/* Timeline Scrubber */}
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>Frame {currentFrameIndex + 1} / {frames.length}</span>
          <span className="text-amber-400 font-semibold">Impact @ Frame #{impactFrame + 1}</span>
        </div>

        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={currentFrameIndex}
          onChange={(e) => {
            setCurrentFrameIndex(Number(e.target.value));
            setIsPlaying(false);
          }}
          className="w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-emerald-500 border border-slate-800"
        />
      </div>

      {/* Playback Action Bar */}
      <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-800/80">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-glow-green transition-all"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isPlaying ? 'Pause' : 'Play Slow-Mo'}
          </button>
          <button
            onClick={() => {
              setCurrentFrameIndex(0);
              setIsPlaying(true);
            }}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all border border-slate-700"
            title="Restart Replay"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Toggle Angle Overlays */}
        <button
          onClick={() => setShowAngles(!showAngles)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
            showAngles
              ? 'bg-sky-500/15 border-sky-500/40 text-sky-400'
              : 'bg-slate-800/60 border-slate-700 text-slate-400'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          {showAngles ? 'Angles Visible' : 'Hide Angles'}
        </button>
      </div>
    </div>
  );
};
