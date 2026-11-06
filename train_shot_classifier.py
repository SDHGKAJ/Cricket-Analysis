"""
Cricket Shot Classifier Training Pipeline
=========================================
Trains an ONNX shot classifier from the rokmr/cricket-shot video dataset.

Input:  D:/CricketEnv/datasets/cricket-shot/cricketshot/{train,val,test}/{class}/*.avi
Output: backend/cricket_shot_classifier.onnx  (drop-in for MLShotClassifier)

Model input shape: (1, 45, 99)  ->  45 frames x 33 landmarks x (x, y, z)
Shot classes (7): cover_drive, forward_defense, flick_shot, pull_shot,
                  cut_shot, straight_drive, sweep_shot

Features are cached to backend/shot_features/{split}/{class}/{video}.npy
so pose extraction only happens once.

Usage:
  # Quick validation run (small subset):
  D:/CricketEnv/Scripts/python.exe train_shot_classifier.py --subset 20

  # Full training (all videos, cached after first run):
  D:/CricketEnv/Scripts/python.exe train_shot_classifier.py

  # Re-train with cached features (fast):
  D:/CricketEnv/Scripts/python.exe train_shot_classifier.py --use-cache
"""

import os
import sys
import cv2
import math
import json
import argparse
import numpy as np
from pathlib import Path
from collections import Counter

# ---------------------------------------------------------------- config ---
DATASET_ROOT = Path(os.getenv("CRICKET_DATASET_DIR", r"D:\CricketEnv\datasets\cricket-shot\cricketshot"))
OUTPUT_ONNX  = Path("backend/cricket_shot_classifier.onnx")
FEATURE_DIR  = Path("backend/shot_features")
SEQ_LEN      = 45        # frames per sequence (matches MLShotClassifier)
LANDMARKS    = 33        # MediaPipe Pose landmarks
FEATURES     = LANDMARKS * 3  # x, y, z per landmark = 99

CLASS_MAP = {
    "cover":      "cover_drive",
    "defense":    "forward_defense",
    "flick":      "flick_shot",
    "pull":       "pull_shot",
    "square_cut": "cut_shot",
    "straight":   "straight_drive",
    "sweep":      "sweep_shot",
}
SKIP_CLASSES = {"hook", "late_cut", "lofted"}
OUTPUT_CLASSES = sorted(set(CLASS_MAP.values()))
CLASS_TO_IDX   = {c: i for i, c in enumerate(OUTPUT_CLASSES)}
IDX_TO_CLASS   = {i: c for c, i in CLASS_TO_IDX.items()}

print("Output classes:", OUTPUT_CLASSES)

# ---------------------------------------------------------------- pose ---
# MediaPipe Tasks API (PoseLandmarker) — mp.solutions.pose was removed in >=0.9.x
POSE_MODEL_PATH = os.getenv("POSE_MODEL_PATH", r"D:\CricketEnv\models\pose_landmarker_heavy.task")
try:
    from mediapipe.tasks import python as mp_tasks
    from mediapipe.tasks.python import vision
    from mediapipe import Image as mpImage, ImageFormat
    _base_options = mp_tasks.BaseOptions(model_asset_path=POSE_MODEL_PATH)
    _options = vision.PoseLandmarkerOptions(
        base_options=_base_options,
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
    )
    _landmarker = vision.PoseLandmarker.create_from_options(_options)
    print("MediaPipe Tasks PoseLandmarker loaded")
except Exception as e:
    print("MediaPipe Tasks not available:", e)
    _landmarker = None


def extract_landmarks(frame_bgr):
    """Return 99 floats (33 landmarks x xyz) or zeros if no pose detected."""
    if _landmarker is None:
        return [0.5, 0.5, 0.0] * LANDMARKS
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    mp_image = mpImage(image_format=ImageFormat.SRGB, data=rgb)
    # Use a monotonically increasing timestamp for VIDEO mode
    extract_landmarks._ts += 1
    res = _landmarker.detect_for_video(mp_image, extract_landmarks._ts)
    if not res.pose_landmarks or len(res.pose_landmarks[0]) < LANDMARKS:
        return [0.5, 0.5, 0.0] * LANDMARKS
    flat = []
    for lm in res.pose_landmarks[0][:LANDMARKS]:
        flat.extend([lm.x, lm.y, lm.z])
    return flat  # length 99


extract_landmarks._ts = 0


def video_to_sequence(video_path, seq_len=SEQ_LEN, use_cache=True):
    """
    Extract pose landmarks from a video and return (seq_len, 99) float32.
    Caches to .npy under FEATURE_DIR.
    """
    cache_path = FEATURE_DIR / f"{Path(video_path).stem}.npy"
    if use_cache and cache_path.exists():
        return np.load(cache_path)

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return None
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()
    if total <= 0:
        return None

    indices = np.linspace(0, total - 1, seq_len).astype(int)

    cap = cv2.VideoCapture(str(video_path))
    seq = []
    for idx in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
        ret, frame = cap.read()
        if not ret or frame is None:
            flat = [0.5, 0.5, 0.0] * LANDMARKS
        else:
            flat = extract_landmarks(frame)
        while len(flat) < FEATURES:
            flat.append(0.0)
        seq.append(flat[:FEATURES])
    cap.release()

    arr = np.array(seq, dtype=np.float32)  # (seq_len, 99)
    if use_cache:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        np.save(cache_path, arr)
    return arr


# ------------------------------------------------------------ data loading ---
def collect_items(split, max_per_class=None):
    """Return list of (video_path, target_idx, class_name)."""
    split_dir = DATASET_ROOT / split
    items = []
    if not split_dir.exists():
        return items
    for cls_name in sorted(os.listdir(split_dir)):
        if cls_name in SKIP_CLASSES:
            continue
        if cls_name not in CLASS_MAP:
            continue
        cls_dir = split_dir / cls_name
        if not cls_dir.is_dir():
            continue
        target = CLASS_MAP[cls_name]
        target_idx = CLASS_TO_IDX[target]
        vids = sorted([f for f in os.listdir(cls_dir)
                       if not f.startswith("._")
                       and f.lower().endswith((".avi", ".mp4", ".mov", ".webm"))])
        if max_per_class:
            vids = vids[:max_per_class]
        for vid_name in vids:
            items.append((str(cls_dir / vid_name), target_idx, target))
    return items


def build_dataset(split, max_per_class=None, use_cache=True):
    items = collect_items(split, max_per_class)
    X, y, names, paths = [], [], [], []
    for i, (vid_path, target_idx, class_name) in enumerate(items):
        seq = video_to_sequence(vid_path, use_cache=use_cache)
        if seq is None:
            print(f"  [skip] {vid_path}")
            continue
        X.append(seq)
        y.append(target_idx)
        names.append(class_name)
        paths.append(vid_path)
        if (i + 1) % 50 == 0:
            print(f"  processed {i+1}/{len(items)} videos in {split}")
    return np.array(X), np.array(y), names, paths


# ---------------------------------------------------------------- model ---
import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader

print(f"\nPyTorch {torch.__version__}, CUDA: {torch.cuda.is_available()}")
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


class ShotClassifierNet(nn.Module):
    def __init__(self, input_size=FEATURES, hidden_size=128, num_layers=2,
                 num_classes=len(OUTPUT_CLASSES), dropout=0.3):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=input_size, hidden_size=hidden_size,
            num_layers=num_layers, batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
            bidirectional=True,
        )
        self.dropout = nn.Dropout(dropout)
        self.fc = nn.Linear(hidden_size * 2, num_classes)

    def forward(self, x):
        out, _ = self.lstm(x)
        out = out[:, -1, :]
        out = self.dropout(out)
        return self.fc(out)


# ---------------------------------------------------------------- main ---
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--subset", type=int, default=None,
                        help="max videos per class for quick validation")
    parser.add_argument("--use-cache", action="store_true", default=True,
                        help="use cached .npy features")
    parser.add_argument("--no-cache", action="store_true",
                        help="force re-extraction (ignore cache)")
    parser.add_argument("--epochs", type=int, default=30)
    args = parser.parse_args()

    use_cache = args.use_cache and not args.no_cache
    FEATURE_DIR.mkdir(parents=True, exist_ok=True)

    print(f"\nLoading data (subset={args.subset}, cache={use_cache})...")
    X_train, y_train, _, train_paths = build_dataset("train", args.subset, use_cache)
    X_val, y_val, _, val_paths = build_dataset("val", args.subset, use_cache)
    X_test, y_test, _, test_paths = build_dataset("test", args.subset, use_cache)

    print(f"\nTrain: {X_train.shape}, Val: {X_val.shape}, Test: {X_test.shape}")
    print("Train class dist:", Counter(IDX_TO_CLASS[int(c)] for c in y_train))

    X_train_t = torch.from_numpy(X_train).to(DEVICE)
    y_train_t = torch.from_numpy(y_train).long().to(DEVICE)
    X_val_t = torch.from_numpy(X_val).to(DEVICE)
    y_val_t = torch.from_numpy(y_val).long().to(DEVICE)
    X_test_t = torch.from_numpy(X_test).to(DEVICE)
    y_test_t = torch.from_numpy(y_test).long().to(DEVICE)

    train_dl = DataLoader(TensorDataset(X_train_t, y_train_t),
                          batch_size=32, shuffle=True)

    model = ShotClassifierNet().to(DEVICE)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-4)

    best_val_acc = 0.0
    print(f"\nTraining for {args.epochs} epochs...")
    for epoch in range(1, args.epochs + 1):
        model.train()
        train_loss, train_correct, train_total = 0.0, 0, 0
        for xb, yb in train_dl:
            optimizer.zero_grad()
            logits = model(xb)
            loss = criterion(logits, yb)
            loss.backward()
            optimizer.step()
            train_loss += loss.item() * xb.size(0)
            train_correct += (logits.argmax(1) == yb).sum().item()
            train_total += yb.size(0)

        model.eval()
        with torch.no_grad():
            val_logits = model(X_val_t)
            val_loss = criterion(val_logits, y_val_t).item()
            val_acc = (val_logits.argmax(1) == y_val_t).sum().item() / y_val_t.size(0)

        train_acc = train_correct / train_total
        print(f"Epoch {epoch:02d}: train_loss={train_loss/train_total:.4f} "
              f"train_acc={train_acc:.4f} val_loss={val_loss:.4f} val_acc={val_acc:.4f}")

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save(model.state_dict(), "best_shot_classifier.pt")

    print(f"\nBest val accuracy: {best_val_acc:.4f}")

    model.load_state_dict(torch.load("best_shot_classifier.pt"))
    model.eval()
    with torch.no_grad():
        test_logits = model(X_test_t)
        test_acc = (test_logits.argmax(1) == y_test_t).sum().item() / y_test_t.size(0)
        print(f"Test accuracy: {test_acc:.4f}")

    from sklearn.metrics import classification_report
    print("\nClassification report:")
    print(classification_report(
        y_test_t.cpu().numpy(),
        test_logits.argmax(1).cpu().numpy(),
        target_names=OUTPUT_CLASSES,
        zero_division=0,
    ))

    # Export ONNX
    model.eval()
    dummy = torch.randn(1, SEQ_LEN, FEATURES).to(DEVICE)
    try:
        torch.onnx.export(
            model, dummy, str(OUTPUT_ONNX),
            export_params=True, opset_version=13, do_constant_folding=True,
            input_names=["input"], output_names=["logits"],
            dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
            dynamo=False,  # use legacy TorchScript exporter (no onnxscript needed)
        )
    except TypeError:
        # Older torch without dynamo param
        torch.onnx.export(
            model, dummy, str(OUTPUT_ONNX),
            export_params=True, opset_version=13, do_constant_folding=True,
            input_names=["input"], output_names=["logits"],
            dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
        )
    print(f"\nONNX exported: {OUTPUT_ONNX.resolve()}")

    import onnxruntime as ort
    session = ort.InferenceSession(str(OUTPUT_ONNX))
    out = session.run(None, {"input": dummy.cpu().numpy()})
    print("ONNX verification OK, output shape:", out[0].shape)
    print("\nDONE — backend/cricket_shot_classifier.onnx is ready for MLShotClassifier")


if __name__ == "__main__":
    main()
