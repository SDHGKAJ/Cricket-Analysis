"""
Kaggle Cricket Shot Dataset Remote Loader
=========================================
Source: aneesh10/cricket-shot-dataset
CLI: kaggle datasets download -d aneesh10/cricket-shot-dataset --unzip

Requirements:
    - Never assume local copies
    - Read credentials safely from environment variables (KAGGLE_USERNAME, KAGGLE_KEY)
    - Check dataset metadata, structure, and license
"""

import os
import sys
import shutil
import logging
import subprocess
from pathlib import Path
from typing import Dict, Any, List, Optional

logger = logging.getLogger("KaggleCricketLoader")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

KAGGLE_DATASET_ID = "aneesh10/cricket-shot-dataset"


class KaggleCricketLoader:
    def __init__(self, download_dir: Optional[str] = None):
        self.download_dir = Path(download_dir or "./data/kaggle_cricket_shots")
        self.download_dir.mkdir(parents=True, exist_ok=True)

    def check_credentials(self) -> bool:
        """Verify if Kaggle credentials are set in environment or default path."""
        has_env = "KAGGLE_USERNAME" in os.environ and "KAGGLE_KEY" in os.environ
        kaggle_json = Path.home() / ".kaggle" / "kaggle.json"
        has_file = kaggle_json.exists()

        if not (has_env or has_file):
            logger.warning(
                "Kaggle credentials not detected! Set environment variables:\n"
                "  export KAGGLE_USERNAME=your_username\n"
                "  export KAGGLE_KEY=your_api_key\n"
                "Or place kaggle.json in ~/.kaggle/"
            )
            return False
        return True

    def download_and_extract(self, force: bool = False) -> Dict[str, Any]:
        """Download and extract the remote Kaggle cricket dataset."""
        if not self.check_credentials():
            return {
                "status": "missing_credentials",
                "message": "Set KAGGLE_USERNAME and KAGGLE_KEY to fetch remotely."
            }

        target_folder = self.download_dir / "cricket_shots"
        if target_folder.exists() and not force:
            logger.info(f"Dataset already exists at {target_folder}. Skipping download.")
            return self.inspect_dataset(target_folder)

        try:
            from kaggle.api.kaggle_api_extended import KaggleApi
            api = KaggleApi()
            api.authenticate()
            logger.info(f"Authenticated with Kaggle API. Downloading {KAGGLE_DATASET_ID}...")
            api.dataset_download_files(KAGGLE_DATASET_ID, path=str(self.download_dir), unzip=True)
            logger.info(f"Download and extraction complete in {self.download_dir}")
            return self.inspect_dataset(self.download_dir)
        except ImportError:
            # Fallback to CLI command
            logger.info("Using kaggle CLI command...")
            cmd = f"kaggle datasets download -d {KAGGLE_DATASET_ID} -p {self.download_dir} --unzip"
            res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            if res.returncode != 0:
                logger.error(f"Kaggle download failed: {res.stderr}")
                return {"status": "error", "error": res.stderr}
            return self.inspect_dataset(self.download_dir)
        except Exception as e:
            logger.error(f"Failed to download Kaggle dataset: {e}")
            return {"status": "error", "error": str(e)}

    def inspect_dataset(self, folder: Path) -> Dict[str, Any]:
        """Inspect extracted classes and file counts."""
        subfolders = [d for d in folder.iterdir() if d.is_dir() and not d.name.startswith(".")]
        class_summary = {}
        for sf in subfolders:
            image_files = list(sf.glob("*.jpg")) + list(sf.glob("*.jpeg")) + list(sf.glob("*.png"))
            class_summary[sf.name] = len(image_files)

        report = {
            "dataset_id": KAGGLE_DATASET_ID,
            "classes_found": list(class_summary.keys()),
            "class_counts": class_summary,
            "total_images": sum(class_summary.values()),
            "status": "ready"
        }
        logger.info(f"Kaggle dataset inspection: {report}")
        return report


if __name__ == "__main__":
    loader = KaggleCricketLoader()
    print("Checking Kaggle dataset status...")
    info = loader.download_and_extract()
    print(info)
