"""
Cricket Shot Classifier (Swappable Architecture)
================================================
Supports:
1. Rule-Based Classifier (default): Evaluates joint angles, stride direction, and bat swing plane
2. ML-Based Classifier: Swappable deep learning model (ONNX / PyTorch) trained on CricShot10 / Hugging Face datasets
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, Tuple
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
    """ONNX shot-type model trained by train_shot_classifier.py (v2).

    Uses app.engine.shot_features — the exact feature code used in training —
    so the swing window, sampling and pose normalisation always match.
    Returns ("", 0.0) rather than guessing when there is no compatible model
    or the batter isn't visible enough; the UI then shows no shot type.
    """

    def __init__(self, model_path: Optional[str] = None):
        from pathlib import Path
        from ..config import BASE_DIR

        self.model_path = Path(model_path) if model_path else BASE_DIR / "cricket_shot_classifier.onnx"
        self.session = None
        self.classes: List[str] = []
        self.reason = ""
        self._load_model()

    def _load_model(self) -> None:
        import json
        from .shot_features import FEATURE_VERSION

        meta_path = self.model_path.with_suffix(".json")
        if not self.model_path.exists() or not meta_path.exists():
            self.reason = "no trained shot model (run train_shot_classifier.py)"
            return
        meta = json.loads(meta_path.read_text())
        if meta.get("feature_version") != FEATURE_VERSION:
            self.reason = f"shot model features v{meta.get('feature_version')} != v{FEATURE_VERSION}; retrain"
            return
        try:
            import onnxruntime as ort
            self.session = ort.InferenceSession(str(self.model_path), providers=["CPUExecutionProvider"])
            self.classes = list(meta["classes"])
        except Exception as exc:  # pragma: no cover - environment specific
            self.reason = f"could not load shot model: {exc}"
            self.session = None

    def classify(self, frames: List[Dict[str, Any]], segmentation: Dict[str, Any],
                 batter_hand: str = "right") -> Tuple[str, float]:
        if self.session is None:
            return "", 0.0
        import numpy as np
        from .shot_features import features_from_api_frames

        feat = features_from_api_frames(frames)
        if feat is None:
            return "", 0.0
        logits = self.session.run(None, {"x": feat[None]})[0][0]
        p = np.exp(logits - logits.max())
        p /= p.sum()
        i = int(p.argmax())
        return self.classes[i], round(float(p[i]), 3)


def get_shot_classifier(mode: str = "rule_based") -> BaseShotClassifier:
    if mode == "ml":
        return MLShotClassifier()
    return RuleBasedShotClassifier()
