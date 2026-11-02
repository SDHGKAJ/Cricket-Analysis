"""
Cricket Biomechanics Metrics Calculator
=======================================
Calculates per-shot metric scores (0-10) and physical measurements for:
- Timing: Peak bat speed synchronization and contact point relative to front foot
- Head Position: Head alignment directly over front knee and head stillness at impact
- Front Elbow: High front elbow elevation and angle at impact
- Footwork: Front foot stride length, direction towards pitch of the ball
- Balance: Center-of-mass stability and front-foot weight transfer
- Bat Swing Path: Swing arc straightness and planar deviation through the off-side line
- Backlift: Backlift apex height and alignment
- Follow-Through: Arc completion and high finishing posture
"""

import math
from typing import List, Dict, Any, Tuple, Optional

# MediaPipe landmark indices
NOSE = 0
LEFT_SHOULDER = 11
RIGHT_SHOULDER = 12
LEFT_ELBOW = 13
RIGHT_ELBOW = 14
LEFT_WRIST = 15
RIGHT_WRIST = 16
LEFT_HIP = 23
RIGHT_HIP = 24
LEFT_KNEE = 25
RIGHT_KNEE = 26
LEFT_ANKLE = 27
RIGHT_ANKLE = 28
LEFT_FOOT_INDEX = 31
RIGHT_FOOT_INDEX = 32

def calculate_angle_2d(p1: Dict[str, float], p2: Dict[str, float], p3: Dict[str, float]) -> float:
    """Calculate angle at p2 formed by (p1 - p2 - p3) in degrees [0, 180]."""
    v1 = (p1.get("x", 0.0) - p2.get("x", 0.0), p1.get("y", 0.0) - p2.get("y", 0.0))
    v2 = (p3.get("x", 0.0) - p2.get("x", 0.0), p3.get("y", 0.0) - p2.get("y", 0.0))
    dot = v1[0] * v2[0] + v1[1] * v2[1]
    mag1 = math.sqrt(v1[0] * v1[0] + v1[1] * v1[1])
    mag2 = math.sqrt(v2[0] * v2[0] + v2[1] * v2[1])
    if mag1 * mag2 == 0:
        return 90.0
    val = max(-1.0, min(1.0, dot / (mag1 * mag2)))
    return math.degrees(math.acos(val))

def calculate_dist(p1: Dict[str, float], p2: Dict[str, float]) -> float:
    dx = p1.get("x", 0.0) - p2.get("x", 0.0)
    dy = p1.get("y", 0.0) - p2.get("y", 0.0)
    return math.sqrt(dx * dx + dy * dy)

class MetricsCalculator:
    def __init__(self, camera_angle: str = "front_on", batter_hand: str = "right"):
        self.camera_angle = camera_angle
        self.batter_hand = batter_hand

    def _resolve_joints(self):
        """Map joints based on batting stance."""
        if self.batter_hand == "right":
            return {
                "front_shoulder": LEFT_SHOULDER,
                "rear_shoulder": RIGHT_SHOULDER,
                "front_elbow": LEFT_ELBOW,
                "rear_elbow": RIGHT_ELBOW,
                "front_wrist": LEFT_WRIST,
                "rear_wrist": RIGHT_WRIST,
                "front_hip": LEFT_HIP,
                "rear_hip": RIGHT_HIP,
                "front_knee": LEFT_KNEE,
                "rear_knee": RIGHT_KNEE,
                "front_ankle": LEFT_ANKLE,
                "rear_ankle": RIGHT_ANKLE,
                "front_toe": LEFT_FOOT_INDEX,
                "rear_toe": RIGHT_FOOT_INDEX,
                "head": NOSE,
            }
        else:
            return {
                "front_shoulder": RIGHT_SHOULDER,
                "rear_shoulder": LEFT_SHOULDER,
                "front_elbow": RIGHT_ELBOW,
                "rear_elbow": LEFT_ELBOW,
                "front_wrist": RIGHT_WRIST,
                "rear_wrist": LEFT_WRIST,
                "front_hip": RIGHT_HIP,
                "rear_hip": LEFT_HIP,
                "front_knee": RIGHT_KNEE,
                "rear_knee": LEFT_KNEE,
                "front_ankle": RIGHT_ANKLE,
                "rear_ankle": LEFT_ANKLE,
                "front_toe": RIGHT_FOOT_INDEX,
                "rear_toe": LEFT_FOOT_INDEX,
                "head": NOSE,
            }

    def compute_all_metrics(
        self,
        frames: List[Dict[str, Any]],
        segmentation: Dict[str, Any]
    ) -> Tuple[Dict[str, float], Dict[str, Any]]:
        """
        Computes metric scores (0-10) and raw diagnostic measurements.
        """
        joints = self._resolve_joints()
        impact_idx = segmentation.get("impact_frame", len(frames) // 2)
        impact_idx = min(max(0, impact_idx), len(frames) - 1)
        impact_frame = frames[impact_idx]
        impact_lm = impact_frame.get("landmarks", [])

        diagnostics: Dict[str, Any] = {}

        if len(impact_lm) < 33:
            # Fallback if landmarks not fully detected
            default_metrics = {
                "timing": 7.0,
                "head_position": 7.0,
                "front_elbow": 7.0,
                "footwork": 7.0,
                "balance": 7.0,
                "bat_swing_path": 7.0,
                "backlift": 7.0,
                "follow_through": 7.0
            }
            return default_metrics, {"error": "Insufficient landmarks"}

        head = impact_lm[joints["head"]]
        f_sh = impact_lm[joints["front_shoulder"]]
        r_sh = impact_lm[joints["rear_shoulder"]]
        f_el = impact_lm[joints["front_elbow"]]
        f_wr = impact_lm[joints["front_wrist"]]
        f_hip = impact_lm[joints["front_hip"]]
        r_hip = impact_lm[joints["rear_hip"]]
        f_kn = impact_lm[joints["front_knee"]]
        r_kn = impact_lm[joints["rear_knee"]]
        f_ank = impact_lm[joints["front_ankle"]]
        r_ank = impact_lm[joints["rear_ankle"]]

        # Body scale normalization (torso length)
        torso_len = max(0.1, calculate_dist(f_sh, f_hip))

        # -------------------------------------------------------------
        # 1. HEAD POSITION METRIC
        # -------------------------------------------------------------
        # In front-on view: Head lateral distance to front knee (x-axis)
        head_knee_dx = abs(head.get("x", 0.5) - f_kn.get("x", 0.5))
        head_lateral_deviation_pct = (head_knee_dx / torso_len) * 100.0
        diagnostics["head_lateral_deviation_pct"] = round(head_lateral_deviation_pct, 2)

        # Head stillness at impact (drift over +/- 2 frames)
        head_drift = 0.0
        window_start = max(0, impact_idx - 2)
        window_end = min(len(frames) - 1, impact_idx + 2)
        if window_end > window_start:
            drifts = []
            for w in range(window_start, window_end):
                if len(frames[w].get("landmarks", [])) > joints["head"]:
                    h_w = frames[w]["landmarks"][joints["head"]]
                    drifts.append(calculate_dist(head, h_w))
            head_drift = (sum(drifts) / len(drifts)) / torso_len if drifts else 0.0
        diagnostics["head_drift_norm"] = round(head_drift, 3)

        # Head score: Ideal head is aligned over knee (dx < 0.08) and still (drift < 0.04)
        head_pos_penalty = min(6.0, (head_lateral_deviation_pct / 8.0) * 4.0)
        head_still_penalty = min(3.0, (head_drift / 0.05) * 3.0)
        head_position_score = max(1.0, min(10.0, 10.0 - head_pos_penalty - head_still_penalty))

        # -------------------------------------------------------------
        # 2. FRONT ELBOW METRIC
        # -------------------------------------------------------------
        # Angle at elbow (shoulder-elbow-wrist)
        elbow_angle = calculate_angle_2d(f_sh, f_el, f_wr)
        diagnostics["front_elbow_angle_deg"] = round(elbow_angle, 1)

        # Front elbow elevation: is the elbow pointing high toward the target?
        # Measure vector from front shoulder to front elbow relative to horizontal
        el_dx = f_el.get("x", 0.0) - f_sh.get("x", 0.0)
        el_dy = f_el.get("y", 0.0) - f_sh.get("y", 0.0)
        elbow_elevation_deg = math.degrees(math.atan2(abs(el_dy), abs(el_dx) + 1e-5))
        diagnostics["front_elbow_elevation_deg"] = round(elbow_elevation_deg, 1)

        # Ideal cover drive elbow angle: ~90° to 115°. Lower (<75°) means collapsed, Higher (>140°) means throwing hands
        if 85.0 <= elbow_angle <= 120.0:
            elbow_score = 9.2 + ((102.5 - abs(elbow_angle - 102.5)) / 102.5) * 0.8
        elif elbow_angle < 85.0:
            elbow_score = max(2.0, 9.0 - (85.0 - elbow_angle) * 0.14)
        else:
            elbow_score = max(3.0, 9.0 - (elbow_angle - 120.0) * 0.12)

        if elbow_elevation_deg < 55.0:
            elbow_score = max(1.5, elbow_score - (55.0 - elbow_elevation_deg) * 0.1)

        front_elbow_score = max(1.0, min(10.0, elbow_score))

        # -------------------------------------------------------------
        # 3. FOOTWORK METRIC (Stride length & front foot direction)
        # -------------------------------------------------------------
        stride_dist = calculate_dist(f_ank, r_ank)
        stride_norm = stride_dist / torso_len
        diagnostics["stride_extension_norm"] = round(stride_norm, 2)

        # In cover drive, front foot should have a positive stride (stride_norm ~ 0.85 - 1.40)
        if 0.85 <= stride_norm <= 1.50:
            footwork_score = 9.0 + (1.0 - abs(stride_norm - 1.15) / 0.35)
        elif stride_norm < 0.85:
            footwork_score = max(2.5, 9.0 - (0.85 - stride_norm) * 8.0)
        else:
            footwork_score = max(4.0, 9.0 - (stride_norm - 1.50) * 5.0)

        footwork_score = max(1.0, min(10.0, footwork_score))

        # -------------------------------------------------------------
        # 4. BALANCE & WEIGHT TRANSFER
        # -------------------------------------------------------------
        # Center of mass proxy: midpoint between hips and shoulders
        com_x = (f_hip.get("x", 0.5) + r_hip.get("x", 0.5) + f_sh.get("x", 0.5) + r_sh.get("x", 0.5)) / 4.0
        front_foot_x = f_ank.get("x", 0.5)
        rear_foot_x = r_ank.get("x", 0.5)
        base_width = max(0.05, abs(front_foot_x - rear_foot_x))

        # Weight transfer ratio onto front foot:
        # Distance from rear foot to COM / total base width
        transfer_ratio = abs(com_x - rear_foot_x) / base_width
        diagnostics["weight_transfer_ratio"] = round(transfer_ratio, 2)

        if 0.55 <= transfer_ratio <= 0.85:
            balance_score = 9.0 + ((transfer_ratio - 0.55) / 0.30) * 1.0
        elif transfer_ratio < 0.55:
            balance_score = max(2.0, 8.5 - (0.55 - transfer_ratio) * 12.0)
        else:
            balance_score = max(4.0, 9.0 - (transfer_ratio - 0.85) * 8.0)

        balance_score = max(1.0, min(10.0, balance_score))

        # -------------------------------------------------------------
        # 5. BAT SWING PATH (Straightness & Arc)
        # -------------------------------------------------------------
        # Measure trajectory of front wrist from downswing to follow-through
        apex_idx = segmentation.get("backlift_apex", max(0, impact_idx - 6))
        follow_idx = segmentation.get("follow_through_end", min(len(frames) - 1, impact_idx + 8))

        path_xs = []
        path_ys = []
        for i in range(apex_idx, min(follow_idx + 1, len(frames))):
            f_lms = frames[i].get("landmarks", [])
            if len(f_lms) > joints["front_wrist"]:
                path_xs.append(f_lms[joints["front_wrist"]].get("x", 0.5))
                path_ys.append(f_lms[joints["front_wrist"]].get("y", 0.5))

        # Deviation from smooth line
        path_deviation_deg = 0.0
        if len(path_xs) >= 4:
            # Linear trend
            dx_total = path_xs[-1] - path_xs[0]
            dy_total = path_ys[-1] - path_ys[0]
            swing_angle = math.degrees(math.atan2(dy_total, dx_total + 1e-5))
            diagnostics["bat_path_angle_deg"] = round(swing_angle, 1)

            # Measure orthogonal scatter
            scatters = []
            line_len = math.sqrt(dx_total**2 + dy_total**2) + 1e-5
            for px, py in zip(path_xs, path_ys):
                dist_to_line = abs(dy_total * px - dx_total * py + path_xs[-1]*path_ys[0] - path_ys[-1]*path_xs[0]) / line_len
                scatters.append(dist_to_line)
            avg_scatter = (sum(scatters) / len(scatters)) / torso_len
            path_deviation_deg = avg_scatter * 100.0

        diagnostics["bat_path_deviation_deg"] = round(path_deviation_deg, 2)
        swing_score = max(2.0, min(10.0, 9.5 - (path_deviation_deg / 10.0) * 4.0))

        # -------------------------------------------------------------
        # 6. TIMING METRIC (Contact frame vs Peak speed frame & Foot alignment)
        # -------------------------------------------------------------
        peak_speed_frame = segmentation.get("impact_frame", impact_idx)
        # Contact frame alignment
        frame_diff = abs(impact_idx - peak_speed_frame)
        diagnostics["timing_frame_offset"] = frame_diff

        # Contact relative to front foot (in front-on view, hands should be slightly ahead or aligned with front foot)
        hands_foot_dx = abs(f_wr.get("x", 0.5) - f_ank.get("x", 0.5))
        diagnostics["hands_to_foot_alignment_norm"] = round(hands_foot_dx / torso_len, 2)

        timing_penalty = min(4.0, frame_diff * 1.5)
        pos_penalty = min(4.0, (hands_foot_dx / torso_len) * 3.5)
        timing_score = max(1.5, min(10.0, 10.0 - timing_penalty - pos_penalty))

        # -------------------------------------------------------------
        # 7. BACKLIFT METRIC
        # -------------------------------------------------------------
        # Apex height of hands relative to hips/shoulders
        apex_lm = frames[apex_idx].get("landmarks", []) if apex_idx < len(frames) else impact_lm
        if len(apex_lm) > joints["front_wrist"]:
            apex_wrist_y = apex_lm[joints["front_wrist"]].get("y", 0.5)
            apex_shoulder_y = apex_lm[joints["front_shoulder"]].get("y", 0.5)
            # Higher backlift: apex_wrist_y is near or above shoulder
            backlift_height_ratio = (apex_shoulder_y - apex_wrist_y) / torso_len
            diagnostics["backlift_height_ratio"] = round(backlift_height_ratio, 2)
            if backlift_height_ratio >= -0.2:
                backlift_score = min(10.0, 8.5 + (backlift_height_ratio + 0.2) * 2.0)
            else:
                backlift_score = max(3.0, 8.5 - abs(backlift_height_ratio + 0.2) * 5.0)
        else:
            backlift_score = 7.5

        # -------------------------------------------------------------
        # 8. FOLLOW-THROUGH METRIC
        # -------------------------------------------------------------
        finish_lm = frames[follow_idx].get("landmarks", []) if follow_idx < len(frames) else impact_lm
        if len(finish_lm) > joints["front_wrist"]:
            finish_wrist_y = finish_lm[joints["front_wrist"]].get("y", 0.5)
            finish_shoulder_y = finish_lm[joints["front_shoulder"]].get("y", 0.5)
            # High finish in cover drive: hands finish at or above shoulder height
            finish_height_norm = (finish_shoulder_y - finish_wrist_y) / torso_len
            diagnostics["follow_through_finish_height_norm"] = round(finish_height_norm, 2)
            if finish_height_norm >= 0.0:
                follow_through_score = min(10.0, 8.8 + finish_height_norm * 2.0)
            else:
                follow_through_score = max(3.5, 8.8 - abs(finish_height_norm) * 6.0)
        else:
            follow_through_score = 7.5

        metrics = {
            "timing": round(timing_score, 1),
            "head_position": round(head_position_score, 1),
            "front_elbow": round(front_elbow_score, 1),
            "footwork": round(footwork_score, 1),
            "balance": round(balance_score, 1),
            "bat_swing_path": round(swing_score, 1),
            "backlift": round(backlift_score, 1),
            "follow_through": round(follow_through_score, 1)
        }

        return metrics, diagnostics
