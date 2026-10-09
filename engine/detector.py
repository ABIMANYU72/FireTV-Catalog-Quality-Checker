"""
detector.py
-----------
Normalise → block → score → classify

Outputs (written by exporter.py):
  issues.json       – all detected issues
  pair_scores.json  – raw scored pairs
  summary.json      – aggregate stats
"""

from __future__ import annotations

import json
import math
import re
import unicodedata
from pathlib import Path
from typing import Any

from rapidfuzz import fuzz
from unidecode import unidecode

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

# ── normalisation ─────────────────────────────────────────────────────────────

ARTICLES = {"the", "a", "an", "le", "la", "les", "der", "die", "das", "el", "los"}

ROMAN_MAP = {
    r"\bI\b": "1", r"\bII\b": "2", r"\bIII\b": "3", r"\bIV\b": "4",
    r"\bV\b": "5", r"\bVI\b": "6", r"\bVII\b": "7", r"\bVIII\b": "8",
    r"\bIX\b": "9", r"\bX\b": "10", r"\bXI\b": "11", r"\bXII\b": "12",
}

NUMBER_WORDS = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4",
    "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
    "ten": "10", "eleven": "11", "twelve": "12",
}

# Common alt-language / transliteration pairs (title → canonical)
ALT_TITLES: dict[str, str] = {
    "kimi no na wa": "your name",
    "sen to chihiro no kamikakushi": "spirited away",
    "mononoke hime": "princess mononoke",
    "howl no ugoku shiro": "howls moving castle",
    "las aventuras de tintin": "the adventures of tintin",
}


def normalise(title: str) -> str:
    """
    Full pipeline:
    1. Transliterate Unicode → ASCII
    2. Lowercase
    3. Remove punctuation (keep alphanumeric and spaces)
    4. Strip leading/trailing articles
    5. Collapse whitespace
    6. Replace Roman numerals → Arabic digits
    7. Replace number words → digits
    8. Apply known alt-title mappings
    """
    if not title:
        return ""
    # transliterate
    t = unidecode(title)
    # lowercase
    t = t.lower()
    # strip parenthetical years like (2021)
    t = re.sub(r"\(\d{4}\)", "", t)
    # remove punctuation
    t = re.sub(r"[^\w\s]", " ", t)
    # collapse whitespace
    t = re.sub(r"\s+", " ", t).strip()
    # drop leading/trailing articles
    words = t.split()
    if words and words[0] in ARTICLES:
        words = words[1:]
    if words and words[-1] in ARTICLES:
        words = words[:-1]
    t = " ".join(words)
    # roman numerals (word-boundary aware)
    for pattern, digit in ROMAN_MAP.items():
        t = re.sub(pattern, digit, t, flags=re.IGNORECASE)
    # number words
    words = t.split()
    words = [NUMBER_WORDS.get(w, w) for w in words]
    t = " ".join(words)
    # known alt-titles
    t = ALT_TITLES.get(t, t)
    return t.strip()


def prefix_key(norm_title: str, length: int = 4) -> str:
    """Return the first `length` chars of the normalised title."""
    return norm_title[:length]


# ── blocking ──────────────────────────────────────────────────────────────────

YEAR_WINDOW = 2   # years within which we consider a match possible


def build_blocks(records: list[dict]) -> dict[str, list[int]]:
    """
    Build an inverted index: norm_prefix → [row indices].
    Also index by (prefix, year-bucket) for denser candidates.
    """
    blocks: dict[str, list[int]] = {}
    for i, rec in enumerate(records):
        norm = normalise(rec.get("title", ""))
        pk = prefix_key(norm)
        blocks.setdefault(pk, []).append(i)
        # also index by first word for short titles
        first_word = norm.split()[0] if norm.split() else pk
        if first_word != pk:
            blocks.setdefault(first_word[:4], []).append(i)
    return blocks


def get_candidate_pairs(records: list[dict], blocks: dict[str, list[int]]) -> list[tuple[int, int]]:
    """
    Return deduplicated (i, j) pairs where i < j from the blocks.
    Also enforce a year-window filter: if both records have years, |y1-y2| <= YEAR_WINDOW.
    """
    seen: set[tuple[int, int]] = set()
    pairs: list[tuple[int, int]] = []

    for indices in blocks.values():
        for a in range(len(indices)):
            for b in range(a + 1, len(indices)):
                i, j = indices[a], indices[b]
                if i > j:
                    i, j = j, i
                if (i, j) in seen:
                    continue
                # Year window filter
                yi = records[i].get("year")
                yj = records[j].get("year")
                try:
                    yi_int = int(yi) if yi is not None else None
                    yj_int = int(yj) if yj is not None else None
                except (ValueError, TypeError):
                    yi_int = yj_int = None

                if yi_int and yj_int and abs(yi_int - yj_int) > YEAR_WINDOW:
                    continue
                seen.add((i, j))
                pairs.append((i, j))

    return pairs


# ── scoring ───────────────────────────────────────────────────────────────────

WEIGHTS = {
    "token_set_ratio": 0.35,
    "wratio": 0.25,
    "year_proximity": 0.15,
    "language_match": 0.10,
    "runtime_closeness": 0.08,
    "cast_overlap": 0.07,
}


def _year_score(y1: Any, y2: Any) -> float:
    try:
        diff = abs(int(y1) - int(y2))
        return max(0.0, 1.0 - diff / YEAR_WINDOW)
    except (TypeError, ValueError):
        return 0.5   # unknown → neutral


def _runtime_score(r1: Any, r2: Any) -> float:
    try:
        diff = abs(float(r1) - float(r2))
        return max(0.0, 1.0 - diff / 30)   # 30-min tolerance
    except (TypeError, ValueError):
        return 0.5


def _cast_overlap(c1: list[str], c2: list[str]) -> float:
    if not c1 or not c2:
        return 0.5
    s1 = {n.lower() for n in c1}
    s2 = {n.lower() for n in c2}
    overlap = len(s1 & s2)
    union = len(s1 | s2)
    return overlap / union if union else 0.0


def score_pair(rec_a: dict, rec_b: dict) -> dict[str, float]:
    """
    Return a signal breakdown dict and a composite score.
    """
    norm_a = normalise(rec_a.get("title", ""))
    norm_b = normalise(rec_b.get("title", ""))

    tsr = fuzz.token_set_ratio(norm_a, norm_b) / 100.0
    wr = fuzz.WRatio(norm_a, norm_b) / 100.0
    yp = _year_score(rec_a.get("year"), rec_b.get("year"))
    lm = 1.0 if (rec_a.get("language") or "").lower() == (rec_b.get("language") or "").lower() else 0.0
    rc = _runtime_score(rec_a.get("runtime"), rec_b.get("runtime"))
    co = _cast_overlap(rec_a.get("cast", []), rec_b.get("cast", []))

    signals = {
        "token_set_ratio": round(tsr, 4),
        "wratio": round(wr, 4),
        "year_proximity": round(yp, 4),
        "language_match": round(lm, 4),
        "runtime_closeness": round(rc, 4),
        "cast_overlap": round(co, 4),
    }

    composite = sum(signals[k] * WEIGHTS[k] for k in WEIGHTS)
    signals["composite"] = round(composite, 4)
    return signals


# ── classification ────────────────────────────────────────────────────────────

AUTO_FLAG_THRESHOLD = 0.82
NEEDS_REVIEW_THRESHOLD = 0.65


def classify_pair(signals: dict[str, float]) -> str:
    score = signals["composite"]
    if signals.get("year_proximity", 0.5) == 0.0:
        # If years are strictly verified to be > YEAR_WINDOW apart, prevent AUTO_FLAG
        score = min(score, AUTO_FLAG_THRESHOLD - 0.01)
        
    if score >= AUTO_FLAG_THRESHOLD:
        return "AUTO_FLAG"
    elif score >= NEEDS_REVIEW_THRESHOLD:
        return "NEEDS_REVIEW"
    else:
        return "DISTINCT"


# ── metadata issue detection ──────────────────────────────────────────────────

def detect_metadata_issues(records: list[dict]) -> list[dict]:
    """
    Classify every record into one or more SOP categories:
      MISSING_METADATA, INVALID_FORMAT, METADATA_MISMATCH (placeholder here)
    """
    issues: list[dict] = []
    current_year = 2026

    for rec in records:
        cid = rec.get("catalog_id", rec.get("tmdb_id", "?"))

        # MISSING_METADATA
        missing_fields: list[str] = []
        if not rec.get("title"):
            missing_fields.append("title")
        if rec.get("year") is None:
            missing_fields.append("year")
        if not rec.get("language"):
            missing_fields.append("language")
        if not rec.get("synopsis"):
            missing_fields.append("synopsis")
        if not rec.get("genres"):
            missing_fields.append("genres")

        if missing_fields:
            issues.append({
                "id": f"MM-{cid}",
                "category": "MISSING_METADATA",
                "severity": "HIGH" if "title" in missing_fields else "MEDIUM",
                "record_ids": [cid],
                "evidence": f"Missing fields: {', '.join(missing_fields)}",
                "suggested_action": "Fetch missing metadata from TMDB or content provider.",
                "fields": missing_fields,
            })

        # INVALID_FORMAT
        invalid_reasons: list[str] = []
        year_val = rec.get("year")
        if year_val is not None:
            try:
                y = int(year_val)
                if y < 1888 or y > current_year + 2:
                    invalid_reasons.append(f"year={year_val} out of range")
            except (ValueError, TypeError):
                invalid_reasons.append(f"year={year_val!r} is not a valid integer")

        runtime_val = rec.get("runtime")
        if runtime_val is not None:
            try:
                r = float(runtime_val)
                if r < 0:
                    invalid_reasons.append(f"runtime={runtime_val} is negative")
            except (ValueError, TypeError):
                invalid_reasons.append(f"runtime={runtime_val!r} invalid")

        if invalid_reasons:
            issues.append({
                "id": f"IF-{cid}",
                "category": "INVALID_FORMAT",
                "severity": "HIGH",
                "record_ids": [cid],
                "evidence": "; ".join(invalid_reasons),
                "suggested_action": "Correct field values to valid formats per SOP section 3.",
                "fields": [],
            })

    return issues


# ── main detection pipeline ───────────────────────────────────────────────────

def run_detection(catalog: list[dict]) -> dict:
    """
    Full pipeline. Returns result dict with issues, pair_scores, summary.
    """
    n = len(catalog)

    # 1. Build blocks
    blocks = build_blocks(catalog)
    candidate_pairs = get_candidate_pairs(catalog, blocks)

    n_squared = n * (n - 1) // 2
    comparisons_saved = n_squared - len(candidate_pairs)
    comparisons_saved_pct = comparisons_saved / n_squared * 100 if n_squared else 0

    # 2. Score pairs
    pair_scores: list[dict] = []
    for i, j in candidate_pairs:
        rec_a = catalog[i]
        rec_b = catalog[j]
        signals = score_pair(rec_a, rec_b)
        label = classify_pair(signals)
        pair_scores.append({
            "id_a": rec_a.get("catalog_id"),
            "id_b": rec_b.get("catalog_id"),
            "title_a": rec_a.get("title"),
            "title_b": rec_b.get("title"),
            "year_a": rec_a.get("year"),
            "year_b": rec_b.get("year"),
            "signals": signals,
            "label": label,
        })

    # 3. Build duplicate issues
    dup_issues: list[dict] = []
    flagged_pairs: list[dict] = []
    for ps in pair_scores:
        if ps["label"] in ("AUTO_FLAG", "NEEDS_REVIEW"):
            confidence = "HIGH" if ps["label"] == "AUTO_FLAG" else "MEDIUM"
            dup_issues.append({
                "id": f"DUP-{ps['id_a']}-{ps['id_b']}",
                "category": "DUPLICATE",
                "severity": confidence,
                "record_ids": [ps["id_a"], ps["id_b"]],
                "evidence": (
                    f"token_set_ratio={ps['signals']['token_set_ratio']:.2f}, "
                    f"composite={ps['signals']['composite']:.2f}"
                ),
                "suggested_action": (
                    "Merge records or mark as intentional variant."
                    if ps["label"] == "AUTO_FLAG"
                    else "Manual review required."
                ),
                "signals": ps["signals"],
                "label": ps["label"],
            })
            flagged_pairs.append(ps)

    # 4. Metadata issues
    meta_issues = detect_metadata_issues(catalog)

    all_issues = dup_issues + meta_issues

    # 5. Summary
    category_counts = {}
    for iss in all_issues:
        cat = iss["category"]
        category_counts[cat] = category_counts.get(cat, 0) + 1

    summary = {
        "total_records": n,
        "total_issues": len(all_issues),
        "category_counts": category_counts,
        "candidate_pairs": len(candidate_pairs),
        "n_squared": n_squared,
        "comparisons_saved": comparisons_saved,
        "comparisons_saved_pct": round(comparisons_saved_pct, 2),
        "auto_flagged": sum(1 for p in pair_scores if p["label"] == "AUTO_FLAG"),
        "needs_review": sum(1 for p in pair_scores if p["label"] == "NEEDS_REVIEW"),
    }

    return {
        "issues": all_issues,
        "pair_scores": pair_scores,
        "flagged_pairs": flagged_pairs,
        "summary": summary,
    }


# ── evaluation against labels ─────────────────────────────────────────────────

def evaluate(result: dict, labels: dict) -> dict:
    """
    Compute precision, recall, F1 for duplicate detection.
    The detector must NEVER read labels during detection – only for evaluation.
    """
    true_pairs: set[frozenset] = set()
    for dp in labels.get("duplicate_pairs", []):
        true_pairs.add(frozenset([dp["original_id"], dp["dup_id"]]))

    detected: set[frozenset] = set()
    for iss in result["issues"]:
        if iss["category"] == "DUPLICATE":
            ids = iss["record_ids"]
            if len(ids) == 2:
                detected.add(frozenset(ids))

    tp = len(detected & true_pairs)
    fp = len(detected - true_pairs)
    fn = len(true_pairs - detected)

    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0

    return {
        "true_positives": tp,
        "false_positives": fp,
        "false_negatives": fn,
        "seeded_dups_detected": tp,
        "total_seeded_dups": len(true_pairs),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
    }


if __name__ == "__main__":
    catalog_path = DATA_DIR / "catalog.json"
    labels_path = DATA_DIR / "seeded_labels.json"

    with open(catalog_path, encoding="utf-8") as f:
        catalog = json.load(f)

    print(f"Loaded {len(catalog)} records.")
    result = run_detection(catalog)

    print(f"Issues: {len(result['issues'])}")
    print(f"Summary: {result['summary']}")

    if labels_path.exists():
        with open(labels_path, encoding="utf-8") as f:
            labels = json.load(f)
        eval_result = evaluate(result, labels)
        print(f"Evaluation: {eval_result}")
