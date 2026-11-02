"""
Cricket Shot Segmentation Engine
================================
Detects the four phases of a cricket stroke from landmark kinematic trajectories:
1. Stance & Backlift: Hands elevate backwards and upwards from resting stance
2. Downswing: Rapid downward and forward acceleration toward the ball
3. Impact: Peak linear/angular bat-hand velocity and inflection point
4. Follow-Through: Deceleration into arc completion and finishing pose
"""

import math
from typing import List, Dict, Any, Tuple, Optional

class ShotSegmentationEngine:
    def __init__(self, fps: float = 30.0):
        self.fps = fps

    def segment_sequence(
        self,
        frames: List[Dict[str, Any]],
        batter_hand: str = "right"
    ) -> Dict[str, Any]:
        """
        Segments a sequence of frames containing pose landmarks and optional bat/ball tracking.
        Returns phase indices:
        {
            "backlift_start": int,
            "backlift_apex": int,
            "impact_frame": int,
            "follow_through_end": int,
            "confidence": float
        }
        """
        if len(frames) < 6:
            # Fallback for ultra-short sequences
            mid = len(frames) // 2
            return {
                "backlift_start": 0,
                "backlift_apex": max(0, mid - 4),
                "impact_frame": mid,
                "follow_through_end": len(frames) - 1,
                "confidence": 0.4
            }

        # Select front & back wrist landmarks
        # Right-handed batter: front=left wrist (idx 15), rear=right wrist (idx 16)
        # Left-handed batter: front=right wrist (idx 16), rear=left wrist (idx 15)
        front_wrist_idx = 15 if batter_hand == "right" else 16
        rear_wrist_idx = 16 if batter_hand == "right" else 15

        wrist_positions = []
        timestamps = []

        for f in frames:
            landmarks = f.get("landmarks", [])
            ts = f.get("timestamp_ms", 0.0)
            timestamps.append(ts)

            if len(landmarks) > rear_wrist_idx:
                w_f = landmarks[front_wrist_idx]
                w_r = landmarks[rear_wrist_idx]
                # Average center of the two wrists (the bat handle grip)
                avg_x = (w_f.get("x", 0.5) + w_r.get("x", 0.5)) / 2.0
                avg_y = (w_f.get("y", 0.5) + w_r.get("y", 0.5)) / 2.0
                avg_z = (w_f.get("z", 0.0) + w_r.get("z", 0.0)) / 2.0
                wrist_positions.append((avg_x, avg_y, avg_z))
            else:
                wrist_positions.append((0.5, 0.5, 0.0))

        # Compute velocities between successive frames
        speeds = []
        y_velocities = []  # In screen coords, lower y is higher in space

        for i in range(1, len(wrist_positions)):
            dt = (timestamps[i] - timestamps[i - 1]) / 1000.0 if i < len(timestamps) else (1.0 / self.fps)
            if dt <= 0:
                dt = 1.0 / self.fps

            dx = wrist_positions[i][0] - wrist_positions[i - 1][0]
            dy = wrist_positions[i][1] - wrist_positions[i - 1][1]
            dz = wrist_positions[i][2] - wrist_positions[i - 1][2]
            dist = math.sqrt(dx * dx + dy * dy + dz * dz)
            speed = dist / dt
            speeds.append(speed)
            y_velocities.append(dy / dt)

        # Pad speed to match frame count
        speeds.insert(0, speeds[0] if speeds else 0.0)
        y_velocities.insert(0, y_velocities[0] if y_velocities else 0.0)

        # 1. Backlift Apex: Min Y coordinate (highest point of hands before downswing)
        # Scan in the first 65% of the sequence
        search_range_apex = int(len(wrist_positions) * 0.65)
        min_y = 999.0
        backlift_apex_idx = 0
        for i in range(max(1, search_range_apex)):
            y_val = wrist_positions[i][1]
            if y_val < min_y:
                min_y = y_val
                backlift_apex_idx = i

        # 2. Backlift Start: Point before apex where speed was at baseline rest
        backlift_start_idx = 0
        for i in range(backlift_apex_idx - 1, -1, -1):
            if speeds[i] < (speeds[backlift_apex_idx] * 0.4):
                backlift_start_idx = i
                break

        # 3. Impact Frame: Peak speed point during or immediately following downswing
        # Search from apex onward
        max_speed = -1.0
        impact_idx = backlift_apex_idx + 1
        for i in range(backlift_apex_idx, len(speeds)):
            if speeds[i] > max_speed:
                max_speed = speeds[i]
                impact_idx = i

        # If peak speed is near the very end, clamp to a realistic middle-to-late frame
        if impact_idx >= len(frames) - 2:
            impact_idx = max(backlift_apex_idx + 2, int(len(frames) * 0.65))

        # 4. Follow-Through End: Point after impact where speed settles into pose completion
        follow_through_end_idx = len(frames) - 1
        for i in range(impact_idx + 1, len(speeds)):
            if speeds[i] < (max_speed * 0.35):
                follow_through_end_idx = i
                break

        return {
            "backlift_start": backlift_start_idx,
            "backlift_apex": backlift_apex_idx,
            "impact_frame": impact_idx,
            "follow_through_end": follow_through_end_idx,
            "peak_speed": round(max_speed, 2),
            "confidence": 0.88
        }
