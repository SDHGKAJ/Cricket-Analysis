"""
OpenPose-Style Pose Overlay Engine
==================================
Produces an annotated copy of an input video:
- Detects a person per frame with MediaPipe Pose (33 landmarks)
- Maps detections to the OpenPose COCO-18 keypoint layout
  (nose, neck, shoulders, elbows, wrists, hips, knees, ankles, eyes, ears)
- Draws each keypoint as a filled circle and each limb as a thick,
  semi-transparent colored line with a fixed color per limb
- Skips keypoints with confidence < 0.3
- Smooths keypoints temporally (EMA) to reduce jitter
- Frames with no person are passed through unchanged
- Keeps original resolution and FPS; writes H.264 mp4 when possible

Public API:
    analyze_video(input_path: str, output_path: str) -> str
"""

import subprocess
from collections import deque
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np

# ── OpenPose COCO-18 keypoint layout ─────────────────────────────────────────
COCO_KEYPOINTS = [
    "nose", "neck",
    "RShoulder", "RElbow", "RWrist",
    "LShoulder", "LElbow", "LWrist",
    "RHip", "RKnee", "RAnkle",
    "LHip", "LKnee", "LAnkle",
    "REye", "LEye", "REar", "LEar",
]

CONF_THRESHOLD = 0.3     # skip keypoints below this confidence
SMOOTH_ALPHA = 0.6       # EMA weight for the new observation (1.0 = no smoothing)
MAX_MISSED_FRAMES = 15   # reset smoothing state after this many frames without a pose

# Ball drawing config (visual style matches cricket_analyzer HUD video)
BALL_COLOR = (0, 165, 255)       # orange circle (BGR)
BALL_DOT_COLOR = (255, 255, 255)  # white center dot
BALL_CONF_MIN = 0.25             # min confidence to draw a detection
BALL_TRAIL_LEN = 15              # fading trail length (frames)
BALL_RADIUS = 7                  # ball circle radius in px
BALL_LABEL_SCALE = 0.5           # confidence label text scale

# ── Limb connections (COCO-18 indices) with fixed BGR colors ─────────────────
# Arms: red/orange/yellow · Legs: blue/cyan · Shoulders/hips: green · Face: pink/magenta
LIMBS: List[Tuple[int, int, Tuple[int, int, int]]] = [
    # shoulders (green)
    (1, 2, (0, 200, 0)),    # neck -> RShoulder
    (1, 5, (0, 200, 0)),    # neck -> LShoulder
    (2, 5, (0, 160, 0)),    # RShoulder -> LShoulder
    # right arm (red -> orange)
    (2, 3, (0, 0, 255)),    # RShoulder -> RElbow
    (3, 4, (0, 120, 255)),  # RElbow -> RWrist
    # left arm (orange -> yellow)
    (5, 6, (0, 170, 255)),  # LShoulder -> LElbow
    (6, 7, (0, 255, 255)),  # LElbow -> LWrist
    # hips (green)
    (1, 8, (0, 170, 0)),    # neck -> RHip
    (1, 11, (0, 170, 0)),   # neck -> LHip
    (8, 11, (0, 200, 0)),   # RHip -> LHip
    # right leg (blue -> cyan-blue)
    (8, 9, (255, 80, 0)),   # RHip -> RKnee
    (9, 10, (255, 160, 0)), # RKnee -> RAnkle
    # left leg (light blue -> cyan)
    (11, 12, (255, 200, 0)),  # LHip -> LKnee
    (12, 13, (255, 255, 0)),  # LKnee -> LAnkle
    # face (pink / magenta)
    (1, 0, (255, 0, 200)),    # neck -> nose
    (0, 14, (255, 0, 255)),   # nose -> REye
    (0, 15, (255, 0, 255)),   # nose -> LEye
    (14, 16, (200, 0, 255)),  # REye -> REar
    (15, 17, (200, 0, 255)),  # LEye -> LEar
]

# Filled-circle color per keypoint (BGR), grouped by body region
KEYPOINT_COLORS: List[Tuple[int, int, int]] = [
    (255, 0, 255),   # nose (magenta)
    (0, 200, 0),     # neck (green)
    (0, 200, 0), (0, 0, 255), (0, 120, 255),     # R arm (green/red/orange)
    (0, 200, 0), (0, 170, 255), (0, 255, 255),   # L arm (green/orange/yellow)
    (0, 200, 0), (255, 80, 0), (255, 160, 0),    # R leg (green/blue/cyan-blue)
    (0, 200, 0), (255, 200, 0), (255, 255, 0),   # L leg (green/light blue/cyan)
    (255, 0, 255), (255, 0, 255),                # eyes (magenta)
    (200, 0, 255), (200, 0, 255),                # ears (pink)
]

# ── Pose detector (MediaPipe Tasks API, with legacy mp.solutions fallback) ───
# mediapipe >= 1.0 removed mp.solutions.*; the Tasks API (PoseLandmarker) is
# the supported path. Model auto-downloads on first use.
MODEL_PATH = Path(__file__).resolve().parents[2] / "models" / "pose_landmarker.task"
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_full/float16/1/pose_landmarker_full.task"
)


def _ensure_model() -> Path:
    """Return the local pose_landmarker.task path, downloading it if missing."""
    if MODEL_PATH.exists() and MODEL_PATH.stat().st_size > 0:
        return MODEL_PATH
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    try:
        import urllib.request
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    except Exception as exc:  # noqa: BLE001 - surface a clear message
        if MODEL_PATH.exists():
            MODEL_PATH.unlink(missing_ok=True)
        raise RuntimeError(
            f"Could not download the MediaPipe pose model. Download it manually "
            f"from {MODEL_URL} and save it as {MODEL_PATH}"
        ) from exc
    return MODEL_PATH


class _TasksPoseDetector:
    """MediaPipe Tasks PoseLandmarker (VIDEO mode) -> 33 landmarks per frame."""

    def __init__(self) -> None:
        import cv2  # noqa: F401  (ensures OpenCV is importable before use)
        import mediapipe as mp
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision

        options = vision.PoseLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=str(_ensure_model())),
            running_mode=vision.RunningMode.VIDEO,
            num_poses=1,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self._mp = mp
        self._landmarker = vision.PoseLandmarker.create_from_options(options)
        self._last_ts = -1

    def detect(self, frame_bgr: np.ndarray, timestamp_ms: float):
        """Return the 33 NormalizedLandmarks for the person, or None."""
        import cv2

        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        image = self._mp.Image(
            image_format=self._mp.ImageFormat.SRGB,
            data=np.ascontiguousarray(rgb),
        )
        # Tasks API requires strictly increasing timestamps
        ts = int(round(timestamp_ms))
        if ts <= self._last_ts:
            ts = self._last_ts + 1
        self._last_ts = ts
        result = self._landmarker.detect_for_video(image, ts)
        if result.pose_landmarks:
            return result.pose_landmarks[0]
        return None

    def close(self) -> None:
        self._landmarker.close()


class _LegacyPoseDetector:
    """Fallback for mediapipe builds that still ship mp.solutions.pose."""

    def __init__(self) -> None:
        import mediapipe as mp
        self._pose = mp.solutions.pose.Pose(
            static_image_mode=False,
            model_complexity=1,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

    def detect(self, frame_bgr: np.ndarray, timestamp_ms: float):
        import cv2

        res = self._pose.process(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))
        if res.pose_landmarks:
            return res.pose_landmarks.landmark
        return None

    def close(self) -> None:
        self._pose.close()


def create_pose_detector():
    """Build the best available pose detector; None if mediapipe is unusable.

    Returns an object with .detect(frame_bgr, timestamp_ms) -> landmarks | None
    and .close().
    """
    try:
        return _TasksPoseDetector()
    except Exception:
        pass
    try:
        return _LegacyPoseDetector()
    except Exception:
        return None


# MediaPipe Pose (33) -> COCO-18 source index (None = derived)
_MP_TO_COCO_SRC = [
    0,    # nose
    None, # neck = midpoint of shoulders
    12, 14, 16,   # RShoulder, RElbow, RWrist (person's right)
    11, 13, 15,   # LShoulder, LElbow, LWrist
    24, 26, 28,   # RHip, RKnee, RAnkle
    23, 25, 27,   # LHip, LKnee, LAnkle
    5, 2,         # REye, LEye
    8, 7,         # REar, LEar
]


def _mp_landmarks_to_coco(landmarks, width: int, height: int) -> np.ndarray:
    """Convert MediaPipe 33 landmarks -> COCO-18 array of shape (18, 3) = x, y, conf.

    Coordinates are pixel space; confidence is MediaPipe visibility.
    """
    pts = np.zeros((18, 3), dtype=np.float64)
    for i, src in enumerate(_MP_TO_COCO_SRC):
        if src is None:
            continue
        lm = landmarks[src]
        pts[i] = (lm.x * width, lm.y * height, lm.visibility or 0.0)

    # neck = midpoint of the shoulders (average position + visibility)
    ls, rs = landmarks[11], landmarks[12]
    pts[1] = (
        (ls.x + rs.x) * 0.5 * width,
        (ls.y + rs.y) * 0.5 * height,
        min(ls.visibility or 0.0, rs.visibility or 0.0),
    )
    return pts


def _smooth(prev: Optional[np.ndarray], cur: np.ndarray, alpha: float = SMOOTH_ALPHA) -> np.ndarray:
    """Exponential moving average per keypoint; only updates visible keypoints."""
    if prev is None:
        return cur.copy()
    out = prev.copy()
    visible = cur[:, 2] >= CONF_THRESHOLD
    out[visible, 0] = alpha * cur[visible, 0] + (1.0 - alpha) * prev[visible, 0]
    out[visible, 1] = alpha * cur[visible, 1] + (1.0 - alpha) * prev[visible, 1]
    out[visible, 2] = cur[visible, 2]
    out[~visible, 2] = 0.0  # drop low-confidence keypoints this frame
    return out


def _draw_pose(frame: np.ndarray, pts: np.ndarray) -> None:
    """Draw OpenPose-style limbs (semi-transparent) and keypoints onto the frame."""
    import cv2

    h, w = frame.shape[:2]
    scale = min(h, w)
    limb_thickness = max(2, int(round(scale / 160)))
    joint_radius = max(3, int(round(scale / 130)))

    # Pass 1: limbs on an overlay, then blend for semi-transparency
    overlay = frame.copy()
    for i1, i2, color in LIMBS:
        p1, p2 = pts[i1], pts[i2]
        if p1[2] < CONF_THRESHOLD or p2[2] < CONF_THRESHOLD:
            continue
        cv2.line(
            overlay,
            (int(round(p1[0])), int(round(p1[1]))),
            (int(round(p2[0])), int(round(p2[1]))),
            color,
            limb_thickness,
            lineType=cv2.LINE_AA,
        )
    cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)

    # Pass 2: keypoint dots (solid, on top)
    for i, (x, y, conf) in enumerate(pts):
        if conf < CONF_THRESHOLD:
            continue
        cv2.circle(frame, (int(round(x)), int(round(y))), joint_radius, KEYPOINT_COLORS[i], -1, cv2.LINE_AA)


def _put_text_outline(frame: np.ndarray, text: str, org: Tuple[int, int], scale: float,
                      color: Tuple[int, int, int], thickness: int = 1) -> None:
    """Draw text with a black outline for readability on any background."""
    import cv2
    cv2.putText(frame, text, org, cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 0, 0), thickness + 2, cv2.LINE_AA)
    cv2.putText(frame, text, org, cv2.FONT_HERSHEY_SIMPLEX, scale, color, thickness, cv2.LINE_AA)


def _draw_ball(frame: np.ndarray, x_px: float, y_px: float, conf: float) -> None:
    """Draw one ball detection: orange circle + white center dot + 'ball 0.62' label."""
    import cv2

    cx, cy = int(round(x_px)), int(round(y_px))
    cv2.circle(frame, (cx, cy), BALL_RADIUS, BALL_COLOR, 3, cv2.LINE_AA)
    cv2.circle(frame, (cx, cy), 2, BALL_DOT_COLOR, -1, cv2.LINE_AA)
    label = f"ball {conf:.2f}"
    (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, BALL_LABEL_SCALE, 1)
    label_y = cy - BALL_RADIUS - 6
    if label_y < th + 4:
        label_y = cy + BALL_RADIUS + th + 4
    _put_text_outline(frame, label, (cx - tw // 2, label_y), BALL_LABEL_SCALE, BALL_COLOR, 1)


def _draw_ball_trail(frame: np.ndarray, trail: deque) -> None:
    """Draw a fading trail of the last N ball positions."""
    import cv2

    n = len(trail)
    if n < 2:
        return
    for j, (tx, ty) in enumerate(trail):
        # Fade: older points are smaller and dimmer
        t = j / max(n - 1, 1)
        r = max(1, int(round(BALL_RADIUS * (0.3 + 0.7 * t))))
        alpha = 0.3 + 0.7 * t
        color = (
            int(BALL_COLOR[0] * alpha),
            int(BALL_COLOR[1] * alpha),
            int(BALL_COLOR[2] * alpha),
        )
        cv2.circle(frame, (int(round(tx)), int(round(ty))), r, color, -1, cv2.LINE_AA)


class _FFmpegH264Writer:
    """Streams raw BGR frames into ffmpeg to produce a true H.264 mp4."""

    def __init__(self, exe: str, path: str, fps: float, width: int, height: int):
        cmd = [
            exe, "-y",
            "-f", "rawvideo", "-vcodec", "rawvideo",
            "-pix_fmt", "bgr24", "-s", f"{width}x{height}", "-r", str(fps),
            "-i", "-",
            "-an",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
            "-pix_fmt", "yuv420p",
            "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            path,
        ]
        self._proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    def write(self, frame: np.ndarray) -> None:
        if self._proc.stdin:
            self._proc.stdin.write(np.ascontiguousarray(frame).tobytes())

    def release(self) -> None:
        if self._proc.stdin:
            self._proc.stdin.close()
        try:
            self._proc.wait(timeout=120)
        except subprocess.TimeoutExpired:
            self._proc.kill()

    def success(self) -> bool:
        return self._proc.returncode == 0


def _open_writer(output_path: str, fps: float, width: int, height: int):
    """Prefer H.264 via bundled ffmpeg; fall back to OpenCV encoders."""
    import cv2

    # 1) imageio-ffmpeg bundled ffmpeg -> real H.264
    try:
        import imageio_ffmpeg
        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if exe:
            return _FFmpegH264Writer(exe, output_path, fps, width, height), "ffmpeg_h264"
    except Exception:
        pass

    # 2) OpenCV with an H.264 fourcc (works on some builds)
    for fourcc in ("avc1", "H264", "X264"):
        writer = cv2.VideoWriter(output_path, cv2.VideoWriter_fourcc(*fourcc), fps, (width, height))
        if writer.isOpened():
            return writer, f"opencv_{fourcc}"
        writer.release()

    # 3) Last resort: MPEG-4 Part 2 (universally writable, not H.264)
    writer = cv2.VideoWriter(output_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
    return writer, "opencv_mp4v"


def analyze_video(input_path: str, output_path: str,
                  ball_positions: Optional[List[Optional[Tuple[float, float, float]]]] = None,
                  ball_conf_min: float = BALL_CONF_MIN,
                  ball_trail_len: int = BALL_TRAIL_LEN) -> str:
    """Annotate a video with an OpenPose-style skeleton overlay.

    Detects the person frame-by-frame (MediaPipe Pose mapped to COCO-18),
    smooths keypoints temporally, and draws colored keypoints + limbs while
    preserving the original resolution and FPS. Frames without a person are
    passed through unchanged.

    Args:
        input_path:  Path to the source video (mp4/avi/mov).
        output_path: Path for the annotated mp4 output.
        ball_positions: Per-frame ball detections indexed by frame index.
            Each entry is ``None`` or ``(x_px, y_px, conf)`` in pixel space.
        ball_conf_min: Minimum confidence to draw a ball detection.
        ball_trail_len: Length of the fading ball trail (frames).

    Returns:
        The output_path written.

    Raises:
        ValueError: If the input video cannot be opened.
        RuntimeError: If no video writer could be created.
    """
    import cv2

    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {input_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    writer, backend = _open_writer(output_path, fps, width, height)
    opened = writer.isOpened() if hasattr(writer, "isOpened") else True
    if not opened:
        cap.release()
        writer.release()
        raise RuntimeError(f"Could not create video writer for: {output_path}")

    # Pose estimator: MediaPipe Tasks API (legacy mp.solutions fallback)
    pose = create_pose_detector()

    smoothed: Optional[np.ndarray] = None
    missed_frames = 0
    frame_idx = 0
    trail: deque = deque(maxlen=ball_trail_len)

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            current: Optional[np.ndarray] = None
            if pose is not None:
                landmarks = pose.detect(frame, (frame_idx / fps) * 1000.0)
                if landmarks:
                    current = _mp_landmarks_to_coco(landmarks, width, height)

            if current is not None:
                smoothed = _smooth(smoothed, current)
                missed_frames = 0
                # Draw a copy so the caller's frame semantics stay "annotated frame"
                _draw_pose(frame, smoothed)
            else:
                # No person detected -> pass the frame through unchanged
                missed_frames += 1
                if missed_frames > MAX_MISSED_FRAMES:
                    smoothed = None  # person gone long enough; reset tracker

            # Draw ball detection + fading trail on top of the skeleton
            ball = None
            if ball_positions is not None and 0 <= frame_idx < len(ball_positions):
                ball = ball_positions[frame_idx]
            if ball is not None:
                x_px, y_px, conf = ball
                if conf >= ball_conf_min:
                    _draw_ball(frame, x_px, y_px, conf)
                    trail.append((x_px, y_px))
            if trail:
                _draw_ball_trail(frame, trail)

            writer.write(frame)
            frame_idx += 1
    finally:
        cap.release()
        if pose is not None:
            pose.close()
        writer.release()

    # Verify the H.264 path actually produced a file; surface ffmpeg failures
    if backend == "ffmpeg_h264" and (not Path(output_path).exists() or Path(output_path).stat().st_size == 0):
        raise RuntimeError(f"ffmpeg failed to write: {output_path}")

    return output_path
