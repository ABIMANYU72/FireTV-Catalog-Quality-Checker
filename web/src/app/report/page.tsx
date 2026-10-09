'use client';

import { useEffect, useState, useRef } from 'react';
import { Download, Timer, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import type { Issue, Summary, ReviewState } from '@/types';

// xlsx is loaded dynamically to avoid SSR issues
async function exportToXlsx(
  summary: Summary,
  issues: Issue[],
  reviews: ReviewState
): Promise<void> {
  const XLSX = await import('xlsx');

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Summary ─────────────────────────────────────────────────────
  const summaryRows = [
    ['FireTV Catalog Quality Checker – Daily Report'],
    ['Generated', new Date().toISOString()],
    [],
    ['SUMMARY'],
    ['Total Records', summary.total_records],
    ['Total Issues', summary.total_issues],
    [],
    ['DETECTION PERFORMANCE'],
    ['Seeded Dups Detected', summary.seeded_dups_detected ?? '—'],
    ['Total Seeded Dups', summary.total_seeded_dups ?? 100],
    ['Precision', summary.precision !== undefined ? (summary.precision * 100).toFixed(2) + '%' : '—'],
    ['Recall', summary.recall !== undefined ? (summary.recall * 100).toFixed(2) + '%' : '—'],
    ['F1 Score', summary.f1 !== undefined ? (summary.f1 * 100).toFixed(2) + '%' : '—'],
    ['Detection Time (s)', summary.detection_time_seconds ?? '—'],
    [],
    ['ISSUES BY CATEGORY'],
    ...Object.entries(summary.category_counts ?? {}).map(([cat, cnt]) => [cat, cnt]),
    [],
    ['BLOCKING EFFICIENCY'],
    ['Candidate Pairs Evaluated', summary.candidate_pairs],
    ['N² Pairs', summary.n_squared],
    ['Comparisons Saved', summary.comparisons_saved],
    ['Savings %', (summary.comparisons_saved_pct ?? 0).toFixed(2) + '%'],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 35 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // ── Sheet 2: Issues ───────────────────────────────────────────────────────
  const issueHeaders = ['Issue ID', 'Category', 'Severity', 'Record IDs', 'Evidence', 'Suggested Action', 'Review Status'];
  const issueRows = issues.map(iss => [
    iss.id,
    iss.category,
    iss.severity,
    iss.record_ids.join(', '),
    iss.evidence,
    iss.suggested_action,
    reviews[iss.id]?.decision ?? 'PENDING',
  ]);
  const wsIssues = XLSX.utils.aoa_to_sheet([issueHeaders, ...issueRows]);
  wsIssues['!cols'] = [
    { wch: 30 }, { wch: 22 }, { wch: 10 }, { wch: 25 },
    { wch: 60 }, { wch: 50 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, wsIssues, 'Issues');

  // ── Sheet 3: Activity Log ─────────────────────────────────────────────────
  const totalReviewed = Object.keys(reviews).length;
  const accepted = Object.values(reviews).filter(r => r.decision === 'ACCEPTED').length;
  const rejected = Object.values(reviews).filter(r => r.decision === 'REJECTED').length;
  const escalated = Object.values(reviews).filter(r => r.decision === 'ESCALATED').length;
  const trueAccepts = Object.entries(reviews).filter(([id, r]) => {
    const iss = issues.find(i => i.id === id);
    return r.decision === 'ACCEPTED' && iss?.category === 'DUPLICATE';
  }).length;
  const reviewerAcc = totalReviewed > 0
    ? ((accepted - rejected * 0 + escalated * 0) / totalReviewed * 100).toFixed(1) + '%'
    : '—';

  const activityRows = [
    ['Activity Log'],
    ['Generated', new Date().toISOString()],
    [],
    ['Records Reviewed', totalReviewed],
    ['Accepted', accepted],
    ['Rejected', rejected],
    ['Escalated', escalated],
    [],
    ['Errors Found by Category'],
    ...Object.entries(summary.category_counts ?? {}).map(([cat, cnt]) => [cat, cnt]),
    [],
    ['Reviewer Accuracy (accepted / total reviewed)', reviewerAcc],
    [],
    ['Review Details'],
    ['Issue ID', 'Decision', 'Timestamp'],
    ...Object.entries(reviews).map(([id, r]) => [
      id,
      r.decision,
      new Date(r.timestamp).toISOString(),
    ]),
  ];
  const wsActivity = XLSX.utils.aoa_to_sheet(activityRows);
  wsActivity['!cols'] = [{ wch: 35 }, { wch: 15 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, wsActivity, 'Activity Log');

  // ── Write file ─────────────────────────────────────────────────────────────
  XLSX.writeFile(wb, `catalog-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function DailyReportPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [reviews, setReviews] = useState<ReviewState>({});
  const [generating, setGenerating] = useState(false);
  const [genTime, setGenTime] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/data/summary.json').then(r => r.json()).catch(() => null),
      fetch('/data/issues.json').then(r => r.json()).catch(() => []),
    ]).then(([s, iss]) => {
      setSummary(s);
      setIssues(iss);
      setLoading(false);
    });

    const saved = localStorage.getItem('catalog-reviews');
    if (saved) setReviews(JSON.parse(saved));
  }, []);

  const handleExport = async () => {
    if (!summary) return;
    setGenerating(true);
    const t0 = performance.now();
    await exportToXlsx(summary, issues, reviews);
    const elapsed = (performance.now() - t0) / 1000;
    setGenTime(elapsed);
    setGenerating(false);
  };

  const reviewed = Object.keys(reviews).length;
  const accepted = Object.values(reviews).filter(r => r.decision === 'ACCEPTED').length;
  const rejected = Object.values(reviews).filter(r => r.decision === 'REJECTED').length;
  const escalated = Object.values(reviews).filter(r => r.decision === 'ESCALATED').length;

  if (loading) {
    return (
      <div className="p-8">
        <div className="shimmer h-8 w-48 rounded mb-6" />
        <div className="shimmer h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-8 page-enter">
      <div className="mb-8">
        <h1 className="text-2xl font-bold gradient-text mb-1">Daily Report</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Export a complete Excel report with Summary, Issues, and Activity Log.
        </p>
      </div>

      {/* Report preview */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        {/* Reviewer activity */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 size={14} style={{ color: 'var(--accent-emerald)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Activity Log</h2>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Total Reviewed', value: reviewed, color: 'var(--text-primary)' },
              { label: 'Accepted', value: accepted, color: '#34d399' },
              { label: 'Rejected', value: rejected, color: '#fb7185' },
              { label: 'Escalated', value: escalated, color: '#fbbf24' },
              {
                label: 'Reviewer Accuracy',
                value: reviewed > 0 ? `${((accepted / reviewed) * 100).toFixed(0)}%` : '—',
                color: '#6366f1',
              },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                <span className="font-semibold" style={{ color }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Issues summary */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileSpreadsheet size={14} style={{ color: 'var(--accent-purple)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Issues Summary</h2>
          </div>
          <div className="space-y-2">
            {Object.entries(summary?.category_counts ?? {}).map(([cat, count]) => (
              <div key={cat} className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>{cat.replace(/_/g, ' ')}</span>
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{count}</span>
              </div>
            ))}
            <div className="border-t pt-2 mt-2 flex justify-between text-sm font-semibold" style={{ borderColor: 'var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>TOTAL</span>
              <span style={{ color: 'var(--text-primary)' }}>{summary?.total_issues ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Performance */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Timer size={14} style={{ color: 'var(--accent-cyan)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Detection Performance</h2>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Records', value: summary?.total_records?.toLocaleString() ?? '—' },
              {
                label: 'Precision',
                value: summary?.precision !== undefined ? `${(summary.precision * 100).toFixed(1)}%` : '—',
              },
              {
                label: 'Recall',
                value: summary?.recall !== undefined ? `${(summary.recall * 100).toFixed(1)}%` : '—',
              },
              {
                label: 'F1',
                value: summary?.f1 !== undefined ? `${(summary.f1 * 100).toFixed(1)}%` : '—',
              },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Export button */}
      <div className="glass-card p-8 flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-cyan))' }}>
          <FileSpreadsheet size={28} className="text-white" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
            Export Daily Report
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Downloads a .xlsx file with 3 sheets: Summary · Issues · Activity Log
          </p>
        </div>
        <button
          id="btn-export-report"
          onClick={handleExport}
          disabled={generating || !summary}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white transition-all"
          style={{
            background: generating
              ? 'var(--bg-tertiary)'
              : 'linear-gradient(135deg, var(--accent-purple), var(--accent-blue))',
            cursor: generating ? 'wait' : 'pointer',
            boxShadow: generating ? 'none' : '0 0 20px rgba(99,102,241,0.4)',
          }}
        >
          <Download size={16} />
          {generating ? 'Generating…' : 'Download .xlsx'}
        </button>

        {genTime !== null && (
          <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--accent-emerald)' }}>
            <CheckCircle2 size={14} />
            Report generated in {genTime.toFixed(3)}s
          </div>
        )}
      </div>
    </div>
  );
}
