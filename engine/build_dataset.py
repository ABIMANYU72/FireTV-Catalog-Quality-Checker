"""
build_dataset.py
----------------
Fetches ~900 real movies/TV titles from the TMDB API, caches to
data/ground_truth.json, then builds a 1 000-record catalog (seed=42)
with injected duplicates and metadata defects.

Outputs
-------
data/ground_truth.json     – TMDB cache (committed)
data/catalog.json          – 1 000-record catalog fed to the detector
data/seeded_labels.json    – hidden answer key (never read by detector)
"""

from __future__ import annotations

import json
import os
import random
import re
import sys
import time
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

# ── paths ────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)

GROUND_TRUTH_PATH = DATA_DIR / "ground_truth.json"
CATALOG_PATH = DATA_DIR / "catalog.json"
LABELS_PATH = DATA_DIR / "seeded_labels.json"

TMDB_BASE = "https://api.themoviedb.org/3"

load_dotenv(ROOT / ".env")
API_KEY = os.getenv("TMDB_API_KEY", "")

SEED = 42
TARGET_RECORDS = 1000
NUM_DUPS = 100          # exactly 100 injected duplicate rows
DEFECT_RATE = 0.15      # ~15 % metadata defects on non-dup rows

# ── TMDB helpers ─────────────────────────────────────────────────────────────

session = requests.Session()

def _get(endpoint: str, params: dict) -> dict:
    params["api_key"] = API_KEY
    for attempt in range(3):
        try:
            r = session.get(f"{TMDB_BASE}{endpoint}", params=params, timeout=10)
            r.raise_for_status()
            return r.json()
        except Exception as exc:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)
    return {}


def fetch_page(media_type: str, list_type: str, page: int) -> list[dict]:
    """Fetch one page of movie or TV titles from TMDB."""
    data = _get(f"/{media_type}/{list_type}", {"page": page, "language": "en-US"})
    return data.get("results", [])


def fetch_credits(media_type: str, tmdb_id: int) -> list[str]:
    """Return top-3 cast names for a title."""
    try:
        data = _get(f"/{media_type}/{tmdb_id}/credits", {})
        cast = data.get("cast", [])
        return [c["name"] for c in cast[:3]]
    except Exception:
        return []


def fetch_certification(media_type: str, tmdb_id: int) -> str:
    """Return US certification (rating)."""
    try:
        if media_type == "movie":
            data = _get(f"/movie/{tmdb_id}/release_dates", {})
            for entry in data.get("results", []):
                if entry.get("iso_3166_1") == "US":
                    for rd in entry.get("release_dates", []):
                        cert = rd.get("certification", "")
                        if cert:
                            return cert
        else:
            data = _get(f"/tv/{tmdb_id}/content_ratings", {})
            for entry in data.get("results", []):
                if entry.get("iso_3166_1") == "US":
                    return entry.get("rating", "")
    except Exception:
        pass
    return ""


def build_record(raw: dict, media_type: str, genres_map: dict[int, str]) -> dict:
    title = raw.get("title") or raw.get("name") or ""
    original_title = raw.get("original_title") or raw.get("original_name") or title
    release = raw.get("release_date") or raw.get("first_air_date") or ""
    year = int(release[:4]) if release and release[:4].isdigit() else None
    genre_ids = raw.get("genre_ids", [])
    genres = [genres_map.get(gid, "") for gid in genre_ids if gid in genres_map]
    language = raw.get("original_language", "")
    runtime = raw.get("runtime")  # may be None; fill later if needed
    synopsis = raw.get("overview", "")
    return {
        "tmdb_id": raw.get("id"),
        "media_type": media_type,
        "title": title,
        "original_title": original_title,
        "year": year,
        "genres": genres,
        "language": language,
        "runtime": runtime,
        "cast": [],   # filled separately
        "synopsis": synopsis,
        "certification": "",
    }


def fetch_ground_truth() -> list[dict]:
    """Fetch ~900 titles from TMDB (popular + top_rated, movies + TV)."""
    print("Fetching genre maps …")
    movie_genres = {
        g["id"]: g["name"]
        for g in _get("/genre/movie/list", {}).get("genres", [])
    }
    tv_genres = {
        g["id"]: g["name"]
        for g in _get("/genre/tv/list", {}).get("genres", [])
    }

    records: list[dict] = []
    seen_ids: set[str] = set()

    combos = [
        ("movie", "popular"),
        ("movie", "top_rated"),
        ("tv", "popular"),
        ("tv", "top_rated"),
    ]

    pages_per_combo = 12   # 12 pages × 20 results × 4 combos = 960 raw
    for media_type, list_type in combos:
        genres_map = movie_genres if media_type == "movie" else tv_genres
        print(f"  Fetching {media_type}/{list_type} …")
        for page in range(1, pages_per_combo + 1):
            try:
                results = fetch_page(media_type, list_type, page)
                time.sleep(0.05)
            except Exception as exc:
                print(f"    page {page} failed: {exc}")
                continue
            for raw in results:
                uid = f"{media_type}-{raw.get('id')}"
                if uid in seen_ids:
                    continue
                seen_ids.add(uid)
                rec = build_record(raw, media_type, genres_map)
                if rec["title"]:
                    records.append(rec)

    # Enrich with credits + certification (sampled to stay under rate limit)
    print(f"Enriching {len(records)} records with credits …")
    for i, rec in enumerate(records):
        if i % 50 == 0:
            print(f"  {i}/{len(records)} …")
        try:
            rec["cast"] = fetch_credits(rec["media_type"], rec["tmdb_id"])
            rec["certification"] = fetch_certification(rec["media_type"], rec["tmdb_id"])
        except Exception:
            pass
        time.sleep(0.04)   # ~25 req/s – well under TMDB's 40 req/10 s limit

    print(f"Fetched {len(records)} unique titles.")
    return records


# ── corruption helpers ────────────────────────────────────────────────────────

ARTICLES = {"the", "a", "an"}

ROMAN = {
    "I": "1", "II": "2", "III": "3", "IV": "4", "V": "5",
    "VI": "6", "VII": "7", "VIII": "8", "IX": "9", "X": "10",
    "XI": "11", "XII": "12",
}
DIGIT_TO_ROMAN = {v: k for k, v in ROMAN.items()}

NUMBER_WORDS = {
    "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
    "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10",
}


def _drop_article(title: str) -> str:
    words = title.split()
    if words and words[0].lower() in ARTICLES:
        return " ".join(words[1:])
    return title


def _add_article(title: str) -> str:
    words = title.split()
    if not words or words[0].lower() in ARTICLES:
        return title
    return "The " + title


def _roman_to_digit(title: str) -> str:
    words = title.split()
    out = []
    for w in words:
        out.append(ROMAN.get(w.upper(), w))
    return " ".join(out)


def _digit_to_roman(title: str) -> str:
    words = title.split()
    out = []
    for w in words:
        out.append(DIGIT_TO_ROMAN.get(w, w))
    return " ".join(out)


def _drop_subtitle(title: str) -> str:
    for sep in (":", " - ", " – "):
        if sep in title:
            return title.split(sep)[0].strip()
    return title


def _typo(title: str, rng: random.Random) -> str:
    if len(title) < 4:
        return title
    i = rng.randint(1, len(title) - 2)
    chars = list(title)
    chars[i], chars[i + 1] = chars[i + 1], chars[i]
    return "".join(chars)


def _year_suffix(title: str, year: int | None) -> str:
    y = year or 2021
    return f"{title} ({y})"


def corrupt_title(title: str, year: int | None, strategy: int, rng: random.Random) -> str:
    """Apply one of 10 corruption strategies to a title."""
    s = strategy % 10
    if s == 0:
        return title.upper()
    elif s == 1:
        return title.lower()
    elif s == 2:
        return _drop_article(title)
    elif s == 3:
        return _add_article(title)
    elif s == 4:
        return _drop_subtitle(title)
    elif s == 5:
        return _year_suffix(title, year)
    elif s == 6:
        return _typo(title, rng)
    elif s == 7:
        return re.sub(r"[^\w\s]", "", title)          # strip punctuation
    elif s == 8:
        return _roman_to_digit(title)
    else:
        return _digit_to_roman(title)


# ── catalog builder ───────────────────────────────────────────────────────────

def build_catalog(ground_truth: list[dict]) -> tuple[list[dict], dict]:
    """
    Returns (catalog_records, labels).
    catalog_records – 1 000 rows (some with corrupted titles / metadata defects)
    labels          – {"duplicate_pairs": [...], "defect_ids": [...]}
    """
    rng = random.Random(SEED)

    # Base pool: sample up to (TARGET - NUM_DUPS) from ground truth
    base_size = TARGET_RECORDS - NUM_DUPS
    pool = rng.sample(ground_truth, min(base_size, len(ground_truth)))

    # Assign catalog IDs
    catalog: list[dict] = []
    for i, rec in enumerate(pool):
        row = dict(rec)
        row["catalog_id"] = f"C{i:04d}"
        catalog.append(row)

    # Inject EXACTLY 100 duplicate rows
    dup_sources = rng.choices(catalog[:500], k=NUM_DUPS)   # pick from first 500
    dup_pairs: list[dict] = []

    for j, src in enumerate(dup_sources):
        strategy = j % 10
        dup = dict(src)
        dup["catalog_id"] = f"D{j:04d}"
        dup["title"] = corrupt_title(src["title"], src.get("year"), strategy, rng)

        # Year corruption on ~30 % of dups
        if rng.random() < 0.30 and dup.get("year"):
            dup["year"] = dup["year"] + rng.choice([-1, 1])

        # Slight language variation on ~10 %
        if rng.random() < 0.10:
            dup["language"] = rng.choice(["en", "EN", "english"])

        dup_pairs.append({"original_id": src["catalog_id"], "dup_id": dup["catalog_id"]})
        catalog.append(dup)

    # Hard negatives: remakes/sequels that must NOT be flagged
    # Already present in ground_truth (same title different year) - kept as-is.
    # We mark them explicitly so tests can verify precision.
    hard_negative_ids: list[str] = []
    title_year_map: dict[str, list] = {}
    for row in catalog:
        key = row["title"].lower().strip()
        title_year_map.setdefault(key, []).append(row)
    for key, rows in title_year_map.items():
        if len(rows) >= 2:
            years = [r.get("year") for r in rows if r.get("year")]
            if len(set(years)) >= 2:   # same title, different years → hard negative
                for r in rows:
                    hard_negative_ids.append(r["catalog_id"])

    # Inject ~15 % metadata defects on non-dup rows
    non_dup_ids = [r["catalog_id"] for r in catalog if not r["catalog_id"].startswith("D")]
    defect_targets = rng.sample(non_dup_ids, int(len(non_dup_ids) * DEFECT_RATE))
    defect_map: dict[str, list[str]] = {}

    defect_by_id = {r["catalog_id"]: r for r in catalog}

    defect_choices = [
        "missing_title", "missing_year", "missing_language",
        "wrong_year", "invalid_year_format", "negative_runtime",
        "missing_synopsis", "missing_genres",
    ]

    for cid in defect_targets:
        row = defect_by_id[cid]
        defect_type = rng.choice(defect_choices)
        applied: list[str] = []

        if defect_type == "missing_title":
            row["title"] = ""
            applied.append("missing_title")
        elif defect_type == "missing_year":
            row["year"] = None
            applied.append("missing_year")
        elif defect_type == "missing_language":
            row["language"] = ""
            applied.append("missing_language")
        elif defect_type == "wrong_year" and row.get("year"):
            row["year"] = row["year"] + rng.randint(2, 10)
            applied.append("wrong_year")
        elif defect_type == "invalid_year_format":
            row["year"] = "20211"   # string, not int, wrong format
            applied.append("invalid_year_format")
        elif defect_type == "negative_runtime":
            row["runtime"] = -abs(row.get("runtime") or 90)
            applied.append("negative_runtime")
        elif defect_type == "missing_synopsis":
            row["synopsis"] = ""
            applied.append("missing_synopsis")
        elif defect_type == "missing_genres":
            row["genres"] = []
            applied.append("missing_genres")

        if applied:
            defect_map[cid] = applied

    # Shuffle the final catalog
    rng.shuffle(catalog)
    for idx, row in enumerate(catalog):
        row["row_index"] = idx

    labels = {
        "duplicate_pairs": dup_pairs,
        "defect_ids": defect_map,
        "hard_negative_ids": hard_negative_ids,
        "seed": SEED,
        "total_records": len(catalog),
        "injected_dups": NUM_DUPS,
    }

    return catalog, labels


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    # Load or fetch ground truth
    if GROUND_TRUTH_PATH.exists():
        print(f"Loading cache from {GROUND_TRUTH_PATH}")
        with open(GROUND_TRUTH_PATH, encoding="utf-8") as f:
            ground_truth = json.load(f)
    elif API_KEY:
        print("API key found – fetching from TMDB …")
        ground_truth = fetch_ground_truth()
        with open(GROUND_TRUTH_PATH, "w", encoding="utf-8") as f:
            json.dump(ground_truth, f, ensure_ascii=False, indent=2)
        print(f"Saved {len(ground_truth)} records to {GROUND_TRUTH_PATH}")
    else:
        print("ERROR: No TMDB API key and no cache file found. Exiting.", file=sys.stderr)
        sys.exit(1)

    print("Building catalog …")
    catalog, labels = build_catalog(ground_truth)

    with open(CATALOG_PATH, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)
    print(f"Saved catalog ({len(catalog)} records) to {CATALOG_PATH}")

    with open(LABELS_PATH, "w", encoding="utf-8") as f:
        json.dump(labels, f, ensure_ascii=False, indent=2)
    print(f"Saved labels to {LABELS_PATH}")
    print("Done.")


if __name__ == "__main__":
    main()
