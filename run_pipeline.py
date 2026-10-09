"""
run_pipeline.py
---------------
Single entry-point that runs the full end-to-end pipeline:
  1. build_dataset.py  – fetch/load TMDB data, build catalog
  2. exporter.py       – run detection, export JSON to web/public/data/
  3. benchmark.py      – measure and write benchmark.json
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

SCRIPTS = [
    ROOT / "engine" / "build_dataset.py",
    ROOT / "engine" / "exporter.py",
    ROOT / "engine" / "benchmark.py",
]


def main():
    for script in SCRIPTS:
        print(f"\n{'='*60}")
        print(f"Running: {script.name}")
        print("=" * 60)
        result = subprocess.run(
            [sys.executable, str(script)],
            cwd=str(ROOT),
        )
        if result.returncode != 0:
            print(f"ERROR: {script.name} exited with code {result.returncode}", file=sys.stderr)
            sys.exit(result.returncode)

    print("\n✅ Pipeline complete. All artifacts written to web/public/data/")


if __name__ == "__main__":
    main()
