"""
Video normalization for upload robustness.

Probes uploaded files with ffmpeg and converts non-H.264/yuv420p/MP4
files to browser-compatible H.264 MP4. Caps resolution at 1280px on the
long side but keeps the original fps (frame dropping would break ball
tracking).
"""

import re
import subprocess
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import imageio_ffmpeg

FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()


def probe_video(path: Path) -> Dict[str, Any]:
    """Probe a video file with ffmpeg and return stream/format info.

    Returns a dict with keys: codec_name, pix_fmt, width, height,
    r_frame_rate, format_name, duration. Missing fields are None.
    Raises RuntimeError if ffmpeg cannot read the file at all.
    """
    result = subprocess.run(
        [
            FFMPEG_EXE,
            "-i", str(path),
            "-hide_banner",
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    stderr = result.stderr or ""

    # Parse container format
    fmt_match = re.search(
        r"Input #0,\s+([^\s,]+)", stderr
    )
    format_name = fmt_match.group(1) if fmt_match else None

    # Find the first video stream. Parse each field separately: real files add
    # language tags "(und)", several "(...)" codec notes and "yuv420p(tv, ...)",
    # which broke a single all-in-one regex (every upload was re-encoded).
    codec_name = pix_fmt = width = height = fps = None
    line = next((ln for ln in stderr.splitlines() if re.search(r"Stream #\d+:\d+.*?:\s*Video:", ln)), None)
    if line:
        body = line.split("Video:", 1)[1]
        m = re.match(r"\s*(\w+)", body)
        codec_name = m.group(1) if m else None
        m = re.search(r",\s*(yuv\w+|yuvj\w+|nv\d+\w*|rgb\w+|bgr\w+|gray\w*|p010\w*)", body)
        pix_fmt = m.group(1) if m else None
        m = re.search(r",\s*(\d{2,5})x(\d{2,5})", body)
        if m:
            width, height = int(m.group(1)), int(m.group(2))
        m = re.search(r"([\d.]+)\s*fps", body)
        fps = float(m.group(1)) if m else None

    # Duration
    dur_match = re.search(r"Duration:\s*(\d+:\d+:\d+\.\d+)", stderr)
    duration = None
    if dur_match:
        parts = dur_match.group(1).split(":")
        duration = (
            int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
        )

    return {
        "codec_name": codec_name,
        "pix_fmt": pix_fmt,
        "width": width,
        "height": height,
        "r_frame_rate": fps,
        "format_name": format_name,
        "duration": duration,
    }


def is_compatible(info: Dict[str, Any]) -> bool:
    """Check if video is H.264 + yuv420p + MP4/mov container."""
    if info.get("codec_name") != "h264":
        return False
    if info.get("pix_fmt") != "yuv420p":
        return False
    fmt = info.get("format_name", "") or ""
    return "mov" in fmt.lower() or "mp4" in fmt.lower()


def remux_faststart(input_path: Path, output_path: Path) -> Dict[str, Any]:
    """Lossless stream copy into MP4 with the index (moov) at the front.

    For uploads that are already H.264/yuv420p: browsers can start playback
    immediately and no image quality is lost. Raises RuntimeError on failure.
    """
    result = subprocess.run(
        [FFMPEG_EXE, "-i", str(input_path), "-c", "copy", "-movflags", "+faststart", "-y", str(output_path)],
        capture_output=True, text=True, timeout=120,
    )
    if result.returncode != 0 or not Path(output_path).exists():
        raise RuntimeError(f"remux failed: {result.stderr[-300:]}")
    return probe_video(output_path)


def normalize_video(input_path: Path, output_path: Path) -> Dict[str, Any]:
    """
    Normalize a video to H.264 + yuv420p + MP4 with faststart.

    Caps resolution at 1280px on the long side but keeps the original fps
    (frame dropping would break ball tracking). Returns probe info of the
    output file. Raises RuntimeError if normalization fails.
    """
    info = probe_video(input_path)
    width = info.get("width") or 0
    height = info.get("height") or 0

    # Build scale filter if needed (cap long side at 1280px, keep aspect)
    vf_filters = []
    if width > 1280 or height > 1280:
        if width >= height:
            new_w = 1280
            new_h = max(1, int(height * 1280 / width))
        else:
            new_h = 1280
            new_w = max(1, int(width * 1280 / height))
        # yuv420p requires even dimensions
        new_w = new_w if new_w % 2 == 0 else new_w + 1
        new_h = new_h if new_h % 2 == 0 else new_h + 1
        vf_filters.append(f"scale={new_w}:{new_h}")

    cmd = [
        FFMPEG_EXE,
        "-i", str(input_path),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "veryfast",
        "-crf", "18",          # near-transparent: a small, fast ball survives re-encoding
        "-c:a", "aac",
        "-movflags", "+faststart",
        "-y",
    ]
    if vf_filters:
        cmd.extend(["-vf", ",".join(vf_filters)])
    cmd.append(str(output_path))

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=180,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"ffmpeg normalization failed (exit {result.returncode}): "
            f"{result.stderr.strip()[-500:] if result.stderr else 'no stderr'}"
        )

    if not output_path.exists():
        raise RuntimeError("ffmpeg produced no output file")

    # Return probe info of output
    return probe_video(output_path)


def get_ffmpeg_path() -> str:
    """Return the path to the bundled ffmpeg executable."""
    return FFMPEG_EXE
