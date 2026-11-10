"""
Cricket Shot Analyzer
=====================
Extends the existing OpenPose-style pose overlay (pose_overlay.py) with
cricket-specific biomechanics for a single batsman (side / front-on video).

Reuses from pose_overlay.py:
    create_pose_detector, _mp_landmarks_to_coco, _smooth, _draw_pose,
    _open_writer, CONF_THRESHOLD, MAX_MISSED_FRAMES
Reuses from yolo_tracker.py:
    CricketObjectTracker._detect_ball_yolo (YOLOv8 ball class)
    CricketObjectTracker._kinematic_bat_proxy (wrist-anchored bat tip)

Public API:
    analyze_cricket_shot(input_path, output_path, shot_direction=None,
                         batter_hand="right") -> dict
        Runs a detection pass, computes the metrics below, writes an
        annotated video (skeleton + live HUD) to output_path, saves a JSON
        report next to it (same stem, .json) and returns the report dict.

Metrics: weight transfer, front foot direction, head balance, ball contact,
eye focus on ball, shot timing phases. Every metric degrades to
status="not detected" instead of raising when inputs are missing.

No new dependencies (mediapipe, opencv, numpy, ultralytics already installed).
"""

import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from .pose_overlay import (
    CONF_THRESHOLD,
    MAX_MISSED_FRAMES,
    _draw_pose,
    _mp_landmarks_to_coco,
    _open_writer,
    _smooth,
    create_pose_detector,
)

# ════════════════════════════════════════════════════════════════════════
# CONFIG — all tunable thresholds in one block
# ════════════════════════════════════════════════════════════════════════
CONFIG: Dict[str, Any] = {
    # -- 1. weight transfer ------------------------------------------------
    "wt_back_max_pct": 40.0,        # <= this  -> "Back foot"
    "wt_front_min_pct": 60.0,       # >= this  -> "Front foot" (else Balanced)
    "wt_min_spread_px": 12.0,       # min |front_ankle_x - back_ankle_x| (absolute floor)
    "wt_min_spread_ratio": 0.10,    # ... also required as fraction of frame width
    "wt_plausible_min": -25.0,      # reject values outside this plausible band
    "wt_plausible_max": 130.0,      #   (feet nearly aligned in x => denominator ~0)
    # -- 2. front foot direction -------------------------------------------
    "foot_shot_tol_deg": 20.0,      # |foot - shot| < 20° -> "Pointing to shot area"
    "foot_lift_ratio": 0.04,        # ankle y gap > ratio*height => one foot airborne
    # -- 3. head balance ----------------------------------------------------
    "person_height_cm": 175.0,      # used to convert px -> cm
    "person_height_pct": 90.0,      # percentile of nose-ankle height = standing height
    "head_tolerance_cm": 6.0,       # head within ±this of front knee/foot -> Balanced
    "max_head_offset_cm": 45.0,     # beyond this the scale/reference is unreliable
    # -- 4. ball contact ----------------------------------------------------
    "contact_max_dist_ratio": 0.12,  # accept ball-bat match if dist <= ratio*min(w,h)
    "traj_turn_deg": 40.0,          # ball direction change >= this -> contact (fallback)
    "traj_min_speed_px": 4.0,       # ignore slower-than-this ball motion for turns
    "traj_min_approach": 3,         # ball detections required before a turn contact
    "traj_body_dist_ratio": 0.35,   # ball must be within this*min(w,h) of bat/body at turn
    "ball_min_dets": 4,             # min detections before a ball track can be trusted (lowered from 6)
    "ball_max_curv_ratio": 0.06,    # median 2nd-diff of track <= this*min(w,h) (smoothness)
    "ball_teleport_ratio": 0.20,    # consecutive jump > ratio*min(w,h) counts as a teleport (tighter)
    "ball_max_teleports": 3,        # more teleports than this = cluster-hopping false positive (tighter)
    # -- ball tracking: visibility & verification ---------------------------
    "ball_conf_min": 0.30,          # BALL_CONF_MIN: balance between catching ball and filtering noise
    "ball_max_jump_ratio": 0.22,    # BALL_MAX_JUMP_PX = allow faster ball movement (was 0.18)
    "ball_min_frames": 5,           # MIN_BALL_FRAMES: below this -> status "not detected"
    "ball_trail_len": 15,           # fading trail length on the output video
    "ball_trail_gap": 30,           # restart the trail after this many frames without ball
    "ball_body_margin": 0.04,       # expand batter body box (fraction of its size, min 5 px)
    "ball_near_bat_ratio": 0.12,    # inside body box kept if within this*min(w,h) of bat tip
    "ball_debug": False,            # True -> also save ball_debug_<id>.mp4 (raw=red, kept=green)
    # -- 5. eye focus -------------------------------------------------------
    "eye_on_ball_deg": 15.0,        # gaze vs head-to-ball angle < 15° -> eyes on ball
    "eye_away_deg": 30.0,           # angle > 30° sustained -> head turned away
    "eye_away_min_frames": 3,       # consecutive frames to count as turned away
    "eye_min_ball_frames": 5,       # pre-contact ball frames required for eye focus
    "min_face_px": 2.0,             # nose-ear offset below this = facing camera (skip)
    # -- 6. shot timing -----------------------------------------------------
    "wrist_rise_min_px": 10.0,      # grip must rise at least this (backlift start)
    "wrist_fall_min_px": 10.0,      # grip must fall this much past peak (downswing)
    "followthrough_speed_drop": 0.35,  # speed < 35% of peak -> follow-through end
    "early_late_cm": 12.0,          # ball-body offset at contact beyond ±this = early/late
    # -- HUD ----------------------------------------------------------------
    "hud_panel_alpha": 0.55,
}

# MediaPipe Pose 33-landmark indices we need beyond COCO-18 (toes / heels)
MP_NOSE, MP_L_EYE, MP_R_EYE, MP_L_EAR, MP_R_EAR = 0, 2, 5, 7, 8
MP_L_SHO, MP_R_SHO = 11, 12
MP_L_ELB, MP_R_ELB = 13, 14
MP_L_WRI, MP_R_WRI = 15, 16
MP_L_HIP, MP_R_HIP = 23, 24
MP_L_KNE, MP_R_KNE = 25, 26
MP_L_ANK, MP_R_ANK = 27, 28
MP_L_HEEL, MP_R_HEEL = 29, 30
MP_L_TOE, MP_R_TOE = 31, 32

# COCO-18 indices (pose_overlay order)
COCO_NOSE, COCO_NECK = 0, 1
COCO_R_SHO, COCO_L_SHO = 2, 5
COCO_R_HIP, COCO_L_HIP = 8, 11
COCO_R_ANK, COCO_L_ANK = 10, 13
COCO_R_EAR, COCO_L_EAR = 16, 17


def _ang_diff(a: float, b: float) -> float:
    """Smallest signed difference between two angles in degrees (-180..180)."""
    return (a - b + 180.0) % 360.0 - 180.0


def _deg(dx: float, dy: float) -> float:
    return math.degrees(math.atan2(dy, dx))


def _not_detected(reason: str) -> Dict[str, Any]:
    return {"status": "not detected", "reason": reason}


# Shared YOLO tracker (model load is expensive — keep one instance)
_TRACKER = None


def _get_tracker():
    global _TRACKER
    if _TRACKER is None:
        from .yolo_tracker import CricketObjectTracker
        _TRACKER = CricketObjectTracker()
    return _TRACKER


# ════════════════════════════════════════════════════════════════════════
# PASS 1 — detection: pose (33 + COCO-18), YOLO ball, kinematic bat tip
# ════════════════════════════════════════════════════════════════════════
def _detect_pass(input_path: str) -> Dict[str, Any]:
    import cv2

    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {input_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    pose = create_pose_detector()
    tracker = _get_tracker()

    # Reset per-video static-object state so previous clips don't pollute results
    tracker._color_blob_history.clear()
    tracker._color_blob_consec.clear()
    tracker._last_frame_positions = set()
    tracker._static_positions = set()

    mp_xy: List[Optional[np.ndarray]] = []      # (33, 2) px
    mp_vis: List[Optional[np.ndarray]] = []     # (33,)
    coco: List[Optional[np.ndarray]] = []       # (18, 3) smoothed px+conf
    ball_raw: List[Optional[np.ndarray]] = []   # (2,) px — raw detection, pre-filter
    ball_raw_conf: List[Optional[float]] = []   # detection confidence (0-1)
    ball_raw_source: List[Optional[str]] = []   # "color_blob" | "yolo"
    tips: List[Optional[np.ndarray]] = []       # (2,) px

    smoothed: Optional[np.ndarray] = None
    missed = 0
    idx = 0
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            lms = pose.detect(frame, (idx / fps) * 1000.0) if pose is not None else None
            if lms:
                xy = np.array([[lm.x * width, lm.y * height] for lm in lms], dtype=np.float32)
                vis = np.array([lm.visibility or 0.0 for lm in lms], dtype=np.float32)
                mp_xy.append(xy)
                mp_vis.append(vis)

                smoothed = _smooth(smoothed, _mp_landmarks_to_coco(lms, width, height))
                coco.append(smoothed.copy())
                missed = 0

                # wrist-anchored bat proxy (needs both wrists reasonably visible)
                if max(vis[MP_L_WRI], vis[MP_R_WRI]) >= CONF_THRESHOLD:
                    dicts = [{"x": float(lm.x), "y": float(lm.y)} for lm in lms]
                    _, tip = _kinematic_bat(dicts)
                    tips.append(
                        np.array([tip["x"] * width, tip["y"] * height], dtype=np.float32)
                        if tip else None
                    )
                else:
                    tips.append(None)

                ball = tracker._detect_ball_yolo_with_conf(frame)
                if ball is not None:
                    ball_raw.append(np.array([ball[0], ball[1]], dtype=np.float32))
                    ball_raw_conf.append(float(ball[2]))
                    ball_raw_source.append(ball[3] if len(ball) > 3 else "yolo")
                else:
                    ball_raw.append(None)
                    ball_raw_conf.append(None)
                    ball_raw_source.append(None)
            else:
                mp_xy.append(None)
                mp_vis.append(None)
                coco.append(None)
                ball_raw.append(None)
                ball_raw_conf.append(None)
                tips.append(None)
                missed += 1
                if missed > MAX_MISSED_FRAMES:
                    smoothed = None
            idx += 1
    finally:
        cap.release()
        if pose is not None:
            pose.close()

    return {
        "fps": fps, "width": width, "height": height,
        "mp_xy": mp_xy, "mp_vis": mp_vis, "coco": coco,
        # raw (unfiltered) detections + a pre-filtered copy for downstream use;
        # _filter_ball_detections() replaces "balls" with the kept positions
        "ball_raw": ball_raw, "ball_raw_conf": ball_raw_conf,
        "ball_raw_source": ball_raw_source,
        "balls": list(ball_raw), "ball_conf": list(ball_raw_conf),
        "tips": tips, "n": idx,
    }


def _kinematic_bat(lms: List[Dict[str, Any]]):
    """Late import wrapper so module import stays light."""
    from .yolo_tracker import CricketObjectTracker
    return CricketObjectTracker._kinematic_bat_proxy(lms)


# ════════════════════════════════════════════════════════════════════════
# METRICS
# ════════════════════════════════════════════════════════════════════════
def _front_back_indices(batter_hand: str) -> Tuple[int, int, int, int, int, int]:
    """(front_ankle, back_ankle, front_knee, front_toe, front_heel, back_ankle_mp)."""
    if batter_hand == "left":
        # LHB front foot = right foot
        return MP_R_ANK, MP_L_ANK, MP_R_KNE, MP_R_TOE, MP_R_HEEL, MP_L_ANK
    # RHB front foot = left foot (standard stance)
    return MP_L_ANK, MP_R_ANK, MP_L_KNE, MP_L_TOE, MP_L_HEEL, MP_R_ANK


def _cm_scale(det) -> Optional[float]:
    """cm per pixel from median standing height (nose -> ankle) across frames."""
    heights = []
    for xy, vis in zip(det["mp_xy"], det["mp_vis"]):
        if xy is None:
            continue
        if vis[MP_NOSE] >= CONF_THRESHOLD and max(vis[MP_L_ANK], vis[MP_R_ANK]) >= CONF_THRESHOLD:
            ank = xy[MP_L_ANK] if vis[MP_L_ANK] >= vis[MP_R_ANK] else xy[MP_R_ANK]
            heights.append(abs(ank[1] - xy[MP_NOSE][1]))
    if not heights:
        return None
    # 90th percentile ≈ standing height (median is dragged down by crouched /
    # bent frames, which inflated every px→cm conversion).
    body_px = float(np.percentile(heights, CONFIG.get("person_height_pct", 90.0)))
    if body_px < 20.0:
        return None
    return CONFIG["person_height_cm"] / body_px


def _choose_front_foot(det, batter_hand: str, cfg) -> Dict[str, Any]:
    """Select the front foot for direction / head / weight metrics.

    Default is the hand-based front foot (RHB -> left). If one ankle is
    clearly held above the other for most of the shot (airborne / lifted),
    the lower (planted) foot is used instead so we never measure a foot
    that isn't on the ground.
    """
    fa, ba, knee, toe, heel, _ = _front_back_indices(batter_hand)
    h = det["height"]
    min_frames = max(3, int(0.05 * det["n"]))

    def mean_ankle_y(mp: int) -> Optional[float]:
        ys = [float(xy[mp][1]) for xy, vis in zip(det["mp_xy"], det["mp_vis"])
              if xy is not None and vis[mp] >= CONF_THRESHOLD]
        return float(np.mean(ys)) if len(ys) >= min_frames else None

    y_l, y_r = mean_ankle_y(MP_L_ANK), mean_ankle_y(MP_R_ANK)
    source = "hand"
    if (y_l is not None and y_r is not None
            and abs(y_l - y_r) > cfg["foot_lift_ratio"] * h):
        planted_left = y_l > y_r  # larger y = lower in the image = on the ground
        if planted_left != (fa == MP_L_ANK):
            source = "planted"
            if batter_hand == "right":
                fa, ba, knee, toe, heel = MP_R_ANK, MP_L_ANK, MP_R_KNE, MP_R_TOE, MP_R_HEEL
            else:
                fa, ba, knee, toe, heel = MP_L_ANK, MP_R_ANK, MP_L_KNE, MP_L_TOE, MP_L_HEEL

    return {
        "fa": fa, "ba": ba, "knee": knee, "toe": toe, "heel": heel,
        "coco_fa": COCO_R_ANK if fa == MP_R_ANK else COCO_L_ANK,
        "coco_ba": COCO_R_ANK if ba == MP_R_ANK else COCO_L_ANK,
        "used_foot": "right" if fa == MP_R_ANK else "left",
        "source": source,
        # lowest (largest y) position of the chosen front ankle = ground level
        "ground_y": max((float(xy[fa][1]) for xy, vis in
                         zip(det["mp_xy"], det["mp_vis"])
                         if xy is not None and vis[fa] >= CONF_THRESHOLD),
                        default=None),
    }


def _weight_transfer_metric(det, contact: Optional[int], feet: Dict[str, Any],
                            cfg) -> Dict[str, Any]:
    hip_c = COCO_L_HIP
    ank_f, ank_b = feet["coco_fa"], feet["coco_ba"]  # COCO: 10=R ankle, 13=L ankle
    min_spread = max(cfg["wt_min_spread_px"], cfg["wt_min_spread_ratio"] * det["width"])
    stats = {"spread": 0, "range": 0}

    def pct_at(i: int) -> Optional[float]:
        c = det["coco"][i]
        if c is None:
            return None
        if min(c[hip_c, 2], c[ank_f, 2], c[ank_b, 2]) < CONF_THRESHOLD:
            return None
        spread = abs(c[ank_f, 0] - c[ank_b, 0])
        if spread < min_spread:
            stats["spread"] += 1
            return None
        hip_x = 0.5 * (c[COCO_L_HIP, 0] + c[COCO_R_HIP, 0])
        pct = (hip_x - c[ank_b, 0]) / (c[ank_f, 0] - c[ank_b, 0]) * 100.0
        if not (cfg["wt_plausible_min"] <= pct <= cfg["wt_plausible_max"]):
            stats["range"] += 1
            return None
        return pct

    start_i = next((i for i in range(det["n"]) if pct_at(i) is not None), None)
    if start_i is None:
        reason = ("implausible geometry (feet nearly aligned in x)"
                  if (stats["spread"] or stats["range"])
                  else "ankles/hips not visible")
        return {**_not_detected(reason),
                "start_pct": None, "contact_pct": None, "shift_pct": None, "label": None}

    start_pct = pct_at(start_i)
    contact_pct = pct_at(contact) if contact is not None else None
    shift = (contact_pct - start_pct) if contact_pct is not None else None

    ref = contact_pct if contact_pct is not None else start_pct
    if ref <= cfg["wt_back_max_pct"]:
        label = "Back foot"
    elif ref >= cfg["wt_front_min_pct"]:
        label = "Front foot"
    else:
        label = "Balanced"

    return {
        "status": "ok" if contact_pct is not None else "ok (contact not detected — start only)",
        "start_pct": round(start_pct, 1),
        "contact_pct": round(contact_pct, 1) if contact_pct is not None else None,
        "shift_pct": round(shift, 1) if shift is not None else None,
        "label": label,
    }


def _front_foot_metric(det, contact: Optional[int], shot_dir: Optional[float],
                       feet: Dict[str, Any], cfg) -> Dict[str, Any]:
    fa_mp, knee_mp, toe_mp, heel_mp = feet["fa"], feet["knee"], feet["toe"], feet["heel"]
    base = {"used_foot": feet["used_foot"], "foot_source": feet["source"]}

    angles: List[float] = []       # planted frames only (preferred)
    angles_all: List[float] = []    # every visible frame (fallback)
    used_toe = True
    # only measure from frames where the front foot is actually planted
    # (ankle near its lowest point in the clip) — an airborne foot's
    # ankle→toe vector points wherever the swing carries it
    ground_y = feet.get("ground_y")
    band = cfg["foot_lift_ratio"] * det["height"]
    for xy, vis in zip(det["mp_xy"], det["mp_vis"]):
        if xy is None or vis[fa_mp] < CONF_THRESHOLD:
            continue
        if vis[toe_mp] >= CONF_THRESHOLD:
            v = xy[toe_mp] - xy[fa_mp]
        elif vis[heel_mp] >= CONF_THRESHOLD:
            # foot direction approximated ankle -> (heel mirrored forward)
            v = xy[fa_mp] - xy[heel_mp]
        elif vis[knee_mp] >= CONF_THRESHOLD:
            used_toe = False
            v = xy[knee_mp] - xy[fa_mp]
        else:
            continue
        if np.hypot(*v) < 3.0:
            continue
        angles_all.append(_deg(float(v[0]), float(v[1])))
        if ground_y is None or float(xy[fa_mp][1]) >= ground_y - band:
            angles.append(_deg(float(v[0]), float(v[1])))

    planted_frames = len(angles)
    if len(angles) < 3:
        angles = angles_all  # foot barely leaves the ground — use everything
    base["planted_frames"] = planted_frames

    if not angles:
        return {**_not_detected("front foot landmarks not visible"), **base,
                "angle_deg": None, "vs_bowler_deg": None,
                "shot_direction_deg": shot_dir, "difference_deg": None, "flag": None}

    foot_angle = float(np.median(angles))

    # line to bowler: reverse of ball approach velocity (toward the bowler)
    bowler_line = _ball_approach_angle(det, contact)
    vs_bowler = _ang_diff(foot_angle, bowler_line) if bowler_line is not None else None

    if shot_dir is None:
        return {
            "status": "ok (shot direction not detected)",
            **base,
            "angle_deg": round(foot_angle, 1),
            "used_toe": used_toe,
            "vs_bowler_deg": round(vs_bowler, 1) if vs_bowler is not None else None,
            "shot_direction_deg": None,
            "difference_deg": None,
            "flag": "not detected",
        }

    diff = abs(_ang_diff(foot_angle, shot_dir))
    return {
        "status": "ok",
        **base,
        "angle_deg": round(foot_angle, 1),
        "used_toe": used_toe,
        "vs_bowler_deg": round(vs_bowler, 1) if vs_bowler is not None else None,
        "shot_direction_deg": round(shot_dir, 1),
        "difference_deg": round(diff, 1),
        "flag": "Pointing to shot area" if diff < cfg["foot_shot_tol_deg"] else "Not pointing to shot area",
    }


def _ball_approach_angle(det, contact: Optional[int]) -> Optional[float]:
    """Image-space angle of the ball travelling toward the batter (pre-contact)."""
    pts = [(i, det["balls"][i]) for i in range(det["n"])
           if det["balls"][i] is not None and (contact is None or i < contact)]
    if len(pts) < 2:
        return None
    (i0, p0), (i1, p1) = pts[0], pts[-1]
    if i1 == i0:
        return None
    return _deg(float(p1[0] - p0[0]), float(p1[1] - p0[1]))


def _shot_direction(det, contact: Optional[int], param: Optional[float]) -> Tuple[Optional[float], str]:
    """Exit trajectory after contact; falls back to the user parameter."""
    if contact is not None:
        pts = [(i, det["balls"][i]) for i in range(contact + 1, det["n"])
               if det["balls"][i] is not None]
        if len(pts) >= 2:
            (i0, p0), (i1, p1) = pts[0], pts[-1]
            if i1 > i0 and np.hypot(*(p1 - p0)) > 5.0:
                return _deg(float(p1[0] - p0[0]), float(p1[1] - p0[1])), "ball_exit_trajectory"
    if param is not None:
        return float(param), "user_parameter"
    return None, "not detected"


def _head_balance_metric(det, contact: Optional[int], feet: Dict[str, Any], cfg,
                         cm_scale: Optional[float]) -> Dict[str, Any]:
    fa_mp, knee_mp = feet["fa"], feet["knee"]
    off_cm_frames: List[float] = []
    jitter_px: List[float] = []
    prev_head: Optional[float] = None

    for xy, vis, c in zip(det["mp_xy"], det["mp_vis"], det["coco"]):
        if xy is None or c is None:
            prev_head = None
            continue
        if vis[MP_NOSE] < CONF_THRESHOLD or vis[knee_mp] < CONF_THRESHOLD or vis[fa_mp] < CONF_THRESHOLD:
            prev_head = None
            continue
        head_x = float(xy[MP_NOSE][0])
        ref_x = 0.5 * (float(xy[knee_mp][0]) + float(xy[fa_mp][0]))
        off_px = head_x - ref_x
        off_cm_frames.append(off_px * cm_scale if cm_scale else off_px)
        if prev_head is not None:
            jitter_px.append(abs(head_x - prev_head))
        prev_head = head_x

    if not off_cm_frames:
        return {**_not_detected("head / front-side landmarks not visible"),
                "offset_cm_at_contact": None, "label": None, "jitter_cm": None}

    unit = "cm" if cm_scale else "px"
    jitter = (float(np.mean(jitter_px)) * cm_scale) if (jitter_px and cm_scale) else (
        float(np.mean(jitter_px)) if jitter_px else None)

    # value at contact: nearest valid frame at/before contact
    contact_off = None
    if contact is not None:
        # recompute offset at the exact contact frame
        i = min(contact, det["n"] - 1)
        xy, vis = det["mp_xy"][i], det["mp_vis"][i]
        if xy is not None and vis[MP_NOSE] >= CONF_THRESHOLD and vis[knee_mp] >= CONF_THRESHOLD and vis[fa_mp] >= CONF_THRESHOLD:
            off_px = float(xy[MP_NOSE][0]) - 0.5 * (float(xy[knee_mp][0]) + float(xy[fa_mp][0]))
            contact_off = off_px * cm_scale if cm_scale else off_px

    ref_off = contact_off if contact_off is not None else float(np.median(off_cm_frames))
    if cm_scale and abs(ref_off) > cfg["max_head_offset_cm"]:
        return {**_not_detected(
            f"implausible offset {ref_off:.0f} cm — px→cm scale/reference unreliable"),
            "offset_cm_at_contact": None, "median_offset": None,
            "label": None, "jitter_cm": None, "unit": "cm"}
    if contact_off is None:
        # head position must be judged at contact — during the stance the head
        # normally sits behind the front foot in a side-on view
        return {**_not_detected("contact frame required to judge head position"),
                "offset_cm_at_contact": None,
                "median_offset": round(float(np.median(off_cm_frames)), 1),
                "label": None, "jitter": round(jitter, 2) if jitter is not None else None,
                "unit": unit}
    tol = cfg["head_tolerance_cm"] if cm_scale else cfg["head_tolerance_cm"] / max(cm_scale or 1.0, 1e-6)
    balanced = abs(ref_off) <= tol

    return {
        "status": "ok",
        "unit": unit,
        "offset_cm_at_contact": round(contact_off, 1) if contact_off is not None else None,
        "median_offset": round(float(np.median(off_cm_frames)), 1),
        "label": "Balanced" if balanced else "Falling over",
        "jitter": round(jitter, 2) if jitter is not None else None,
    }


def _ball_speed_at(det, i: int) -> Optional[float]:
    """Ball speed (px/frame) around frame i; None when no neighbours exist."""
    b = det["balls"][i]
    prev = next((j for j in range(i - 1, max(i - 4, -1), -1)
                 if det["balls"][j] is not None), None)
    nxt = next((j for j in range(i + 1, min(i + 4, det["n"]))
                if det["balls"][j] is not None), None)
    if prev is None and nxt is None:
        return None
    speeds = []
    if prev is not None:
        speeds.append(float(np.hypot(*(b - det["balls"][prev]))) / (i - prev))
    if nxt is not None:
        speeds.append(float(np.hypot(*(det["balls"][nxt] - b))) / (nxt - i))
    return float(np.mean(speeds))


# ════════════════════════════════════════════════════════════════════════
# BALL TRACKING — filtering, stats, video overlay, debug render
# ════════════════════════════════════════════════════════════════════════
def _body_box(det, i: int, margin: float):
    """Bounding box of the batter's visible body landmarks in px, or None."""
    xy = det["mp_xy"][i] if i < len(det["mp_xy"]) else None
    vis = det["mp_vis"][i] if i < len(det["mp_vis"]) else None
    if xy is None or vis is None:
        return None
    m = vis >= 0.3
    if not bool(m.any()):
        return None
    pts = xy[m]
    x0, y0 = float(pts[:, 0].min()), float(pts[:, 1].min())
    x1, y1 = float(pts[:, 0].max()), float(pts[:, 1].max())
    dx = max((x1 - x0) * margin, 5.0)
    dy = max((y1 - y0) * margin, 5.0)
    return x0 - dx, y0 - dy, x1 + dx, y1 + dy


def _filter_ball_detections(det, cfg) -> Dict[str, int]:
    """Filter raw ball detections.

    Gates (all thresholds in CONFIG):
      1. BALL_CONF_MIN      — drop detections below this confidence
      2. BALL_MAX_JUMP_PX   — drop a detection that jumps more than
                              0.25 * frame width from the previous kept
                              position within 3 frames
      3. body box           — drop YOLO detections inside the batter's body box
                              unless the ball is near the bat (shoes,
                              bottles, shadows). Color-blob detections are
                              colour-specific to an orange/red cricket ball, so
                              they are trusted even inside the body box
                              (e.g. ball on the floor near the feet).

    Overwrites det["balls"] with the kept positions and stores per-frame
    confidence in det["ball_conf"] and source in det["ball_source"].
    Raw detections stay in det["ball_raw"] / det["ball_raw_conf"] /
    det["ball_raw_source"] for stats and the debug video.
    Returns rejection counts.
    """
    w = det["width"]
    conf_min = cfg["ball_conf_min"]
    jump_px = cfg["ball_max_jump_ratio"] * w            # BALL_MAX_JUMP_PX
    near_bat_px = cfg["ball_near_bat_ratio"] * min(det["width"], det["height"])
    margin = cfg["ball_body_margin"]
    raw_sources = det.get("ball_raw_source") or [None] * det["n"]

    kept: List[Optional[np.ndarray]] = []
    kept_conf: List[Optional[float]] = []
    kept_source: List[Optional[str]] = []
    rejected = {"low_conf": 0, "jump": 0, "body_box": 0}
    last_i: Optional[int] = None
    last_p: Optional[np.ndarray] = None

    for i in range(det["n"]):
        raw = det["ball_raw"][i] if i < len(det["ball_raw"]) else None
        rc = det["ball_raw_conf"][i] if i < len(det["ball_raw_conf"]) else None
        rs = raw_sources[i] if i < len(raw_sources) else None
        if raw is None:
            kept.append(None)
            kept_conf.append(None)
            kept_source.append(None)
            continue

        # 1) confidence gate
        if rc is not None and rc < conf_min:
            rejected["low_conf"] += 1
            kept.append(None)
            kept_conf.append(None)
            kept_source.append(None)
            continue

        # 2) jump gate — too far from previous detected position within 3 frames.
        #    Update last_p to this raw position regardless of accept/reject so
        #    nearby frames can chain into a track. On a jump rejection, reset
        #    last_p so a subsequent real-ball detection can start a new track
        #    instead of being blocked by a stale wall-object position.
        prev_i, prev_p = last_i, last_p
        last_i, last_p = i, raw
        if (prev_p is not None and prev_i is not None and (i - prev_i) <= 3
                and float(np.hypot(*(raw - prev_p))) > jump_px):
            rejected["jump"] += 1
            last_i, last_p = None, None   # reset — start a new track
            kept.append(None)
            kept_conf.append(None)
            kept_source.append(None)
            continue

        # 3) body-box gate — skip for colour-blob detections (trustworthy
        #    orange/red ball); YOLO detections inside the body box only kept
        #    if near the bat.
        box = _body_box(det, i, margin)
        if box is not None and box[0] <= raw[0] <= box[2] and box[1] <= raw[1] <= box[3]:
            if rs != "color_blob":
                tip = det["tips"][i] if i < len(det["tips"]) else None
                near_bat = tip is not None and float(np.hypot(*(raw - tip))) <= near_bat_px
                if not near_bat:
                    rejected["body_box"] += 1
                    kept.append(None)
                    kept_conf.append(None)
                    kept_source.append(None)
                    continue

        kept.append(np.array(raw, dtype=np.float32))
        kept_conf.append(float(rc) if rc is not None else None)
        kept_source.append(rs)

    det["balls"] = kept
    det["ball_conf"] = kept_conf
    det["ball_source"] = kept_source
    return rejected


def _ball_tracking_stats(det, cfg, rejected: Dict[str, int], tracker) -> Dict[str, Any]:
    """Detection statistics for the JSON report (see spec: ball_tracking)."""
    n = det["n"]
    with_ball = sum(1 for p in det["balls"] if p is not None)
    confs = [c for c in det.get("ball_conf", []) if c is not None]
    model = (Path(tracker.model_path).name
             if tracker is not None and getattr(tracker, "model_path", None)
             else "none")
    return {
        "frames_total": n,
        "frames_with_ball": with_ball,
        "detection_rate": round(with_ball / n, 3) if n else 0.0,
        "avg_confidence": round(sum(confs) / len(confs), 3) if confs else 0.0,
        "model": model,
        "conf_threshold": cfg["ball_conf_min"],
        "status": "ok" if with_ball >= cfg["ball_min_frames"] else "not detected",
        "rejected": dict(rejected),
    }


def _draw_ball_overlay(frame, i: int, det: dict, trail: List[Any], cfg) -> None:
    """Draw the kept ball detection: circle + 'ball 0.62' label + fading trail.

    Frames with no detection get no ball drawing at all.
    """
    import cv2

    balls = det.get("balls_vis")
    if balls is None:
        balls = det.get("balls") or []
    if i >= len(balls) or balls[i] is None:
        return
    confs = det.get("ball_conf") or []
    pos = balls[i]
    conf = confs[i] if i < len(confs) else None

    h, w = frame.shape[:2]
    scale = max(0.6, min(h, w) / 700.0)

    # --- fading trail of the last N ball positions ---
    trail.append((i, np.array(pos, dtype=np.float32)))
    max_len = int(cfg.get("ball_trail_len", 15))
    gap = int(cfg.get("ball_trail_gap", 30))
    if len(trail) >= 2 and i - trail[-2][0] > gap:
        trail[:] = trail[-1:]          # long gap — restart the trail
    while len(trail) > max_len:
        trail.pop(0)
    m = len(trail)
    for k, (fi, p) in enumerate(trail):
        a = (k + 1) / m                # oldest = faintest
        r = int(round((2.0 + 3.0 * a) * scale))
        color = (0, int(210 * a), int(255 * a))   # orange fading out
        cv2.circle(frame, (int(p[0]), int(p[1])), r, color,
                   max(1, int(round(a * 2))), cv2.LINE_AA)

    # --- current detection: circle + confidence label ---
    cx, cy = int(pos[0]), int(pos[1])
    r = int(round(6 * scale))
    cv2.circle(frame, (cx, cy), r, (0, 255, 255),
               max(2, int(round(2 * scale))), cv2.LINE_AA)
    cv2.circle(frame, (cx, cy), max(2, int(round(2 * scale))),
               (255, 255, 255), -1, cv2.LINE_AA)
    label = f"ball {conf:.2f}" if conf is not None else "ball"
    _put_text(frame, label, (cx + r + 4, max(14, cy - r - 4)),
              (0, 255, 255), scale=0.55 * max(scale, 0.6), thickness=1)


def _draw_ball_debug(frame, i: int, det: dict) -> None:
    """Debug overlay: every raw detection (pre-filter) red, kept green."""
    import cv2

    raws = det.get("ball_raw") or []
    raw_confs = det.get("ball_raw_conf") or []
    if i < len(raws) and raws[i] is not None:
        p = raws[i]
        c = raw_confs[i] if i < len(raw_confs) and raw_confs[i] is not None else None
        cv2.circle(frame, (int(p[0]), int(p[1])), 8, (0, 0, 255), 2, cv2.LINE_AA)
        _put_text(frame, f"raw {c:.2f}" if c is not None else "raw",
                  (int(p[0]) + 10, int(p[1]) - 9), (0, 0, 255),
                  scale=0.5, thickness=1)

    kept = det.get("balls_vis")
    if kept is None:
        kept = det.get("balls") or []
    kept_confs = det.get("ball_conf") or []
    if i < len(kept) and kept[i] is not None:
        p = kept[i]
        c = kept_confs[i] if i < len(kept_confs) and kept_confs[i] is not None else None
        cv2.circle(frame, (int(p[0]), int(p[1])), 5, (0, 255, 0), -1, cv2.LINE_AA)
        _put_text(frame, f"ball {c:.2f}" if c is not None else "ball",
                  (int(p[0]) + 10, int(p[1]) + 18), (0, 255, 0),
                  scale=0.5, thickness=1)


def _ball_plausible(det, cfg) -> Tuple[bool, str]:
    """Reject erratic YOLO tracks (false positives in shadow practice etc.).

    A real ball travels smoothly, so the median second difference of its
    track stays small even at high speed; random false positives jump
    hundreds of px between frames with no consistent direction.
    """
    idx = [i for i, b in enumerate(det["balls"]) if b is not None]
    if len(idx) < cfg["ball_min_dets"]:
        return False, f"ball detected in only {len(idx)} frames (<{cfg['ball_min_dets']})"
    limit = cfg["ball_max_curv_ratio"] * min(det["width"], det["height"])
    curvs: List[float] = []
    for k in range(2, len(idx)):
        ia, ib, ic = idx[k - 2], idx[k - 1], idx[k]
        if ib - ia > 2 or ic - ib > 2:
            continue
        pa, pb, pc = det["balls"][ia], det["balls"][ib], det["balls"][ic]
        curvs.append(float(np.hypot(*(pc - 2 * pb + pa))))
    if not curvs:
        return False, "ball detections too sparse to validate"
    med = float(np.median(curvs))
    if med > limit:
        return False, (f"erratic ball track rejected "
                       f"(median jump {med:.0f}px > {limit:.0f}px)")
    # teleport gate: false positives hop between fixed clusters (wall objects),
    # producing long smooth runs joined by huge jumps a real ball never makes
    tele_limit = cfg["ball_teleport_ratio"] * min(det["width"], det["height"])
    teleports = sum(
        1 for a, b in zip(idx, idx[1:])
        if float(np.hypot(*(det["balls"][b] - det["balls"][a]))) > tele_limit)
    if teleports > cfg["ball_max_teleports"]:
        return False, (f"cluster-hopping false positives rejected "
                       f"({teleports} teleports > {cfg['ball_max_teleports']})")
    return True, ""


def _reject_floor_stationary(det, cfg) -> Tuple[bool, str]:
    """Reject ball detections that sit on the floor and barely move.

    A real cricket ball in play is either airborne or moving across the pitch.
    A stationary round object on the floor (plate, lid, kettle base) that gets
    repeatedly detected as a "ball" will:
      - sit in the bottom portion of the frame (floor level)
      - have near-zero position variance across all frames
      - have enough detections to pass the plausibility gate

    Returns (rejected, reason). If rejected, callers should clear det["balls"].
    """
    idx = [i for i, b in enumerate(det["balls"]) if b is not None]
    if len(idx) < cfg["ball_min_dets"]:
        return False, ""
    h = det["height"]
    floor_y = 0.70 * h  # bottom 30% of frame = floor level
    floor_dets = [i for i in idx if det["balls"][i][1] >= floor_y]
    if len(floor_dets) < max(3, len(idx) * 0.6):
        # fewer than 60% of detections are floor-level — not a floor object
        return False, ""
    # Check position variance: a stationary object has tiny spread
    pts = np.array([det["balls"][i] for i in floor_dets], dtype=np.float32)
    spread_x = float(pts[:, 0].max() - pts[:, 0].min())
    spread_y = float(pts[:, 1].max() - pts[:, 1].min())
    max_spread = max(spread_x, spread_y)
    if max_spread > 15.0:  # moves more than 15px — probably a real ball near the ground
        return False, ""
    return True, (f"floor-level stationary object rejected "
                  f"(spread {max_spread:.0f}px, {len(floor_dets)}/{len(idx)} detections on floor)")


def _ball_contact_metric(det, cfg) -> Tuple[Optional[int], Dict[str, Any]]:
    # primary: smallest ball <-> bat-tip distance (ball must be moving — a
    # static false positive locked onto the scene is rejected)
    best_i, best_d = None, float("inf")
    limit = cfg["contact_max_dist_ratio"] * min(det["width"], det["height"])
    for i in range(det["n"]):
        b, t = det["balls"][i], det["tips"][i]
        if b is None or t is None:
            continue
        d = float(np.hypot(*(b - t)))
        if d < best_d:
            best_d, best_i = d, i
    note = None
    if best_i is not None and best_d <= limit:
        sp = _ball_speed_at(det, best_i)
        if sp is None or sp >= cfg["traj_min_speed_px"]:
            return best_i, {
                "status": "ok", "frame": best_i,
                "time_ms": round(best_i / det["fps"] * 1000.0, 1),
                "method": "ball_bat_min_distance",
                "distance_px": round(best_d, 1),
            }
        note = "ball near bat but not moving (likely false positive)"

    # fallback: abrupt ball trajectory direction change — only accepted with
    # enough approach detections and the ball actually at the bat/body
    pts = [(i, det["balls"][i]) for i in range(det["n"]) if det["balls"][i] is not None]
    turn_i, turn_best = None, cfg["traj_turn_deg"]
    body_limit = cfg["traj_body_dist_ratio"] * min(det["width"], det["height"])
    for k in range(2, len(pts)):
        (ia, pa), (ib, pb), (ic, pc) = pts[k - 2], pts[k - 1], pts[k]
        if k - 1 < cfg["traj_min_approach"]:
            continue  # not enough detections before the turn
        v1 = (pb - pa) / max(ib - ia, 1)
        v2 = (pc - pb) / max(ic - ib, 1)
        s1, s2 = float(np.hypot(*v1)), float(np.hypot(*v2))
        if s1 < cfg["traj_min_speed_px"] or s2 < cfg["traj_min_speed_px"]:
            continue
        cosang = float(np.clip(np.dot(v1, v2) / (s1 * s2), -1.0, 1.0))
        turn = math.degrees(math.acos(cosang))
        if turn < turn_best:
            continue
        # proximity gate: at contact the ball must be at the bat or body
        ref = det["tips"][ib]
        if ref is None:
            c = det["coco"][ib]
            if c is not None and min(c[COCO_L_HIP, 2], c[COCO_R_HIP, 2]) >= CONF_THRESHOLD:
                ref = np.array([0.5 * (c[COCO_L_HIP, 0] + c[COCO_R_HIP, 0]),
                                0.5 * (c[COCO_L_HIP, 1] + c[COCO_R_HIP, 1])])
        if ref is None or float(np.hypot(*(pb - ref))) > body_limit:
            continue
        turn_best, turn_i = turn, ib
    if turn_i is not None:
        return turn_i, {
            "status": "ok", "frame": turn_i,
            "time_ms": round(turn_i / det["fps"] * 1000.0, 1),
            "method": "ball_trajectory_turn",
            "turn_deg": round(turn_best, 1),
        }

    reason = (det.get("ball_note")
              or ("ball never detected" if all(b is None for b in det["balls"])
                  else "no ball-bat proximity or trajectory turn found"))
    if note:
        reason = note
    return None, {**_not_detected(reason), "frame": None, "time_ms": None, "method": None}


def _eye_focus_metric(det, contact: Optional[int], cfg) -> Dict[str, Any]:
    if contact is None or contact <= 0:
        return {**_not_detected("contact frame required for pre-contact window"),
                "pct_eyes_on_ball": None, "frames_checked": 0, "turned_away_at_frame": None}
    ball_frames = sum(1 for i in range(contact) if det["balls"][i] is not None)
    if ball_frames < cfg["eye_min_ball_frames"]:
        return {**_not_detected(f"only {ball_frames} pre-contact ball detections "
                                f"(<{cfg['eye_min_ball_frames']})"),
                "pct_eyes_on_ball": None, "frames_checked": 0, "turned_away_at_frame": None}

    on_ball = checked = 0
    away_run = 0
    turned_away_at: Optional[int] = None

    # anatomical baseline: nose sits below the ear/eye centre even when the
    # head is level — measure it once per shot and remove it so the residual
    # vector reflects head yaw/pitch only.
    baseline_samples = []
    for i in range(0, contact):
        xy, vis = det["mp_xy"][i], det["mp_vis"][i]
        if xy is None or vis[MP_NOSE] < CONF_THRESHOLD:
            continue
        src = [j for j in (MP_L_EAR, MP_R_EAR, MP_L_EYE, MP_R_EYE) if vis[j] >= CONF_THRESHOLD]
        if src:
            center = np.mean([xy[j] for j in src], axis=0)
            baseline_samples.append(float(xy[MP_NOSE][1] - center[1]))
    baseline = float(np.median(baseline_samples)) if baseline_samples else 0.0

    for i in range(0, contact):
        xy, vis = det["mp_xy"][i], det["mp_vis"][i]
        ball = det["balls"][i]
        if xy is None or ball is None:
            away_run = 0
            continue
        ears = [j for j in (MP_L_EAR, MP_R_EAR) if vis[j] >= CONF_THRESHOLD]
        eyes = [j for j in (MP_L_EYE, MP_R_EYE) if vis[j] >= CONF_THRESHOLD]
        if vis[MP_NOSE] < CONF_THRESHOLD or not (ears or eyes):
            away_run = 0
            continue
        src = ears if ears else eyes
        center = np.mean([xy[j] for j in src], axis=0)
        # gaze proxy: horizontal yaw is reliable in 2D; vertical uses only the
        # residual beyond the anatomical baseline (head pitch)
        facing = np.array([xy[MP_NOSE][0] - center[0],
                           (xy[MP_NOSE][1] - center[1]) - baseline], dtype=np.float64)
        if abs(float(facing[0])) < cfg["min_face_px"]:
            continue  # facing the camera; yaw not estimable in 2D
        if float(np.hypot(*facing)) < cfg["min_face_px"]:
            continue
        to_ball = ball - center
        if float(np.hypot(*to_ball)) < 1.0:
            continue
        cosang = float(np.clip(np.dot(facing, to_ball) /
                               (np.hypot(*facing) * np.hypot(*to_ball)), -1.0, 1.0))
        ang = math.degrees(math.acos(cosang))
        checked += 1
        if ang < cfg["eye_on_ball_deg"]:
            on_ball += 1
        if ang > cfg["eye_away_deg"]:
            away_run += 1
            if away_run >= cfg["eye_away_min_frames"] and turned_away_at is None:
                turned_away_at = i - away_run + 1
        else:
            away_run = 0

    if checked == 0:
        return {**_not_detected("no ball / head pose in pre-contact frames"),
                "pct_eyes_on_ball": None, "frames_checked": 0, "turned_away_at_frame": None}

    return {
        "status": "ok",
        "pct_eyes_on_ball": round(on_ball / checked * 100.0, 1),
        "frames_checked": checked,
        "turned_away_at_frame": turned_away_at,
    }


def _grip_series(det) -> List[Optional[np.ndarray]]:
    """Midpoint of the two wrists per frame (px), None when not visible."""
    out: List[Optional[np.ndarray]] = []
    for xy, vis in zip(det["mp_xy"], det["mp_vis"]):
        if xy is None:
            out.append(None)
            continue
        vs = [j for j in (MP_L_WRI, MP_R_WRI) if vis[j] >= CONF_THRESHOLD]
        out.append(np.mean([xy[j] for j in vs], axis=0) if vs else None)
    return out


def _timing_metric(det, grip: List[Optional[np.ndarray]], contact: Optional[int],
                   cfg, cm_scale: Optional[float]) -> Tuple[Dict[str, Any], Dict[str, Optional[int]]]:
    valid = [i for i, g in enumerate(grip) if g is not None]
    phases: Dict[str, Optional[int]] = {
        "shot_start": None, "backlift_start": None, "wrist_peak": None,
        "downswing_start": None, "contact": contact, "followthrough_end": None,
    }
    if len(valid) < 5:
        return {**_not_detected("wrists not visible enough")}, phases

    fps = det["fps"]
    h = det["height"]
    rise = cfg["wrist_rise_min_px"]
    fall = cfg["wrist_fall_min_px"]

    shot_start = valid[0]
    baseline = float(np.median([grip[i][1] for i in valid[:min(5, len(valid))]]))

    # backlift start: first sustained rise above baseline
    backlift_start = None
    for k in range(1, len(valid)):
        if grip[valid[k]][1] < baseline - rise:
            backlift_start = valid[k]
            break

    # wrist peak = highest point (min y) after backlift start
    search_from = backlift_start if backlift_start is not None else valid[0]
    peak = min((i for i in valid if i >= search_from), key=lambda i: grip[i][1])

    # downswing start: first frame past the peak where grip dropped `fall` px
    downswing_start = None
    for i in valid:
        if i > peak and grip[i][1] > grip[peak][1] + fall:
            downswing_start = i
            break

    # follow-through end: after contact, first frame with grip speed < drop * peak speed
    speeds = {}
    for a, b in zip(valid, valid[1:]):
        speeds[b] = float(np.hypot(*(grip[b] - grip[a]))) * fps  # px/s
    peak_speed = max(speeds.values()) if speeds else 0.0
    phases.update({
        "shot_start": shot_start, "backlift_start": backlift_start,
        "wrist_peak": peak, "downswing_start": downswing_start,
    })
    end_anchor = contact if contact is not None else (downswing_start or peak)
    ft_end = None
    if peak_speed > 0:
        for i in valid:
            if i > end_anchor and speeds.get(i, peak_speed) < cfg["followthrough_speed_drop"] * peak_speed:
                ft_end = i
                break
    phases["followthrough_end"] = ft_end or valid[-1]

    def dur(a: Optional[int], b: Optional[int]) -> Optional[float]:
        if a is None or b is None or b < a:
            return None
        return round((b - a) / fps * 1000.0, 1)

    # swing speed at contact (px/s -> m/s)
    swing_mps = None
    if contact is not None and contact in speeds and cm_scale:
        swing_mps = round(speeds[contact] * cm_scale / 100.0, 2)

    # early / late: ball position along bowler axis relative to body at contact
    contact_timing = None
    if contact is not None:
        ball = det["balls"][contact]
        c = det["coco"][contact] if contact < det["n"] else None
        approach = _ball_approach_angle(det, contact)
        if ball is not None and c is not None and approach is not None and cm_scale:
            body_x = 0.5 * (c[COCO_L_HIP, 0] + c[COCO_R_HIP, 0])
            body_y = 0.5 * (c[COCO_L_HIP, 1] + c[COCO_R_HIP, 1])
            toward_bowler = (-math.cos(math.radians(approach)), -math.sin(math.radians(approach)))
            ahead = ((ball[0] - body_x) * toward_bowler[0] +
                     (ball[1] - body_y) * toward_bowler[1]) * cm_scale
            if ahead > cfg["early_late_cm"]:
                contact_timing = "Early"
            elif ahead < -cfg["early_late_cm"]:
                contact_timing = "Late"
            else:
                contact_timing = "On time"

    status = "ok" if contact is not None else "ok (contact not detected)"
    report = {
        "status": status,
        "phases_ms": {
            "stance": dur(shot_start, backlift_start),
            "backlift": dur(backlift_start, peak),
            "downswing": dur(downswing_start, contact),
            "follow_through": dur(contact, phases["followthrough_end"]),
        },
        "downswing_to_contact_ms": dur(downswing_start, contact),
        "swing_speed_mps": swing_mps,
        "contact_timing": contact_timing,   # Early | Late | On time | None
        "fps": round(fps, 2),
    }
    return report, phases


# ════════════════════════════════════════════════════════════════════════
# FEEDBACK (fixed thresholds, one line per metric)
# ════════════════════════════════════════════════════════════════════════
def _build_feedback(report: Dict[str, Any]) -> List[str]:
    fb: List[str] = []

    wt = report["weight_transfer"]
    if wt.get("status", "").startswith("ok") and wt.get("contact_pct") is not None:
        fb.append(f"Weight transfer {wt['start_pct']:.0f}% → {wt['contact_pct']:.0f}% at contact ({wt['label']})")
    elif wt.get("status", "").startswith("ok") and wt.get("start_pct") is not None:
        fb.append(f"Weight transfer start {wt['start_pct']:.0f}% ({wt['label']}) — contact value not measurable")
    else:
        fb.append("Weight transfer not detected")

    ff = report["front_foot"]
    if ff.get("difference_deg") is not None:
        if ff["flag"] == "Pointing to shot area":
            fb.append(f"Front foot pointing to shot area (off by {ff['difference_deg']:.0f}°)")
        else:
            fb.append(f"Front foot off shot direction by {ff['difference_deg']:.0f}°")
    else:
        fb.append("Front foot direction not detected")

    hb = report["head_balance"]
    if hb.get("status") == "ok":
        off = hb.get("offset_cm_at_contact")
        if off is None:
            fb.append(f"Head {hb['label'].lower()} through the shot (median {hb['median_offset']} {hb['unit']})")
        elif hb["label"] == "Balanced":
            fb.append(f"Head stayed balanced over the front knee (±{abs(off):.1f} {hb['unit']} at contact)")
        else:
            side = "outside" if off > 0 else "inside"
            fb.append(f"Head fell {abs(off):.1f} {hb['unit']} {side} the front knee at contact")
    else:
        fb.append("Head balance not detected")

    bc = report["ball_contact"]
    if bc.get("status") == "ok":
        fb.append(f"Ball-bat contact at frame {bc['frame']} ({bc['time_ms']:.0f} ms, {bc['method'].replace('_', ' ')})")
    else:
        fb.append("Ball contact not detected")

    ef = report["eye_focus"]
    if ef.get("status") == "ok":
        line = f"Eyes on ball in {ef['pct_eyes_on_ball']:.0f}% of pre-contact frames"
        if ef.get("turned_away_at_frame") is not None:
            line += f" (head turned away at frame {ef['turned_away_at_frame']})"
        fb.append(line)
    else:
        fb.append("Eye focus not detected")

    tm = report["timing"]
    if tm.get("status", "").startswith("ok") and tm.get("downswing_to_contact_ms") is not None:
        line = f"Downswing→contact {tm['downswing_to_contact_ms']:.0f} ms"
        if tm.get("contact_timing"):
            line += f", contact {tm['contact_timing'].lower()}"
        if tm.get("swing_speed_mps") is not None:
            line += f", swing {tm['swing_speed_mps']:.1f} m/s"
        fb.append(line)
    elif tm.get("status", "").startswith("ok"):
        ph = {k: v for k, v in (tm.get("phases_ms") or {}).items() if v is not None}
        if ph:
            parts = ", ".join(f"{k} {v:.0f} ms" for k, v in ph.items())
            fb.append(f"Timing partial ({parts}) — contact not detected")
        else:
            fb.append("Shot timing not detected")
    else:
        fb.append("Shot timing not detected")

    return fb


# ════════════════════════════════════════════════════════════════════════
# HUD + annotated video (pass 2)
# ════════════════════════════════════════════════════════════════════════
_PHASE_COLORS = {
    "STANCE": (180, 180, 180),
    "BACKLIFT": (0, 200, 255),
    "DOWNSWING": (0, 255, 160),
    "CONTACT": (0, 0, 255),
    "FOLLOW-THROUGH": (255, 170, 60),
}


def _phase_label(i: int, phases: Dict[str, Optional[int]]) -> str:
    bs, ds, ct, fe = (phases.get("backlift_start"), phases.get("downswing_start"),
                      phases.get("contact"), phases.get("followthrough_end"))
    if ct is not None and i == ct:
        return "CONTACT"
    if ds is not None and i >= ds:
        if ct is not None and i > ct:
            return "FOLLOW-THROUGH"
        return "DOWNSWING"
    if bs is not None and i >= bs:
        return "BACKLIFT"
    return "STANCE"


def _put_text(frame, text, org, color, scale=0.55, thickness=1):
    import cv2
    x, y = org
    cv2.putText(frame, text, (x + 1, y + 1), cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 0, 0), thickness + 2, cv2.LINE_AA)
    cv2.putText(frame, text, (x, y), cv2.FONT_HERSHEY_SIMPLEX, scale, color, thickness, cv2.LINE_AA)


def _draw_hud(frame, i: int, det: dict, wt: dict, hb: dict, ff: dict,
              phases: Dict[str, Optional[int]], contact: Optional[int],
              feet: Dict[str, Any], cfg) -> None:
    import cv2

    h, w = frame.shape[:2]
    scale = min(h, w) / 700.0
    alpha = cfg["hud_panel_alpha"]

    # --- skeleton (reused from pose overlay) ---
    if det["coco"][i] is not None:
        _draw_pose(frame, det["coco"][i])

    # --- top-left panel: weight transfer + head balance ---
    lines = []
    if wt.get("contact_pct") is not None or wt.get("start_pct") is not None:
        val = wt.get("contact_pct") if i >= (phases.get("contact") or 0) and wt.get("contact_pct") is not None else wt.get("start_pct")
        lines.append((f"WEIGHT  {val:.0f}%   {wt.get('label', '')}", (255, 255, 255)))
    else:
        lines.append(("WEIGHT  not detected", (120, 120, 120)))
    if hb.get("status") == "ok":
        col = (80, 220, 80) if hb.get("label") == "Balanced" else (60, 60, 235)
        lines.append((f"HEAD  {hb.get('label', '')}", col))
    else:
        lines.append(("HEAD  not detected", (120, 120, 120)))

    ph = _phase_label(i, phases)
    lines.append((f"PHASE  {ph}", _PHASE_COLORS[ph]))

    panel_w = int(max(len(t) for t, _ in lines) * 11 * scale + 24)
    panel_h = int(len(lines) * 24 * scale + 16)
    overlay = frame.copy()
    cv2.rectangle(overlay, (12, 12), (12 + panel_w, 12 + panel_h), (10, 14, 24), -1)
    cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)
    for k, (text, color) in enumerate(lines):
        _put_text(frame, text, (24, int(40 * scale) + k * int(24 * scale)),
                  color, scale=0.55 * scale + 0.25)

    # --- front foot arrow ---
    xy, vis = det["mp_xy"][i], det["mp_vis"][i]
    if xy is not None:
        fa_mp, knee_mp, toe_mp, heel_mp = feet["fa"], feet["knee"], feet["toe"], feet["heel"]
        band = cfg["foot_lift_ratio"] * det["height"]
        planted_now = (feet.get("ground_y") is None
                       or float(xy[fa_mp][1]) >= feet["ground_y"] - band)
        if vis[fa_mp] >= CONF_THRESHOLD and planted_now:
            tip_i = toe_mp if vis[toe_mp] >= CONF_THRESHOLD else (
                heel_mp if vis[heel_mp] >= CONF_THRESHOLD else (
                    knee_mp if vis[knee_mp] >= CONF_THRESHOLD else None))
            if tip_i is not None and vis[tip_i] >= CONF_THRESHOLD:
                a = xy[fa_mp]
                v = xy[tip_i] - a
                n = float(np.hypot(*v))
                if n > 1e-3:
                    u = v / n
                    end = a + u * (40 * max(scale, 0.5) * 2)
                    cv2.arrowedLine(frame, (int(a[0]), int(a[1])),
                                    (int(end[0]), int(end[1])),
                                    (0, 210, 255), max(2, int(3 * scale)),
                                    tipLength=0.35, line_type=cv2.LINE_AA)

    # --- head balance indicator: ref line + head dot ---
    if xy is not None and vis[MP_NOSE] >= CONF_THRESHOLD:
        fa_mp2, knee_mp2 = feet["fa"], feet["knee"]
        if vis[knee_mp2] >= CONF_THRESHOLD and vis[fa_mp2] >= CONF_THRESHOLD:
            ref_x = int(0.5 * (xy[knee_mp2][0] + xy[fa_mp2][0]))
            head_x = int(xy[MP_NOSE][0])
            top, bot = int(xy[MP_NOSE][1]), int(max(xy[knee_mp2][1], xy[fa_mp2][1]))
            ok = hb.get("label") == "Balanced" and hb.get("status") == "ok"
            col = (80, 220, 80) if ok else (60, 60, 235)
            for y in range(top, bot, max(6, int(10 * scale))):
                cv2.line(frame, (ref_x, y), (ref_x, min(y + 4, bot)), col, 1, cv2.LINE_AA)
            cv2.circle(frame, (head_x, int(xy[MP_NOSE][1])), max(4, int(7 * scale)), col, 2, cv2.LINE_AA)

    # --- CONTACT marker ---
    if contact is not None and i == contact:
        cv2.rectangle(frame, (4, 4), (w - 4, h - 4), (0, 0, 255), max(3, int(6 * scale)))
        _put_text(frame, "CONTACT", (int(w * 0.5 - 90 * scale), int(h * 0.18)),
                  (0, 0, 255), scale=1.6 * max(scale, 0.6), thickness=3)

    # --- frame counter ---
    _put_text(frame, f"{i + 1} / {det['n']}", (w - int(120 * scale), h - int(16 * scale)),
              (200, 200, 200), scale=0.5 * max(scale, 0.6))


def _write_annotated(input_path: str, output_path: str, det: dict, report: dict,
                     phases: Dict[str, Optional[int]], feet: Dict[str, Any],
                     debug_path: Optional[str] = None) -> None:
    import cv2

    cfg = CONFIG
    contact = report["ball_contact"].get("frame")
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {input_path}")

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    writer, backend = _open_writer(output_path, det["fps"], det["width"], det["height"])
    opened = writer.isOpened() if hasattr(writer, "isOpened") else True
    if not opened:
        cap.release()
        writer.release()
        raise RuntimeError(f"Could not create video writer for: {output_path}")

    # optional ball-debug video: raw detections red, kept detections green
    debug_writer = None
    if debug_path:
        Path(debug_path).parent.mkdir(parents=True, exist_ok=True)
        debug_writer, _ = _open_writer(debug_path, det["fps"], det["width"], det["height"])
        if hasattr(debug_writer, "isOpened") and not debug_writer.isOpened():
            debug_writer = None

    trail: List[Any] = []          # (frame_idx, pos) — fading ball trail
    i = 0
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if debug_writer is not None:
                dbg = frame.copy()
                _draw_ball_debug(dbg, i, det)
                debug_writer.write(dbg)
            if i < det["n"]:
                _draw_hud(frame, i, det, report["weight_transfer"], report["head_balance"],
                          report["front_foot"], phases, contact, feet, cfg)
                _draw_ball_overlay(frame, i, det, trail, cfg)
            writer.write(frame)
            i += 1
    finally:
        cap.release()
        writer.release()
        if debug_writer is not None:
            debug_writer.release()

    if backend == "ffmpeg_h264" and (not Path(output_path).exists() or Path(output_path).stat().st_size == 0):
        raise RuntimeError(f"ffmpeg failed to write: {output_path}")
    if debug_path and (not Path(debug_path).exists() or Path(debug_path).stat().st_size == 0):
        print(f"[ball_tracking] WARNING: debug video not written: {debug_path}")


# ════════════════════════════════════════════════════════════════════════
# PUBLIC API
# ════════════════════════════════════════════════════════════════════════
def analyze_cricket_shot(
    input_path: str,
    output_path: str,
    shot_direction: Optional[float] = None,
    batter_hand: str = "right",
    debug_ball: bool = False,
) -> dict:
    """Analyze a cricket batting shot and write an HUD-annotated video.

    Args:
        input_path:   Source video (single batsman, side or front-on).
        output_path:  Annotated mp4 (skeleton + live metric HUD + CONTACT mark).
        shot_direction: Shot direction in degrees (image space). Used only
            when the ball exit trajectory cannot be measured.
        batter_hand:  "right" | "left" (selects the front foot).
        debug_ball:   Also save "ball_debug_<id>.mp4" next to the output with
            every raw YOLO detection in red and kept (filtered) ones in green.
            (Can also be forced via CONFIG["ball_debug"] = True.)

    Returns:
        The JSON report dict (includes "ball_tracking" detection stats).
        The same report is saved next to the video as ``<output stem>.json``.
    """
    cfg = CONFIG
    if batter_hand not in ("right", "left"):
        batter_hand = "right"

    # 1) detect pose + raw ball + bat tip
    det = _detect_pass(input_path)
    if det["n"] == 0:
        raise ValueError(f"No frames read from video: {input_path}")

    # 1a) ball filtering — confidence / jump / body-box gates
    tracker = _get_tracker()
    rejected = _filter_ball_detections(det, cfg)
    # keep the filtered track for the video overlay / debug render even if a
    # gate below clears the metric-facing track
    det["balls_vis"] = list(det["balls"])

    # 1b) ball-tracking stats: printed and saved under report["ball_tracking"]
    ball_tracking = _ball_tracking_stats(det, cfg, rejected, tracker)
    gate_note: Optional[str] = None
    if ball_tracking["status"] == "not detected":
        # too few detections — no other metric may use the ball
        gate_note = (f"ball_tracking: only {ball_tracking['frames_with_ball']} frames "
                     f"with ball (<{cfg['ball_min_frames']})")
        det["balls"] = [None] * det["n"]
    print(f"[ball_tracking] {ball_tracking['frames_with_ball']}/"
          f"{ball_tracking['frames_total']} frames "
          f"({ball_tracking['detection_rate']:.1%}), "
          f"avg_conf={ball_tracking['avg_confidence']:.2f}, "
          f"model={ball_tracking['model']}, "
          f"conf_min={ball_tracking['conf_threshold']}, "
          f"status={ball_tracking['status']}, "
          f"rejected={ball_tracking['rejected']}")

    # 1c) ball-track plausibility — evaluated on the FILTERED track (post
    #     _filter_ball_detections): the per-detection filters (conf/jump/
    #     body-box) already remove erratic FPs, so a coherent kept track
    #     means real ball detections. On failure no metric may use the ball.
    plausible, why = _ball_plausible(det, cfg)
    if not plausible:
        det["balls"] = [None] * det["n"]
        det["ball_note"] = gate_note or why

    # 1d) floor-level stationary rejection — safety net for round floor objects
    #     (plate, lid, kettle base) that pass static rejection in the tracker
    floor_rej, floor_why = _reject_floor_stationary(det, cfg)
    if floor_rej:
        det["balls"] = [None] * det["n"]
        det["ball_note"] = gate_note or floor_why

    # 1b) front foot: planted (lower) foot if one is clearly airborne
    feet = _choose_front_foot(det, batter_hand, cfg)

    # 2) contact first (other metrics depend on it)
    contact, ball_contact = _ball_contact_metric(det, cfg)

    # 3) shot direction (trajectory -> user param -> not detected)
    shot_dir, shot_src = _shot_direction(det, contact, shot_direction)

    # 4) px -> cm scale
    cm_scale = _cm_scale(det)

    # 5) individual metrics — each degrades to "not detected"
    def safe(fn, *args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except Exception as exc:  # noqa: BLE001 — metric must never crash the run
            return {**_not_detected(f"{type(exc).__name__}: {exc}")}

    weight_transfer = safe(_weight_transfer_metric, det, contact, feet, cfg)
    front_foot = safe(_front_foot_metric, det, contact, shot_dir, feet, cfg)
    head_balance = safe(_head_balance_metric, det, contact, feet, cfg, cm_scale)
    eye_focus = safe(_eye_focus_metric, det, contact, cfg)

    grip = _grip_series(det)
    timing, phases = _timing_metric_safe(det, grip, contact, cfg, cm_scale)

    report: Dict[str, Any] = {
        "weight_transfer": weight_transfer,
        "front_foot": front_foot,
        "head_balance": head_balance,
        "ball_contact": ball_contact,
        "eye_focus": eye_focus,
        "timing": timing,
        "shot_direction": {
            "value_deg": round(shot_dir, 1) if shot_dir is not None else None,
            "source": shot_src,
        },
        "ball_tracking": ball_tracking,
    }
    report["feedback"] = _build_feedback(report)

    # 6) annotated video (skeleton + HUD + ball overlay)
    debug_path: Optional[str] = None
    if debug_ball or cfg.get("ball_debug"):
        stem = Path(output_path).stem
        aid = stem[len("cricket_"):] if stem.startswith("cricket_") else stem
        debug_path = str(Path(output_path).with_name(f"ball_debug_{aid}.mp4"))
    _write_annotated(input_path, output_path, det, report, phases, feet,
                     debug_path=debug_path)
    if debug_path:
        print(f"[ball_tracking] debug video: {debug_path}")

    # 7) JSON report next to the video
    json_path = Path(output_path).with_suffix(".json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    return report


def _timing_metric_safe(det, grip, contact, cfg, cm_scale):
    try:
        return _timing_metric(det, grip, contact, cfg, cm_scale)
    except Exception as exc:  # noqa: BLE001
        phases = {"shot_start": None, "backlift_start": None, "wrist_peak": None,
                  "downswing_start": None, "contact": contact, "followthrough_end": None}
        return {**_not_detected(f"{type(exc).__name__}: {exc}")}, phases
