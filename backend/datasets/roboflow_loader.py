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
    "cricket_ball": {
        "workspace": "learningplatform",
        "project": "cricket-ball-detection-4g7e0",
        "version": 1,
        "classes": ["ball"],
        "url": "https://universe.roboflow.com/learningplatform/cricket-ball-detection-4g7e0"
    }
}


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


if __name__ == "__main__":
    loader = RoboflowCricketLoader()
    print("Available Roboflow datasets for Cricket CV:")
    print(RoboflowCricketLoader.list_available_targets())
