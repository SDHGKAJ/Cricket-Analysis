"""
Hawk-Eye-style trajectory reconstruction from per-frame 2D ball detections.
===========================================================================

Consumes the *existing* ball detector's output — a list of
``{"f": frame, "x": px, "y": px, "conf": 0-1}`` — and produces one JSON
document per delivery that the frontend renders (video overlay + virtual
3D pitch).

Pipeline
--------
1. clean        drop conf < 0.4, Hampel outlier filter, keep longest run,
                linear interpolation of short gaps
2. smooth       Savitzky-Golay (per segment, so the bounce vertex stays sharp)
3. bounce       split where two ballistic curves beat one (a vertical-velocity sign
                flip side-on, a velocity kink from behind the bowler)
4. fit          quadratic in time per segment: gravity (y) + swing/drift (x)
5. predict      extrapolate the post-bounce fit to the stump plane
6. metrics      speed, length, line, swing, turn, height at stumps, decision

Single-camera honesty
---------------------
One camera only gives image positions. Everything in steps 1-4 (and the 2D
overlay) works from the video alone. Real-world metrics need a *pitch
calibration*: the two ends of each bowling crease plus the top of the middle
stump at the batter's end, clicked in the video. That gives a ground-plane
homography, so the **bounce point** (the one moment the ball is on the
ground) is located exactly. Speed, the release point and the post-bounce
flight to the stumps then rest on stated assumptions, which are written to
``notes`` in the output. Without calibration those metrics are ``None`` —
never guessed.

Run standalone::

    python -m app.engine.trajectory outputs/trajectory_<id>.json --calibration calib.json
"""
from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

SCHEMA_VERSION = 1

# ── Cricket geometry (metres, Laws of Cricket) ───────────────────────────
PITCH_LENGTH = 20.12          # stumps to stumps
CREASE_HALF = 1.32            # half of the 2.64 m bowling crease
PITCH_HALF_WIDTH = 1.525      # pitch is 3.05 m wide
POPPING_CREASE = 1.22         # popping crease in front of the stumps
STUMP_HEIGHT = 0.711
WICKET_HALF_WIDTH = 0.114     # outer edge of off/leg stump (wicket is 22.86 cm)
OUTER_STUMP_CENTRE = 0.095    # centre of off/leg stump
BALL_RADIUS = 0.036
GRAVITY = 9.81

# ── Assumptions (calibrated mode only; echoed into ``notes``) ────────────
RELEASE_HEIGHT = 2.0                          # m above the pitch at release
RELEASE_Y = PITCH_LENGTH - POPPING_CREASE     # bowler releases near the popping crease
BOUNCE_SPEED_RETAINED = 0.9                   # horizontal speed kept after pitching
PLAUSIBLE_SPEED_MPS = (5.0, 50.0)             # 18-180 km/h

DEFAULTS: Dict[str, Any] = {
    "conf_min": 0.4,        # drop detections below this confidence
    "hampel_half": 3,       # Hampel window half-width (frames)
    "hampel_k": 3.0,        # outlier if > k * scaled MAD from the window median
    "hampel_min_px": 6.0,   # ...and more than this many pixels away
    "max_gap": 5,           # interpolate gaps up to this many frames; longer gaps split the track
    "min_points": 6,        # need at least this many clean detections
    "sg_window": 7,         # Savitzky-Golay window (odd)
    "sg_order": 2,
    "min_segment": 3,       # frames needed on each side of a bounce
    "min_bounce_px": 2.0,   # image velocity must change by >= this many px/frame at a bounce
}


# ═══════════════════════════════════════════════════════════════════════
# 1. Cleaning
# ═══════════════════════════════════════════════════════════════════════
def _hampel_mask(v: np.ndarray, half: int, k: float, min_dev: float) -> np.ndarray:
    """True where v[i] is an outlier vs. the median of its neighbourhood.

    Bounce-safe: a median follows a monotonic ramp and a single vertex,
    unlike a global polynomial fit that would flag the points around a bounce.
    """
    n = len(v)
    out = np.zeros(n, dtype=bool)
    for i in range(n):
        lo, hi = max(0, i - half), min(n, i + half + 1)
        win = v[lo:hi]
        med = np.median(win)
        mad = 1.4826 * np.median(np.abs(win - med))
        dev = abs(v[i] - med)
        out[i] = dev > max(k * mad, min_dev)
    return out


def clean_detections(dets: Sequence[Dict[str, Any]], p: Dict[str, Any]
                     ) -> Tuple[np.ndarray, np.ndarray, np.ndarray, Dict[str, int]]:
    """Confidence gate + Hampel outlier removal. Returns (f, x, y, dropped)."""
    rows = sorted(
        ((int(d["f"]), float(d["x"]), float(d["y"]),
          1.0 if d.get("conf") is None else float(d["conf"])) for d in dets),
        key=lambda r: r[0],
    )
    # one detection per frame (keep the most confident)
    by_frame: Dict[int, Tuple[int, float, float, float]] = {}
    for r in rows:
        if r[0] not in by_frame or r[3] > by_frame[r[0]][3]:
            by_frame[r[0]] = r
    rows = [by_frame[k] for k in sorted(by_frame)]

    dropped = {"lowConf": 0, "outliers": 0}
    kept = [r for r in rows if r[3] >= p["conf_min"]]
    dropped["lowConf"] = len(rows) - len(kept)
    if len(kept) < 3:
        f = np.array([r[0] for r in kept], dtype=float)
        return f, np.array([r[1] for r in kept]), np.array([r[2] for r in kept]), dropped

    f = np.array([r[0] for r in kept], dtype=float)
    x = np.array([r[1] for r in kept])
    y = np.array([r[2] for r in kept])
    bad = (_hampel_mask(x, p["hampel_half"], p["hampel_k"], p["hampel_min_px"])
           | _hampel_mask(y, p["hampel_half"], p["hampel_k"], p["hampel_min_px"]))
    dropped["outliers"] = int(bad.sum())
    return f[~bad], x[~bad], y[~bad], dropped


def interpolate_track(f: np.ndarray, x: np.ndarray, y: np.ndarray, max_gap: int
                      ) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Keep the longest run whose gaps are <= max_gap, then fill every frame linearly.

    Returns (frames, x, y, interpolated_mask).
    """
    if len(f) == 0:
        e = np.array([])
        return e, e, e, np.array([], dtype=bool)
    breaks = np.where(np.diff(f) > max_gap + 1)[0]
    starts = np.r_[0, breaks + 1]
    ends = np.r_[breaks + 1, len(f)]
    s, e = max(zip(starts, ends), key=lambda se: se[1] - se[0])
    f, x, y = f[s:e], x[s:e], y[s:e]
    full = np.arange(int(f[0]), int(f[-1]) + 1, dtype=float)
    interp = ~np.isin(full, f)
    return full, np.interp(full, f, x), np.interp(full, f, y), interp


# ═══════════════════════════════════════════════════════════════════════
# 2-4. Smoothing, bounce, curve fit
# ═══════════════════════════════════════════════════════════════════════
def smooth(v: np.ndarray, window: int, order: int) -> np.ndarray:
    """Savitzky-Golay smoothing that degrades gracefully on short arrays."""
    from scipy.signal import savgol_filter

    n = len(v)
    w = min(window, n if n % 2 == 1 else n - 1)
    if w <= order + 1:
        return v.copy()
    return savgol_filter(v, w, order, mode="interp")


def _sse(t: np.ndarray, v: np.ndarray) -> float:
    """Residual sum of squares of a quadratic (linear if short) fit."""
    deg = 2 if len(t) >= 4 else 1
    c = np.polyfit(t, v, deg)
    r = v - np.polyval(c, t)
    return float(r @ r)


def detect_bounce(t: np.ndarray, x: np.ndarray, y: np.ndarray, fps: float,
                  min_segment: int, min_px: float) -> Optional[int]:
    """Index of the bounce, or None.

    The bounce is where the image path stops being one smooth ballistic curve.
    Seen side-on that is a vertical-velocity sign flip (the ball's lowest screen
    point); seen from behind the bowler the ball keeps moving up the screen and
    the bounce is only a *kink* (sudden velocity change). Both are found by
    choosing the split where two quadratics fit far better than one:

    - two-piece residual <= 25% of the single-curve residual, and
    - image velocity changes by >= ``min_px`` px/frame across the split.
    """
    n = len(t)
    if n < 2 * min_segment + 1:
        return None
    single = _sse(t, x) + _sse(t, y)
    if single / n < 1.0:          # one curve already fits to ~1 px: no bounce
        return None
    best, best_sse = None, math.inf
    for i in range(min_segment, n - min_segment):
        e = (_sse(t[:i + 1], x[:i + 1]) + _sse(t[:i + 1], y[:i + 1])
             + _sse(t[i:], x[i:]) + _sse(t[i:], y[i:]))
        if e < best_sse:
            best, best_sse = i, e
    if best is None or best_sse > 0.25 * single:
        return None
    pre, post = fit_segment(t[:best + 1], x[:best + 1], y[:best + 1]), fit_segment(t[best:], x[best:], y[best:])
    dv = np.subtract(post.velocity(float(t[best])), pre.velocity(float(t[best])))
    return best if float(np.linalg.norm(dv)) / fps >= min_px else None


@dataclass
class SegmentFit:
    """x(t), y(t) polynomials for one flight segment (t in seconds)."""
    px: np.ndarray
    py: np.ndarray
    t0: float
    t1: float

    def at(self, t: float) -> Tuple[float, float]:
        return float(np.polyval(self.px, t)), float(np.polyval(self.py, t))

    def velocity(self, t: float) -> Tuple[float, float]:
        return float(np.polyval(np.polyder(self.px), t)), float(np.polyval(np.polyder(self.py), t))


def fit_segment(t: np.ndarray, x: np.ndarray, y: np.ndarray) -> SegmentFit:
    """Quadratic in time: gravity curves y, swing/drift curves x."""
    deg = 2 if len(t) >= 4 else 1
    return SegmentFit(np.polyfit(t, x, deg), np.polyfit(t, y, deg), float(t[0]), float(t[-1]))


# ═══════════════════════════════════════════════════════════════════════
# Pitch calibration (ground-plane homography)
# ═══════════════════════════════════════════════════════════════════════
@dataclass
class PitchCalibration:
    """Image <-> pitch mapping from 5 clicked points.

    Pitch frame: x = lateral (+ = image-right), y = metres from the batter's
    stumps toward the bowler, z = height.
    """
    H: np.ndarray            # image px -> pitch m (ground plane)
    H_inv: np.ndarray        # pitch m -> image px
    stump_base: np.ndarray   # image px of middle-stump base (batter's end)
    stump_up: np.ndarray     # image vector from stump base to stump top
    px_per_m_v: float        # vertical px per metre at the stumps
    x_axis: np.ndarray       # unit image vector of +x at the stumps
    px_per_m_h: float        # horizontal px per metre at the stumps
    off_sign: int            # +1 if the off side is +x, else -1
    behind_bowler: bool

    @classmethod
    def from_points(cls, cal: Dict[str, Any], batter_hand: str = "right") -> "PitchCalibration":
        """cal = {"batterEnd": [[xL,yL],[xR,yR]], "bowlerEnd": [[xL,yL],[xR,yR]], "stumpTop": [x,y]}

        "L"/"R" are the crease ends as they appear left/right in the video.
        """
        import cv2

        try:
            bl, br = (np.asarray(p, dtype=float) for p in cal["batterEnd"])
            wl, wr = (np.asarray(p, dtype=float) for p in cal["bowlerEnd"])
            top = np.asarray(cal["stumpTop"], dtype=float)
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"calibration needs batterEnd[2], bowlerEnd[2], stumpTop: {exc}") from exc
        img = np.array([bl, br, wl, wr], dtype=np.float32)
        if not np.all(np.isfinite(img)) or img.shape != (4, 2):
            raise ValueError("calibration points must be four finite [x, y] pairs")
        world = np.array([[-CREASE_HALF, 0], [CREASE_HALF, 0],
                          [-CREASE_HALF, PITCH_LENGTH], [CREASE_HALF, PITCH_LENGTH]], dtype=np.float32)
        H = cv2.getPerspectiveTransform(img, world)
        if not np.all(np.isfinite(H)) or abs(np.linalg.det(H)) < 1e-12:
            raise ValueError("calibration points are degenerate (collinear or repeated)")
        H_inv = np.linalg.inv(H)

        def to_img(xm: float, ym: float) -> np.ndarray:
            v = H_inv @ np.array([xm, ym, 1.0])
            return v[:2] / v[2]

        base = to_img(0.0, 0.0)
        up = top - base
        px_v = float(np.linalg.norm(up)) / STUMP_HEIGHT
        span = to_img(WICKET_HALF_WIDTH, 0.0) - to_img(-WICKET_HALF_WIDTH, 0.0)
        px_h = float(np.linalg.norm(span)) / (2 * WICKET_HALF_WIDTH)
        if px_v < 1 or px_h < 0.5:
            raise ValueError("stump top or crease points are too close together")

        # Batter's end further away (higher on screen) => camera behind the bowler.
        behind_bowler = bool((bl[1] + br[1]) / 2 < (wl[1] + wr[1]) / 2)
        # Right-hander, camera behind bowler: off side appears on screen-left (-x).
        off_sign = (-1 if behind_bowler else 1) * (1 if batter_hand == "right" else -1)
        return cls(H, H_inv, base, up, px_v, span / np.linalg.norm(span), px_h, off_sign, behind_bowler)

    def img_to_pitch(self, u: float, v: float) -> Tuple[float, float]:
        w = self.H @ np.array([u, v, 1.0])
        return float(w[0] / w[2]), float(w[1] / w[2])

    def pitch_to_img(self, xm: float, ym: float) -> Tuple[float, float]:
        w = self.H_inv @ np.array([xm, ym, 1.0])
        return float(w[0] / w[2]), float(w[1] / w[2])

    def local_px_per_m(self, xm: float, ym: float) -> float:
        """Horizontal image scale (px per metre) at a point on the pitch."""
        a = np.array(self.pitch_to_img(xm - 0.5, ym))
        b = np.array(self.pitch_to_img(xm + 0.5, ym))
        return float(np.linalg.norm(b - a))

    def at_stumps(self, u: float, v: float) -> Tuple[float, float]:
        """(lateral m, height m) of an image point assumed to lie in the stump plane."""
        d = np.array([u, v]) - self.stump_base
        up_unit = self.stump_up / np.linalg.norm(self.stump_up)
        height = float(d @ up_unit) / self.px_per_m_v
        lateral = float(d @ self.x_axis) / self.px_per_m_h
        return lateral, height

    def stumps_image(self) -> Dict[str, List[List[float]]]:
        """Image coordinates of the three stumps (base and top) for drawing."""
        bases, tops = [], []
        for xm in (-OUTER_STUMP_CENTRE, 0.0, OUTER_STUMP_CENTRE):
            b = np.array(self.pitch_to_img(xm, 0.0))
            bases.append([round(float(b[0]), 1), round(float(b[1]), 1)])
            t = b + self.stump_up
            tops.append([round(float(t[0]), 1), round(float(t[1]), 1)])
        return {"base": bases, "top": tops}


# ═══════════════════════════════════════════════════════════════════════
# 6. Metric classification helpers
# ═══════════════════════════════════════════════════════════════════════
def length_category(dist_from_stumps_m: float) -> str:
    """Where the ball pitched, measured from the batter's stumps."""
    if dist_from_stumps_m < 2.0:
        return "yorker"
    if dist_from_stumps_m < 6.0:
        return "full"
    if dist_from_stumps_m < 8.0:
        return "good"
    return "short"


def line_category(off_lateral_m: float) -> str:
    """Line relative to middle stump; positive = toward the off side."""
    a = abs(off_lateral_m)
    if a <= 0.038:
        return "middle"
    side = "off" if off_lateral_m > 0 else "leg"
    return f"{side} stump" if a <= WICKET_HALF_WIDTH else f"outside {side}"


def decision_at_stumps(lateral_m: float, height_m: float) -> str:
    """DRS-style call from where the ball meets the stump plane.

    HITTING        ball centre inside the zone between the centres of the outer
                   stumps and below the bails (>= half the ball hitting)
    UMPIRE'S CALL  not HITTING, but some of the ball clips the wicket
    MISSING        ball misses the wicket entirely
    """
    lat = abs(lateral_m)
    if lat <= OUTER_STUMP_CENTRE and 0.0 <= height_m <= STUMP_HEIGHT:
        return "HITTING"
    if (lat <= WICKET_HALF_WIDTH + BALL_RADIUS
            and -BALL_RADIUS <= height_m <= STUMP_HEIGHT + BALL_RADIUS):
        return "UMPIRE'S CALL"
    return "MISSING"


def _swing_px(x: np.ndarray, y: np.ndarray) -> float:
    """Signed max deviation (px) of a path from its chord; + = curving to image-right."""
    if len(x) < 3:
        return 0.0
    p0, p1 = np.array([x[0], y[0]]), np.array([x[-1], y[-1]])
    d = p1 - p0
    L = float(np.linalg.norm(d))
    if L < 1e-6:
        return 0.0
    n = np.array([d[1], -d[0]]) / L           # chord normal
    dev = (np.stack([x, y], axis=1) - p0) @ n
    i = int(np.argmax(np.abs(dev)))
    # Express the sign in screen terms: positive when the bulge is to the right.
    return float(dev[i]) * (1.0 if n[0] >= 0 else -1.0)


def _contact_summary(c: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Bat-ball contact from the analyzer (app/engine/contact.py), for drawing."""
    if not c or c.get("frame") is None:
        return None
    px = c.get("ball_px") or [None, None]
    return {"frame": int(c["frame"]), "timeMs": c.get("time_ms"), "method": c.get("method"),
            "confidence": c.get("confidence"), "x": px[0], "y": px[1]}


def _round(v: Optional[float], nd: int = 2) -> Optional[float]:
    return None if v is None or not math.isfinite(v) else round(float(v), nd)


# ═══════════════════════════════════════════════════════════════════════
# Main entry point
# ═══════════════════════════════════════════════════════════════════════
def build_trajectory(
    detections: Sequence[Dict[str, Any]],
    fps: float,
    width: int,
    height: int,
    calibration: Optional[Dict[str, Any]] = None,
    batter_hand: str = "right",
    video_id: Optional[str] = None,
    params: Optional[Dict[str, Any]] = None,
    contact: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Full pipeline -> JSON-serialisable dict (see docs/trajectory_schema.json)."""
    p = {**DEFAULTS, **(params or {})}
    fps = float(fps) if fps and fps > 0 else 30.0
    raw = sorted(
        ({"f": int(d["f"]), "x": round(float(d["x"]), 1), "y": round(float(d["y"]), 1),
          "conf": None if d.get("conf") is None else round(float(d["conf"]), 3)} for d in detections),
        key=lambda r: r["f"],
    )
    out: Dict[str, Any] = {
        "version": SCHEMA_VERSION, "id": video_id, "status": "insufficient",
        "fps": round(fps, 3), "width": int(width), "height": int(height),
        "batterHand": batter_hand, "calibrated": False, "calibration": calibration,
        "raw": raw, "dropped": {"lowConf": 0, "outliers": 0},
        "frames": [], "bounce": None, "predicted": [], "impact": None,
        "stumps": None, "pitch3d": None,
        "contact": _contact_summary(contact),
        "metrics": {
            "speed": None, "length": None, "lengthM": None, "line": None, "lineCm": None,
            "swing": None, "swingPx": None, "turnDeg": None, "turnCm": None,
            "heightAtStumps": None, "lateralAtStumpsCm": None,
            "decision": None, "reviewRetained": False,
        },
        "notes": [],
    }
    notes: List[str] = out["notes"]

    cal: Optional[PitchCalibration] = None
    if calibration:
        try:
            cal = PitchCalibration.from_points(calibration, batter_hand)
            out["calibrated"] = True
            out["stumps"] = cal.stumps_image()
        except ValueError as exc:
            notes.append(f"Calibration ignored: {exc}")

    # 1. clean + interpolate
    f, x, y, dropped = clean_detections(raw, p)
    out["dropped"] = dropped
    if len(f) < p["min_points"]:
        notes.append(f"Only {len(f)} usable ball detections (need {p['min_points']}) — no trajectory.")
        return out
    fi, xi, yi, interp = interpolate_track(f, x, y, p["max_gap"])
    if len(fi) < p["min_points"]:
        notes.append("Ball track too fragmented to build a trajectory.")
        return out
    t = fi / fps

    # 2-3. smooth for bounce detection, then split
    b = detect_bounce(t, xi, yi, fps, p["min_segment"], p["min_bounce_px"])
    segments = [(0, b), (b, len(fi) - 1)] if b is not None else [(0, len(fi) - 1)]

    frames_out: List[Dict[str, Any]] = []
    fits: List[SegmentFit] = []
    for si, (s, e) in enumerate(segments):
        sl = slice(s, e + 1)
        xs = smooth(xi[sl], p["sg_window"], p["sg_order"])
        ys = smooth(yi[sl], p["sg_window"], p["sg_order"])
        fits.append(fit_segment(t[sl], xs, ys))
        name = "post" if (b is not None and si == 1) else "pre"
        for k in range(len(xs)):
            if si == 1 and k == 0:
                continue  # bounce frame already emitted by the pre segment
            frames_out.append({"f": int(fi[s + k]), "x": round(float(xs[k]), 1), "y": round(float(ys[k]), 1),
                               "interpolated": bool(interp[s + k]), "segment": name})
    out["frames"] = frames_out
    out["status"] = "ok"
    m = out["metrics"]

    pre = [fr for fr in frames_out if fr["segment"] == "pre"]
    m["swingPx"] = _round(_swing_px(np.array([q["x"] for q in pre]), np.array([q["y"] for q in pre])), 1)

    if b is None:
        notes.append("No bounce found (full toss, rolling ball, or bounce outside the frame).")
        if not cal:
            notes.append("Calibrate the pitch to get speed, length, line and a stump prediction.")
        else:
            notes.append("A stump prediction needs a visible bounce.")
        return out

    t_b = float(t[b])
    bx, by = frames_out[b]["x"], frames_out[b]["y"]
    out["bounce"] = {"frame": int(fi[b]), "x": bx, "y": by}
    v_pre = np.array(fits[0].velocity(t_b))
    v_post = np.array(fits[1].velocity(t_b))
    if np.linalg.norm(v_pre) > 0 and np.linalg.norm(v_post) > 0:
        a_pre = math.degrees(math.atan2(v_pre[0], v_pre[1]))
        a_post = math.degrees(math.atan2(v_post[0], -v_post[1]))  # rising after bounce: flip y
        m["turnDeg"] = _round(a_post - a_pre, 1)

    if not cal:
        notes.append("Calibrate the pitch to get speed, length, line, the stump prediction and a decision.")
        return out

    # ── Calibrated metrics ───────────────────────────────────────────────
    notes.extend([
        f"Bounce point located on the ground plane from the pitch calibration.",
        f"Assumed release at {RELEASE_Y:.2f} m from the batter's stumps, {RELEASE_HEIGHT:.1f} m high, "
        f"at the first tracked frame (speed is an average up to the bounce).",
        f"Assumed {int(BOUNCE_SPEED_RETAINED * 100)}% of horizontal speed kept after the bounce.",
        "Prediction assumes the ball is in the stump plane when it reaches the stumps' depth "
        "(single camera — an estimate, not multi-camera Hawk-Eye).",
    ])
    pxb, pyb = cal.img_to_pitch(bx, by)
    out["bounce"].update({"pitchX": _round(pxb, 3), "pitchY": _round(pyb, 3)})
    if not (-0.5 <= pyb <= PITCH_LENGTH + 0.5):
        notes.append(f"Bounce maps {pyb:.1f} m from the stumps — outside the pitch; check calibration.")
        return out

    m["lengthM"] = _round(pyb, 2)
    m["length"] = length_category(pyb)
    m["lineCm"] = _round(pxb * cal.off_sign * 100, 1)
    m["line"] = line_category(pxb * cal.off_sign)
    m["swing"] = _round(m["swingPx"] / cal.local_px_per_m(pxb, pyb) * 100, 1) if m["swingPx"] is not None else None

    t0 = float(t[0])
    if t_b - t0 <= 0:
        return out
    speed = (RELEASE_Y - pyb) / (t_b - t0)
    if not (PLAUSIBLE_SPEED_MPS[0] <= speed <= PLAUSIBLE_SPEED_MPS[1]):
        notes.append(f"Estimated speed {speed * 3.6:.0f} km/h is implausible — no prediction made; "
                     "check calibration or that the track starts near release.")
        return out
    m["speed"] = _round(speed * 3.6, 1)

    # 5. extrapolate the post-bounce fit to the stump plane
    t_star = t_b + pyb / (speed * BOUNCE_SPEED_RETAINED)
    t_last = float(t[-1])
    pred: List[Dict[str, Any]] = []
    if t_star > t_last:
        n = max(2, int(math.ceil((t_star - t_last) * fps)) + 1)
        for tt in np.linspace(t_last, t_star, n):
            u, v = fits[1].at(float(tt))
            pred.append({"f": round(float(tt) * fps, 2), "x": round(u, 1), "y": round(v, 1)})
    out["predicted"] = pred
    iu, iv = fits[1].at(t_star)
    lat, hgt = cal.at_stumps(iu, iv)
    m["heightAtStumps"] = _round(hgt, 3)
    m["lateralAtStumpsCm"] = _round(lat * cal.off_sign * 100, 1)
    decision = decision_at_stumps(lat, hgt)
    m["decision"] = decision
    m["reviewRetained"] = decision == "UMPIRE'S CALL"   # DRS: umpire's call keeps the review
    out["impact"] = {"x": round(iu, 1), "y": round(iv, 1), "f": round(t_star * fps, 2),
                     "lateralM": _round(lat, 3), "heightM": _round(hgt, 3)}

    # Release lateral: where the first detection sits along the bowler-end crease.
    wl, wr = (np.asarray(q, float) for q in calibration["bowlerEnd"])
    u_frac = float(np.clip((xi[0] - wl[0]) / (wr[0] - wl[0] + 1e-9), -0.2, 1.2))
    x_rel = -CREASE_HALF + 2 * CREASE_HALF * u_frac
    straight_at_stumps = pxb + (pxb - x_rel) * (pyb / max(RELEASE_Y - pyb, 1e-6))
    m["turnCm"] = _round((lat - straight_at_stumps) * cal.off_sign * 100, 1)

    out["pitch3d"] = _pitch3d(fi, t, b, t_star, fps, x_rel, pxb, pyb, lat, hgt,
                              (m["swing"] or 0.0) / 100.0, int(fi[-1]))
    return out


def _pitch3d(fi: np.ndarray, t: np.ndarray, b: int, t_star: float, fps: float,
             x_rel: float, xb: float, yb: float, x_s: float, h_s: float,
             swing_m: float, last_observed_f: int) -> Dict[str, Any]:
    """3D reconstruction for the virtual pitch view (metres, pitch frame).

    Pre-bounce: release -> bounce with constant horizontal speed, a swing bulge
    and a gravity parabola from RELEASE_HEIGHT to 0.
    Post-bounce: bounce -> stump plane, gravity parabola from 0 to the
    estimated height at the stumps.
    """
    t0, tb = float(t[0]), float(t[b])
    T1, T2 = tb - t0, max(t_star - tb, 1e-3)
    vz1 = (GRAVITY * T1 ** 2 / 2 - RELEASE_HEIGHT) / T1
    vz2 = (max(h_s, 0.0) + GRAVITY * T2 ** 2 / 2) / T2
    path: List[Dict[str, Any]] = []
    for k in range(b + 1):
        tau = float(t[k]) - t0
        s = tau / T1
        path.append({"f": int(fi[k]),
                     "x": round(x_rel + (xb - x_rel) * s + swing_m * math.sin(math.pi * s), 3),
                     "y": round(RELEASE_Y + (yb - RELEASE_Y) * s, 3),
                     "z": round(max(0.0, RELEASE_HEIGHT + vz1 * tau - GRAVITY * tau ** 2 / 2), 3),
                     "predicted": False})
    n = max(2, int(math.ceil(T2 * fps)) + 1)
    for tt in np.linspace(tb, t_star, n)[1:]:
        tau = float(tt) - tb
        s = tau / T2
        fnum = float(tt) * fps
        path.append({"f": round(fnum, 2),
                     "x": round(xb + (x_s - xb) * s, 3),
                     "y": round(yb * (1 - s), 3),
                     "z": round(max(0.0, vz2 * tau - GRAVITY * tau ** 2 / 2), 3),
                     "predicted": fnum > last_observed_f + 1e-6})
    return {"path": path, "bounce": {"x": round(xb, 3), "y": round(yb, 3)},
            "impact": {"x": round(x_s, 3), "z": round(h_s, 3)}}


# ═══════════════════════════════════════════════════════════════════════
# Persistence helpers + CLI
# ═══════════════════════════════════════════════════════════════════════
def rebuild_from_file(path: Path, calibration: Optional[Dict[str, Any]],
                      batter_hand: Optional[str] = None) -> Dict[str, Any]:
    """Re-run the pipeline on a saved trajectory JSON (e.g. after calibrating)."""
    old = json.loads(Path(path).read_text())
    c = old.get("contact")
    contact = ({"frame": c["frame"], "time_ms": c.get("timeMs"), "method": c.get("method"),
                "confidence": c.get("confidence"), "ball_px": [c.get("x"), c.get("y")]} if c else None)
    return build_trajectory(
        old["raw"], old["fps"], old["width"], old["height"],
        calibration=calibration,
        batter_hand=batter_hand or old.get("batterHand", "right"),
        video_id=old.get("id"),
        contact=contact,
    )


def _main() -> None:
    ap = argparse.ArgumentParser(description="Rebuild a Hawk-Eye trajectory JSON.")
    ap.add_argument("trajectory_json", type=Path, help="outputs/trajectory_<id>.json")
    ap.add_argument("--calibration", type=Path, help="JSON with batterEnd, bowlerEnd, stumpTop")
    ap.add_argument("--batter-hand", choices=["right", "left"])
    ap.add_argument("--write", action="store_true", help="overwrite the input file")
    a = ap.parse_args()
    cal = json.loads(a.calibration.read_text()) if a.calibration else None
    res = rebuild_from_file(a.trajectory_json, cal, a.batter_hand)
    if a.write:
        a.trajectory_json.write_text(json.dumps(res))
    print(json.dumps({"status": res["status"], "bounce": res["bounce"],
                      "metrics": res["metrics"], "notes": res["notes"]}, indent=2))


if __name__ == "__main__":
    _main()
