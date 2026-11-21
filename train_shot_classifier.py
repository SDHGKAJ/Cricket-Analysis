"""
Cricket shot-type classifier — training pipeline (v2)
=====================================================
Trains the ONNX model used by backend/app/engine/shot_classifier.py on the
rokmr/cricket-shot video dataset.

Why v2: the v1 model answered "pull_shot" for every input (12.9% test
accuracy, 7 classes). Its pose cache was mostly placeholder frames, was keyed
by file name only (250 names exist in more than one split), and inference fed
the first 45 frames while training sampled whole clips.

  Phase 1  extract   MediaPipe pose for every frame of every clip, cached per
                     split/class/clip in backend/shot_features_v2/*.npz
  Phase 2  train     features from app.engine.shot_features (the SAME code the
                     API uses), 1D-CNN + BiGRU, class-weighted loss,
                     augmentation; best epoch by val accuracy; test report

Outputs
  backend/cricket_shot_classifier.onnx       input "x" (1, 45, 132) -> "logits" (1, 7)
  backend/cricket_shot_classifier.json       classes, feature version, test metrics

Usage (repo root)
  python train_shot_classifier.py                       # extract (cached) + train
  python train_shot_classifier.py --workers 3 --epochs 120
  CRICKET_DATASET_DIR=D:/path/to/cricketshot python train_shot_classifier.py
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from multiprocessing import Pool
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "backend"))
from app.engine.shot_features import (  # noqa: E402
    FEATURE_VERSION, N_FEATURES, SEQ_LEN, select_window, sequence_features,
)

DATASET_ROOT = Path(os.getenv("CRICKET_DATASET_DIR", r"D:\CricketEnv\datasets\cricket-shot\cricketshot"))
CACHE_DIR = ROOT / "backend" / "shot_features_v2"
OUT_ONNX = ROOT / "backend" / "cricket_shot_classifier.onnx"
OUT_META = ROOT / "backend" / "cricket_shot_classifier.json"

# dataset folder -> output class (hook / late_cut / lofted are not modelled)
CLASS_MAP = {
    "cover": "cover_drive", "defense": "forward_defense", "flick": "flick_shot",
    "pull": "pull_shot", "square_cut": "cut_shot", "straight": "straight_drive", "sweep": "sweep_shot",
}
CLASSES = sorted(set(CLASS_MAP.values()))
CLASS_IDX = {c: i for i, c in enumerate(CLASSES)}


# ═══════════════════════════════════════════════════════════════ Phase 1 ═══
def list_clips(split: str):
    out = []
    for folder, cls in CLASS_MAP.items():
        d = DATASET_ROOT / split / folder
        if d.is_dir():
            for f in sorted(d.iterdir()):
                if f.suffix.lower() in (".avi", ".mp4", ".mov") and not f.name.startswith("._"):
                    out.append((split, folder, f))
    return out


def cache_path(split: str, folder: str, video: Path) -> Path:
    return CACHE_DIR / split / folder / f"{video.stem}.npz"


def extract_clip(job) -> str:
    """Pose for every frame of one clip -> npz(t_ms, pts[T,33,3], has[T])."""
    split, folder, video = job
    out = cache_path(split, folder, video)
    if out.exists():
        return "cached"
    import cv2
    from app.engine.pose_overlay import create_pose_detector

    # fresh tracker per clip; 0.3 confidence finds the (small) broadcast batter in
    # ~69% of frames vs ~53% at the API's 0.5 default (sampled on 14 clips)
    det = create_pose_detector(min_conf=0.3)
    if det is None:
        return "no-detector"
    cap = cv2.VideoCapture(str(video))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    t, pts, has = [], [], []
    i = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        ts = i * 1000.0 / fps
        lms = det.detect(frame, ts)
        p = np.zeros((33, 3), np.float32)
        if lms is not None and len(lms) >= 33:
            p[:] = [(l.x, l.y, getattr(l, "visibility", 1.0) or 0.0) for l in list(lms)[:33]]
        t.append(ts); pts.append(p); has.append(lms is not None)
        i += 1
    cap.release()
    det.close()
    out.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(out, t=np.array(t), pts=np.array(pts, np.float32), has=np.array(has, bool))
    return "ok" if i else "empty"


def extract_all(workers: int) -> None:
    jobs = [j for s in ("train", "val", "test") for j in list_clips(s)]
    todo = [j for j in jobs if not cache_path(*j).exists()]
    print(f"Clips: {len(jobs)} | already cached: {len(jobs) - len(todo)} | to extract: {len(todo)}", flush=True)
    if not todo:
        return
    done = Counter()
    with Pool(workers) as pool:
        for k, r in enumerate(pool.imap_unordered(extract_clip, todo, chunksize=4), 1):
            done[r] += 1
            if k % 50 == 0 or k == len(todo):
                print(f"  extracted {k}/{len(todo)} {dict(done)}", flush=True)


# ═══════════════════════════════════════════════════════════════ Phase 2 ═══
def load_split(split: str):
    """Raw arrays per clip (features are built later so training can augment)."""
    items, skipped = [], 0
    for _, folder, video in list_clips(split):
        p = cache_path(split, folder, video)
        if not p.exists():
            skipped += 1
            continue
        z = np.load(p)
        items.append((z["t"], z["pts"], z["has"], CLASS_IDX[CLASS_MAP[folder]]))
    return items, skipped


def augment(t, pts, has, rng):
    """Random time crop (85-100%), scale/rotation jitter and landmark noise."""
    n = len(t)
    keep = max(8, int(n * rng.uniform(0.85, 1.0)))
    s = rng.integers(0, n - keep + 1)
    t, pts, has = t[s:s + keep], pts[s:s + keep].copy(), has[s:s + keep]
    ang = np.deg2rad(rng.uniform(-8, 8))
    rot = np.array([[np.cos(ang), -np.sin(ang)], [np.sin(ang), np.cos(ang)]], np.float32)
    c = np.array([0.5, 0.5], np.float32)
    pts[:, :, :2] = (pts[:, :, :2] - c) @ rot.T * rng.uniform(0.9, 1.1) + c
    pts[:, :, :2] += rng.normal(0, 0.003, pts[:, :, :2].shape).astype(np.float32)
    return t, pts, has


def featurise(items, rng=None):
    X, y = [], []
    for t, pts, has, label in items:
        if rng is not None:
            t, pts, has = augment(t, pts, has, rng)
        f = sequence_features(t, pts, has, window=select_window(t, pts, has))
        if f is not None:
            X.append(f); y.append(label)
    return np.array(X, np.float32), np.array(y, np.int64)


def build_model():
    import torch.nn as nn

    class ShotNet(nn.Module):
        """Temporal convs for local motion, BiGRU for order, mean+max pooling."""

        def __init__(self, n_in=N_FEATURES, n_cls=len(CLASSES)):
            super().__init__()
            self.conv = nn.Sequential(
                nn.Conv1d(n_in, 128, 5, padding=2), nn.BatchNorm1d(128), nn.ReLU(), nn.Dropout(0.2),
                nn.Conv1d(128, 128, 5, padding=2), nn.BatchNorm1d(128), nn.ReLU(), nn.Dropout(0.2),
            )
            self.gru = nn.GRU(128, 96, batch_first=True, bidirectional=True)
            self.head = nn.Sequential(nn.Dropout(0.3), nn.Linear(96 * 4, n_cls))

        def forward(self, x):                      # x: (B, T, F)
            import torch
            h = self.conv(x.transpose(1, 2)).transpose(1, 2)
            h, _ = self.gru(h)
            return self.head(torch.cat([h.mean(1), h.amax(1)], dim=1))

    return ShotNet()


def train(epochs: int, seed: int = 0) -> None:
    import torch
    import torch.nn as nn
    from sklearn.metrics import classification_report, confusion_matrix

    rng = np.random.default_rng(seed)
    torch.manual_seed(seed)
    dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"\nPyTorch {torch.__version__} on {dev}")

    tr_items, tr_skip = load_split("train")
    va_items, _ = load_split("val")
    te_items, _ = load_split("test")
    X_va, y_va = featurise(va_items)
    X_te, y_te = featurise(te_items)
    print(f"Clips with usable pose: train {len(tr_items)} (uncached {tr_skip}) | "
          f"val {len(X_va)}/{len(va_items)} | test {len(X_te)}/{len(te_items)}")

    counts = Counter(lbl for *_, lbl in tr_items)
    print("Train classes:", {CLASSES[k]: v for k, v in sorted(counts.items())})
    w = torch.tensor([len(tr_items) / (len(CLASSES) * max(counts[i], 1)) for i in range(len(CLASSES))],
                     dtype=torch.float32, device=dev)

    model = build_model().to(dev)
    opt = torch.optim.AdamW(model.parameters(), lr=2e-3, weight_decay=1e-3)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=2e-3, total_steps=epochs)
    loss_fn = nn.CrossEntropyLoss(weight=w, label_smoothing=0.05)
    Xv, yv = torch.from_numpy(X_va).to(dev), torch.from_numpy(y_va).to(dev)

    best, best_state, patience = -1.0, None, 0
    for ep in range(1, epochs + 1):
        X_tr, y_tr = featurise(tr_items, rng)          # fresh augmentation each epoch
        perm = rng.permutation(len(X_tr))
        model.train()
        tot = 0.0
        for i in range(0, len(perm), 32):
            b = perm[i:i + 32]
            xb, yb = torch.from_numpy(X_tr[b]).to(dev), torch.from_numpy(y_tr[b]).to(dev)
            opt.zero_grad()
            loss = loss_fn(model(xb), yb)
            loss.backward()
            opt.step()
            tot += loss.item() * len(b)
        sched.step()
        model.eval()
        with torch.no_grad():
            va = (model(Xv).argmax(1) == yv).float().mean().item()
        if va > best:
            best, patience = va, 0
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
        else:
            patience += 1
        if ep % 5 == 0 or ep == 1:
            print(f"epoch {ep:3d}  loss {tot / len(perm):.3f}  val_acc {va:.3f}  best {best:.3f}", flush=True)
        if patience >= 30:
            print(f"early stop at epoch {ep}")
            break

    model.load_state_dict(best_state)
    model.eval()
    with torch.no_grad():
        pred = model(torch.from_numpy(X_te).to(dev)).argmax(1).cpu().numpy()
    test_acc = float((pred == y_te).mean())
    print(f"\nBest val accuracy {best:.3f} | TEST accuracy {test_acc:.3f}  (chance = {1 / len(CLASSES):.3f})")
    report = classification_report(y_te, pred, labels=list(range(len(CLASSES))), target_names=CLASSES,
                                   zero_division=0, output_dict=True)
    print(classification_report(y_te, pred, labels=list(range(len(CLASSES))), target_names=CLASSES, zero_division=0))
    print("Confusion matrix (rows = truth):\n", confusion_matrix(y_te, pred, labels=list(range(len(CLASSES)))))

    # ── export ────────────────────────────────────────────────────────────
    model = model.cpu()
    dummy = torch.zeros(1, SEQ_LEN, N_FEATURES)
    if OUT_ONNX.exists():
        OUT_ONNX.replace(OUT_ONNX.with_suffix(".onnx.v1.bak"))
    torch.onnx.export(model, dummy, str(OUT_ONNX), input_names=["x"], output_names=["logits"],
                      dynamic_axes={"x": {0: "batch"}, "logits": {0: "batch"}},
                      opset_version=17, dynamo=False)
    OUT_META.write_text(json.dumps({
        "feature_version": FEATURE_VERSION, "seq_len": SEQ_LEN, "n_features": N_FEATURES,
        "classes": CLASSES, "val_accuracy": round(best, 4), "test_accuracy": round(test_acc, 4),
        "per_class_recall": {c: round(report[c]["recall"], 3) for c in CLASSES},
        "test_clips": int(len(y_te)), "dataset": "rokmr/cricket-shot (broadcast footage)",
    }, indent=2))
    import onnxruntime as ort
    s = ort.InferenceSession(str(OUT_ONNX), providers=["CPUExecutionProvider"])
    ref = model(torch.from_numpy(X_te[:4])).detach().numpy()
    got = s.run(None, {"x": X_te[:4]})[0]
    print(f"\nONNX saved to {OUT_ONNX} (max diff vs torch {np.abs(ref - got).max():.2e}); metadata {OUT_META}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--workers", type=int, default=3, help="pose-extraction processes (RAM ~0.6 GB each)")
    ap.add_argument("--epochs", type=int, default=120)
    ap.add_argument("--extract-only", action="store_true")
    args = ap.parse_args()
    if not DATASET_ROOT.exists():
        sys.exit(f"Dataset not found: {DATASET_ROOT} (set CRICKET_DATASET_DIR)")
    extract_all(args.workers)
    if not args.extract_only:
        train(args.epochs)


if __name__ == "__main__":   # required on Windows for multiprocessing
    main()
