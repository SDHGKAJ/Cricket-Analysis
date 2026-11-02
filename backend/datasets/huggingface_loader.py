"""
Hugging Face Remote Dataset Loader
==================================
Sources:
    1. vicky521/cricket-shot
    2. rokmr/cricket-shot

Requirements:
    - Never assume local copies
    - Always load with streaming=True
    - Inspect dataset splits and schema column names dynamically first before accessing fields
    - Support train/val/test iteration without downloading entire gigabyte archives
"""

import os
import sys
import logging
from typing import Dict, Any, Generator, Optional, List

logger = logging.getLogger("HuggingFaceCricketLoader")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

HF_DATASET_IDS = [
    "vicky521/cricket-shot",
    "rokmr/cricket-shot"
]


class HuggingFaceCricketLoader:
    def __init__(self, dataset_name: str = "vicky521/cricket-shot"):
        self.dataset_name = dataset_name
        self._dataset = None
        self._schema_info: Dict[str, Any] = {}

    def inspect_and_stream(self, split: Optional[str] = None):
        """
        Dynamically inspect splits and schema column names first.
        Loads in streaming mode: `datasets.load_dataset(dataset_name, streaming=True)`
        """
        try:
            from datasets import load_dataset, get_dataset_split_names
        except ImportError:
            logger.error("Hugging Face `datasets` package is not installed. Run: pip install datasets")
            return None

        logger.info(f"Inspecting remote Hugging Face dataset: '{self.dataset_name}' with streaming=True...")

        try:
            # First, check available splits without downloading data
            splits = get_dataset_split_names(self.dataset_name)
            logger.info(f"Available splits in '{self.dataset_name}': {splits}")
        except Exception as e:
            logger.warning(f"Could not fetch split names directly ({e}). Defaulting to 'train'.")
            splits = ["train"]

        chosen_split = split if split in splits else splits[0]
        logger.info(f"Streaming split: '{chosen_split}'...")

        dataset_stream = load_dataset(self.dataset_name, split=chosen_split, streaming=True)

        # Inspect the very first sample to detect column names dynamically
        sample_iter = iter(dataset_stream)
        try:
            first_sample = next(sample_iter)
            column_names = list(first_sample.keys())
            logger.info(f"Detected columns dynamically for '{self.dataset_name}': {column_names}")

            # Identify candidate label columns and media columns
            label_col = next((c for c in column_names if c.lower() in ["label", "shot_type", "shot", "class", "target"]), None)
            media_col = next((c for c in column_names if c.lower() in ["image", "video", "clip", "frames", "file"]), None)

            self._schema_info = {
                "dataset_name": self.dataset_name,
                "split": chosen_split,
                "all_columns": column_names,
                "detected_label_column": label_col,
                "detected_media_column": media_col,
                "first_sample_keys": list(first_sample.keys())
            }
            logger.info(f"Schema summary: {self._schema_info}")

            # Return a generator that yields normalized samples
            def sample_generator() -> Generator[Dict[str, Any], None, None]:
                # Yield first sample
                yield self._normalize_sample(first_sample, label_col, media_col)
                # Yield subsequent samples
                for sample in sample_iter:
                    yield self._normalize_sample(sample, label_col, media_col)

            return sample_generator()

        except StopIteration:
            logger.warning("Stream is empty.")
            return None
        except Exception as e:
            logger.error(f"Error inspecting stream: {e}")
            raise e

    def _normalize_sample(self, raw_sample: Dict[str, Any], label_col: Optional[str], media_col: Optional[str]) -> Dict[str, Any]:
        """Normalize dataset sample into standard shot representation."""
        shot_label = raw_sample.get(label_col) if label_col else "unknown"
        media_data = raw_sample.get(media_col) if media_col else None

        # Clean string label if necessary
        clean_label = str(shot_label).lower().replace(" ", "_")

        return {
            "source_dataset": self.dataset_name,
            "raw_label": shot_label,
            "normalized_shot_type": clean_label,
            "media": media_data,
            "raw_payload": {k: v for k, v in raw_sample.items() if k not in [media_col]}
        }

    def get_schema_info(self) -> Dict[str, Any]:
        return self._schema_info


def inspect_all_cricket_hf_datasets():
    """Diagnostic tool to inspect all target HF datasets."""
    for ds_name in HF_DATASET_IDS:
        print(f"\n================ Loading {ds_name} ================")
        loader = HuggingFaceCricketLoader(ds_name)
        stream = loader.inspect_and_stream()
        if stream:
            count = 0
            for item in stream:
                count += 1
                print(f"Sample #{count}: Label='{item['normalized_shot_type']}', keys={list(item.keys())}")
                if count >= 3:
                    break


if __name__ == "__main__":
    inspect_all_cricket_hf_datasets()
