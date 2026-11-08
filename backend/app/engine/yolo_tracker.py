"""
Cricket Bat & Ball Tracking Engine
==================================
Provides dual tracking pipeline:
1. Fine-tuned YOLOv8n ONNX model for ball detection (via Ultralytics / ONNX Runtime)
   - Weights: backend/cricket_yolo.onnx (1 class: cricketball)
2. High-performance Computer Vision fallback (wrist-anchored bat proxy from MediaPipe
   landmarks, with the ball position taken from the frame payload when available)

Returns for each frame:
{
    "frame_index": int,
    "bat_box": [x1, y1, x2, y2] | None,
    "bat_tip": [x, y] | None,
    "ball_pos": [x, y] | None,
    "method": str   # "yolov8_ball_kinematic_bat" | "yolov8_ball_only" | "kinematic_bat_proxy" | "unavailable"
}
"""

import math
from typing import List, Dict, Any, Tuple, Optional
from pathlib import Path

# Resolve weights relative to the backend directory so the tracker works no matter
# which working directory the server is launched from.
from ..config import BASE_DIR

DEFAULT_MODEL_PATH = str(BASE_DIR / "cricket_yolo.onnx")


class CricketObjectTracker:
    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path or DEFAULT_MODEL_PATH
        self.yolo_model = None
        self._init_detector()

    def _init_detector(self):
        """Attempts to load the YOLOv8n ONNX detector if weights exist on disk."""
        if not self.model_path or not Path(self.model_path).exists():
            return
        try:
            from ultralytics import YOLO
            self.yolo_model = YOLO(self.model_path)
        except Exception:
            self.yolo_model = None

    def _detect_ball_yolo_with_conf(self, cv_frame) -> Optional[Tuple[float, float, float]]:
        """Best 'ball' detection as (center_x, center_y, confidence) or None.

        Picks the highest-confidence ball box when several are returned so the
        caller can apply its own confidence gate and log detection stats.
        """
        if self.yolo_model is None:
            return None
        try:
            res = self.yolo_model(cv_frame, verbose=False)[0]
            best: Optional[Tuple[float, float, float]] = None
            for box in res.boxes:
                cls_name = res.names.get(int(box.cls[0]), "")
                if "ball" in cls_name.lower():
                    xyxy = box.xyxy[0].tolist()
                    conf = float(box.conf[0])
                    if best is None or conf > best[2]:
                        best = ((xyxy[0] + xyxy[2]) / 2.0,
                                (xyxy[1] + xyxy[3]) / 2.0, conf)
            return best
        except Exception:
            pass
        return None

    def _detect_ball_yolo(self, cv_frame) -> Optional[List[float]]:
        det = self._detect_ball_yolo_with_conf(cv_frame)
        return [det[0], det[1]] if det is not None else None

    @staticmethod
    def _kinematic_bat_proxy(
        lms: List[Dict[str, Any]]
    ) -> Tuple[Optional[List[float]], Optional[Dict[str, float]]]:
        """
        Wrist-anchored bat proxy: MediaPipe landmarks give wrist positions (15 & 16)
        and elbow position (13). The bat extends rigidly along the forearm->wrists vector.
        Returns (bat_box, bat_tip) or (None, None) when landmarks are insufficient.
        """
        if len(lms) < 17:
            return None, None

        w1 = lms[15]
        w2 = lms[16]
        el = lms[13]

        # Center of grip (between the two wrists)
        grip_x = (w1.get("x", 0.5) + w2.get("x", 0.5)) / 2.0
        grip_y = (w1.get("y", 0.5) + w2.get("y", 0.5)) / 2.0

        # Forearm vector from elbow to grip
        arm_dx = grip_x - el.get("x", 0.5)
        arm_dy = grip_y - el.get("y", 0.5)
        arm_len = math.sqrt(arm_dx * arm_dx + arm_dy * arm_dy) + 1e-5

        # Bat blade length ~ 1.35x forearm length
        bat_len = arm_len * 1.35
        tip_x = grip_x + (arm_dx / arm_len) * bat_len
        tip_y = grip_y + (arm_dy / arm_len) * bat_len

        bat_tip = {"x": round(tip_x, 3), "y": round(tip_y, 3)}
        bat_box = [
            round(min(grip_x, tip_x) - 0.05, 3),
            round(min(grip_y, tip_y) - 0.05, 3),
            round(max(grip_x, tip_x) + 0.05, 3),
            round(max(grip_y, tip_y) + 0.05, 3),
        ]
        return bat_box, bat_tip

    def track_objects_in_sequence(
        self,
        frames: List[Dict[str, Any]],
        video_path: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Extracts bat and ball trajectory across frames.
        Returns for each frame:
        {
            "frame_index": int,
            "bat_box": [x1, y1, x2, y2] | None,
            "bat_tip": [x, y] | None,
            "ball_pos": [x, y] | None,
            "method": str
        }
        """
        results: List[Dict[str, Any]] = []

        # --- Path A: YOLOv8n ONNX ball detection + kinematic bat proxy ---
        use_yolo = (
            self.yolo_model is not None
            and video_path
            and Path(video_path).exists()
        )

        yolo_balls: Dict[int, List[float]] = {}
        if use_yolo:
            try:
                import cv2
                cap = cv2.VideoCapture(video_path)
                idx = 0
                while cap.isOpened():
                    ret, cv_frame = cap.read()
                    if not ret:
                        break
                    ball = self._detect_ball_yolo(cv_frame)
                    if ball is not None:
                        yolo_balls[idx] = ball
                    idx += 1
                cap.release()
            except Exception:
                use_yolo = False
                yolo_balls = {}

        # Build results aligned to the frames (landmark) list.
        for i, f in enumerate(frames):
            lms = f.get("landmarks", [])
            bat_box, bat_tip = self._kinematic_bat_proxy(lms)

            ball_pos = yolo_balls.get(i)
            if ball_pos is None:
                ball_pos = f.get("ball_position")

            if use_yolo and ball_pos is not None and bat_box is not None:
                method = "yolov8_ball_kinematic_bat"
            elif use_yolo and ball_pos is not None:
                method = "yolov8_ball_only"
            elif bat_box is not None:
                method = "kinematic_bat_proxy"
            else:
                method = "kinematic_bat_proxy"

            results.append({
                "frame_index": i,
                "bat_box": bat_box,
                "bat_tip": bat_tip,
                "ball_pos": ball_pos,
                "method": method,
            })

        if results:
            return results

        # --- Path B: total fallback (no frames, no video) ---
        return [{
            "frame_index": 0,
            "bat_box": None,
            "bat_tip": None,
            "ball_pos": None,
            "method": "unavailable",
        }]
