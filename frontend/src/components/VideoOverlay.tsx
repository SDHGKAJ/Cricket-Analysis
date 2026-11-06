import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FrameLandmarks, FlawItem } from '../types/cricket';
import { Play, Pause, SkipBack, SkipForward, RotateCcw, Eye, Zap, Camera, BookOpen, Target, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';

const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15],
  [12, 14], [14, 16],
  [23, 25], [25, 27],
  [24, 26], [26, 28],
  [0, 11], [0, 12],
];

// Purple/violet theme matching the reference UI
const SKELETON_BONE = '#8B5CF6';      // violet-500
const SKELETON_JOINT = '#A855F7';     // purple-500
const FLAW_JOINT = '#EF4444';         // red
const BAT_COLOR = '#F59E0B';          // amber
const IDEAL_ARC = '#38BDF8';          // sky

const PHASES = [
  { id: 'stance', label: 'Stance', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  { id: 'backlift', label: 'Backlift', color: 'text-sky-400', bg: 'bg-sky-500/10' },
  { id: 'downswing', label: 'Downswing', color: 'text-amber-400', bg: 'bg-amber-500/10' },
  { id: 'impact', label: 'Impact', color: 'text-rose-400', bg: 'bg-rose-500/10' },
  { id: 'follow_through', label: 'Follow-Through', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
];

// Floating action buttons that overlay the video (right side)
const ACTION_BUTTONS = [
  { id: 'skeleton', label: 'Skeleton', icon: BookOpen, color: 'bg-purple-500/20 border-purple-500/40 text-purple-400' },
  { id: 'target', label: 'Ideal Arc', icon: Target, color: 'bg-sky-500/20 border-sky-500/40 text-sky-400' },
  { id: 'metrics', label: 'Metrics', icon: TrendingUp, color: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' },
  { id: 'replay', label: 'Replay', icon: RotateCcw, color: 'bg-rose-500/20 border-rose-500/40 text-rose-400' },
];

interface VideoOverlayProps {
  frames: FrameLandmarks[];
  flaws: FlawItem[];
  impactFrame?: number;
  totalFrames?: number;
  replayVideoUrl?: string;
  selectedJoint?: string | null;
  onJointSelect?: (joint: string | null) => void;
  seekToFrame?: number;
  onFrameChange?: (frame: number) => void;
}

export const VideoOverlay: React.FC<VideoOverlayProps> = ({
  frames,
  flaws,
  impactFrame = 24,
  totalFrames,
  replayVideoUrl,
  selectedJoint,
  onJointSelect,
  seekToFrame,
  onFrameChange,
}) => {
  const safeTotal = Math.max(1, totalFrames ?? frames.length);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(0.5);
  const [activeAction, setActiveAction] = useState<string | null>('skeleton');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  /* External seek (Fix button / deep link) */
  useEffect(() => {
    if (seekToFrame !== undefined && seekToFrame !== currentFrameIndex) {
      const clamped = Math.max(0, Math.min(safeTotal - 1, seekToFrame));
      setCurrentFrameIndex(clamped);
      setIsPlaying(false);
      onFrameChange?.(clamped);
    }
  }, [seekToFrame, safeTotal, onFrameChange]);

  /* Initialize frame when new frames arrive */
  useEffect(() => {
    if (frames.length > 0) {
      setCurrentFrameIndex(0);
      setIsPlaying(true);
    }
  }, [frames]);

  /* Playback loop */
  useEffect(() => {
    if (!isPlaying || frames.length === 0) return;
    const frameDurationMs = (1000 / 30) / playbackSpeed;
    const loop = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const elapsed = timestamp - lastTimeRef.current;
      if (elapsed >= frameDurationMs) {
        lastTimeRef.current = timestamp;
        setCurrentFrameIndex((prev) =>
          prev >= frames.length - 1 ? 0 : prev + 1,
        );
      }
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying, playbackSpeed, frames]);

  /* Seek from scrubber */
  const seekFrame = useCallback(
    (f: number) => {
      const clamped = Math.max(0, Math.min(frames.length - 1, f));
      setCurrentFrameIndex(clamped);
      setIsPlaying(false);
      onFrameChange?.(clamped);
    },
    [frames, onFrameChange],
  );

  /* Phase for current frame */
  const backliftApex = Math.max(0, Math.floor(impactFrame * 0.6));
  const phaseBounds = [
    { id: 'stance', start: 0, end: Math.floor(backliftApex * 0.5) },
    { id: 'backlift', start: Math.floor(backliftApex * 0.5), end: backliftApex },
    { id: 'downswing', start: backliftApex, end: impactFrame },
    { id: 'impact', start: impactFrame, end: Math.min(safeTotal - 1, impactFrame + 2) },
    { id: 'follow_through', start: Math.min(safeTotal - 1, impactFrame + 2), end: safeTotal - 1 },
  ];
  const currentPhaseBounds = phaseBounds.find((p) => currentFrameIndex >= p.start && currentFrameIndex <= p.end) ?? phaseBounds[0];
  const currentPhase = PHASES.find((p) => p.id === currentPhaseBounds.id) ?? PHASES[0];

  /* ── Canvas render ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || frames.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const frameData = frames[currentFrameIndex];
    if (!frameData) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#060A14';
    ctx.fillRect(0, 0, width, height);

    const landmarks = frameData.landmarks;
    if (!landmarks || landmarks.length < 33) return;

    const getPx = (idx: number) => {
      const pt = landmarks[idx] || { x: 0.5, y: 0.5 };
      return { x: pt.x * width, y: pt.y * height };
    };

    const isFlawJoint = (idx: number): FlawItem | undefined => {
      const j = landmarks[idx];
      if (!j || j.visibility < 0.4) return undefined;
      return flaws.find(
        (f) =>
          (f.joint || f.affected_joint || '') ===
          ['nose', 'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist', 'left_ankle', 'right_ankle'][idx] ||
          (selectedJoint && (f.joint || f.affected_joint || '').includes(selectedJoint)),
      );
    };

    /* 1. Bat path trail (ghost) — only when skeleton action active */
    if (activeAction === 'skeleton' || activeAction === null) {
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.25)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      let first = true;
      for (let f = 0; f <= currentFrameIndex; f++) {
        const past = frames[f]?.landmarks?.[15];
        if (past) {
          const px = past.x * width;
          const py = past.y * height;
          if (first) { ctx.moveTo(px, py); first = false; }
          else ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
    }

    /* 2. Skeleton bones — purple */
    if (activeAction === 'skeleton' || activeAction === null) {
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      POSE_CONNECTIONS.forEach(([i1, i2]) => {
        const p1 = getPx(i1);
        const p2 = getPx(i2);
        ctx.strokeStyle = SKELETON_BONE;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
    }

    /* 3. Bat blade — amber */
    const fWr = getPx(15);
    const fEl = getPx(13);
    const bdx = fWr.x - fEl.x;
    const bdy = fWr.y - fEl.y;
    const blen = Math.sqrt(bdx * bdx + bdy * bdy) || 1;
    const tipX = fWr.x + (bdx / blen) * blen * 1.35;
    const tipY = fWr.y + (bdy / blen) * blen * 1.35;
    ctx.strokeStyle = BAT_COLOR;
    ctx.lineWidth = 6;
    ctx.shadowColor = 'rgba(245, 158, 11, 0.5)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(fWr.x, fWr.y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    /* 4. Joints + flaw highlighting */
    landmarks.forEach((lm, idx) => {
      if (idx > 28 && idx !== 31 && idx !== 32) return;
      if (activeAction !== 'skeleton' && activeAction !== null) return;
      const px = lm.x * width;
      const py = lm.y * height;
      const flaw = isFlawJoint(idx);
      const isTargeted = selectedJoint && flaw && (flaw.joint || flaw.affected_joint || '').includes(selectedJoint);

      ctx.beginPath();
      ctx.arc(px, py, flaw ? 10 : 5, 0, Math.PI * 2);

      if (flaw) {
        /* Flawed joint — pulses red with label + angle */
        ctx.fillStyle = FLAW_JOINT;
        ctx.strokeStyle = '#FCA5A5';
        ctx.lineWidth = 2.5;
        ctx.fill();
        ctx.stroke();

        /* Pulse halo */
        const pulse = 16 + Math.sin(Date.now() / 180) * 5;
        ctx.beginPath();
        ctx.arc(px, py, pulse, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();

        /* Angle / measured value callout */
        const angle =
          idx === 13 || idx === 14
            ? (() => {
                const sh = getPx(11);
                const el = getPx(13);
                const wr = getPx(15);
                const v1 = { x: sh.x - el.x, y: sh.y - el.y };
                const v2 = { x: wr.x - el.x, y: wr.y - el.y };
                const dot = v1.x * v2.x + v1.y * v2.y;
                const mag = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
                return mag > 0 ? Math.round((Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI) : 0;
              })()
            : 0;

        const calloutX = px + 14;
        const calloutY = py - 26;
        ctx.fillStyle = 'rgba(6, 10, 20, 0.95)';
        ctx.strokeStyle = FLAW_JOINT;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(calloutX, calloutY, 140, 30, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#FCA5A5';
        ctx.font = 'bold 11px JetBrains Mono, monospace';
        ctx.textBaseline = 'middle';
        const labelText =
          idx === 13 || idx === 14
            ? `ELBOW ${angle}°`
            : idx === 0
              ? 'HEAD DRIFT'
              : 'JOINT FAULT';
        ctx.fillText(labelText, calloutX + 10, calloutY + 15);
      } else {
        ctx.fillStyle = SKELETON_JOINT;
        ctx.fill();

        /* Outer ring for targeted joint */
        if (isTargeted) {
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(px, py, 8, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    });

    /* 5. Ideal-angle ghost arc (front elbow window) — sky */
    if (activeAction === 'target' || activeAction === null) {
      const sh = getPx(11);
      const el = getPx(13);
      const wr = getPx(15);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(el.x, el.y, 48, 0, Math.PI * 0.85);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    /* 6. Impact flash indicator */
    const isImpact = Math.abs(currentFrameIndex - impactFrame) <= 1;
    if (isImpact) {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.95)';
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      ctx.textBaseline = 'top';
      ctx.fillText('⚡ IMPACT CONTACT', fWr.x + 10, fWr.y - 34);
    }

    /* 7. Phase label — top-left of canvas */
    ctx.fillStyle = 'rgba(16, 185, 129, 0.95)';
    ctx.font = 'bold 11px JetBrains Mono, monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(currentPhase.label.toUpperCase(), 16, 16);
  }, [currentFrameIndex, frames, flaws, impactFrame, safeTotal, selectedJoint, activeAction]);

  return (
    <div className="flex flex-col h-full fade-in">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/6 bg-[#0A1020]/40 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/30 text-purple-400 flex items-center justify-center shrink-0">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Video Analysis</h3>
            <p className="text-[11px] text-slate-400">Frame-accurate kinematic overlay</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-numeric font-bold">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            Pose 60 FPS
          </span>
          <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300">
            {currentFrameIndex + 1} / {safeTotal}
          </span>
        </div>
      </div>

      {/* ── Video viewport — immersive full-bleed 16:9 ── */}
      <div className="relative aspect-video-frame group overflow-hidden">
        <div className="absolute inset-0 z-0 pointer-events-none">
          {/* Top-right score pulse + dotted trail (reference style) */}
          <div className="absolute top-6 right-6 z-10 flex flex-col items-end gap-2">
            <div className="relative w-14 h-14 rounded-full border-2 border-purple-500/40 flex items-center justify-center bg-[#0A1020]/80 backdrop-blur-md shadow-[0_0_30px_rgba(139,92,246,0.35)]">
              <span className="text-[11px] font-black font-numeric text-purple-400">
                {currentFrameIndex + 1}
              </span>
              <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="w-1 h-8 bg-purple-500/20 animate-[dash_2s_linear_infinite]" style={{ maskImage: `linear-gradient(to bottom, black 20%, transparent 20%)` }} />
          </div>
        </div>

        <div className="frame-content relative z-10 w-full h-full">
          {replayVideoUrl ? (
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-contain"
              src={replayVideoUrl}
            />
          ) : (
            <canvas ref={canvasRef} width={640} height={360} className="w-full h-full object-contain" />
          )}
        </div>

        {/* Telemetry stamp */}
        <div className="absolute top-4 left-4 z-20 bg-[#060A14]/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 font-numeric text-[10px] text-purple-400 font-bold flex items-center gap-1.5 shadow-lg">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
          Optical pose
        </div>

        {/* Impact flash pill */}
        {isPlaying && Math.abs(currentFrameIndex - impactFrame) <= 1 && (
          <div className="absolute top-4 right-4 z-20 bg-amber-500/95 text-slate-950 px-2.5 py-1 rounded-lg font-numeric text-[10px] font-black tracking-wider flex items-center gap-1 shadow-lg animate-pulse">
            <Zap className="w-3 h-3" />
            Impact point
          </div>
        )}

        {/* ── Floating action buttons (right side, reference style) ── */}
        <div className="absolute top-1/2 right-4 z-20 flex flex-col gap-2 transform -translate-y-1/2">
          {ACTION_BUTTONS.map((btn) => {
            const isActive = activeAction === btn.id;
            const Icon = btn.icon;
            return (
              <button
                key={btn.id}
                onClick={() => setActiveAction(isActive ? null : btn.id)}
                className={`w-12 h-12 rounded-full flex items-center justify-center shadow-xl shadow-purple-500/25 transition-all transform hover:scale-110 border flex-shrink-0 ${
                  isActive
                    ? btn.color.replace('/20', '/35').replace('/40', '/50') + ' text-white ring-2 ring-white/20'
                    : btn.color + ' hover:bg-purple-500/35 hover:text-white'
                }`}
                title={btn.label}
              >
                <Icon className="w-5 h-5" />
                {isActive && (
                  <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-current" />
                )}
              </button>
            );
          })}
        </div>

        {/* Phase pill top-right of video */}
        <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#060A14]/80 backdrop-blur-md border border-white/10">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: currentPhase.color === 'text-emerald-400' ? '#10B981' : currentPhase.color === 'text-sky-400' ? '#38BDF8' : currentPhase.color === 'text-amber-400' ? '#F59E0B' : '#F43F5E' }} />
          <span className="text-[10px] font-numeric font-bold text-white capitalize">{currentPhase.label}</span>
        </div>
      </div>

      {/* ── Phase timeline with flaw markers ── */}
      <div className="mt-4 bg-[#0A1020]/60 backdrop-blur-md rounded-2xl p-3.5 border border-white/6 space-y-2.5">
        {/* Active phase pill + frame counter */}
        <div className="flex items-center justify-between text-[10px] font-numeric font-bold">
          <div className="flex items-center gap-1.5">
            <span className={`flex items-center gap-1.5 ${currentPhase.color}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {currentPhase.label}
            </span>
          </div>
          <span className="text-slate-400">
            Frame {currentFrameIndex + 1} / {safeTotal}
          </span>
        </div>

        {/* Phase stepper chips */}
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
          {PHASES.map((phase) => {
            const bounds = phaseBounds.find((p) => p.id === phase.id)!;
            const isActive = currentPhaseBounds.id === phase.id;
            const inBounds =
              currentFrameIndex >= bounds.start && currentFrameIndex <= bounds.end;
            return (
              <button
                key={phase.id}
                onClick={() => seekFrame(Math.floor((bounds.start + bounds.end) / 2))}
                className={`flex-1 min-w-[56px] py-1.5 rounded-lg text-[10px] font-semibold transition-all border shrink-0 ${
                  isActive
                    ? 'bg-emerald-500 text-slate-950 border-emerald-500 shadow-sm font-bold'
                    : inBounds
                      ? 'bg-slate-800/60 text-slate-300 border-slate-700'
                      : 'bg-[#0A1020]/60 text-slate-500 border-white/10 hover:bg-white/10 hover:text-white'
                }`}
              >
                {phase.label}
              </button>
            );
          })}
        </div>

        {/* Flaw markers on exact frames */}
        <div className="relative h-5 mt-1">
          <div className="absolute left-0 right-0 h-0.5 bg-white/8 rounded-full" />
          {flaws.map((flaw, idx) => {
            const leftPct = Math.min(96, Math.max(4, (flaw.frame / safeTotal) * 100));
            const isCritical = flaw.severity === 'high';
            return (
              <button
                key={idx}
                onClick={(e) => {
                  e.stopPropagation();
                  seekFrame(flaw.frame);
                }}
                style={{ left: `${leftPct}%`, top: '-7px' }}
                className="absolute -translate-x-1/2 flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[9px] font-numeric font-bold shadow-lg transition-transform hover:scale-110 z-10"
                title={`Frame #${flaw.frame}: ${flaw.name}`}
              >
                <span className={`w-2 h-2 rounded-full ${isCritical ? 'bg-rose-500' : 'bg-amber-500'}`} />
                <span className={`${isCritical ? 'text-rose-300' : 'text-slate-900'}`}>`#${flaw.frame}`</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Playback controls toolbar ── */}
      <div className="mt-4 border-t border-white/6 pt-3.5 px-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => seekFrame(currentFrameIndex - 1)}
            className="p-2.5 rounded-xl bg-[#0A1020]/80 hover:bg-white/10 text-slate-300 border border-white/10 transition-all"
            title="Step back 1 frame"
          >
            <SkipBack className="w-4 h-4" />
            <span className="hidden sm:inline text-[10px] font-numeric">-1f</span>
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 font-bold text-xs shadow-lg shadow-purple-500/30 transition-all"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span className="text-[11px]">{isPlaying ? 'Pause' : 'Play slow-mo'}</span>
          </button>
          <button
            onClick={() => seekFrame(currentFrameIndex + 1)}
            className="p-2.5 rounded-xl bg-[#0A1020]/80 hover:bg-white/10 text-slate-300 border border-white/10 transition-all"
            title="Step forward 1 frame"
          >
            <span className="hidden sm:inline text-[10px] font-numeric">+1f</span>
            <SkipForward className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setCurrentFrameIndex(0);
              setIsPlaying(true);
            }}
            className="p-2.5 rounded-xl bg-[#0A1020]/80 hover:bg-white/10 text-slate-300 border border-white/10 transition-all"
            title="Restart"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Speed chips */}
        <div className="flex items-center gap-1 bg-[#0A1020]/80 p-1.5 rounded-xl border border-white/10 text-[10px] font-numeric font-bold">
          {[0.25, 0.5, 1.0].map((speed) => (
            <button
              key={speed}
              onClick={() => setPlaybackSpeed(speed)}
              className={`px-2 py-0.75 rounded-lg transition-all ${
                playbackSpeed === speed
                  ? 'bg-purple-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {speed}×
            </button>
          ))}
        </div>

        <button
          onClick={() => {}}
          className={`p-1.5 rounded-xl border transition-all text-[10px] flex items-center gap-1 bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-white`}
          title="Toggle skeleton and angle overlays"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
