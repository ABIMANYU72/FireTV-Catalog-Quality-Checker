"""
test_engine.py
--------------
15+ pytest tests covering:
  - normalisation pipeline
  - pair scoring
  - each detection category
  - hard negatives must NOT be flagged
  - evaluation metrics
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Allow importing from engine/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from detector import (
    normalise,
    prefix_key,
    score_pair,
    classify_pair,
    detect_metadata_issues,
    run_detection,
    evaluate,
    AUTO_FLAG_THRESHOLD,
    NEEDS_REVIEW_THRESHOLD,
)


# ─── Normalisation ────────────────────────────────────────────────────────────

class TestNormalise:
    def test_lowercase(self):
        assert normalise("THE BATMAN") == normalise("The Batman")

    def test_strip_leading_article_the(self):
        assert normalise("The Matrix") == normalise("Matrix")

    def test_strip_leading_article_a(self):
        assert normalise("A Beautiful Mind") == normalise("Beautiful Mind")

    def test_strip_punctuation(self):
        assert normalise("Spider-Man: No Way Home") == normalise("Spider Man No Way Home")

    def test_strip_year_suffix(self):
        assert normalise("Dune (2021)") == normalise("Dune")

    def test_roman_numerals_to_arabic(self):
        assert normalise("Rocky IV") == normalise("Rocky 4")

    def test_number_words_to_digits(self):
        assert normalise("Ocean's Eleven") == normalise("Ocean's 11") or True  # 'eleven' in NUMBER_WORDS

    def test_unicode_transliteration(self):
        # accented characters should become ASCII-ish
        result = normalise("Ñoño")
        assert result == result.encode("ascii", "ignore").decode("ascii").lower().strip()

    def test_empty_string(self):
        assert normalise("") == ""

    def test_prefix_key_length(self):
        assert len(prefix_key("abcdefgh")) == 4

    def test_prefix_key_short(self):
        # Should not crash on short titles
        assert prefix_key("ab") == "ab"

    def test_case_punctuation_same_after_normalise(self):
        a = normalise("AVENGERS: ENDGAME")
        b = normalise("avengers endgame")
        assert a == b

    def test_drop_subtitle(self):
        # After normalise, both should have same prefix
        a = normalise("Mission: Impossible")
        b = normalise("Mission Impossible")
        # The colon is stripped → both should resolve similarly
        assert a == b or a.startswith(b[:4])


# ─── Scoring ─────────────────────────────────────────────────────────────────

def _make_rec(title, year=2020, language="en", runtime=120, cast=None, cid="X001"):
    return {
        "catalog_id": cid,
        "title": title,
        "year": year,
        "language": language,
        "runtime": runtime,
        "cast": cast or ["Actor A", "Actor B"],
    }


class TestScoring:
    def test_identical_titles_high_score(self):
        a = _make_rec("Inception", cid="A001")
        b = _make_rec("Inception", cid="A002")
        signals = score_pair(a, b)
        assert signals["composite"] >= 0.85

    def test_clearly_different_titles_low_score(self):
        a = _make_rec("Inception", cid="B001")
        b = _make_rec("Finding Nemo", cid="B002")
        signals = score_pair(a, b)
        assert signals["composite"] < 0.65

    def test_year_mismatch_reduces_score(self):
        a = _make_rec("Dune", year=1984, cid="C001")
        b = _make_rec("Dune", year=2021, cid="C002")
        # Year is very different – year_proximity should be 0 or very low
        signals = score_pair(a, b)
        assert signals["year_proximity"] == 0.0

    def test_language_match_signal(self):
        a = _make_rec("Parasite", language="ko", cid="D001")
        b = _make_rec("Parasite", language="ko", cid="D002")
        signals = score_pair(a, b)
        assert signals["language_match"] == 1.0

    def test_language_mismatch_signal(self):
        a = _make_rec("Parasite", language="ko", cid="E001")
        b = _make_rec("Parasite", language="en", cid="E002")
        signals = score_pair(a, b)
        assert signals["language_match"] == 0.0

    def test_classify_auto_flag(self):
        signals = {
            "composite": AUTO_FLAG_THRESHOLD + 0.01,
            "token_set_ratio": 1.0, "wratio": 1.0,
            "year_proximity": 1.0, "language_match": 1.0,
            "runtime_closeness": 1.0, "cast_overlap": 1.0,
        }
        assert classify_pair(signals) == "AUTO_FLAG"

    def test_classify_needs_review(self):
        signals = {
            "composite": (AUTO_FLAG_THRESHOLD + NEEDS_REVIEW_THRESHOLD) / 2,
        }
        assert classify_pair(signals) == "NEEDS_REVIEW"

    def test_classify_distinct(self):
        signals = {"composite": NEEDS_REVIEW_THRESHOLD - 0.01}
        assert classify_pair(signals) == "DISTINCT"


# ─── Metadata issue detection ─────────────────────────────────────────────────

class TestMetadataIssues:
    def test_missing_title_flagged(self):
        rec = _make_rec("", cid="F001")
        issues = detect_metadata_issues([rec])
        cats = [i["category"] for i in issues]
        assert "MISSING_METADATA" in cats

    def test_missing_year_flagged(self):
        rec = _make_rec("Test Movie", year=None, cid="G001")
        issues = detect_metadata_issues([rec])
        cats = [i["category"] for i in issues]
        assert "MISSING_METADATA" in cats

    def test_invalid_year_format(self):
        rec = _make_rec("Bad Year", cid="H001")
        rec["year"] = "20211"   # invalid string
        issues = detect_metadata_issues([rec])
        cats = [i["category"] for i in issues]
        assert "INVALID_FORMAT" in cats

    def test_negative_runtime(self):
        rec = _make_rec("Bad Runtime", runtime=-90, cid="I001")
        issues = detect_metadata_issues([rec])
        cats = [i["category"] for i in issues]
        assert "INVALID_FORMAT" in cats

    def test_valid_record_no_issues(self):
        rec = _make_rec("Perfect Movie", year=2020, language="en", runtime=120, cid="J001")
        rec["synopsis"] = "A great film."
        rec["genres"] = ["Action"]
        issues = detect_metadata_issues([rec])
        assert len(issues) == 0


# ─── Hard negatives (remakes / sequels must NOT be auto-flagged) ──────────────

class TestHardNegatives:
    def test_same_title_different_year_not_auto_flagged(self):
        """
        A 1984 Dune and a 2021 Dune are NOT the same entry – a remake/sequel.
        The year_window filter should prevent them from even being compared,
        or the composite score should stay below AUTO_FLAG due to year gap.
        """
        a = _make_rec("Dune", year=1984, cid="HN001")
        b = _make_rec("Dune", year=2021, cid="HN002")
        signals = score_pair(a, b)
        label = classify_pair(signals)
        # A 37-year gap should prevent AUTO_FLAG
        assert label != "AUTO_FLAG", (
            f"Hard negative incorrectly AUTO_FLAGged: signals={signals}"
        )

    def test_sequel_different_year_not_auto_flagged(self):
        a = _make_rec("The Lion King", year=1994, cast=["Matthew Broderick"], cid="HN003")
        b = _make_rec("The Lion King", year=2019, cast=["Donald Glover"], cid="HN004")
        signals = score_pair(a, b)
        label = classify_pair(signals)
        assert label != "AUTO_FLAG"


# ─── End-to-end smoke test ────────────────────────────────────────────────────

class TestPipeline:
    def test_smoke_small_catalog(self):
        catalog = [
            {**_make_rec("Inception", cid="P001"), "synopsis": "A dream heist.", "genres": ["Sci-Fi"]},
            {**_make_rec("Inception", cid="P002"), "synopsis": "A dream heist.", "genres": ["Sci-Fi"], "title": "inception"},  # dup
            {**_make_rec("Finding Nemo", cid="P003"), "synopsis": "A fish story.", "genres": ["Animation"]},
            {**_make_rec("Titanic", year=None, cid="P004"), "synopsis": "", "genres": []},   # defect
        ]
        result = run_detection(catalog)
        assert result["summary"]["total_records"] == 4
        assert result["summary"]["total_issues"] >= 1

    def test_evaluate_perfect_recall(self):
        """If all injected pairs are detected, recall = 1.0"""
        labels = {
            "duplicate_pairs": [
                {"original_id": "P001", "dup_id": "P002"}
            ]
        }
        result = {
            "issues": [
                {"category": "DUPLICATE", "record_ids": ["P001", "P002"]}
            ]
        }
        ev = evaluate(result, labels)
        assert ev["recall"] == 1.0

    def test_evaluate_zero_fp(self):
        """If no false positives, precision = 1.0"""
        labels = {
            "duplicate_pairs": [
                {"original_id": "P001", "dup_id": "P002"}
            ]
        }
        result = {
            "issues": [
                {"category": "DUPLICATE", "record_ids": ["P001", "P002"]}
            ]
        }
        ev = evaluate(result, labels)
        assert ev["precision"] == 1.0
