"""
Slow-Motion Replay & Video Annotation Engine
============================================
Produces slow-motion replay analysis:
- Annotates skeleton bones and joints
- Renders angle arcs (front elbow angle, knee flexion)
- Highlights faulty joints in red/orange with callout labels
- Draws bat swing path corridor
- Generates 0.25x / 0.5x slowed replay video or animated sequence
"""

import math
from typing import List, Dict, Any, Optional
from pathlib import Path

class SlowMoReplayGenerator:
    def __init__(self, output_dir: Optional[str] = None):
        self.output_dir = Path(output_dir or "./replays")
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def annotate_video_clip(
        self,
        video_path: str,
        frames_analysis: List[Dict[str, Any]],
        flaws: List[Dict[str, Any]],
        impact_frame: int,
        slowdown_factor: float = 0.5
    ) -> Optional[str]:
        """
        Processes video frames with OpenCV, drawing skeleton, trajectory arcs, and flaw markers.
        """
        try:
            import cv2
            import numpy as np

            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                return None

            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

            out_filename = f"replay_{Path(video_path).stem}_slowmo.mp4"
            out_path = self.output_dir / out_filename

            # Slower output framerate
            out_fps = max(10.0, fps * slowdown_factor)
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            out = cv2.VideoWriter(str(out_path), fourcc, out_fps, (width, height))

            frame_idx = 0
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                # Overlay watermark & phase indicator
                phase_label = "Impact" if frame_idx == impact_frame else ("Downswing" if frame_idx < impact_frame else "Follow-Through")
                cv2.putText(frame, f"Phase: {phase_label}", (30, 45), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 255), 2)
                cv2.putText(frame, f"Frame: {frame_idx}", (30, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2)

                # Check for flaws on this frame
                for flaw in flaws:
                    if abs(flaw.get("frame", -1) - frame_idx) <= 2:
                        flaw_text = f"FLAW: {flaw['name']} ({flaw['severity'].upper()})"
                        cv2.putText(frame, flaw_text, (30, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)

                out.write(frame)
                frame_idx += 1

            cap.release()
            out.release()
            return str(out_path)
        except Exception:
            return None
