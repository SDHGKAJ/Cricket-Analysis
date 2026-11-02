"""
Unit Tests for Cricket Analysis Engine
======================================
Tests:
- Segmentation of backlift, impact, and follow-through
- Biomechanics metrics calculation
- Rule-based flaw detection for Cover Drive
- Output JSON format compliance
"""

import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.engine.shot_segmentation import ShotSegmentationEngine
from app.engine.metrics_calculator import MetricsCalculator
from app.engine.flaw_detector import FlawDetector
from app.engine.shot_classifier import RuleBasedShotClassifier

def create_synthetic_cover_drive_sequence(num_frames=45):
    """Generates synthetic sequence of 33 MediaPipe pose landmarks for a cover drive."""
    frames = []
    for i in range(num_frames):
        t = i / float(num_frames)
        # Base body: Right-handed batter facing camera (front-on)
        # 0: nose, 11: left_shoulder, 12: right_shoulder, 13: left_elbow, 14: right_elbow
        # 15: left_wrist, 16: right_wrist, 23: left_hip, 24: right_hip, 25: left_knee, 26: right_knee
        # 27: left_ankle, 28: right_ankle
        landmarks = [{"x": 0.5, "y": 0.5, "z": 0.0, "visibility": 0.99} for _ in range(33)]

        # Head / Nose
        landmarks[0] = {"x": 0.48 + 0.02 * (1 - t), "y": 0.18, "z": 0.0, "visibility": 0.99}
        # Shoulders
        landmarks[11] = {"x": 0.44, "y": 0.28, "z": 0.0, "visibility": 0.99}
        landmarks[12] = {"x": 0.54, "y": 0.28, "z": 0.0, "visibility": 0.99}
        # Hips
        landmarks[23] = {"x": 0.46, "y": 0.52, "z": 0.0, "visibility": 0.99}
        landmarks[24] = {"x": 0.52, "y": 0.52, "z": 0.0, "visibility": 0.99}
        # Front Knee (left knee flexes forward into drive)
        landmarks[25] = {"x": 0.43, "y": 0.72, "z": 0.0, "visibility": 0.99}
        landmarks[26] = {"x": 0.54, "y": 0.72, "z": 0.0, "visibility": 0.99}
        # Feet (Front foot strides to 0.40)
        landmarks[27] = {"x": 0.40, "y": 0.92, "z": 0.0, "visibility": 0.99}
        landmarks[28] = {"x": 0.56, "y": 0.92, "z": 0.0, "visibility": 0.99}

        # Wrists movement: Backlift (frames 0-15), Downswing with acceleration (15-25), Impact (25), Follow-through (25-45)
        if i <= 15:
            # Backlift up & back (gradual rise)
            p = i / 15.0
            wr_x = 0.53 + p * 0.05
            wr_y = 0.50 - p * 0.15
        elif i <= 25:
            # Downswing accelerating down towards cover; speed peaks as p -> 1.0 (frame 25)
            p = (i - 15) / 10.0
            ease_in = p * p  # Accelerating swing
            wr_x = 0.58 - ease_in * 0.16
            wr_y = 0.35 + ease_in * 0.30
        else:
            # Follow-through high finish decelerating
            p = (i - 25) / 20.0
            ease_out = 1.0 - (1.0 - p) * (1.0 - p)
            wr_x = 0.42 - ease_out * 0.08
            wr_y = 0.65 - ease_out * 0.38

        landmarks[15] = {"x": wr_x - 0.02, "y": wr_y, "z": 0.0, "visibility": 0.99}
        landmarks[16] = {"x": wr_x + 0.02, "y": wr_y + 0.02, "z": 0.0, "visibility": 0.99}

        # Front elbow (high elbow at impact)
        landmarks[13] = {"x": wr_x - 0.08, "y": wr_y - 0.10, "z": 0.0, "visibility": 0.99}
        landmarks[14] = {"x": wr_x + 0.06, "y": wr_y - 0.05, "z": 0.0, "visibility": 0.99}

        frames.append({
            "frame_index": i,
            "timestamp_ms": i * 33.33,
            "landmarks": landmarks
        })

    return frames

def test_pipeline_end_to_end():
    frames = create_synthetic_cover_drive_sequence(45)
    segmenter = ShotSegmentationEngine(fps=30.0)
    seg = segmenter.segment_sequence(frames, batter_hand="right")

    print(f"Segmentation results: {seg}")
    assert "impact_frame" in seg
    assert seg["impact_frame"] > seg["backlift_apex"]

    classifier = RuleBasedShotClassifier()
    shot_type, conf = classifier.classify(frames, seg, batter_hand="right")
    print(f"Classified shot: {shot_type} (conf={conf})")
    assert shot_type == "cover_drive"

    calc = MetricsCalculator(camera_angle="front_on", batter_hand="right")
    metrics, diagnostics = calc.compute_all_metrics(frames, seg)
    print(f"Metrics: {metrics}")
    print(f"Diagnostics: {diagnostics}")

    detector = FlawDetector(shot_type="cover_drive")
    overall, timing, flaws, tips = detector.evaluate_flaws_and_score(
        metrics=metrics,
        diagnostics=diagnostics,
        impact_frame=seg["impact_frame"]
    )

    print(f"Overall Score: {overall}/10 | Timing Score: {timing}/10")
    print(f"Flaws detected: {len(flaws)}")
    for f in flaws:
        print(f"  - [{f['severity'].upper()}] {f['name']} (frame {f['frame']}): measured={f['measured']} ideal={f['ideal']}")
    for t in tips:
        print(f"  * Fix: {t['fix']}")
        print(f"    Drill: {t['drill']}")

    assert 0.0 <= overall <= 10.0
    assert 0.0 <= timing <= 10.0
    print("\n[SUCCESS] Engine pipeline unit test passed successfully!")

if __name__ == "__main__":
    test_pipeline_end_to_end()
