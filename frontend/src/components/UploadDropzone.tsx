import React, { useCallback, useRef, useState } from 'react';
import { Crosshair, Film, UploadCloud, X } from 'lucide-react';

/** The batter the user tapped: video time (s) and position (0-1 of the picture). */
export interface SubjectPick {
  t: number;
  x: number;
  y: number;
}

interface UploadDropzoneProps {
  onAnalyze: (file: File, subject: SubjectPick | null) => void;
  error?: string | null;
  setError: (err: string | null) => void;
}

// video/* lets phones offer "Record video" as well as the gallery.
const ACCEPT = 'video/*,.mp4,.mov,.avi';
const MAX_SIZE_MB = 200;

export function validateVideoFile(file: File): string | null {
  const name = file.name.toLowerCase();
  const okType =
    /mp4|quicktime|msvideo/.test(file.type) || /\.(mp4|mov|avi)$/.test(name);
  if (!okType) return 'Only MP4, MOV and AVI videos are supported.';
  if (file.size > MAX_SIZE_MB * 1024 * 1024) return `That file is too large — the limit is ${MAX_SIZE_MB} MB.`;
  return null;
}

/**
 * UploadDropzone — tap anywhere (or drop a file) to pick a clip, preview it,
 * then Analyse. Works with a phone's camera roll or camera.
 */
export const UploadDropzone: React.FC<UploadDropzoneProps> = ({ onAnalyze, error, setError }) => {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [subject, setSubject] = useState<SubjectPick | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const select = useCallback((f?: File | null) => {
    if (!f) return;
    const err = validateVideoFile(f);
    if (err) { setError(err); return; }
    setError(null);
    setFile(f);
    setSubject(null);
    setPicking(false);
    setUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(f); });
  }, [setError]);

  const clear = () => {
    if (url) URL.revokeObjectURL(url);
    setFile(null);
    setUrl(null);
    setSubject(null);
    setPicking(false);
    if (input.current) input.current.value = '';
  };

  const startPicking = () => {
    videoRef.current?.pause();
    setPicking(true);
  };

  /** Tap position as 0-1 of the video picture, plus the paused time. */
  const onPick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const r = v.getBoundingClientRect();
    setSubject({
      t: v.currentTime,
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    });
    setPicking(false);
  };

  return (
    <section className="space-y-3" aria-label="Upload shot video">
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-bad/40 bg-bad/10 text-[13px] text-bad" role="alert">
          <X className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button className="text-xs underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {!file ? (
        <label
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => { e.preventDefault(); setDragActive(false); select(e.dataTransfer.files?.[0]); }}
          className={`card flex flex-col items-center justify-center gap-3 text-center px-6 py-12 sm:py-16 cursor-pointer border-2 border-dashed transition-colors ${
            dragActive ? 'border-accent bg-accent/10' : 'border-line-strong hover:border-accent/70'
          }`}
        >
          <span className="w-14 h-14 rounded-2xl bg-accent/15 text-accent flex items-center justify-center">
            <UploadCloud className="w-7 h-7" />
          </span>
          <span className="text-base font-semibold text-ink">
            <span className="hidden sm:inline">Drop a batting clip here or click to browse</span>
            <span className="sm:hidden">Tap to choose or record a clip</span>
          </span>
          <span className="text-xs text-mute">MP4 · MOV · AVI · up to {MAX_SIZE_MB} MB · one batter in frame</span>
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => select(e.target.files?.[0])}
          />
        </label>
      ) : (
        <div className="card overflow-hidden">
          <div className="bg-black flex justify-center">
            {url && (
              <div className="relative inline-block max-w-full">
                <video
                  ref={videoRef}
                  src={url}
                  controls={!picking}
                  playsInline
                  muted
                  className="block max-h-[50vh] w-auto max-w-full"
                />
                {/* tap layer: only while picking, so normal controls work otherwise */}
                {picking && (
                  <button
                    type="button"
                    onClick={onPick}
                    className="absolute inset-0 cursor-crosshair bg-accent/10 ring-2 ring-inset ring-accent"
                    aria-label="Tap the batter in the video"
                  />
                )}
                {subject && (
                  <span
                    className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full border-2 border-white bg-accent shadow pointer-events-none"
                    style={{ left: `${subject.x * 100}%`, top: `${subject.y * 100}%` }}
                    aria-hidden="true"
                  />
                )}
              </div>
            )}
          </div>

          {/* Batter selection */}
          <div className="px-3 pt-3 flex flex-wrap items-center gap-2 text-[13px]">
            <Crosshair className="w-4 h-4 text-accent shrink-0" />
            <span className="flex-1 min-w-[200px]">
              {picking ? (
                <span className="text-ink">Pause where the batter is visible, then tap the batter.</span>
              ) : subject ? (
                <span className="text-ink">Batter picked at {subject.t.toFixed(1)} s — the analysis will follow this player.</span>
              ) : (
                <span className="text-body">
                  Is someone else (bowler, umpire) bigger in the frame than the batter?{' '}
                  <span className="text-mute">Pick the batter so they're analysed.</span>
                </span>
              )}
            </span>
            {picking ? (
              <button className="btn btn-ghost" onClick={() => setPicking(false)}>Cancel</button>
            ) : (
              <>
                {subject && <button className="btn btn-ghost" onClick={() => setSubject(null)}>Clear</button>}
                <button className="btn btn-ghost" onClick={startPicking}>{subject ? 'Re-pick' : 'Pick batter'}</button>
              </>
            )}
          </div>

          <div className="p-3 flex flex-wrap items-center gap-3">
            <Film className="w-4 h-4 text-mute shrink-0" />
            <span className="flex-1 min-w-0 text-[13px] text-ink truncate">
              {file.name} <span className="text-mute">· {(file.size / (1024 * 1024)).toFixed(1)} MB</span>
            </span>
            <button className="btn btn-ghost" onClick={clear}>Change</button>
            <button className="btn btn-primary w-full sm:w-auto" disabled={picking} onClick={() => onAnalyze(file, subject)}>
              Analyse shot
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default UploadDropzone;
