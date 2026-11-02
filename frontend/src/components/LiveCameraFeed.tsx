import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CameraAngle, BatterHand, FrameLandmarks } from '../types/cricket';
import { Camera, VideoOff, Zap, Sparkles, Crosshair, Radio, ShieldCheck } from 'lucide-react';

interface LiveCameraFeedProps {
  cameraAngle: CameraAngle;
  batterHand: BatterHand;
  onShotCompleted: (frames: FrameLandmarks[]) => void;
  highlightJoint?: string | null;
  isAnalyzing?: boolean;
}

const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15],
  [12, 14], [14, 16],
  [23, 25], [25, 27],
  [24, 26], [26, 28],
  [0, 11], [0, 12]
];

export const LiveCameraFeed: React.FC<LiveCameraFeedProps> = ({
  cameraAngle,
  batterHand,
  onShotCompleted,
  highlightJoint,
  isAnalyzing = false
}) => {
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [fps, setFps] = useState<number>(0);
  const [isRecordingShot, setIsRecordingShot] = useState<boolean>(false);
  const [recordingProgress, setRecordingProgress] = useState<number>(0);
  const [kinematicSpeed, setKinematicSpeed] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const poseEstimatorRef = useRef<any>(null);

  const frameBufferRef = useRef<FrameLandmarks[]>([]);
  const frameCountRef = useRef<number>(0);
  const lastFpsTimeRef = useRef<number>(performance.now());

  // Start Camera with 60 FPS request
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 60, min: 30 },
          facingMode: 'user',
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      setCameraError('Webcam not active. You can test immediately using the preset pro strokes below.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  // Initialize MediaPipe Pose
  useEffect(() => {
    const initPose = async () => {
      try {
        const PoseClass = (window as any).Pose;
        if (PoseClass) {
          const pose = new PoseClass({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
          });
          pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
          pose.onResults(onPoseResults);
          poseEstimatorRef.current = pose;
        }
      } catch (e) {
        console.warn('MediaPipe Pose notice:', e);
      }
    };

    initPose();
    return () => {
      if (poseEstimatorRef.current) {
        try { poseEstimatorRef.current.close(); } catch (_) {}
      }
    };
  }, [cameraAngle, batterHand, highlightJoint]);

  // Handle MediaPipe Results and render broadcast HUD
  const onPoseResults = (results: any) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    if (results.poseLandmarks) {
      const landmarks = results.poseLandmarks.map((lm: any) => ({
        x: lm.x,
        y: lm.y,
        z: lm.z,
        visibility: lm.visibility,
      }));

      // Calculate instant wrist velocity
      const fWrIdx = batterHand === 'right' ? 15 : 16;
      const fWr = landmarks[fWrIdx];
      if (fWr && frameBufferRef.current.length > 0) {
        const lastFrame = frameBufferRef.current[frameBufferRef.current.length - 1];
        const lastWr = lastFrame.landmarks[fWrIdx];
        if (lastWr) {
          const dx = fWr.x - lastWr.x;
          const dy = fWr.y - lastWr.y;
          const spd = Math.sqrt(dx * dx + dy * dy) * 100;
          setKinematicSpeed(Math.min(100, Math.round(spd * 6)));
        }
      }

      // Buffer
      frameBufferRef.current.push({
        frame_index: frameBufferRef.current.length,
        timestamp_ms: performance.now(),
        landmarks,
      });
      if (frameBufferRef.current.length > 120) {
        frameBufferRef.current.shift();
      }

      // Draw Crease Alignment Guidelines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(width * 0.1, height * 0.92);
      ctx.lineTo(width * 0.9, height * 0.92); // Crease line
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw Skeleton Bones
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.85)';

      POSE_CONNECTIONS.forEach(([i1, i2]) => {
        const p1 = landmarks[i1];
        const p2 = landmarks[i2];
        if (p1 && p2 && (p1.visibility ?? 1) > 0.4 && (p2.visibility ?? 1) > 0.4) {
          ctx.beginPath();
          ctx.moveTo(p1.x * width, p1.y * height);
          ctx.lineTo(p2.x * width, p2.y * height);
          ctx.stroke();
        }
      });

      // Draw Bat Trajectory Blade
      const fElIdx = batterHand === 'right' ? 13 : 14;
      const fEl = landmarks[fElIdx];
      if (fWr && fEl) {
        const bdx = (fWr.x - fEl.x) * width;
        const bdy = (fWr.y - fEl.y) * height;
        const blen = Math.sqrt(bdx * bdx + bdy * bdy) || 1;
        const tipX = fWr.x * width + (bdx / blen) * (blen * 1.35);
        const tipY = fWr.y * height + (bdy / blen) * (blen * 1.35);

        ctx.strokeStyle = '#F59E0B'; // Cricket willow gold
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(fWr.x * width, fWr.y * height);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
      }

      // Draw Joints & Flaw Spotlights
      landmarks.forEach((lm: any, idx: number) => {
        if ((lm.visibility ?? 1) < 0.4) return;
        const px = lm.x * width;
        const py = lm.y * height;

        let isTargetFault = false;
        if (highlightJoint) {
          if (highlightJoint === 'nose' && idx === 0) isTargetFault = true;
          if (highlightJoint.includes('elbow') && (idx === 13 || idx === 14)) isTargetFault = true;
          if (highlightJoint.includes('wrist') && (idx === 15 || idx === 16)) isTargetFault = true;
          if (highlightJoint.includes('ankle') && (idx === 27 || idx === 28)) isTargetFault = true;
        }

        ctx.beginPath();
        ctx.arc(px, py, isTargetFault ? 9 : 4.5, 0, Math.PI * 2);

        if (isTargetFault) {
          ctx.fillStyle = '#EF4444';
          ctx.strokeStyle = '#FCA5A5';
          ctx.lineWidth = 3;
          ctx.fill();
          ctx.stroke();

          // Radar circle
          ctx.beginPath();
          ctx.arc(px, py, 16, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.fillStyle = '#10B981';
          ctx.fill();
        }
      });
    }

    // FPS Counter
    frameCountRef.current += 1;
    const now = performance.now();
    if (now - lastFpsTimeRef.current >= 1000) {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      lastFpsTimeRef.current = now;
    }
  };

  // Continuous frame pump
  useEffect(() => {
    let animId: number;
    const sendFrame = async () => {
      if (videoRef.current && cameraActive && videoRef.current.readyState >= 2 && poseEstimatorRef.current) {
        try {
          await poseEstimatorRef.current.send({ image: videoRef.current });
        } catch (_) {}
      }
      animId = requestAnimationFrame(sendFrame);
    };

    if (cameraActive) {
      animId = requestAnimationFrame(sendFrame);
    }
    return () => cancelAnimationFrame(animId);
  }, [cameraActive]);

  // Record a live stroke window (2.5 seconds)
  const triggerShotCapture = useCallback(() => {
    if (isRecordingShot) return;
    setIsRecordingShot(true);
    setRecordingProgress(0);

    const recordingBuffer: FrameLandmarks[] = [];
    const startTime = performance.now();
    const duration = 2500;

    const interval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setRecordingProgress(pct);

      if (frameBufferRef.current.length > 0) {
        recordingBuffer.push(frameBufferRef.current[frameBufferRef.current.length - 1]);
      }

      if (elapsed >= duration) {
        clearInterval(interval);
        setIsRecordingShot(false);
        setRecordingProgress(0);

        if (recordingBuffer.length > 10) {
          onShotCompleted(recordingBuffer);
        } else {
          onShotCompleted(frameBufferRef.current.slice(-45));
        }
      }
    }, 33);
  }, [isRecordingShot, onShotCompleted]);

  // Preset Generator: Elite Kohli Drive (9.4/10), Collapsed Elbow (6.4/10), Head Fall (5.8/10)
  const loadPresetShot = (mode: 'elite' | 'dropped_elbow' | 'head_fall') => {
    const frames: FrameLandmarks[] = [];
    const totalFrames = 48;

    for (let i = 0; i < totalFrames; i++) {
      const p = i / totalFrames;
      const lms = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0.0, visibility: 0.99 }));

      // Head
      let headX = 0.48 - p * 0.03;
      if (mode === 'head_fall') {
        headX = 0.48 + (p > 0.4 ? (p - 0.4) * 0.22 : 0); // Leaning out to off-side
      }
      lms[0] = { x: headX, y: 0.18, z: 0.0, visibility: 0.99 };

      // Shoulders
      lms[11] = { x: 0.44, y: 0.28, z: 0.0, visibility: 0.99 };
      lms[12] = { x: 0.54, y: 0.28, z: 0.0, visibility: 0.99 };

      // Knees & Feet
      lms[25] = { x: 0.43, y: 0.72, z: 0.0, visibility: 0.99 };
      lms[26] = { x: 0.54, y: 0.72, z: 0.0, visibility: 0.99 };
      lms[27] = { x: 0.41, y: 0.92, z: 0.0, visibility: 0.99 };
      lms[28] = { x: 0.56, y: 0.92, z: 0.0, visibility: 0.99 };

      // Downswing kinematics
      let wrX = 0.54;
      let wrY = 0.40;
      if (i <= 16) {
        wrX = 0.54 + (i / 16) * 0.04;
        wrY = 0.45 - (i / 16) * 0.14;
      } else if (i <= 28) {
        const dp = (i - 16) / 12;
        const ease = dp * dp;
        wrX = 0.58 - ease * 0.16;
        wrY = 0.31 + ease * 0.35;
      } else {
        const fp = (i - 28) / 20;
        wrX = 0.42 - fp * 0.08;
        wrY = 0.66 - fp * 0.38;
      }

      lms[15] = { x: wrX, y: wrY, z: 0.0, visibility: 0.99 };
      lms[16] = { x: wrX + 0.03, y: wrY + 0.02, z: 0.0, visibility: 0.99 };

      // Front Elbow
      if (mode === 'dropped_elbow') {
        // Collapsed elbow pointing down
        lms[13] = { x: wrX - 0.02, y: wrY + 0.04, z: 0.0, visibility: 0.99 };
      } else {
        // High leading elbow
        lms[13] = { x: wrX - 0.08, y: wrY - 0.12, z: 0.0, visibility: 0.99 };
      }

      frames.push({
        frame_index: i,
        timestamp_ms: i * 33.3,
        landmarks: lms,
      });
    }

    onShotCompleted(frames);
  };

  return (
    <div className="pro-card rounded-2xl p-6 border border-slate-700/60 shadow-2xl relative overflow-hidden">
      {/* Broadcast HUD Top Bar */}
      <div className="flex items-center justify-between pb-3.5 border-b border-slate-800/80 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-400 font-mono text-[11px] font-bold">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            LIVE TELEMETRY
          </div>
          <div className="text-xs font-mono text-slate-400 font-medium">
            VIEW: <strong className="text-slate-200">{cameraAngle.replace('_', ' ').toUpperCase()}</strong>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-xs bg-slate-900/90 text-emerald-400 px-2.5 py-1 rounded-lg border border-slate-800 font-bold">
            {cameraActive ? `${fps} FPS` : 'STANDBY'}
          </span>
          <span className="text-xs font-mono bg-slate-900/90 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-800">
            {batterHand.toUpperCase()}-HAND
          </span>
        </div>
      </div>

      {/* Video & Canvas Viewport */}
      <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-slate-950 border border-slate-800/80 shadow-2xl flex items-center justify-center bg-tech-grid">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover ${cameraActive ? 'opacity-85' : 'hidden'}`}
        />

        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
        />

        {/* Inactive Standby Screen */}
        {!cameraActive && (
          <div className="text-center p-8 max-w-md z-10">
            <div className="w-16 h-16 rounded-2xl bg-slate-900/90 border border-slate-700/70 flex items-center justify-center mx-auto mb-4 text-emerald-400 shadow-glow-green">
              <Camera className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-extrabold text-white mb-1">Optical Pose Telemetry Feed</h4>
            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              Connect a 60 FPS camera or load instant pro telemetry strokes to test cover drive kinematics.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={startCamera}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-glow-green transition-all"
              >
                Turn On Camera
              </button>
            </div>
          </div>
        )}

        {/* Flaw Target Banner */}
        {highlightJoint && (
          <div className="absolute top-3 left-3 bg-rose-600/90 text-white text-xs font-bold px-3 py-1.5 rounded-lg border border-rose-400/50 shadow-glow-red flex items-center gap-2 backdrop-blur-md">
            <Crosshair className="w-3.5 h-3.5 animate-spin" />
            FAULT FOCUS: {highlightJoint.replace('_', ' ').toUpperCase()}
          </div>
        )}

        {/* Bat Speed HUD Gauge */}
        {cameraActive && (
          <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-md p-3 rounded-xl border border-slate-800 text-xs shadow-lg">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Wrist Swing Velocity
            </div>
            <div className="w-36 bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-amber-400 transition-all duration-100"
                style={{ width: `${kinematicSpeed}%` }}
              />
            </div>
          </div>
        )}

        {/* Recording Banner */}
        {isRecordingShot && (
          <div className="absolute inset-x-0 bottom-0 p-3 bg-slate-950/95 border-t border-rose-500/50 backdrop-blur-md">
            <div className="flex items-center justify-between text-xs font-bold text-rose-400 mb-1.5 font-mono">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                RECORDING HIGH-SPEED STROKE...
              </span>
              <span>{recordingProgress}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-rose-500 transition-all duration-75"
                style={{ width: `${recordingProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Preset Showcase Controls (Immediate Testing) */}
      <div className="mt-4 pt-3 border-t border-slate-800/60">
        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2 flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-amber-400" />
          Instant Telemetry Showcase Presets:
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => loadPresetShot('elite')}
            className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-emerald-500/30 text-left transition-all group"
          >
            <div className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Elite Drive
            </div>
            <div className="text-[10px] text-slate-400">9.4/10 Pro Stride</div>
          </button>

          <button
            onClick={() => loadPresetShot('dropped_elbow')}
            className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-rose-500/30 text-left transition-all group"
          >
            <div className="text-[11px] font-bold text-rose-400 flex items-center gap-1">
              <Crosshair className="w-3.5 h-3.5" />
              Dropped Elbow
            </div>
            <div className="text-[10px] text-slate-400">6.4/10 Collapsed Arm</div>
          </button>

          <button
            onClick={() => loadPresetShot('head_fall')}
            className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-amber-500/30 text-left transition-all group"
          >
            <div className="text-[11px] font-bold text-amber-400 flex items-center gap-1">
              <Crosshair className="w-3.5 h-3.5" />
              Head Falling
            </div>
            <div className="text-[10px] text-slate-400">5.8/10 Slicing Line</div>
          </button>
        </div>
      </div>

      {/* Main Action Bar */}
      <div className="mt-4 flex items-center justify-between gap-3">
        {cameraActive ? (
          <button
            onClick={stopCamera}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition-all flex items-center gap-1.5"
          >
            <VideoOff className="w-3.5 h-3.5" />
            Stop Camera
          </button>
        ) : (
          <button
            onClick={startCamera}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-400 font-bold text-xs border border-emerald-500/30 transition-all flex items-center gap-1.5"
          >
            <Camera className="w-3.5 h-3.5" />
            Start Webcam
          </button>
        )}

        <button
          onClick={triggerShotCapture}
          disabled={!cameraActive || isRecordingShot || isAnalyzing}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg transition-all flex items-center gap-2 ${
            !cameraActive || isRecordingShot || isAnalyzing
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-glow-green'
          }`}
        >
          <Crosshair className="w-4 h-4" />
          {isRecordingShot ? 'Analyzing Motion...' : isAnalyzing ? 'Processing Shot...' : 'Capture 2.5s Stroke'}
        </button>
      </div>

      {cameraError && (
        <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300">
          {cameraError}
        </div>
      )}
    </div>
  );
};
