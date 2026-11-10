import React, { useRef, useCallback, useEffect, useState } from 'react';

/**
 * VideoPlayer — shared custom player:
 *   play/pause · speed 0.25x / 0.5x / 1x · frame step · scrubber
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
}

const SPEEDS = [0.25, 0.5, 1];

function timeToFrame(currentTime: number, duration: number, total: number): number {
  if (!duration || total <= 1) return 0;
  return Math.round((currentTime / duration) * (total - 1));
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
  className = '',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [isPaused, setIsPaused] = useState(true);

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

  const handleLoadedMetadata = useCallback(() => {
    setDuration(videoRef.current?.duration ?? 0);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const f = timeToFrame(video.currentTime, duration, totalFrames);
    const ms = (f / Math.max(1, totalFrames - 1)) * duration;
    setIsPaused(video.paused);
    onSeekTime(ms);
  }, [duration, totalFrames, onSeekTime]);

  const handlePause = useCallback(() => setIsPaused(true), []);
  const handlePlay = useCallback(() => setIsPaused(false), []);

  const handleScrub = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const target = Number(e.target.value);
      const ms = (target / Math.max(1, totalFrames - 1)) * duration;
      onSeekTime(ms);
    },
    [duration, totalFrames, onSeekTime]
  );

  const handleStep = useCallback(
    (deltaMs: number) => {
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
          className="w-full h-full object-contain"
          aria-label="Shot video"
        />
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
