"""
Bat-ball contact detection: audio + vision fusion.
=================================================

Vision alone struggles at the moment that matters: the ball is small, blurred
and often occluded by the bat, and the bat position is only a wrist-based
estimate. Phone videos, however, record the *sound* of the hit — a sharp,
broadband crack — with millisecond timing.

1. Audio onsets   high-pass (> 2 kHz) the soundtrack, 5 ms RMS envelope,
                  onset strength = rise over the previous 30 ms. Candidates
                  must be sharp (>= ONSET_DB) and loud (>= LEVEL_DB over the
                  clip's median level).
2. Swing window   from the pose: the burst of fastest wrist movement
                  (SWING_BEFORE_S before the peak to SWING_AFTER_S after).
3. Reach gate     at each candidate time, where is the ball? First a *local
                  search*: run the ball model on the frames +/-2 around the
                  sound at a low threshold, keeping only boxes within reach
                  of the hands (we know where to look, so stray detections
                  elsewhere can't interfere). Else the tracked ball, else the
                  incoming track extrapolated (<= EXTRAP_MAX_S). The ball must
                  be within bat's reach of the hands (<= REACH_TORSO).
4. Pick           the EARLIEST candidate that passes — sounds after the real
                  hit (bat hitting the floor, footsteps) come later, and a
                  ball-on-floor bounce before it fails the reach gate.

Confidence: high   audio + ball detected near the hands
            medium audio + extrapolated ball near the hands
            low    audio + swing only (ball position unknown)
Without usable audio the caller's vision-only method is used.
"""
from __future__ import annotations

import subprocess
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np

SR = 22050
HIGHPASS_HZ = 2000
HOP_S = 0.005
ONSET_DB = 8.0          # sharpness: rise over the previous 30 ms
LEVEL_DB = 12.0         # loudness over the clip's median high-band level
NMS_S = 0.08            # merge onsets closer than this
SWING_BEFORE_S = 0.7
SWING_AFTER_S = 0.5
REACH_TORSO = 2.4       # bat (~0.85 m) + arms, in torso lengths (~0.5 m)
EXTRAP_MAX_S = 0.5
LOCAL_CONF = 0.10       # low is safe: only boxes within reach of the hands, +/-2 frames
                        # around a loud crack in the swing (re-encodes blur the ball)
# Search window around a sound, in frames: mostly *before* it. At impact the ball
# is hidden behind the bat, so it's seen just before the crack; phone audio can
# also lag the picture by a frame or two. Sounds can be only ~4 frames apart
# (ball hitting the floor, then the bat hitting the ball), so the window must
# not reach the next event.
LOCAL_BEFORE = 3
LOCAL_AFTER = 1

BallSearch = Callable[[np.ndarray], List[Tuple[float, float, float]]]

MP_L_SH, MP_R_SH, MP_L_WR, MP_R_WR, MP_L_HIP, MP_R_HIP = 11, 12, 15, 16, 23, 24


# ── audio ─────────────────────────────────────────────────────────────────
def audio_onsets(video_path: str) -> Optional[List[Dict[str, float]]]:
    """Sharp transients as [{t, onset_db, level_db}], or None if there's no audio."""
    import imageio_ffmpeg
    from scipy.signal import butter, sosfiltfilt

    try:
        raw = subprocess.run(
            [imageio_ffmpeg.get_ffmpeg_exe(), "-v", "error", "-i", video_path,
             "-vn", "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
            capture_output=True, check=True, timeout=60,
        ).stdout
    except (subprocess.SubprocessError, OSError):
        return None
    a = np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0
    if len(a) < SR * 0.2 or float(np.abs(a).max()) < 1e-4:
        return None                                    # no / silent audio track
    hp = sosfiltfilt(butter(4, HIGHPASS_HZ, "highpass", fs=SR, output="sos"), a)
    hop = int(HOP_S * SR)
    n = len(hp) // hop
    env = np.sqrt((hp[: n * hop].reshape(n, hop) ** 2).mean(axis=1) + 1e-12)
    db = 20 * np.log10(env)
    base = float(np.median(db))
    k = int(0.03 / HOP_S)
    prev = np.array([db[max(0, i - k):i].mean() if i else db[0] for i in range(n)])
    onset = np.maximum(0.0, db - prev)

    cands = [i for i in range(n) if onset[i] >= ONSET_DB and db[i] - base >= LEVEL_DB]
    cands.sort(key=lambda i: -onset[i])
    kept: List[int] = []
    for i in cands:                                    # non-maximum suppression
        if all(abs(i - j) * HOP_S > NMS_S for j in kept):
            kept.append(i)
    return [{"t": round(i * HOP_S, 3), "onset_db": round(float(onset[i]), 1),
             "level_db": round(float(db[i] - base), 1)} for i in sorted(kept)]


# ── pose helpers ──────────────────────────────────────────────────────────
def _hands_and_torso(det, i: int) -> Tuple[Optional[np.ndarray], Optional[float]]:
    xy = det["mp_xy"][i] if i < len(det["mp_xy"]) else None
    vis = det["mp_vis"][i] if i < len(det["mp_vis"]) else None
    if xy is None or vis is None:
        return None, None
    wr = [w for w in (MP_L_WR, MP_R_WR) if vis[w] >= 0.3]
    if not wr:
        return None, None
    hands = xy[wr].mean(axis=0)
    torso = float(np.linalg.norm((xy[MP_L_SH] + xy[MP_R_SH]) / 2 - (xy[MP_L_HIP] + xy[MP_R_HIP]) / 2))
    return hands, (torso if torso > 1 else None)


def swing_window(det) -> Optional[Tuple[int, int, int]]:
    """(start, peak, end) frames around the fastest hand movement."""
    fps, n = det["fps"], det["n"]
    speed = np.zeros(n)
    prev = None
    for i in range(n):
        h, torso = _hands_and_torso(det, i)
        if h is not None and torso and prev is not None:
            speed[i] = float(np.linalg.norm(h - prev)) / torso
        prev = h if h is not None else prev
    if not speed.any():
        return None
    peak = int(np.argmax(np.convolve(speed, np.ones(3) / 3, mode="same")))
    return (max(0, peak - int(SWING_BEFORE_S * fps)), peak, min(n - 1, peak + int(SWING_AFTER_S * fps)))


# ── ball position at an arbitrary frame ──────────────────────────────────
def ball_at(det, f: float) -> Tuple[Optional[np.ndarray], str]:
    """Ball px at (fractional) frame f: ('detected' within 2 frames) or ('extrapolated')."""
    fi = int(round(f))
    for j in sorted(range(int(np.ceil(f - LOCAL_BEFORE)), int(np.floor(f + LOCAL_AFTER)) + 1),
                    key=lambda j: abs(j - f)):
        if 0 <= j < det["n"] and det["balls"][j] is not None:
            return np.asarray(det["balls"][j], float), "detected"
    pts = [(j, det["balls"][j]) for j in range(min(fi, det["n"])) if det["balls"][j] is not None]
    if len(pts) < 3 or (f - pts[-1][0]) / det["fps"] > EXTRAP_MAX_S:
        return None, "unknown"
    pts = pts[-8:]
    t = np.array([p[0] for p in pts], float)
    xy = np.array([p[1] for p in pts], float)
    deg = 2 if len(pts) >= 5 else 1
    return np.array([np.polyval(np.polyfit(t, xy[:, k], deg), f) for k in (0, 1)]), "extrapolated"


def local_search(video_path: str, det, f: float, search: BallSearch
                 ) -> Tuple[Optional[np.ndarray], Optional[float], Optional[int]]:
    """Closest-to-the-hands ball within reach in frames [f-LOCAL_BEFORE, f+LOCAL_AFTER].

    Returns (ball_px, confidence, frame) or (None, None, None).
    """
    import math

    import cv2

    lo = max(0, math.ceil(f - LOCAL_BEFORE))
    hi = min(det["n"] - 1, math.floor(f + LOCAL_AFTER))
    cap = cv2.VideoCapture(video_path)
    cap.set(cv2.CAP_PROP_POS_FRAMES, lo)
    best = (None, None, None, float("inf"))
    for j in range(lo, hi + 1):
        ok, frame = cap.read()
        if not ok:
            break
        hands, torso = _hands_and_torso(det, j)
        if hands is None or not torso:
            continue
        for x, y, c in search(frame):
            if c < LOCAL_CONF:
                continue
            reach = float(np.hypot(x - hands[0], y - hands[1])) / torso
            # prefer frames nearest the sound, then the ball nearest the hands
            score = abs(j - f) + reach
            if reach <= REACH_TORSO and score < best[3]:
                best = (np.array([x, y]), c, j, score)
    cap.release()
    return best[0], best[1], best[2]


# ── fusion ────────────────────────────────────────────────────────────────
def detect_contact(video_path: str, det: Dict[str, Any],
                   vision_fallback: Callable[[], Tuple[Optional[int], Dict[str, Any]]],
                   ball_search: Optional[BallSearch] = None,
                   ) -> Tuple[Optional[int], Dict[str, Any]]:
    """Return (contact_frame, ball_contact report). Falls back to vision-only."""
    onsets = audio_onsets(video_path)
    swing = swing_window(det)
    if not onsets or swing is None:
        f, rep = vision_fallback()
        rep.setdefault("audio", "no audio track" if onsets is None else
                       ("no sharp sounds" if not onsets else "no swing found"))
        return f, rep

    fps = det["fps"]
    s0, peak, s1 = swing
    checked: List[Dict[str, Any]] = []
    for o in onsets:
        f = o["t"] * fps
        if not (s0 <= f <= s1):
            continue
        hands, torso = _hands_and_torso(det, int(round(f)))
        ball, src, local_conf = None, "unknown", None
        if ball_search is not None:
            ball, local_conf, _ = local_search(video_path, det, f, ball_search)
            if ball is not None:
                src = "detected"
        if ball is None:
            ball, src = ball_at(det, f)
        reach = (float(np.linalg.norm(ball - hands)) / torso
                 if ball is not None and hands is not None and torso else None)
        ok = reach is None or reach <= REACH_TORSO
        checked.append({**o, "frame": round(f, 1), "ball": src,
                        "local_conf": None if local_conf is None else round(float(local_conf), 2),
                        "reach_torso": None if reach is None else round(reach, 2), "passes": ok})
        if ok:
            conf = "high" if src == "detected" else "medium" if src == "extrapolated" else "low"
            fr = int(round(f))
            return fr, {
                "status": "ok", "frame": fr, "time_ms": round(o["t"] * 1000.0, 1),
                "method": "audio+vision" if src != "unknown" else "audio+swing",
                "confidence": conf,
                "ball_px": None if ball is None else [round(float(ball[0]), 1), round(float(ball[1]), 1)],
                "audio": {"onset_db": o["onset_db"], "level_db": o["level_db"]},
                "candidates": checked,
            }

    f, rep = vision_fallback()
    rep["audio"] = {"candidates": checked, "note": "no sound in the swing had the ball within reach"}
    return f, rep
