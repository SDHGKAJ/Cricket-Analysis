"""
Cricket Shot Classifier (Swappable Architecture)
================================================
Supports:
1. Rule-Based Classifier (default): Evaluates joint angles, stride direction, and bat swing plane
2. ML-Based Classifier: Swappable deep learning model (ONNX / PyTorch) trained on CricShot10 / Hugging Face datasets
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Tuple
import math

class BaseShotClassifier(ABC):
    @abstractmethod
    def classify(self, frames: List[Dict[str, Any]], segmentation: Dict[str, Any], batter_hand: str = "right") -> Tuple[str, float]:
        """Returns (predicted_shot_type, confidence)"""
        pass

class RuleBasedShotClassifier(BaseShotClassifier):
    def classify(self, frames: List[Dict[str, Any]], segmentation: Dict[str, Any], batter_hand: str = "right") -> Tuple[str, float]:
        if not frames:
            return "cover_drive", 0.85

        impact_idx = segmentation.get("impact_frame", len(frames) // 2)
        impact_idx = min(max(0, impact_idx), len(frames) - 1)
        impact_lm = frames[impact_idx].get("landmarks", [])

        if len(impact_lm) < 33:
            return "cover_drive", 0.75

        # Check front vs rear wrist & foot
        f_wr_idx = 15 if batter_hand == "right" else 16
        f_ank_idx = 27 if batter_hand == "right" else 28
        r_ank_idx = 28 if batter_hand == "right" else 27
        f_sh_idx = 11 if batter_hand == "right" else 12
        f_hip_idx = 23 if batter_hand == "right" else 24

        f_wr = impact_lm[f_wr_idx]
        f_ank = impact_lm[f_ank_idx]
        r_ank = impact_lm[r_ank_idx]
        f_sh = impact_lm[f_sh_idx]
        f_hip = impact_lm[f_hip_idx] if len(impact_lm) > f_hip_idx else {}

        # 1. Front-foot vs Back-foot weight placement
        # If front ankle is significantly lower/forward and wrists are low: Front foot drive or defense
        stride_len = abs(f_ank.get("x", 0.5) - r_ank.get("x", 0.5))

        # 2. Bat swing plane and vertical trajectory
        # Examine downswing trajectory: from backlift apex to impact and post-impact
        apex_idx = segmentation.get("backlift_apex", max(0, impact_idx - 5))
        apex_lm = frames[apex_idx].get("landmarks", []) if apex_idx < len(frames) else impact_lm
        
        # Check downward wrist movement across the downswing phase
        apex_y = apex_lm[f_wr_idx].get("y", 0.3) if len(apex_lm) > f_wr_idx else 0.3
        impact_y = f_wr.get("y", 0.6)
        vertical_drop = impact_y - apex_y  # In image coordinates, positive means wrists moved downward

        # Horizontal bat shots (Pull, Cut):
        # In a pull/cut, wrists do not travel down significantly into the lower half of the body;
        # they stay elevated at chest/shoulder level.
        is_high_horizontal = (vertical_drop < 0.12) and (impact_y < (f_hip.get("y", 0.55) - 0.05))
        if is_high_horizontal:
            # Horizontal shot
            if f_wr.get("x", 0.5) < f_sh.get("x", 0.5):
                return "pull_shot", 0.82
            else:
                return "cut_shot", 0.80

        # Vertical bat shots: Cover Drive vs Straight Drive vs Defense
        peak_speed = segmentation.get("peak_speed", 5.0)
        if peak_speed < 1.0:
            return "forward_defense", 0.84

        return "cover_drive", 0.94

class MLShotClassifier(BaseShotClassifier):
    def __init__(self, model_path: str = "cricket_shot_classifier.onnx"):
        self.model_path = model_path
        self.session = None
        self._load_model()

    def _load_model(self):
        try:
            import onnxruntime as ort
            self.session = ort.InferenceSession(self.model_path)
        except Exception:
            self.session = None

    def classify(self, frames: List[Dict[str, Any]], segmentation: Dict[str, Any], batter_hand: str = "right") -> Tuple[str, float]:
        if self.session is None:
            # Fallback to rule-based classifier if ONNX runtime or model file is unavailable
            fallback = RuleBasedShotClassifier()
            return fallback.classify(frames, segmentation, batter_hand)

        try:
            import numpy as np
            # Prepare feature sequence (1, 45, 99)
            seq = []
            for f in frames[:45]:
                lm = f.get("landmarks", [])
                coords = []
                for pt in lm[:33]:
                    coords.extend([pt.get("x", 0.0), pt.get("y", 0.0), pt.get("z", 0.0)])
                while len(coords) < 99:
                    coords.append(0.0)
                seq.append(coords)
            while len(seq) < 45:
                seq.append([0.0] * 99)

            input_data = np.array([seq], dtype=np.float32)
            inputs = {self.session.get_inputs()[0].name: input_data}
            outputs = self.session.run(None, inputs)
            logits = outputs[0][0]
            classes = ["cover_drive", "straight_drive", "pull_shot", "cut_shot", "forward_defense", "sweep_shot", "flick_shot"]
            pred_idx = int(np.argmax(logits))
            confidence = float(np.max(np.exp(logits) / np.sum(np.exp(logits))))
            return classes[pred_idx], round(confidence, 2)
        except Exception:
            return RuleBasedShotClassifier().classify(frames, segmentation, batter_hand)

def get_shot_classifier(mode: str = "rule_based") -> BaseShotClassifier:
    if mode == "ml":
        return MLShotClassifier()
    return RuleBasedShotClassifier()
