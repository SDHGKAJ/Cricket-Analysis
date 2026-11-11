import React, { useState, useCallback, useRef } from 'react';
import { UploadCloud, FileVideo, X } from 'lucide-react';

interface UploadDropzoneProps {
  onFiles: (files: FileList) => void;
  onPreviewUrl?: (url: string | null) => void;
  disabled?: boolean;
  error?: string | null;
  setError: (err: string | null) => void;
}

const ACCEPT = 'video/mp4,video/quicktime,video/x-msvideo,.mp4,.mov,.avi';
const MAX_SIZE_MB = 200;

function validateFile(file: File): string | null {
  const name = file.name.toLowerCase();
  const okType =
    file.type.includes('mp4') ||
    file.type.includes('quicktime') ||
    file.type.includes('msvideo') ||
    name.endsWith('.mp4') ||
    name.endsWith('.mov') ||
    name.endsWith('.avi');
  if (!okType) return 'Only MP4, MOV and AVI video files are accepted.';
  if (file.size > MAX_SIZE_MB * 1024 * 1024)
    return `File too large — max ${MAX_SIZE_MB} MB.`;
  return null;
}

/**
 * UploadDropzone — large dashed drop zone on a dark panel with a gradient
 * accent border, file picker fallback, thumbnail preview, Analyze + Remove.
 */
export const UploadDropzone: React.FC<UploadDropzoneProps> = ({
  onFiles,
  onPreviewUrl,
  disabled = false,
  error,
  setError,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      if (!e.dataTransfer.files.length) return;
      onFiles(e.dataTransfer.files);
    },
    [onFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files) return;
      onFiles(e.target.files);
    },
    [onFiles]
  );

  const handleSelectFile = useCallback(
    (files: FileList) => {
      const file = files[0];
      const err = validateFile(file);
      if (err) { setError(err); return; }
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      onPreviewUrl?.(url);
      setError(null);
    },
    [setError]
  );

  return (
    <section className="panel p-5 space-y-4 fade-in" aria-label="Upload shot video">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#FFFFFF]">Upload shot video</h2>
          <p className="text-xs text-[#6E7486] mt-1">
            Record a single batsman from side-on or front-on, then hit Analyze.
          </p>
        </div>
        {error && (
          <button
            onClick={() => setError(null)}
            className="text-xs text-[#6E7486] hover:text-[#FFFFFF] underline underline-offset-4"
          >
            Dismiss
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-[8px] border border-[#F4533F]/30 bg-[#F4533F]/10 text-[12px] text-[#F4533F]">
          <X className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {!selectedFile ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
          onDragEnd={(e) => { e.preventDefault(); setDragActive(false); }}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-[16px] p-14 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-3 ${
            disabled
              ? 'border-[#444A5B]/40 bg-[#242833]/40 opacity-60 cursor-not-allowed'
              : dragActive
                ? 'border-[#1FB5D6] bg-[#1FB5D6]/10 text-[#1FB5D6]'
                : 'border-[rgba(255,255,255,0.12)] text-[#AAB0BD] hover:border-[#1FB5D6] hover:bg-[#1FB5D6]/05 hover:text-[#FFFFFF]'
          }`}
          aria-label="Drop video here"
        >
          <div className="w-12 h-12 rounded-[12px] flex items-center justify-center bg-[#1FB5D6]/15 text-[#1FB5D6]">
            <UploadCloud className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-[#FFFFFF]">
            {disabled ? 'Analysis running — drop disabled' : 'Drag & drop video here'}
          </p>
          <p className="text-[11px] text-[#6E7486]">
            or{' '}
            <span
              className="text-[#1FB5D6] hover:text-[#5CC8E0] cursor-pointer underline underline-offset-1"
              onClick={(e) => {
                e.preventDefault();
                fileInput.current?.click();
              }}
            >
              browse files
            </span>
          </p>
          <p className="text-[11px] text-[#6E7486] mt-1">MP4 · MOV · AVI · up to {MAX_SIZE_MB} MB</p>

          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            className="hidden"
            disabled={disabled}
            onChange={(e) => handleSelectFile(e.target.files!)}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative rounded-[12px] overflow-hidden bg-[#242833] aspect-video border border-[rgba(255,255,255,0.08)]">
            {previewUrl && (
              <video
                src={previewUrl}
                controls
                className="w-full h-full object-contain"
              />
            )}
          </div>

          <div className="flex items-center justify-between text-[12px] text-[#AAB0BD]">
            <span className="truncate font-medium text-[#FFFFFF]">
              {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)
            </span>
            <button
              onClick={() => {
                setSelectedFile(null);
                setPreviewUrl(null);
                onPreviewUrl?.(null);
                URL.revokeObjectURL(previewUrl!);
              }}
              className="text-[#6E7486] hover:text-[#F4533F] underline underline-offset-1"
            >
              Remove
            </button>
          </div>

          <button
            onClick={() => onFiles({ 0: selectedFile, length: 1 } as unknown as FileList)}
            disabled={disabled}
            className="w-full py-3 rounded-[12px] bg-[#1FB5D6] text-[#052E16] font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#5CC8E0] transition-colors"
          >
            {disabled ? (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6a6 6 0 1 0 0 12"/></svg>
                Analyzing…
              </span>
            ) : (
              <>
                <FileVideo className="w-4 h-4" /> Analyze video
              </>
            )}
          </button>
        </div>
      )}
    </section>
  );
};
