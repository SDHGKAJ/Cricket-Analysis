"""
Subject (batter) selection and tracking.
========================================

MediaPipe Pose follows ONE person — by default the most prominent one. In a
clip filmed from behind the bowler that is the bowler, so the whole batting
analysis silently describes the wrong player.

The user taps the batter once (any frame). This module:
1. runs a COCO person detector (yolov8n) on every frame,
2. picks the person under the tap,
3. follows them forwards and backwards by box overlap / proximity, holding
   the last box through short occlusions,
4. smooths the boxes and turns each into a square crop (2.2x the person, room
   for bat and stride).

``SubjectPoseDetector`` wraps a pose detector so every pass (scores, HUD,
contact, pose video) runs on that crop and returns whole-frame landmarks.
Small, distant batters are also enlarged by the crop, so pose finds them.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, List, Optional, Tuple

import numpy as np

Box = Tuple[float, float, float, float]

PERSON_CONF = 0.25
MIN_IOU = 0.2           # same person if boxes overlap at least this much...
MAX_SHIFT = 0.6         # ...or the centre moved less than this x box height
HOLD_FRAMES = 15        # keep the last box through short occlusions
SMOOTH = 0.6            # EMA weight of the new box
CROP_SCALE = 2.2

_PERSON_MODEL = None


def _person_model():
    global _PERSON_MODEL
    if _PERSON_MODEL is None:
        from ultralytics import YOLO
        from ..config import BASE_DIR

        _PERSON_MODEL = YOLO(str(BASE_DIR.parent / "yolov8n.pt"))
    return _PERSON_MODEL


def _iou(a: Box, b: Box) -> float:
    x1, y1, x2, y2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def _centre(b: Box) -> np.ndarray:
    return np.array([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2])


@dataclass
class SubjectTrack:
    """Per-frame crop boxes (x1, y1, x2, y2) in pixels; None = subject not available."""
    crops: List[Optional[Tuple[int, int, int, int]]]
    boxes: List[Optional[Box]]
    fps: float
    width: int
    height: int
    start_frame: int

    def crop_at(self, frame_idx: int) -> Optional[Tuple[int, int, int, int]]:
        return self.crops[frame_idx] if 0 <= frame_idx < len(self.crops) else None

    def coverage(self) -> float:
        return sum(c is not None for c in self.crops) / max(1, len(self.crops))


def _follow(dets: List[List[Box]], start: int, box: Box, order: range) -> dict:
    """Greedy association from `start` along `order`; returns {frame: box}."""
    out = {start: box}
    last, missing = box, 0
    for j in order:
        best, best_score = None, 0.0
        h = last[3] - last[1]
        for b in dets[j]:
            iou = _iou(last, b)
            shift = float(np.linalg.norm(_centre(b) - _centre(last))) / max(h, 1.0)
            score = iou if iou >= MIN_IOU else (0.1 * (1 - shift / MAX_SHIFT) if shift < MAX_SHIFT else 0.0)
            if score > best_score:
                best, best_score = b, score
        if best is not None:
            last, missing = best, 0
            out[j] = best
        else:
            missing += 1
            if missing <= HOLD_FRAMES:
                out[j] = last           # occluded / missed: hold position
    return out


def track_subject(video_path: str, t_s: float, x_n: float, y_n: float) -> SubjectTrack:
    """Track the person under the tap (time in s, x/y normalised 0-1).

    Raises ValueError if no person is found at the tapped point.
    """
    import cv2
    import torch

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    W, H = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    model = _person_model()
    device = 0 if torch.cuda.is_available() else "cpu"
    dets: List[List[Box]] = []
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        r = model.predict(frame, classes=[0], conf=PERSON_CONF, verbose=False, device=device)[0]
        dets.append([tuple(b) for b in r.boxes.xyxy.tolist()])
    cap.release()
    n = len(dets)
    if n == 0:
        raise ValueError("could not read the video")

    s = int(np.clip(round(t_s * fps), 0, n - 1))
    px, py = x_n * W, y_n * H
    inside = [b for b in dets[s] if b[0] <= px <= b[2] and b[1] <= py <= b[3]]
    if inside:
        start = min(inside, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]))   # innermost box
    else:
        near = sorted(dets[s], key=lambda b: float(np.hypot(*(_centre(b) - (px, py)))))
        if not near or np.hypot(*(_centre(near[0]) - (px, py))) > 0.15 * np.hypot(W, H):
            raise ValueError("no person found where you tapped — pause on a frame where the batter is visible")
        start = near[0]

    found = {**_follow(dets, s, start, range(s - 1, -1, -1)), **_follow(dets, s, start, range(s + 1, n))}
    boxes: List[Optional[Box]] = [found.get(i) for i in range(n)]

    # smooth (EMA forwards) and convert to square crops
    crops: List[Optional[Tuple[int, int, int, int]]] = []
    prev: Optional[np.ndarray] = None
    for b in boxes:
        if b is None:
            crops.append(None)
            prev = None
            continue
        cur = np.array(b, float)
        prev = cur if prev is None else SMOOTH * cur + (1 - SMOOTH) * prev
        x1, y1, x2, y2 = prev
        side = max(x2 - x1, y2 - y1) * CROP_SCALE
        cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
        crops.append((int(max(0, cx - side / 2)), int(max(0, cy - side / 2)),
                      int(min(W, cx + side / 2)), int(min(H, cy + side / 2))))
    return SubjectTrack(crops, boxes, fps, W, H, s)


class _Landmark:
    """Whole-frame landmark with the attributes callers read from MediaPipe's."""
    __slots__ = ("x", "y", "z", "visibility", "presence")

    def __init__(self, x: float, y: float, z: float, visibility: float, presence: float):
        self.x, self.y, self.z, self.visibility, self.presence = x, y, z, visibility, presence


class SubjectPoseDetector:
    """Runs a pose detector on the subject's crop; returns whole-frame landmarks.

    Frames where the subject isn't available return None (no pose) rather than
    falling back to the full frame, which would pick up another player.
    """

    def __init__(self, base: Any, track: SubjectTrack):
        self.base, self.track = base, track

    def detect(self, frame_bgr: np.ndarray, timestamp_ms: float):
        i = int(round(timestamp_ms * self.track.fps / 1000.0))
        crop = self.track.crop_at(i)
        if crop is None:
            return None
        x1, y1, x2, y2 = crop
        if x2 - x1 < 8 or y2 - y1 < 8:
            return None
        h, w = frame_bgr.shape[:2]
        lms = self.base.detect(np.ascontiguousarray(frame_bgr[y1:y2, x1:x2]), timestamp_ms)
        if not lms:
            return None
        cw, ch = x2 - x1, y2 - y1
        return [_Landmark((x1 + l.x * cw) / w, (y1 + l.y * ch) / h, getattr(l, "z", 0.0),
                          getattr(l, "visibility", 1.0), getattr(l, "presence", 1.0)) for l in lms]

    def close(self) -> None:
        self.base.close()
