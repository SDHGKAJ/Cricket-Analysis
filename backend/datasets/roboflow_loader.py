"""
Roboflow Cricket YOLO Dataset Remote Loader
===========================================
Datasets:
    1. universe.roboflow.com/lbwdrs/cricket-2-7snzq (ball, bat, batsman, bowler)
    2. universe.roboflow.com/lbwdrs/cricket-bat-detection-hlbdq
    3. universe.roboflow.com/learningplatform/cricket-ball-detection-4g7e0

Requirements:
    - Never assume local copies
    - Read Roboflow API key securely from `ROBOFLOW_API_KEY` environment variable
    - Export in standard YOLOv8 format (images, labels, data.yaml) for training
"""

import os
import sys
import logging
from pathlib import Path
from typing import Dict, Any, Optional

logger = logging.getLogger("RoboflowCricketLoader")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

ROBOFLOW_DATASETS = {
    "cricket_full_match": {
        "workspace": "lbwdrs",
        "project": "cricket-2-7snzq",
        "version": 1,
        "classes": ["ball", "bat", "batsman", "bowler"],
        "url": "https://universe.roboflow.com/lbwdrs/cricket-2-7snzq"
    },
    "cricket_bat": {
        "workspace": "lbwdrs",
        "project": "cricket-bat-detection-hlbdq",
        "version": 1,
        "classes": ["bat"],
        "url": "https://universe.roboflow.com/lbwdrs/cricket-bat-detection-hlbdq"
    },
    # Single-class cricket-ball datasets (all CC BY 4.0). These are merged by
    # build_ball_dataset() into one YOLO dataset with class 0 = cricket_ball.
    # (The old learningplatform/cricket-ball-detection-4g7e0 had only 3 unlabelled
    # images and produced a useless model — do not use it.)
    "ball_red_white": {
        "workspace": "ball-speed",
        "project": "red-and-white-ball",
        "version": 3,
        "classes": ["Cricket Ball"],
        "url": "https://universe.roboflow.com/ball-speed/red-and-white-ball"
    },
    "ball_learningplatform": {
        "workspace": "learningplatform",
        "project": "cricket-ball-detection-rixg7",
        "version": 1,
        "classes": ["cricketball"],
        "url": "https://universe.roboflow.com/learningplatform/cricket-ball-detection-rixg7"
    },
    "ball_rajyavardhan": {
        "workspace": "rajyavardhan-singh-oygkv",
        "project": "cricket-ball-detection-our4k",
        "version": 1,
        "classes": ["Cricket Ball Detection"],
        "url": "https://universe.roboflow.com/rajyavardhan-singh-oygkv/cricket-ball-detection-our4k"
    },
}

BALL_DATASET_KEYS = ["ball_red_white", "ball_learningplatform", "ball_rajyavardhan"]


class RoboflowCricketLoader:
    def __init__(self, api_key: Optional[str] = None, base_dir: Optional[str] = None):
        self.api_key = api_key or os.getenv("ROBOFLOW_API_KEY")
        self.base_dir = Path(base_dir or "./data/roboflow_yolo")
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def verify_api_key(self) -> bool:
        if not self.api_key:
            logger.warning(
                "ROBOFLOW_API_KEY environment variable is not set!\n"
                "To download datasets from Roboflow Universe, set:\n"
                "  export ROBOFLOW_API_KEY=your_roboflow_key\n"
                "Or pass api_key to RoboflowCricketLoader(api_key='...')"
            )
            return False
        return True

    def download_dataset(self, dataset_key: str = "cricket_full_match", yolo_version: str = "yolov8") -> Dict[str, Any]:
        """
        Download remote Roboflow dataset in YOLO format.
        """
        if not self.verify_api_key():
            return {
                "status": "missing_api_key",
                "message": "Set ROBOFLOW_API_KEY to proceed with remote download."
            }

        if dataset_key not in ROBOFLOW_DATASETS:
            raise ValueError(f"Unknown dataset '{dataset_key}'. Choose from: {list(ROBOFLOW_DATASETS.keys())}")

        cfg = ROBOFLOW_DATASETS[dataset_key]
        target_dir = self.base_dir / dataset_key

        try:
            from roboflow import Roboflow
            rf = Roboflow(api_key=self.api_key)
            project = rf.workspace(cfg["workspace"]).project(cfg["project"])
            version = project.version(cfg["version"])
            logger.info(f"Downloading {dataset_key} (v{cfg['version']}) into {target_dir} in {yolo_version} format...")
            dataset = version.download(model_format=yolo_version, location=str(target_dir))
            return {
                "status": "success",
                "dataset_key": dataset_key,
                "location": str(dataset.location),
                "classes": cfg["classes"],
                "source_url": cfg["url"]
            }
        except ImportError:
            logger.error("Roboflow Python SDK not installed. Run: pip install roboflow")
            return {"status": "error", "error": "pip install roboflow required"}
        except Exception as e:
            logger.error(f"Error downloading Roboflow dataset '{dataset_key}': {e}")
            return {"status": "error", "error": str(e)}

    @staticmethod
    def list_available_targets() -> Dict[str, Any]:
        return ROBOFLOW_DATASETS

    def build_ball_dataset(self, out_dir: Optional[str] = None) -> Path:
        """Download every BALL_DATASET_KEYS source and merge them into one
        single-class YOLO dataset (class 0 = cricket_ball). Returns data.yaml path.

        Source splits are kept (train/valid/test) so no source image leaks from
        train into validation. Every label's class id is rewritten to 0.
        """
        import shutil

        out = Path(out_dir or self.base_dir / "ball_merged")
        for split in ("train", "valid", "test"):
            (out / split / "images").mkdir(parents=True, exist_ok=True)
            (out / split / "labels").mkdir(parents=True, exist_ok=True)

        counts: Dict[str, int] = {"train": 0, "valid": 0, "test": 0}
        for key in BALL_DATASET_KEYS:
            src = self.base_dir / key
            if not (src / "data.yaml").exists():
                res = self.download_dataset(key)
                if res.get("status") != "success":
                    raise RuntimeError(f"Download failed for {key}: {res}")
            for split in ("train", "valid", "test"):
                img_dir = src / split / "images"
                if not img_dir.exists():
                    continue
                for img in img_dir.iterdir():
                    lbl = src / split / "labels" / (img.stem + ".txt")
                    new_stem = f"{key}__{img.stem}"
                    shutil.copy2(img, out / split / "images" / (new_stem + img.suffix))
                    lines = []
                    if lbl.exists():
                        for line in lbl.read_text().splitlines():
                            parts = line.split()
                            # keep plain bounding boxes only (cls cx cy w h)
                            if len(parts) == 5:
                                lines.append(" ".join(["0"] + parts[1:]))
                    (out / split / "labels" / (new_stem + ".txt")).write_text("\n".join(lines))
                    counts[split] += 1

        data_yaml = out / "data.yaml"
        data_yaml.write_text(
            f"path: {out.resolve().as_posix()}\n"
            "train: train/images\nval: valid/images\ntest: test/images\n"
            "nc: 1\nnames: ['cricket_ball']\n"
        )
        logger.info(f"Merged ball dataset at {out}: {counts}")
        return data_yaml


if __name__ == "__main__":
    loader = RoboflowCricketLoader()
    if len(sys.argv) > 1 and sys.argv[1] == "ball":
        print(loader.build_ball_dataset())
    else:
        print("Available Roboflow datasets for Cricket CV:")
        print(RoboflowCricketLoader.list_available_targets())
        print("\nRun `python backend/datasets/roboflow_loader.py ball` to build the merged ball dataset.")
