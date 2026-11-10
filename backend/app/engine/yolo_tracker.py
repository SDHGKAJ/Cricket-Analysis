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

    def _init_detector(self):
        if not self.model_path or not Path(self.model_path).exists():
            return
        try:
            from ultralytics import YOLO

            self.yolo_model = YOLO(self.model_path)
        except Exception:
            self.yolo_model = None

    def _detect_ball_yolo_with_conf(self, cv_frame) -> Optional[Tuple[float, float, float]]:
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
                        best = (
                            (xyxy[0] + xyxy[2]) / 2.0,
                            (xyxy[1] + xyxy[3]) / 2.0,
                            conf,
                        )
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
