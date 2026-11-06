"""Train YOLOv8n for cricket ball detection on RTX 3050 (6GB VRAM)."""
from pathlib import Path
from ultralytics import YOLO
import torch
import shutil

# Verify CUDA
print(f"PyTorch: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")
print(f"GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'None'}")

# Dataset path (downloaded from Roboflow)
data_yaml = Path("Cricket-Ball-Detection-1/data.yaml").resolve()
print(f"\nData YAML: {data_yaml}")
print(f"Exists: {data_yaml.exists()}")

# NOTE: This Roboflow dataset only has 3 images in train/ and no valid/ dir.
# We'll point val to train so YOLOv8 can run (minimal dataset - for testing only).
import yaml
with open(data_yaml) as f:
    config = yaml.safe_load(f)
config['val'] = '../train/images'  # point val to train since no valid dir exists
with open(data_yaml, 'w') as f:
    yaml.dump(config, f)
print("Adjusted data.yaml: val -> train (3 images, minimal dataset)")

# Load YOLOv8n (nano - best for 6GB VRAM)
model = YOLO("yolov8n.pt")

# Train (fewer epochs since dataset is tiny)
results = model.train(
    data=str(data_yaml),
    epochs=10,
    imgsz=640,
    batch=8,
    device=0,
    workers=4,
    name="cricket_ball_yolov8",
    degrees=10.0,
    translate=0.1,
    scale=0.2,
    mosaic=1.0,
    mixup=0.1,
    patience=5,
    verbose=True,
)

# Validation
val_metrics = model.val()
print(f"\nValidation mAP50: {val_metrics.box.map50:.4f}")
print(f"Validation mAP50-95: {val_metrics.box.map:.4f}")

# Export to ONNX
onnx_path = model.export(format="onnx", dynamic=True, simplify=True)
print(f"\nExported ONNX model: {onnx_path}")

# Copy ONNX to backend/
backend_onnx = Path("backend/cricket_yolo.onnx")
shutil.copy2(onnx_path, backend_onnx)
print(f"Copied to: {backend_onnx.resolve()}")

print("\nTraining complete! Model saved to backend/cricket_yolo.onnx")
