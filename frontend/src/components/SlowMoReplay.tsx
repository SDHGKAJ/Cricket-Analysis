import React, { useState, useEffect, useRef } from 'react';
import { FrameLandmarks, FlawItem } from '../types/cricket';
import { Play, Pause, RotateCcw, Eye, SkipBack, SkipForward, Sliders, Zap } from 'lucide-react';

interface SlowMoReplayProps {
  frames: FrameLandmarks[];
  flaws: FlawItem[];
  impactFrame?: number;
  replayVideoUrl?: string;
  selectedJoint?: string | null;
  /** Optionally drive the frame from outside (PhaseTimeline, Fix-flaw button) */
  externalFrame?: number;
  onFrameChange?: (frame: number) => void;
}

const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15],
  [12, 14], [14, 16],
  [23, 25], [25, 27],
  [24, 26], [26, 28],
  [0, 11], [0, 12]
];

export const SlowMoReplay: React.FC<SlowMoReplayProps> = ({
  frames,
  flaws,
  impactFrame = 0,
  replayVideoUrl,
  selectedJoint,
  externalFrame,
  onFrameChange,
}) => {
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(0.25);
  const [showAngles, setShowAngles] = useState(true);

  // Sync with external frame controller (PhaseTimeline, Fix-flaw CTA)
  useEffect(() => {
    if (externalFrame !== undefined && externalFrame !== currentFrameIndex) {
      setCurrentFrameIndex(externalFrame);
      setIsPlaying(false);
    }
  }, [externalFrame]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

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
            return 0;
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

    // Deep sports obsidian background
    ctx.fillStyle = '#060A14';
    ctx.fillRect(0, 0, width, height);

    // Subtle pitch alignment grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(width * 0.08, height * 0.92);
    ctx.lineTo(width * 0.92, height * 0.92);
    ctx.stroke();

    const landmarks = frameData.landmarks;
    if (!landmarks || landmarks.length < 33) return;

    const getPx = (idx: number) => {
      const pt = landmarks[idx] || { x: 0.5, y: 0.5 };
      return { x: pt.x * width, y: pt.y * height };
    };

    // Draw Bat Trajectory Ghost Trail (history of wrists)
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let f = 0; f <= currentFrameIndex; f++) {
      const pastLms = frames[f]?.landmarks;
      if (pastLms && pastLms[15]) {
        const px = pastLms[15].x * width;
        const py = pastLms[15].y * height;
        if (f === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    }
    ctx.stroke();

    // Draw Skeleton Bones
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';

    POSE_CONNECTIONS.forEach(([i1, i2]) => {
      const p1 = getPx(i1);
      const p2 = getPx(i2);
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    });

    // Bat Blade
    const fWr = getPx(15);
    const fEl = getPx(13);
    const batDx = fWr.x - fEl.x;
    const batDy = fWr.y - fEl.y;
    const batLen = Math.sqrt(batDx * batDx + batDy * batDy) * 1.35;
    const tipX = fWr.x + (batDx / (Math.sqrt(batDx * batDx + batDy * batDy) || 1)) * batLen;
    const tipY = fWr.y + (batDy / (Math.sqrt(batDx * batDx + batDy * batDy) || 1)) * batLen;

    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(fWr.x, fWr.y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // Joints
    landmarks.forEach((lm, idx) => {
      if (idx > 28 && idx !== 31 && idx !== 32) return;
      const px = lm.x * width;
      const py = lm.y * height;

      let isFlawJoint = false;
      if (idx === 0 && flaws.some((f) => f.affected_joint === 'nose')) isFlawJoint = true;
      if (idx === 13 && flaws.some((f) => f.affected_joint?.includes('elbow'))) isFlawJoint = true;
      if (idx === 27 && flaws.some((f) => f.affected_joint?.includes('ankle'))) isFlawJoint = true;
      if (selectedJoint && idx === 13 && selectedJoint.includes('elbow')) isFlawJoint = true;

      ctx.beginPath();
      ctx.arc(px, py, isFlawJoint ? 8 : 4.5, 0, Math.PI * 2);

      if (isFlawJoint) {
        ctx.fillStyle = '#EF4444';
        ctx.strokeStyle = '#FCA5A5';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(px, py, 15, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = '#34D399';
        ctx.fill();
      }
    });

    // Angle HUD Overlays
    if (showAngles) {
      const sh = getPx(11);
      const el = getPx(13);
      const wr = getPx(15);
      const head = getPx(0);
      const kn = getPx(25);

      // Elbow Angle Arc
      const v1 = { x: sh.x - el.x, y: sh.y - el.y };
      const v2 = { x: wr.x - el.x, y: wr.y - el.y };
      const dot = v1.x * v2.x + v1.y * v2.y;
      const mag = Math.sqrt(v1.x * v1.x + v1.y * v1.y) * Math.sqrt(v2.x * v2.x + v2.y * v2.y);
      const angle = mag > 0 ? (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI : 90;

      // Elbow HUD Tag
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(el.x + 12, el.y - 20, 85, 22, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#38BDF8';
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      ctx.fillText(`ELBOW ${angle.toFixed(0)}°`, el.x + 18, el.y - 5);

      // Head-over-knee vertical guideline
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(head.x, head.y);
      ctx.lineTo(head.x, height * 0.92);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Impact Flash Indicator
    const isImpact = Math.abs(currentFrameIndex - impactFrame) <= 1;
    ctx.fillStyle = isImpact ? '#EF4444' : '#10B981';
    ctx.font = 'bold 12px JetBrains Mono, monospace';
    const phaseLabel = isImpact ? '⚡ IMPACT CONTACT POINT' : currentFrameIndex < impactFrame ? 'DOWNSWING PHASE' : 'FOLLOW-THROUGH HOLD';
    ctx.fillText(`${phaseLabel} [FRAME ${currentFrameIndex + 1}/${frames.length}]`, 20, 30);
  }, [currentFrameIndex, frames, flaws, impactFrame, showAngles, selectedJoint]);

  if (frames.length === 0) {
    return (
      <div className="pro-card rounded-2xl p-6 text-center text-slate-400">
        <Sliders className="w-8 h-8 mx-auto mb-2 opacity-30 text-emerald-400" />
        <h4 className="text-sm font-bold text-slate-300">Slow-Motion Kinematic Scrub</h4>
        <p className="text-xs text-slate-500 mt-1">Replay scrubber activates automatically when a stroke is analyzed.</p>
      </div>
    );
  }

  return (
    <div className="pro-card rounded-2xl p-6 border border-slate-700/60 shadow-2xl">
      <div className="flex items-center justify-between pb-3.5 border-b border-slate-800/80 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Slow-Motion Kinematic Scrub</h3>
            <p className="text-[11px] text-slate-400">High-speed trajectory and angle breakdown</p>
          </div>
        </div>

        {/* Speed Selector */}
        <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs font-mono font-bold">
          {[0.25, 0.5, 1.0].map((speed) => (
            <button
              key={speed}
              onClick={() => setPlaybackSpeed(speed)}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                playbackSpeed === speed
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>

      {/* Canvas Viewport */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 aspect-[4/3] flex items-center justify-center shadow-inner">
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="w-full h-full object-contain"
        />

        {replayVideoUrl && (
          <a
            href={replayVideoUrl}
            target="_blank"
            rel="noreferrer"
            className="absolute bottom-3 right-3 text-xs bg-slate-900/90 hover:bg-slate-800 text-emerald-400 px-3 py-1.5 rounded-lg border border-emerald-500/30 font-semibold transition-all shadow-lg"
          >
            Export Replay MP4
          </a>
        )}
      </div>

      {/* Timeline Scrubber */}
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>FRAME: <strong className="text-white">{currentFrameIndex + 1}</strong> / {frames.length}</span>
          <span className="text-amber-400 font-semibold flex items-center gap-1">
            <Zap className="w-3.5 h-3.5" />
            Impact Contact Frame #{impactFrame + 1}
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={currentFrameIndex}
          onChange={(e) => {
            const f = Number(e.target.value);
            setCurrentFrameIndex(f);
            setIsPlaying(false);
            onFrameChange?.(f);
          }}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer"
        />

        {/* Phase Timeline Badges */}
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 px-1 pt-1">
          <button
            onClick={() => { setCurrentFrameIndex(0); setIsPlaying(false); }}
            className="hover:text-emerald-400"
          >
            [STANCE]
          </button>
          <button
            onClick={() => { setCurrentFrameIndex(Math.floor(impactFrame * 0.6)); setIsPlaying(false); }}
            className="hover:text-emerald-400"
          >
            [BACKLIFT APEX]
          </button>
          <button
            onClick={() => { setCurrentFrameIndex(impactFrame); setIsPlaying(false); }}
            className="hover:text-amber-400 font-bold text-amber-400"
          >
            [⚡ IMPACT]
          </button>
          <button
            onClick={() => { setCurrentFrameIndex(frames.length - 1); setIsPlaying(false); }}
            className="hover:text-emerald-400"
          >
            [FINISH POSE]
          </button>
        </div>
      </div>

      {/* Playback Controls Bar */}
      <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-800/80">
        <div className="flex items-center gap-2">
          {/* Frame Step Back */}
          <button
            onClick={() => {
              setCurrentFrameIndex((prev) => Math.max(0, prev - 1));
              setIsPlaying(false);
            }}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-all"
            title="Step back 1 frame"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          {/* Play/Pause */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-glow-green transition-all"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isPlaying ? 'Pause' : 'Play Slow-Mo'}
          </button>

          {/* Frame Step Forward */}
          <button
            onClick={() => {
              setCurrentFrameIndex((prev) => Math.min(frames.length - 1, prev + 1));
              setIsPlaying(false);
            }}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-all"
            title="Step forward 1 frame"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          {/* Restart */}
          <button
            onClick={() => {
              setCurrentFrameIndex(0);
              setIsPlaying(true);
            }}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-all"
            title="Restart Replay"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={() => setShowAngles(!showAngles)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
            showAngles
              ? 'bg-sky-500/15 border-sky-500/40 text-sky-400'
              : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          {showAngles ? 'Angles Active' : 'Angles Hidden'}
        </button>
      </div>
    </div>
  );
};
