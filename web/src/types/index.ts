// types/index.ts
// Shared TypeScript types for the dashboard

export interface Issue {
  id: string;
  category: 'DUPLICATE' | 'MISSING_METADATA' | 'METADATA_MISMATCH' | 'INVALID_FORMAT';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  record_ids: string[];
  evidence: string;
  suggested_action: string;
  signals?: Record<string, number>;
  label?: 'AUTO_FLAG' | 'NEEDS_REVIEW' | 'DISTINCT';
  fields?: string[];
}

export interface PairScore {
  id_a: string;
  id_b: string;
  title_a: string;
  title_b: string;
  year_a: number | null;
  year_b: number | null;
  signals: {
    token_set_ratio: number;
    wratio: number;
    year_proximity: number;
    language_match: number;
    runtime_closeness: number;
    cast_overlap: number;
    composite: number;
  };
  label: 'AUTO_FLAG' | 'NEEDS_REVIEW' | 'DISTINCT';
}

export interface Summary {
  total_records: number;
  total_issues: number;
  category_counts: Record<string, number>;
  candidate_pairs: number;
  n_squared: number;
  comparisons_saved: number;
  comparisons_saved_pct: number;
  auto_flagged: number;
  needs_review: number;
  detection_time_seconds?: number;
  // Eval
  true_positives?: number;
  false_positives?: number;
  false_negatives?: number;
  seeded_dups_detected?: number;
  total_seeded_dups?: number;
  precision?: number;
  recall?: number;
  f1?: number;
}

export interface Benchmark {
  measured: {
    catalog_records: number;
    detection_time_seconds: number;
    report_generation_time_seconds: number;
    total_issues_found: number;
    candidate_pairs_evaluated: number;
    n_squared_pairs: number;
    comparisons_saved: number;
    comparisons_saved_pct: number;
  };
  manual_baseline_ESTIMATES: {
    note: string;
    seconds_per_record: number;
    report_minutes: number;
    total_manual_review_seconds: number;
    total_manual_report_seconds: number;
  };
  time_savings_ESTIMATES: {
    note: string;
    review_time_saved_seconds: number;
    report_time_saved_seconds: number;
    total_time_saved_seconds: number;
    total_time_saved_minutes: number;
    speedup_factor: number;
  };
}

export interface CatalogRecord {
  catalog_id: string;
  title: string;
  original_title?: string;
  year?: number | string | null;
  genres?: string[];
  language?: string;
  runtime?: number | null;
  cast?: string[];
  synopsis?: string;
  certification?: string;
  media_type?: string;
}

export type ReviewDecision = 'ACCEPTED' | 'REJECTED' | 'ESCALATED';

export interface ReviewState {
  [issueId: string]: {
    decision: ReviewDecision;
    timestamp: number;
  };
}
