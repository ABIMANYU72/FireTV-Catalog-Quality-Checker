"""
exporter.py
-----------
Runs the full detection pipeline and exports all JSON artifacts to
web/public/data/ so the Next.js dashboard can serve them statically.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

from detector import run_detection, evaluate

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
OUT_DIR = ROOT / "web" / "public" / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def load_json(path: Path) -> list | dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json(data, path: Path) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  Wrote {path.name} ({path.stat().st_size // 1024} KB)")


def main():
    catalog_path = DATA_DIR / "catalog.json"
    labels_path = DATA_DIR / "seeded_labels.json"

    if not catalog_path.exists():
        raise FileNotFoundError(f"Catalog not found: {catalog_path}. Run build_dataset.py first.")

    print("Loading catalog …")
    catalog = load_json(catalog_path)

    print(f"Running detection on {len(catalog)} records …")
    t0 = time.perf_counter()
    result = run_detection(catalog)
    elapsed = time.perf_counter() - t0

    # Evaluation
    eval_result = {}
    if labels_path.exists():
        labels = load_json(labels_path)
        eval_result = evaluate(result, labels)
        print(f"Evaluation: {eval_result}")

    # Build summary with eval metrics
    summary = {
        **result["summary"],
        **eval_result,
        "detection_time_seconds": round(elapsed, 3),
    }

    print("Writing artifacts …")
    write_json(result["issues"], OUT_DIR / "issues.json")
    write_json(result["pair_scores"], OUT_DIR / "pair_scores.json")
    write_json(summary, OUT_DIR / "summary.json")
    write_json(catalog, OUT_DIR / "catalog.json")

    print("Export complete.")
    return summary


if __name__ == "__main__":
    main()
