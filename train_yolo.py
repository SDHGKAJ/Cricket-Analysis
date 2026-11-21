"""Train YOLOv8n cricket-ball detector on RTX 3050 (6GB VRAM).

Dataset: three public CC BY 4.0 Roboflow Universe datasets merged into one
single-class YOLO dataset (see backend/datasets/roboflow_loader.py).

Usage (from repo root, with ROBOFLOW_API_KEY set):
    python train_yolo.py                 # download/merge if needed, then train
    python train_yolo.py --epochs 100 --imgsz 640 --batch 16

Outputs:
    backend/models/cricket_ball.pt   (picked up first by CricketBallTracker)
    backend/cricket_yolo.onnx        (used by CricketObjectTracker)
"""
import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "backend" / "datasets"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=80)
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--name", default="cricket_ball_v3")
    args = ap.parse_args()

    import torch
    from ultralytics import YOLO
    from roboflow_loader import RoboflowCricketLoader

    print(f"PyTorch {torch.__version__} | CUDA: {torch.cuda.is_available()}")
    if not torch.cuda.is_available():
        sys.exit("CUDA not available - install the CUDA build of PyTorch before training.")
    print(f"GPU: {torch.cuda.get_device_name(0)}")

    loader = RoboflowCricketLoader(base_dir=str(ROOT / "data" / "roboflow_yolo"))
    data_yaml = loader.build_ball_dataset()
    print(f"Dataset: {data_yaml}")

    model = YOLO(str(ROOT / "yolov8n.pt"))
    model.train(
        data=str(data_yaml),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=0,
        workers=args.workers,
        project=str(ROOT / "runs" / "detect"),
        name=args.name,
        exist_ok=True,
        patience=20,
        cos_lr=True,
        # Ball-friendly augmentation: no heavy hue shift (keep red red), mild geometry
        hsv_h=0.01,
        hsv_s=0.5,
        hsv_v=0.4,
        degrees=5.0,
        translate=0.1,
        scale=0.4,
        fliplr=0.5,
        mosaic=1.0,
        close_mosaic=10,
        mixup=0.0,
        amp=True,
        verbose=True,
    )

    run_dir = ROOT / "runs" / "detect" / args.name
    best = run_dir / "weights" / "best.pt"
    best_model = YOLO(str(best))

    metrics = best_model.val(data=str(data_yaml), split="test", imgsz=args.imgsz, device=0)
    print(f"\nTEST mAP50: {metrics.box.map50:.4f} | mAP50-95: {metrics.box.map:.4f} "
          f"| P: {metrics.box.mp:.4f} | R: {metrics.box.mr:.4f}")

    models_dir = ROOT / "backend" / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(best, models_dir / "cricket_ball.pt")

    onnx_path = best_model.export(format="onnx", imgsz=args.imgsz, dynamic=True, simplify=True)
    shutil.copy2(onnx_path, ROOT / "backend" / "cricket_yolo.onnx")
    print(f"\nSaved backend/models/cricket_ball.pt and backend/cricket_yolo.onnx")


if __name__ == "__main__":  # required on Windows for dataloader workers
    main()
