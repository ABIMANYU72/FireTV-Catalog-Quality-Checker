# Standard Operating Procedure (SOP)
# FireTV Catalog Quality Checker

**Version:** 1.0  
**Owner:** Catalog Quality Team  
**Last Updated:** 2026-10-09

---

## 1. Purpose

This SOP defines the four canonical issue categories used by the Catalog Quality Checker, describes the severity levels, and specifies the required action for each. All reviewers and automated systems must classify issues using exactly these categories.

---

## 2. Scope

Applies to all records in the streaming content catalog ingested from any provider. The checker runs daily (or on-demand) and exports results to the reviewer dashboard.

---

## 3. Issue Categories

Every detected issue must be classified into **exactly one** of the following four categories:

### 3.1 DUPLICATE

**Definition:** Two or more catalog records refer to the same content asset (same title, same year, same language/version) but exist as separate entries.

**Severity Levels:**

| Severity | Condition |
|----------|-----------|
| HIGH | Composite similarity score ≥ 0.82 (AUTO_FLAG) |
| MEDIUM | Composite similarity score ≥ 0.65 (NEEDS_REVIEW) |

**Evidence Required:** Token-set ratio, weighted ratio, year proximity, language match, runtime closeness, cast overlap scores, and composite score.

**Suggested Actions:**
- **AUTO_FLAG (HIGH):** Automatically merge or suppress the lower-confidence record. Reviewer confirms merge within 24 hours.
- **NEEDS_REVIEW (MEDIUM):** Place in manual review queue. Reviewer decides merge, mark as intentional variant, or dismiss within 48 hours.

**Hard Negatives (DO NOT flag):**
- Remakes: same title, release year differs by > 2 years
- Sequels with the same franchise title but different years
- Regional variants with different language codes

---

### 3.2 MISSING_METADATA

**Definition:** A required metadata field is absent or empty for a catalog record.

**Required Fields (all must be present):**

| Field | Severity if Missing |
|-------|---------------------|
| title | HIGH |
| year | MEDIUM |
| language | MEDIUM |
| synopsis | LOW |
| genres | LOW |
| cast | LOW |
| certification | LOW |

**Suggested Action:** Fetch missing metadata from the TMDB API using the `tmdb_id` field. If `tmdb_id` is also missing, escalate to the content provider.

---

### 3.3 METADATA_MISMATCH

**Definition:** A metadata field value is present but differs from the authoritative source (TMDB) by more than the acceptable tolerance.

**Mismatch Rules:**

| Field | Acceptable Tolerance |
|-------|---------------------|
| year | ±1 year |
| runtime | ±10 minutes |
| language | Exact match required |
| title | Same after normalisation |

**Severity:** MEDIUM for year/runtime; HIGH for language/title.

**Suggested Action:** Update the catalog field to match the TMDB value. Document the correction in the activity log.

---

### 3.4 INVALID_FORMAT

**Definition:** A metadata field is present but contains a value that is syntactically or semantically invalid.

**Invalid Format Examples:**

| Field | Invalid Example | Rule |
|-------|----------------|------|
| year | "20211" | Must be 4-digit integer between 1888 and current_year+2 |
| year | 1800 | Must be ≥ 1888 (first motion picture) |
| runtime | -90 | Must be a positive integer |
| runtime | "two hours" | Must be numeric (minutes) |

**Severity:** HIGH for all format errors (they break downstream systems).

**Suggested Action:** Correct the field to a valid format per the rules above. Log the correction.

---

## 4. Severity Definitions

| Severity | SLA | Meaning |
|----------|-----|---------|
| HIGH | 24 hours | Causes downstream failures or wrong content served |
| MEDIUM | 48 hours | Degrades search/recommendation quality |
| LOW | 7 days | Minor quality issue, no immediate customer impact |

---

## 5. Reviewer Actions

Each issue in the dashboard supports three reviewer actions:

| Action | Keyboard | Meaning |
|--------|----------|---------|
| Accept | `A` | Confirm the issue is real; correction applied |
| Reject | `R` | Dismiss the issue (false positive) |
| Escalate | `E` | Escalate to senior reviewer or content provider |

Navigate between issues with `J` (next) / `K` (previous).

All decisions persist in `localStorage` and are exported to the Daily Report.

---

## 6. Threshold Configuration

The Threshold Lab slider allows reviewers to adjust the composite score boundary between AUTO_FLAG and NEEDS_REVIEW. Changes are non-destructive and applied to the pre-computed pair scores. The default thresholds are:

- **AUTO_FLAG:** ≥ 0.82
- **NEEDS_REVIEW:** ≥ 0.65
- **DISTINCT:** < 0.65

---

## 7. Daily Report

The one-click Excel export contains three sheets:

| Sheet | Contents |
|-------|---------|
| Summary | KPI metrics, precision/recall/F1, category counts |
| Issues | All detected issues with evidence and status |
| Activity Log | Reviewer decisions, timestamps, accuracy % |

---

## 8. Limitations

1. The duplicate detector relies on title similarity; it may miss duplicates with completely different titles (e.g., alternate-language titles not in the known mapping).
2. METADATA_MISMATCH detection requires a TMDB API call at detection time; in offline mode, only MISSING_METADATA and INVALID_FORMAT are detected.
3. Hard-negative rules (remakes/sequels) use year proximity as a proxy; a remake in the same year will still be flagged and requires manual review.

---

*This product uses the TMDB API but is not endorsed or certified by TMDB.*
