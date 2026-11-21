import React, { useCallback, useRef, useState } from 'react';
import { Film, UploadCloud, X } from 'lucide-react';

interface UploadDropzoneProps {
  onAnalyze: (file: File) => void;
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
  const input = useRef<HTMLInputElement>(null);

  const select = useCallback((f?: File | null) => {
    if (!f) return;
    const err = validateVideoFile(f);
    if (err) { setError(err); return; }
    setError(null);
    setFile(f);
    setUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(f); });
  }, [setError]);

  const clear = () => {
    if (url) URL.revokeObjectURL(url);
    setFile(null);
    setUrl(null);
    if (input.current) input.current.value = '';
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
            {url && <video src={url} controls playsInline muted className="max-h-[50vh] w-auto max-w-full" />}
          </div>
          <div className="p-3 flex flex-wrap items-center gap-3">
            <Film className="w-4 h-4 text-mute shrink-0" />
            <span className="flex-1 min-w-0 text-[13px] text-ink truncate">
              {file.name} <span className="text-mute">· {(file.size / (1024 * 1024)).toFixed(1)} MB</span>
            </span>
            <button className="btn btn-ghost" onClick={clear}>Change</button>
            <button className="btn btn-primary w-full sm:w-auto" onClick={() => onAnalyze(file)}>
              Analyse shot
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default UploadDropzone;
