"""
Cricket Shot Analysis Engine - FastAPI Server
============================================
Provides real-time shot detection, biomechanics scoring, flaw identification,
coach drills, video processing, and session history management.
"""

import os
import json
import re
import uuid
import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any, Tuple

from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from .config import BASE_DIR, UPLOAD_DIR, REPLAY_DIR, OUTPUT_DIR, SHOTS_CONFIG, FLAWS_CONFIG
from .database import engine, Base, get_db
from .models.shot_models import SessionModel, ShotRecordModel
from .schemas.shot_schemas import (
    ShotAnalysisResponse,
    AnalyzeShotSequenceRequest,
    SessionCreate,
    SessionResponse,
    FlawItem,
    TipItem,
    FrameLandmarks,
)
from .engine.shot_segmentation import ShotSegmentationEngine
from .engine.metrics_calculator import MetricsCalculator
from .engine.flaw_detector import FlawDetector
from .engine.shot_classifier import get_shot_classifier
from .engine.yolo_tracker import CricketObjectTracker
from .engine.slowmo_generator import SlowMoReplayGenerator
from .engine.pose_overlay import analyze_video as analyze_pose_overlay, create_pose_detector
from .engine.cricket_analyzer import analyze_cricket_shot
from .engine.video_normalizer import probe_video, normalize_video, is_compatible, remux_faststart
from .engine.trajectory import build_trajectory, rebuild_from_file
from .engine.yolo_tracker import CricketBallTracker

# Initialize database tables
Base.metadata.create_all(bind=engine)

# Auto-select ML shot classifier when the trained ONNX model is available,
# otherwise fall back to the rule-based classifier.
SHOT_CLASSIFIER_ONNX = BASE_DIR / "cricket_shot_classifier.onnx"
SHOT_CLASSIFIER_MODE = "ml" if SHOT_CLASSIFIER_ONNX.exists() else "rule_based"

# Video analysis limits
MAX_ANALYSIS_SECONDS = 6.0  # analyse at most the first 6 s of a clip
MIN_POSE_FRAMES = 10        # fewer frames with a visible batter -> shot is not scored

app = FastAPI(
    title="Cricket Batting Biomechanics & Shot Analysis API",
    description="Real-time Pose Estimation, YOLO Tracking, Flaw Detection, and Coaching Engine",
    version="1.0.0"
)

# CORS setup for web frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static file serving for uploads, replays & pose-overlay outputs
app.mount("/replays", StaticFiles(directory=str(REPLAY_DIR)), name="replays")
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/outputs", StaticFiles(directory=str(OUTPUT_DIR)), name="outputs")

segmenter = ShotSegmentationEngine(fps=30.0)
object_tracker = CricketObjectTracker()
ball_tracker = CricketBallTracker()
replay_generator = SlowMoReplayGenerator(output_dir=str(REPLAY_DIR))

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "Cricket Analysis Engine",
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "database": "sqlite_connected"
    }

@app.get("/api/config")
def get_configurations():
    """Return editable metric weights, ideal angle ranges, and flaw rules."""
    return {
        "shots_config": SHOTS_CONFIG,
        "flaws_config": FLAWS_CONFIG
    }

@app.post("/api/sessions", response_model=SessionResponse)
def create_session(data: SessionCreate, db: Session = Depends(get_db)):
    """Create a new batting session."""
    session_id = f"sess_{uuid.uuid4().hex[:8]}"
    db_session = SessionModel(
        id=session_id,
        player_name=data.player_name,
        camera_angle=data.camera_angle,
        batter_hand=data.batter_hand,
        notes=data.notes
    )
    db.add(db_session)
    db.commit()
    db.refresh(db_session)

    return SessionResponse(
        id=db_session.id,
        player_name=db_session.player_name,
        camera_angle=db_session.camera_angle,
        batter_hand=db_session.batter_hand,
        created_at=db_session.created_at.isoformat(),
        shot_count=0,
        avg_score=0.0,
        shots=[]
    )

@app.get("/api/sessions", response_model=List[SessionResponse])
def list_sessions(db: Session = Depends(get_db)):
    """List all batting practice sessions with summary stats."""
    sessions = db.query(SessionModel).order_by(SessionModel.created_at.desc()).all()
    res = []
    for s in sessions:
        shot_count = len(s.shots)
        avg = sum(sh.overall_score for sh in s.shots) / shot_count if shot_count > 0 else 0.0
        res.append(SessionResponse(
            id=s.id,
            player_name=s.player_name,
            camera_angle=s.camera_angle,
            batter_hand=s.batter_hand,
            created_at=s.created_at.isoformat(),
            shot_count=shot_count,
            avg_score=round(avg, 1),
            shots=[]
        ))
    return res

@app.get("/api/sessions/{session_id}", response_model=SessionResponse)
def get_session(session_id: str, db: Session = Depends(get_db)):
    """Get single session with its full shot history."""
    s = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    shot_count = len(s.shots)
    avg = sum(sh.overall_score for sh in s.shots) / shot_count if shot_count > 0 else 0.0

    shot_items = []
    for sh in s.shots:
        shot_items.append(ShotAnalysisResponse(
            shot_type=sh.shot_type,
            overall_score=sh.overall_score,
            timing_score=sh.timing_score,
            metrics=sh.metrics,
            flaws=[FlawItem(**f) for f in sh.flaws],
            tips=[TipItem(**t) for t in sh.tips],
            impact_frame=sh.impact_frame,
            total_frames=sh.total_frames,
            shot_id=sh.id,
            replay_url=sh.replay_url
        ))

    return SessionResponse(
        id=s.id,
        player_name=s.player_name,
        camera_angle=s.camera_angle,
        batter_hand=s.batter_hand,
        created_at=s.created_at.isoformat(),
        shot_count=shot_count,
        avg_score=round(avg, 1),
        shots=shot_items
    )

@app.post("/api/analyze-shot", response_model=ShotAnalysisResponse)
def analyze_shot_sequence(data: AnalyzeShotSequenceRequest, db: Session = Depends(get_db)):
    """
    Main endpoint for real-time shot analysis:
    Takes sequenced landmark frames, segments shot phases, computes 8 metrics,
    identifies flaws, provides coach tips, and persists the record.
    """
    frame_dicts = [f.model_dump() for f in data.frames]

    # 1. Shot Segmentation (Backlift -> Downswing -> Impact -> Follow-Through)
    segmentation = segmenter.segment_sequence(frame_dicts, batter_hand=data.batter_hand)
    impact_frame = segmentation.get("impact_frame", len(frame_dicts) // 2)

    # 2. Shot Classification (Swappable Rule-Based or ML)
    classifier = get_shot_classifier(mode=SHOT_CLASSIFIER_MODE)
    predicted_shot, conf = classifier.classify(frame_dicts, segmentation, batter_hand=data.batter_hand)

    # In MVP, prioritize Cover Drive analysis
    # Shown to the user: the hint, else the classifier's answer ("" = unsure).
    shown_shot = data.shot_type_hint or predicted_shot or ""
    # Flaw rules need some shot profile; cover drive is the generic default.
    active_shot = shown_shot or "cover_drive"

    # 3. Compute Biomechanical Metrics
    calculator = MetricsCalculator(camera_angle=data.camera_angle, batter_hand=data.batter_hand)
    metrics, diagnostics = calculator.compute_all_metrics(frame_dicts, segmentation)

    # 4. Flaw Detection & Coach Insights
    detector = FlawDetector(shot_type=active_shot)
    overall_score, timing_score, flaws, tips = detector.evaluate_flaws_and_score(
        metrics=metrics,
        diagnostics=diagnostics,
        impact_frame=impact_frame
    )

    shot_id = f"shot_{uuid.uuid4().hex[:10]}"

    # Save to SQLite DB if session exists
    if data.session_id:
        sess = db.query(SessionModel).filter(SessionModel.id == data.session_id).first()
        if sess:
            record = ShotRecordModel(
                id=shot_id,
                session_id=sess.id,
                shot_type=active_shot,
                overall_score=overall_score,
                timing_score=timing_score,
                metrics=metrics,
                flaws=flaws,
                tips=tips,
                impact_frame=impact_frame,
                total_frames=len(data.frames)
            )
            db.add(record)
            db.commit()

    return ShotAnalysisResponse(
        shot_type=shown_shot,
        overall_score=overall_score,
        timing_score=timing_score,
        metrics=metrics,
        flaws=[FlawItem(**f) for f in flaws],
        tips=[TipItem(**t) for t in tips],
        impact_frame=impact_frame,
        total_frames=len(data.frames),
        shot_id=shot_id,
        confidence=round(float(conf) * 100, 1) if conf is not None else None,
        frames=data.frames
    )

@app.post("/api/analyze-video", response_model=ShotAnalysisResponse)
async def analyze_video_upload(
    file: UploadFile = File(...),
    camera_angle: str = Form("front_on"),
    batter_hand: str = Form("right"),
    session_id: Optional[str] = Form(None),
    calibration: Optional[str] = Form(None),  # JSON: batterEnd, bowlerEnd, stumpTop (video px)
    db: Session = Depends(get_db)
):
    """
    Video upload endpoint: saves video, runs extraction/pose/YOLO,
    scores shot, and generates slow-mo replay.
    """
    file_id = uuid.uuid4().hex[:8]
    ext = Path(file.filename or "shot.mp4").suffix or ".mp4"
    saved_filename = f"upload_{file_id}{ext}"
    saved_path = UPLOAD_DIR / saved_filename

    contents = await file.read()
    with open(saved_path, "wb") as f:
        f.write(contents)

    # Probe + normalize uploaded video for browser compatibility.
    # Converts non-H.264/yuv420p/MP4 files, fixes missing moov atoms,
    # and caps resolution at 1280px long side (keeps original fps so ball
    # tracking frame counts stay valid).
    normalized_path: Optional[Path] = None
    probe_info: Dict[str, Any] = {}
    try:
        probe_info = probe_video(saved_path)
    except RuntimeError:
        probe_info = {}

    if probe_info and is_compatible(probe_info) and max(probe_info.get("width") or 0,
                                                        probe_info.get("height") or 0) <= 1280:
        # Already H.264 + yuv420p + MP4: copy the streams (no quality loss) and move
        # the index to the front for browser playback. Fall back to the original.
        try:
            remux_faststart(saved_path, UPLOAD_DIR / f"fixed_{file_id}.mp4")
            normalized_path = UPLOAD_DIR / f"fixed_{file_id}.mp4"
        except RuntimeError:
            normalized_path = saved_path
    else:
        # Needs normalization — convert to H.264 yuv420p MP4.
        norm_filename = f"fixed_{file_id}.mp4"
        norm_path = UPLOAD_DIR / norm_filename
        try:
            probe_info = normalize_video(saved_path, norm_path)
            normalized_path = norm_path
        except RuntimeError as norm_exc:
            # ffmpeg cannot read or convert this file — return a clear error.
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "video_normalization_failed",
                    "reason": str(norm_exc),
                    "hint": "Upload an H.264-encoded MP4 file (e.g. from a phone or screen recorder).",
                },
            )

    # Use the normalized (or original compatible) file for all downstream processing.
    processing_path = normalized_path if normalized_path else saved_path

    # ── Pose extraction (MediaPipe Tasks API) ─────────────────────────────
    # Every frame keeps its index/timestamp so ball positions and the video
    # stay aligned. Frames where no person is found get an empty landmark
    # list. No synthetic landmarks are ever generated: if pose can't be
    # measured, the shot is returned unrated instead of with a made-up score.
    import cv2

    cap = cv2.VideoCapture(str(processing_path))
    if not cap.isOpened():
        raise HTTPException(
            status_code=422,
            detail={"error": "video_unreadable", "reason": "OpenCV could not open the uploaded video."},
        )
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 480
    max_frames = int(round(fps * MAX_ANALYSIS_SECONDS))

    detector = create_pose_detector()
    if detector is None:
        cap.release()
        raise HTTPException(
            status_code=500,
            detail={"error": "pose_unavailable", "reason": "MediaPipe pose detector could not be loaded on the server."},
        )

    frames_data: List[Dict[str, Any]] = []
    try:
        frame_idx = 0
        while frame_idx < max_frames:
            ok, frame = cap.read()
            if not ok:
                break
            ts = (frame_idx / fps) * 1000.0
            lms = detector.detect(frame, ts)
            landmarks = (
                [{"x": float(l.x), "y": float(l.y), "z": float(l.z),
                  "visibility": float(getattr(l, "visibility", 1.0) or 0.0)} for l in lms]
                if lms else []
            )
            frames_data.append({"frame_index": frame_idx, "timestamp_ms": ts, "landmarks": landmarks})
            frame_idx += 1
    finally:
        cap.release()
        detector.close()

    if not frames_data:
        raise HTTPException(
            status_code=422,
            detail={"error": "no_frames", "reason": "No frames could be read from the video."},
        )

    # Merge ball detections into frames (normalised x/y for the UI and
    # downstream metrics; pixel positions for the pose-overlay drawing).
    ball_positions: List[Optional[Tuple[float, float, float]]] = [None] * len(frames_data)
    try:
        tracking = object_tracker.track_objects_in_sequence(frames_data, video_path=str(processing_path))
        for i, track in enumerate(tracking):
            if i < len(frames_data) and track.get("ball_pos"):
                bx, by = track["ball_pos"]
                conf = float(track.get("conf") or 0.0)
                frames_data[i]["ball_position"] = {"x": float(bx), "y": float(by)}
                ball_positions[i] = (bx * width, by * height, conf)
    except Exception as exc:
        print(f"[analyze-video] ball tracking failed: {exc}")

    pose_frames = [f for f in frames_data if f["landmarks"]]
    if len(pose_frames) >= MIN_POSE_FRAMES:
        req = AnalyzeShotSequenceRequest(
            session_id=session_id,
            camera_angle=camera_angle,
            batter_hand=batter_hand,
            shot_type_hint=None,  # let the classifier decide
            frames=pose_frames,
        )
        result = analyze_shot_sequence(req, db)
    else:
        # Not enough of the batter was visible to score the shot honestly.
        result = ShotAnalysisResponse(
            shot_type="",
            overall_score=None,
            timing_score=None,
            metrics={},
            flaws=[],
            tips=[],
            feedback=[f"Batter's pose found in only {len(pose_frames)} of {len(frames_data)} frames "
                      f"- not enough to score the shot. Keep the whole body in frame."],
        )
    # The UI needs every frame (ball positions, timeline), not just pose frames.
    result.frames = [FrameLandmarks(**f) for f in frames_data]
    result.total_frames = len(frames_data)

    # Generate slow-mo video replay
    try:
        replay_path = replay_generator.annotate_video_clip(
            video_path=str(processing_path),
            frames_analysis=frames_data,
            flaws=[f.model_dump() for f in result.flaws],
            impact_frame=result.impact_frame or 20
        )
        if replay_path:
            result.replay_url = f"/replays/{Path(replay_path).name}"
    except Exception as exc:
        print(f"[analyze-video] slow-mo replay failed: {exc}")

    # OpenPose-style skeleton overlay video (original resolution/FPS, H.264)
    try:
        pose_out = OUTPUT_DIR / f"pose_{file_id}.mp4"
        analyze_pose_overlay(str(processing_path), str(pose_out), ball_positions=ball_positions)
        result.pose_video_url = f"/outputs/{pose_out.name}"
    except Exception:
        pass  # pose overlay is best-effort; analysis result is still returned

    # Cricket-specific shot analysis: HUD-annotated video + JSON report + feedback
    contact_info: Optional[Dict[str, Any]] = None
    try:
        cricket_out = OUTPUT_DIR / f"cricket_{file_id}.mp4"
        report = analyze_cricket_shot(
            str(processing_path), str(cricket_out),
            shot_direction=None, batter_hand=batter_hand,
        )
        result.cricket_video_url = f"/outputs/{cricket_out.name}"
        result.cricket_report_url = f"/outputs/{cricket_out.stem}.json"
        result.feedback = (result.feedback or []) + report.get("feedback", [])
        result.ball_tracking = report.get("ball_tracking")
        contact_info = report.get("ball_contact")
    except Exception:
        pass  # cricket analysis is best-effort; rest of the result is still returned

    # Hawk-Eye-style trajectory from the existing ball detections
    try:
        cal = _parse_calibration(calibration)
        detections = [
            {"f": i, "x": bp[0], "y": bp[1], "conf": bp[2]}
            for i, bp in enumerate(ball_positions) if bp is not None
        ]
        traj = build_trajectory(detections, fps, width, height, calibration=cal,
                                batter_hand=batter_hand, video_id=file_id, contact=contact_info)
        _save_trajectory(file_id, traj)
        result.trajectory_url = f"/outputs/trajectory_{file_id}.json"
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[analyze-video] trajectory failed: {exc}")

    # Add normalized video URL for frontend playback
    result.video_url = f"/uploads/{processing_path.name}"

    return result


# ── Hawk-Eye trajectory ─────────────────────────────────────────────────
_TRAJ_ID = re.compile(r"^[0-9a-f]{8}$")


def _parse_calibration(raw: Optional[Any]) -> Optional[Dict[str, Any]]:
    """Accept a dict or a JSON string; None/empty means uncalibrated."""
    if raw in (None, "", "null"):
        return None
    if isinstance(raw, dict):
        return raw
    try:
        val = json.loads(raw)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail={"error": "bad_calibration", "reason": "calibration must be JSON"})
    return val or None


def _save_trajectory(traj_id: str, traj: Dict[str, Any]) -> Path:
    path = OUTPUT_DIR / f"trajectory_{traj_id}.json"
    path.write_text(json.dumps(traj))
    return path


@app.post("/api/trajectory/{traj_id}")
async def recalibrate_trajectory(traj_id: str, body: Dict[str, Any]):
    """Rebuild a saved trajectory with a pitch calibration.

    Body: {"calibration": {"batterEnd": [[x,y],[x,y]], "bowlerEnd": [[x,y],[x,y]],
           "stumpTop": [x,y]} | null, "batterHand": "right" | "left" (optional)}
    Points are in the analysed video's pixel coordinates. Returns the new JSON.
    """
    if not _TRAJ_ID.match(traj_id):
        raise HTTPException(status_code=400, detail="invalid trajectory id")
    path = OUTPUT_DIR / f"trajectory_{traj_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="trajectory not found")
    hand = body.get("batterHand")
    if hand not in (None, "right", "left"):
        raise HTTPException(status_code=422, detail="batterHand must be 'right' or 'left'")
    traj = rebuild_from_file(path, _parse_calibration(body.get("calibration")), hand)
    _save_trajectory(traj_id, traj)
    return traj


@app.post("/api/detect-ball")
async def detect_ball_in_video(
    file: UploadFile = File(...),
    conf: float = Form(0.15),
    save_annotated: bool = Form(True),
):
    """
    Detect & track the cricket ball across all frames of an uploaded video
    using ByteTrack cross-frame tracking (stable ball ID across frames).

    Returns per-frame ball positions with track IDs, plus an optional
    annotated video saved to /outputs/ and served at /outputs/<name>.
    """
    import cv2

    file_id = uuid.uuid4().hex[:8]
    ext = Path(file.filename or "shot.mp4").suffix or ".mp4"
    saved_filename = f"ball_{file_id}{ext}"
    saved_path = UPLOAD_DIR / saved_filename

    contents = await file.read()
    with open(saved_path, "wb") as f:
        f.write(contents)

    # Run ByteTrack ball tracking
    tracks = ball_tracker.track_balls_in_video(str(saved_path), conf=conf)

    # Build per-frame summary (frames with detections only, for compactness)
    detections = []
    annotated_path = None
    for t in tracks:
        if t.get("ball_pos") is not None:
            detections.append(
                {
                    "frame_index": t["frame_index"],
                    "ball_id": t["ball_id"],
                    "ball_pos": t["ball_pos"],       # normalized [x, y] 0..1
                    "ball_box": t["ball_box"],         # normalized [x1,y1,x2,y2] 0..1
                    "conf": t["conf"],
                    "method": t["method"],
                }
            )

    # Optionally write an annotated output video with boxes + track IDs
    if save_annotated and detections:
        try:
            annotated_filename = f"ball_annotated_{file_id}.mp4"
            annotated_path = OUTPUT_DIR / annotated_filename

            cap = cv2.VideoCapture(str(saved_path))
            fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
            w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            writer = cv2.VideoWriter(str(annotated_path), fourcc, fps, (w, h))

            track_by_frame = {t["frame_index"]: t for t in tracks}
            fi = 0
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                t = track_by_frame.get(fi)
                if t and t.get("ball_box") is not None:
                    x1, y1, x2, y2 = t["ball_box"]
                    x1i, y1i = int(x1 * w), int(y1 * h)
                    x2i, y2i = int(x2 * w), int(y2 * h)
                    cv2.rectangle(frame, (x1i, y1i), (x2i, y2i), (0, 255, 0), 2)
                    label = f"id:{t['ball_id']} {t['conf']:.2f}"
                    (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                    cv2.rectangle(
                        frame,
                        (x1i, y1i - th - 6),
                        (x1i + tw, y1i),
                        (0, 255, 0),
                        -1,
                    )
                    cv2.putText(
                        frame,
                        label,
                        (x1i, y1i - 4),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5,
                        (0, 0, 0),
                        1,
                    )
                    cx, cy = int(((x1 + x2) / 2.0) * w), int(((y1 + y2) / 2.0) * h)
                    cv2.circle(frame, (cx, cy), 4, (0, 0, 255), -1)
                writer.write(frame)
                fi += 1
            cap.release()
            writer.release()
        except Exception:
            annotated_path = None

    return {
        "status": "ok",
        "file_id": file_id,
        "video_name": file.filename or "shot.mp4",
        "frames_processed": len(tracks),
        "ball_detections": detections,
        "annotated_video_url": f"/outputs/{annotated_path.name}" if annotated_path else None,
    }


@app.websocket("/ws/live-stream")
async def websocket_live_stream(websocket: WebSocket):
    """
    WebSocket endpoint for high-FPS client frame landmark streaming.
    Receives JSON frames, sends real-time kinematic velocity & posture alerts.
    """
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            # Respond with instantaneous joint feedback
            await websocket.send_json({
                "status": "tracking",
                "received_frame": data.get("frame_index", 0),
                "server_time_ms": datetime.datetime.utcnow().timestamp() * 1000.0
            })
    except WebSocketDisconnect:
        pass


@app.get("/api/videos/{video_id}")
async def serve_video(video_id: str, range: Optional[str] = None):
    """
    Serve a normalized upload video with HTTP Range support so the browser
    can seek. Looks for the file in backend/uploads/ by exact filename or
    by the <file_id> prefix used in upload_<file_id>.mp4 / fixed_<file_id>.mp4.
    """
    upload_dir = Path(UPLOAD_DIR)

    # Try exact filename first, then prefix match
    candidates: list[Path] = []
    exact = upload_dir / video_id
    if exact.exists():
        candidates.append(exact)
    else:
        for p in upload_dir.iterdir():
            if p.is_file() and p.name.startswith(f"{video_id}_") or p.name.startswith(f"upload_{video_id}") or p.name.startswith(f"fixed_{video_id}"):
                candidates.append(p)

    if not candidates:
        raise HTTPException(status_code=404, detail="Video not found")

    video_path = candidates[0]
    file_size = video_path.stat().st_size

    # Parse Range header
    start = 0
    end = file_size - 1
    if range:
        match = re.match(r"bytes=(\d+)-(\d*)", range)
        if match:
            start = int(match.group(1))
            if match.group(2):
                end = int(match.group(2))
            end = min(end, file_size - 1)

    if start > end or start >= file_size:
        raise HTTPException(status_code=416, detail="Requested range not satisfiable")

    length = end - start + 1

    def iter_file():
        with open(video_path, "rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(65536, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Content-Length": str(length),
        "Content-Type": "video/mp4",
    }
    status = 206 if range else 200
    return StreamingResponse(iter_file(), status=status, headers=headers)
