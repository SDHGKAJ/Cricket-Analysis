"""
Cricket Bat & Ball Tracking Engine
==================================
Provides:
1. ByteTrack cross-frame ball tracking (stable ball ID across frames)
   - Custom cricket-ball YOLO model (runs/detect/.../best.pt) preferred
   - Falls back to backend/cricket_yolo.onnx, then COCO class 32
2. Kinematic bat proxy from MediaPipe landmarks

Returns per-frame dicts with stable ball track IDs so the same ball keeps
one ID across the whole video (essential for slow-mo replay analysis).
"""

import math
from typing import List, Dict, Any, Tuple, Optional
from pathlib import Path

from ..config import BASE_DIR

# Resolve weights relative to the backend directory so the tracker works no matter
# which working directory the server is launched from.
DEFAULT_MODEL_PATH = str(BASE_DIR / "cricket_yolo.onnx")

# Prefer the custom-trained PyTorch cricket-ball model if it was trained.
CUSTOM_PT_MODEL = str(
    BASE_DIR.parent
    / "runs"
    / "detect"
    / "cricket_ball_yolov8-2"
    / "weights"
    / "best.pt"
)

# COCO "sports ball" class id (fallback only)
COCO_SPORTS_BALL_CLASS = 32


class CricketBallTracker:
    """
    ByteTrack-based cross-frame cricket-ball detector.

    Usage:
        tracker = CricketBallTracker()
        tracks = tracker.track_balls_in_video("path/to/video.mp4", conf=0.15)
        # tracks[i] = {
        #   "frame_index": int,
        #   "ball_id": int | None,          # stable ByteTrack id
        #   "ball_pos": [x, y] | None,      # normalized 0..1 center
        #   "ball_box": [x1,y1,x2,y2] | None, # normalized 0..1 bbox
        #   "conf": float | None,
        #   "method": str
        # }
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
        conf: float = 0.15,
        imgsz: int = 640,
        device: Optional[str] = None,
    ):
        import torch as _torch

        self.model = None
        self.use_custom_pt = False
        self.model_path = model_path or self._pick_model()
        self.conf = conf
        self.imgsz = imgsz
        self.device = device or ("0" if _torch.cuda.is_available() else "cpu")
        self._init_detector()

    def _pick_model(self) -> str:
        """Pick best available model: custom PT > ONNX > COCO."""
        if Path(CUSTOM_PT_MODEL).exists():
            self.use_custom_pt = True
            return CUSTOM_PT_MODEL
        if Path(DEFAULT_MODEL_PATH).exists():
            return DEFAULT_MODEL_PATH
        # COCO nano fallback (sports ball = class 32)
        return "yolov8n.pt"

    def _init_detector(self):
        from ultralytics import YOLO

        try:
            self.model = YOLO(self.model_path)
        except Exception:
            self.model = None

    def track_balls_in_video(
        self,
        video_path: str,
        conf: Optional[float] = None,
    ) -> List[Dict[str, Any]]:
        """
        Run ByteTrack ball tracking across every frame of a video.

        Returns a list aligned by frame_index with stable track ids.
        """
        if self.model is None:
            return []

        conf = conf if conf is not None else self.conf
        import cv2

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return []

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 480

        tracks: List[Dict[str, Any]] = []
        frame_index = 0

        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                result = self._track_frame(frame, frame_index, width, height, conf)
                tracks.append(result)
                frame_index += 1
        finally:
            cap.release()

        return tracks

    def _track_frame(
        self,
        frame,
        frame_index: int,
        width: int,
        height: int,
        conf: float,
    ) -> Dict[str, Any]:
        from ultralytics import YOLO

        # Run tracking with ByteTrack (persist=True keeps ids across frames)
        results = self.model.track(
            frame,
            persist=True,
            tracker="bytetrack.yaml",
            imgsz=self.imgsz,
            conf=conf,
            verbose=False,
            device=self.device,
        )

        out: Dict[str, Any] = {
            "frame_index": frame_index,
            "ball_id": None,
            "ball_pos": None,
            "ball_box": None,
            "conf": None,
            "method": "no_detection",
        }

        res = results[0]
        boxes = res.boxes
        if boxes is None or len(boxes) == 0:
            return out

        # Pick highest-confidence ball box for this frame
        best = None
        xyxy = boxes.xyxy.cpu().numpy()
        confs = boxes.conf.cpu().numpy()
        clses = boxes.cls.cpu().numpy().astype(int)
        ids = boxes.id.cpu().numpy().astype(int) if boxes.id is not None else None

        for i in range(len(xyxy)):
            c = float(confs[i])
            if c < conf:
                continue
            # For COCO fallback, only keep sports-ball class
            if not self.use_custom_pt and clses[i] != COCO_SPORTS_BALL_CLASS:
                continue
            if best is None or c > best[0]:
                best = (c, i)

        if best is None:
            return out

        c, i = best
        x1, y1, x2, y2 = [float(v) for v in xyxy[i]]
        # clamp
        x1, y1 = max(0.0, x1), max(0.0, y1)
        x2, y2 = min(float(width), x2), min(float(height), y2)

        # normalize to 0..1
        ball_box = [x1 / width, y1 / height, x2 / width, y2 / height]
        ball_pos = [((x1 + x2) / 2.0) / width, ((y1 + y2) / 2.0) / height]
        ball_id = int(ids[i]) if ids is not None else -1

        out.update(
            {
                "ball_id": ball_id,
                "ball_pos": ball_pos,
                "ball_box": ball_box,
                "conf": round(c, 3),
                "method": "bytetrack_custom" if self.use_custom_pt else "bytetrack_coco",
            }
        )
        return out


class CricketObjectTracker:
    """
    Original bat & ball tracker kept for backward compatibility.
    Now delegates ball detection to CricketBallTracker when a video path is given.
    """

    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path or DEFAULT_MODEL_PATH
        self.yolo_model = None
        self.ball_tracker = CricketBallTracker(model_path=model_path)
        self._init_detector()
        # Static-object rejection for the colour-blob detector: a kettle on the
        # floor or a yellow wall object stays at (near-)identical pixels across
        # frames, whereas a real cricket ball moves. We track both cumulative
        # frame count and consecutive frames at the same quantised position; a
        # position is classed as static if EITHER threshold is met.
        self._color_blob_history: Dict[Tuple[int, int], int] = {}   # cumulative count per position
        self._color_blob_consec: Dict[Tuple[int, int], int] = {}    # consecutive count per position
        self._last_frame_positions: set = set()                     # positions seen in previous frame
        self._static_positions: set = set()
        self._last_ball_pos: Optional[Tuple[float, float]] = None   # last accepted ball position
        self._static_frames: int = 0                                # frames at same position
        self._STATIC_CUMULATIVE = 2      # seen in 2+ frames total -> static
        self._STATIC_CONSEC_FRAMES = 2   # seen in 2+ consecutive frames -> static
        self._STATIC_POS_TOL = 10        # px tolerance for position match
        self._COLOR_BLOB_MIN_AREA_RATIO = 0.0002  # 0.02% of frame (very tight)
        self._COLOR_BLOB_MAX_AREA_RATIO = 0.001   # 0.1% of frame (reject large objects like kettle/wall items)
        self._COLOR_BLOB_MIN_CIRCULARITY = 0.80   # very strict circularity (cricket ball is perfectly round)
        # YOLO box size limit: cricket balls are small, reject boxes >1.5% of frame
        self._YOLO_MAX_BOX_AREA_RATIO = 0.015
        # Movement: real ball must move at least this many px between frames
        self._BALL_MIN_MOVE_PX = 3.0
        # Max dimension for color-blob: reject anything larger than a cricket ball would appear
        self._COLOR_BLOB_MAX_DIM = 40  # max width or height of blob in px

    def _init_detector(self):
        if not self.model_path or not Path(self.model_path).exists():
            return
        try:
            from ultralytics import YOLO

            self.yolo_model = YOLO(self.model_path)
        except Exception:
            self.yolo_model = None

    def _quantize_pos(self, cx: float, cy: float) -> Tuple[int, int]:
        """Snap a position to a coarse grid so small jitter still matches."""
        tol = self._STATIC_POS_TOL
        return (int(round(cx / tol)) * tol, int(round(cy / tol)) * tol)

    def _near_pos(self, q1: Tuple[int, int], q2: Tuple[int, int]) -> bool:
        """True if two quantised positions are within STATIC_POS_TOL px of each other."""
        return (abs(q1[0] - q2[0]) <= self._STATIC_POS_TOL and
                abs(q1[1] - q2[1]) <= self._STATIC_POS_TOL)

    def _update_static_tracking(self, blobs: List[Tuple[float, float, float]]) -> set:
        """Given candidate blobs, return the set of positions classed as static.

        A position is static when it meets EITHER threshold:
        - seen in _STATIC_CUMULATIVE frames total (catches kettles detected intermittently)
        - seen in _STATIC_CONSEC_FRAMES consecutive frames (catches steadily detected objects)
        A real cricket ball moves constantly so it rarely stays within STATIC_POS_TOL
        px for 2+ consecutive frames or 3+ frames total.
        Uses proximity matching so a flickering floor object that shifts a few px
        between frames is still classed as static.
        """
        current: set = set()
        for cx, cy, _conf in blobs:
            q = self._quantize_pos(cx, cy)
            current.add(q)

            # --- proximity match against existing static positions ---
            near_static = any(self._near_pos(q, sq) for sq in self._static_positions)
            if near_static:
                self._static_positions.add(q)
                # also bump cumulative/history for this quantised cell
                self._color_blob_history[q] = self._color_blob_history.get(q, 0) + 1
                continue

            # Cumulative count
            self._color_blob_history[q] = self._color_blob_history.get(q, 0) + 1

            # Consecutive count: match against any position seen last frame within tolerance
            near_last = None
            for lq in self._last_frame_positions:
                if self._near_pos(q, lq):
                    near_last = lq
                    break
            if near_last is not None:
                self._color_blob_consec[near_last] = self._color_blob_consec.get(near_last, 0) + 1
                consec_q = near_last
            else:
                self._color_blob_consec[q] = 1
                consec_q = q

            # Promote to static if either threshold is met
            if (self._color_blob_history[q] >= self._STATIC_CUMULATIVE or
                    self._color_blob_consec.get(consec_q, 0) >= self._STATIC_CONSEC_FRAMES):
                self._static_positions.add(q)

        # Positions not seen this frame reset their consecutive count
        for q in list(self._color_blob_consec.keys()):
            if not any(self._near_pos(q, cq) for cq in current):
                self._color_blob_consec[q] = 0
        self._last_frame_positions = current
        return self._static_positions

    def _is_static_position(self, cx: float, cy: float) -> bool:
        q = self._quantize_pos(cx, cy)
        if q in self._static_positions:
            return True
        for sq in self._static_positions:
            if abs(sq[0] - q[0]) <= self._STATIC_POS_TOL and abs(sq[1] - q[1]) <= self._STATIC_POS_TOL:
                return True
        return False

    def _detect_ball_yolo_with_conf(self, cv_frame) -> Optional[Tuple[float, float, float]]:
        import cv2
        import numpy as np

        # Gather ALL candidate positions from both detectors so static-object
        # tracking learns from every detector, not just colour-blob. A kettle on
        # the floor or a yellow wall object stays at the same pixels across
        # frames; a real cricket ball moves. Positions seen for
        # _STATIC_CONSEC_FRAMES consecutive frames are classed as static and
        # rejected by both detectors.
        candidates: List[Tuple[float, float, float, str]] = []  # (cx, cy, conf, source)

        # --- Colour-blob candidates ---
        try:
            hsv = cv2.cvtColor(cv_frame, cv2.COLOR_BGR2HSV)
            # Very tight HSV: cricket ball is a specific orange/red, nothing else
            lower_orange = np.array([10, 150, 150])
            upper_orange = np.array([20, 255, 255])
            lower_red1 = np.array([0, 150, 150])
            upper_red1 = np.array([6, 255, 255])
            lower_red2 = np.array([174, 150, 150])
            upper_red2 = np.array([180, 255, 255])
            mask = cv2.bitwise_or(
                cv2.bitwise_or(
                    cv2.inRange(hsv, lower_orange, upper_orange),
                    cv2.inRange(hsv, lower_red1, upper_red1),
                ),
                cv2.inRange(hsv, lower_red2, upper_red2),
            )
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            h, w = cv_frame.shape[:2]
            min_area = (w * h) * self._COLOR_BLOB_MIN_AREA_RATIO
            max_area = (w * h) * self._COLOR_BLOB_MAX_AREA_RATIO
            blob_candidates = []
            for cnt in contours:
                area = cv2.contourArea(cnt)
                if area < min_area or area > max_area:
                    continue
                perimeter = cv2.arcLength(cnt, True)
                if perimeter == 0:
                    continue
                circularity = 4 * np.pi * area / (perimeter * perimeter)
                if circularity < self._COLOR_BLOB_MIN_CIRCULARITY:
                    continue
                M = cv2.moments(cnt)
                if M["m00"] == 0:
                    continue
                cx_b = M["m10"] / M["m00"]
                cy_b = M["m01"] / M["m00"]
                # Max dimension: cricket ball is small, reject large blobs (kettle, wall items)
                x, y, bw, bh = cv2.boundingRect(cnt)
                if bw > self._COLOR_BLOB_MAX_DIM or bh > self._COLOR_BLOB_MAX_DIM:
                    continue
                # Aspect-ratio check: bounding rect should be roughly square
                aspect = min(bw, bh) / max(bw, bh) if max(bw, bh) > 0 else 0
                if aspect < 0.65:  # reject elongated blobs (not a ball)
                    continue
                conf = min(0.90, circularity * 0.70 + 0.20)
                blob_candidates.append((cx_b, cy_b, conf, "color_blob"))
            # Keep only the most circular blob per frame (avoid multi-blob false positives)
            if blob_candidates:
                blob_candidates.sort(key=lambda c: c[2], reverse=True)
                candidates.append(blob_candidates[0])
        except Exception:
            pass

        # --- YOLO candidates ---
        if self.yolo_model is not None:
            try:
                res = self.yolo_model(cv_frame, verbose=False)[0]
                h, w = cv_frame.shape[:2]
                max_box_area = (w * h) * self._YOLO_MAX_BOX_AREA_RATIO
                for box in res.boxes:
                    cls_name = res.names.get(int(box.cls[0]), "")
                    if "ball" in cls_name.lower():
                        xyxy = box.xyxy[0].tolist()
                        bw = xyxy[2] - xyxy[0]
                        bh = xyxy[3] - xyxy[1]
                        # Reject boxes that are too large to be a cricket ball
                        if bw * bh > max_box_area:
                            continue
                        # Reject detections with very poor aspect ratio
                        aspect = min(bw, bh) / max(bw, bh) if max(bw, bh) > 0 else 0
                        if aspect < 0.4:
                            continue
                        cx_y = (xyxy[0] + xyxy[2]) / 2.0
                        cy_y = (xyxy[1] + xyxy[3]) / 2.0
                        conf = float(box.conf[0])
                        candidates.append((cx_y, cy_y, conf, "yolo"))
            except Exception:
                pass

        # Update static tracking with every candidate from both detectors
        self._update_static_tracking([(c[0], c[1], c[2]) for c in candidates])

        # Filter to non-static positions only
        non_static = [c for c in candidates if not self._is_static_position(c[0], c[1])]

        # --- Movement filter: real balls move fast; static objects don't ---
        moved_candidates: List[Tuple[float, float, float, str]] = []
        for c in non_static:
            cx, cy = c[0], c[1]
            if self._last_ball_pos is not None:
                dx = cx - self._last_ball_pos[0]
                dy = cy - self._last_ball_pos[1]
                dist = (dx * dx + dy * dy) ** 0.5
                if dist < self._BALL_MIN_MOVE_PX:
                    self._static_frames += 1
                    continue
            self._last_ball_pos = (cx, cy)
            self._static_frames = 0
            moved_candidates.append(c)

        if self._static_frames > 10:
            self._last_ball_pos = None
            self._static_frames = 0

        if not moved_candidates:
            return None

        # Prefer colour-blob (high circularity + cricket-ball colour) over YOLO.
        # If YOLO confidence is very high (>= 0.6), prefer YOLO instead.
        color_blob_candidates = [c for c in moved_candidates if c[3] == "color_blob"]
        yolo_candidates = [c for c in moved_candidates if c[3] == "yolo"]

        if yolo_candidates:
            best_yolo = max(yolo_candidates, key=lambda c: c[2])
            if best_yolo[2] >= 0.60:  # high-confidence YOLO wins
                return (best_yolo[0], best_yolo[1], best_yolo[2], "yolo")

        if color_blob_candidates:
            best = max(color_blob_candidates, key=lambda c: c[2])
            return (best[0], best[1], best[2], "color_blob")

        if yolo_candidates:
            best = max(yolo_candidates, key=lambda c: c[2])
            return (best[0], best[1], best[2], "yolo")

        return None

    def _detect_ball_yolo(self, cv_frame) -> Optional[List[float]]:
        det = self._detect_ball_yolo_with_conf(cv_frame)
        return [det[0], det[1]] if det is not None else None

    def _detect_ball_color_blob(self, cv_frame) -> Optional[List[float]]:
        """Detect orange/red cricket ball using HSV color-blob fallback.

        Used when YOLO misses the ball (weak model trained on few images).
        Looks for orange/red circular blobs in HSV color space, filters by
        tighter area/circularity, rejects static objects (kettle, wall items)
        that persist at the same pixels across frames, returns [x, y] in pixels.
        """
        det = self._detect_ball_yolo_with_conf(cv_frame)
        if det is not None and det[3] == "color_blob":
            return [det[0], det[1]]
        return None

    @staticmethod
    def _kinematic_bat_proxy(
        lms: List[Dict[str, Any]]
    ) -> Tuple[Optional[List[float]], Optional[Dict[str, float]]]:
        if len(lms) < 17:
            return None, None

        w1 = lms[15]
        w2 = lms[16]
        el = lms[13]

        grip_x = (w1.get("x", 0.5) + w2.get("x", 0.5)) / 2.0
        grip_y = (w1.get("y", 0.5) + w2.get("y", 0.5)) / 2.0

        arm_dx = grip_x - el.get("x", 0.5)
        arm_dy = grip_y - el.get("y", 0.5)
        arm_len = math.sqrt(arm_dx * arm_dx + arm_dy * arm_dy) + 1e-5

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
        video_path: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        # Reset static-object tracking state for every new video/sequence so
        # objects from a previous clip don't pollute the current one.
        self._color_blob_history.clear()
        self._color_blob_consec.clear()
        self._last_frame_positions = set()
        self._static_positions = set()

        results: List[Dict[str, Any]] = []

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
                y_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1
                y_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 1
                idx = 0
                while cap.isOpened():
                    ret, cv_frame = cap.read()
                    if not ret:
                        break
                    ball = self._detect_ball_yolo(cv_frame)
                    # Fallback: color-blob detection when YOLO misses the ball
                    if ball is None:
                        ball = self._detect_ball_color_blob(cv_frame)
                    if ball is not None:
                        # store normalized [0..1] for the FrameLandmarks schema
                        yolo_balls[idx] = [ball[0] / y_w, ball[1] / y_h]
                    idx += 1
                cap.release()
            except Exception:
                use_yolo = False
                yolo_balls = {}

        # Prefer ByteTrack ball tracking when a video is available
        byte_balls: Dict[int, Dict[str, Any]] = {}
        if video_path and Path(video_path).exists():
            try:
                bt = self.ball_tracker.track_balls_in_video(video_path, conf=self.ball_tracker.conf)
                for t in bt:
                    if t.get("ball_pos") is not None:
                        byte_balls[t["frame_index"]] = t
            except Exception:
                pass

        for i, f in enumerate(frames):
            lms = f.get("landmarks", [])
            bat_box, bat_tip = self._kinematic_bat_proxy(lms)

            ball_pos = None
            ball_meta: Dict[str, Any] = {}
            if i in byte_balls:
                ball_pos = byte_balls[i].get("ball_pos")
                ball_meta = {
                    "ball_id": byte_balls[i].get("ball_id"),
                    "ball_box": byte_balls[i].get("ball_box"),
                    "conf": byte_balls[i].get("conf"),
                    "method": byte_balls[i].get("method"),
                }
            elif yolo_balls.get(i) is not None:
                ball_pos = yolo_balls[i]
            elif f.get("ball_position") is not None:
                ball_pos = f["ball_position"]

            if use_yolo and ball_pos is not None and bat_box is not None:
                method = "yolov8_ball_kinematic_bat"
            elif use_yolo and ball_pos is not None:
                method = "yolov8_ball_only"
            elif bat_box is not None:
                method = "kinematic_bat_proxy"
            else:
                method = "unavailable"

            if ball_meta:
                method = ball_meta.get("method", method)

            results.append(
                {
                    "frame_index": i,
                    "bat_box": bat_box,
                    "bat_tip": bat_tip,
                    "ball_pos": ball_pos,
                    "ball_id": ball_meta.get("ball_id"),
                    "ball_box": ball_meta.get("ball_box"),
                    "conf": ball_meta.get("conf"),
                    "method": method,
                }
            )

        if results:
            return results

        return [
            {
                "frame_index": 0,
                "bat_box": None,
                "bat_tip": None,
                "ball_pos": None,
                "method": "unavailable",
            }
        ]
