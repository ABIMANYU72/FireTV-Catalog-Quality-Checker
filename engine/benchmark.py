"""
benchmark.py
------------
Measures real runtime of the detection pipeline and estimates time savings
vs. a manual review baseline.

IMPORTANT: All "manual baseline" numbers are clearly labelled ESTIMATES.
           They are configurable constants, not tuned to hit any target.
           This script reports whatever is actually measured.

Outputs
-------
data/benchmark.json      – raw measurements
web/public/data/benchmark.json – copy for dashboard
"""

from __future__ import annotations

import json
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
OUT_DIR = ROOT / "web" / "public" / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ── ESTIMATES (configurable; clearly labelled) ────────────────────────────────
# Based on industry norms for manual catalog QA:
MANUAL_SECONDS_PER_RECORD = 10      # ESTIMATE: typical time for a human to review one record
MANUAL_REPORT_MINUTES = 30          # ESTIMATE: time a human takes to generate a daily report


def run_benchmark() -> dict:
    from detector import run_detection

    catalog_path = DATA_DIR / "catalog.json"
    if not catalog_path.exists():
        raise FileNotFoundError("Run build_dataset.py first.")

    with open(catalog_path, encoding="utf-8") as f:
        catalog = json.load(f)

    n = len(catalog)

    # ── measure detection time ────────────────────────────────────────────────
    t0 = time.perf_counter()
    result = run_detection(catalog)
    detection_time = time.perf_counter() - t0

    # ── measure report generation time ───────────────────────────────────────
    t1 = time.perf_counter()
    # Simulate the work done to build the summary JSON (already done in detection)
    summary_snapshot = {**result["summary"]}
    report_generation_time = time.perf_counter() - t1

    # ── manual baseline (ESTIMATES) ───────────────────────────────────────────
    manual_review_seconds = n * MANUAL_SECONDS_PER_RECORD
    manual_report_seconds = MANUAL_REPORT_MINUTES * 60

    time_saved_review = manual_review_seconds - detection_time
    time_saved_report = manual_report_seconds - report_generation_time
    total_time_saved = time_saved_review + time_saved_report

    speedup_factor = manual_review_seconds / detection_time if detection_time > 0 else float("inf")

    benchmark = {
        "measured": {
            "catalog_records": n,
            "detection_time_seconds": round(detection_time, 3),
            "report_generation_time_seconds": round(report_generation_time, 6),
            "total_issues_found": len(result["issues"]),
            "candidate_pairs_evaluated": result["summary"]["candidate_pairs"],
            "n_squared_pairs": result["summary"]["n_squared"],
            "comparisons_saved": result["summary"]["comparisons_saved"],
            "comparisons_saved_pct": result["summary"]["comparisons_saved_pct"],
        },
        "manual_baseline_ESTIMATES": {
            "note": "These are ESTIMATES based on industry norms, not measured values.",
            "seconds_per_record": MANUAL_SECONDS_PER_RECORD,
            "report_minutes": MANUAL_REPORT_MINUTES,
            "total_manual_review_seconds": manual_review_seconds,
            "total_manual_report_seconds": manual_report_seconds,
        },
        "time_savings_ESTIMATES": {
            "note": "Savings computed from ESTIMATED manual baseline vs. measured tool time.",
            "review_time_saved_seconds": round(time_saved_review, 1),
            "report_time_saved_seconds": round(time_saved_report, 1),
            "total_time_saved_seconds": round(total_time_saved, 1),
            "total_time_saved_minutes": round(total_time_saved / 60, 1),
            "speedup_factor": round(speedup_factor, 1),
        },
    }

    return benchmark


def main():
    print("Running benchmark …")
    benchmark = run_benchmark()

    data_path = DATA_DIR / "benchmark.json"
    web_path = OUT_DIR / "benchmark.json"

    for path in (data_path, web_path):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(benchmark, f, ensure_ascii=False, indent=2)
        print(f"  Wrote {path}")

    m = benchmark["measured"]
    e = benchmark["time_savings_ESTIMATES"]
    print(f"\nResults:")
    print(f"  Records        : {m['catalog_records']}")
    print(f"  Detection time : {m['detection_time_seconds']:.3f}s")
    print(f"  Issues found   : {m['total_issues_found']}")
    print(f"  Comparisons saved: {m['comparisons_saved_pct']:.1f}%")
    print(f"  Speedup (vs ESTIMATE): {e['speedup_factor']}×")
    print(f"  Time saved (ESTIMATE): {e['total_time_saved_minutes']} min")


if __name__ == "__main__":
    main()
