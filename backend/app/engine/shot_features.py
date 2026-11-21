"""
Pose-sequence features for the shot-type classifier.
====================================================

Shared by training (``train_shot_classifier.py``) and inference
(``shot_classifier.MLShotClassifier``) so the two can never drift apart —
the previous classifier was trained on uniformly-sampled whole clips but fed
the first 45 frames at inference.

Pipeline for one clip:
1. ``select_window``  — the dataset clips are trimmed to ~2 s around the
   shot; a phone clip has a long stance first. Take a WINDOW_S window around
   the fastest wrist movement (the swing). Short clips are used whole.
2. sample SEQ_LEN time points evenly across the window, each taking the
   nearest frame that has a detected pose
3. normalise every frame: centre on the hip midpoint, scale by the median
   torso length (shoulder-mid to hip-mid), so camera distance and framing
   don't matter
4. features = 33 landmarks * (x, y) positions + their frame-to-frame
   velocities  ->  (SEQ_LEN, 132)
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

FEATURE_VERSION = 2
SEQ_LEN = 45
N_LANDMARKS = 33
N_FEATURES = N_LANDMARKS * 2 * 2      # (x, y) position + (x, y) velocity
WINDOW_S = 2.2                         # ~median dataset clip length
MIN_POSE_SHARE = 0.4                   # need a pose in >= 40% of the window's frames
VIS_MIN = 0.3

L_SHOULDER, R_SHOULDER, L_WRIST, R_WRIST, L_HIP, R_HIP = 11, 12, 15, 16, 23, 24


def frames_to_arrays(frames: Sequence[Dict[str, Any]]) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """API frame dicts -> (t_ms (T,), pts (T, 33, 3) as x, y, visibility, has_pose (T,))."""
    t = np.array([float(f.get("timestamp_ms", i * 33.3)) for i, f in enumerate(frames)], dtype=np.float64)
    pts = np.zeros((len(frames), N_LANDMARKS, 3), dtype=np.float32)
    has = np.zeros(len(frames), dtype=bool)
    for i, f in enumerate(frames):
        lms = f.get("landmarks") or []
        if len(lms) >= N_LANDMARKS:
            for j, lm in enumerate(lms[:N_LANDMARKS]):
                get = lm.get if isinstance(lm, dict) else (lambda k, d=None, _lm=lm: getattr(_lm, k, d))
                vis = get("visibility", 1.0)
                pts[i, j] = (get("x", 0.0), get("y", 0.0), 1.0 if vis is None else vis)
            has[i] = True
    return t, pts, has


def _centre_scale(p: np.ndarray) -> Tuple[np.ndarray, float]:
    """Hip midpoint and torso length for one frame (33, 3)."""
    hip = (p[L_HIP, :2] + p[R_HIP, :2]) / 2
    sho = (p[L_SHOULDER, :2] + p[R_SHOULDER, :2]) / 2
    return hip, float(np.linalg.norm(sho - hip))


def select_window(t: np.ndarray, pts: np.ndarray, has: np.ndarray,
                  window_s: float = WINDOW_S) -> Tuple[int, int]:
    """[start, end] frame indices of the swing window (inclusive)."""
    n = len(t)
    if n == 0 or (t[-1] - t[0]) / 1000.0 <= window_s:
        return 0, max(0, n - 1)
    idx = np.where(has)[0]
    if len(idx) < 3:
        return 0, n - 1
    # wrist speed in torso lengths per second, on pose frames only
    speeds = np.zeros(n)
    for a, b in zip(idx[:-1], idx[1:]):
        dt = (t[b] - t[a]) / 1000.0
        if dt <= 0:
            continue
        _, s = _centre_scale(pts[b])
        s = max(s, 1e-3)
        d = max(np.linalg.norm(pts[b, w, :2] - pts[a, w, :2]) for w in (L_WRIST, R_WRIST))
        speeds[b] = d / s / dt
    k = np.ones(5) / 5
    peak = int(np.argmax(np.convolve(speeds, k, mode="same")))
    half = window_s * 1000.0
    start_t = t[peak] - 0.55 * half      # swing peak ~55% into the window
    start_t = min(max(start_t, t[0]), t[-1] - half)
    s_i = int(np.searchsorted(t, start_t))
    e_i = int(np.searchsorted(t, start_t + half, side="right")) - 1
    return s_i, max(s_i, e_i)


def sequence_features(t: np.ndarray, pts: np.ndarray, has: np.ndarray,
                      window: Optional[Tuple[int, int]] = None) -> Optional[np.ndarray]:
    """(SEQ_LEN, N_FEATURES) float32, or None if the batter isn't visible enough."""
    if len(t) == 0:
        return None
    s, e = window if window is not None else select_window(t, pts, has)
    tw, pw, hw = t[s:e + 1], pts[s:e + 1], has[s:e + 1]
    pose_idx = np.where(hw)[0]
    if len(pose_idx) < 3 or hw.mean() < MIN_POSE_SHARE:
        return None

    # sample evenly in time; each sample takes the nearest frame with a pose
    targets = np.linspace(tw[0], tw[-1], SEQ_LEN)
    pt = tw[pose_idx]
    pick = pose_idx[np.abs(pt[None, :] - targets[:, None]).argmin(axis=1)]
    seq = pw[pick]                                   # (SEQ_LEN, 33, 3)

    centres = np.array([_centre_scale(p)[0] for p in seq])
    scale = float(np.median([_centre_scale(p)[1] for p in seq]))
    if scale < 1e-3:
        return None
    xy = (seq[:, :, :2] - centres[:, None, :]) / scale
    xy[seq[:, :, 2] < VIS_MIN] = 0.0                 # hide unreliable landmarks
    xy = np.clip(xy, -4.0, 4.0)
    vel = np.diff(xy, axis=0, prepend=xy[:1])
    feat = np.concatenate([xy.reshape(SEQ_LEN, -1), vel.reshape(SEQ_LEN, -1) * 5.0], axis=1)
    return feat.astype(np.float32)


def features_from_api_frames(frames: Sequence[Dict[str, Any]]) -> Optional[np.ndarray]:
    """Convenience wrapper for the API's frame dicts."""
    t, pts, has = frames_to_arrays(frames)
    return sequence_features(t, pts, has)
