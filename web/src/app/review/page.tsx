'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Search, Filter, ChevronDown, Check, X, ArrowUpRight, Info } from 'lucide-react';
import type { Issue, CatalogRecord, ReviewState, ReviewDecision } from '@/types';

const CATEGORY_LABELS: Record<string, string> = {
  DUPLICATE: 'Duplicate',
  MISSING_METADATA: 'Missing Metadata',
  METADATA_MISMATCH: 'Metadata Mismatch',
  INVALID_FORMAT: 'Invalid Format',
};

function RecordCard({
  record,
  compareRecord,
  label,
}: {
  record: CatalogRecord;
  compareRecord?: CatalogRecord;
  label: string;
}) {
  const fields: Array<{ key: keyof CatalogRecord; label: string }> = [
    { key: 'title', label: 'Title' },
    { key: 'year', label: 'Year' },
    { key: 'language', label: 'Language' },
    { key: 'runtime', label: 'Runtime' },
    { key: 'genres', label: 'Genres' },
    { key: 'synopsis', label: 'Synopsis' },
    { key: 'certification', label: 'Certification' },
  ];

  const isDifferent = (key: keyof CatalogRecord) => {
    if (!compareRecord) return false;
    const a = JSON.stringify(record[key]);
    const b = JSON.stringify(compareRecord[key]);
    return a !== b;
  };

  return (
    <div className="glass-card p-4 flex-1">
      <div className="text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2"
        style={{ color: 'var(--text-muted)' }}>
        <span className="w-2 h-2 rounded-full" style={{ background: label === 'Record A' ? 'var(--accent-purple)' : 'var(--accent-cyan)' }} />
        {label}
        <span className="mono ml-auto" style={{ color: 'var(--text-muted)' }}>{record.catalog_id}</span>
      </div>
      <div className="space-y-2">
        {fields.map(({ key, label: fLabel }) => {
          const val = record[key];
          const changed = isDifferent(key);
          const displayVal = Array.isArray(val) ? val.join(', ') : String(val ?? '—');
          return (
            <div key={key} className="flex gap-2 text-xs">
              <span className="w-24 shrink-0 font-medium" style={{ color: 'var(--text-muted)' }}>
                {fLabel}
              </span>
              <span
                className={`flex-1 leading-relaxed ${changed ? 'diff-changed' : 'diff-same'}`}
                title={changed ? 'Differs from paired record' : ''}
              >
                {displayVal || <em style={{ color: 'var(--text-muted)' }}>empty</em>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SignalBar({ name, value }: { name: string; value: number }) {
  const colors: Record<string, string> = {
    token_set_ratio: '#6366f1',
    wratio: '#8b5cf6',
    year_proximity: '#06b6d4',
    language_match: '#10b981',
    runtime_closeness: '#f59e0b',
    cast_overlap: '#f43f5e',
    composite: '#f0f4ff',
  };
  const color = colors[name] ?? '#6366f1';
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span style={{ color: 'var(--text-secondary)' }}>{name.replace(/_/g, ' ')}</span>
        <span style={{ color }}>{(value * 100).toFixed(0)}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
        <div className="h-full rounded-full" style={{ width: `${value * 100}%`, background: color }} />
      </div>
    </div>
  );
}

export default function ReviewPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [catalog, setCatalog] = useState<CatalogRecord[]>([]);
  const [reviews, setReviews] = useState<ReviewState>({});
  const [selected, setSelected] = useState<Issue | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [filterCat, setFilterCat] = useState<string>('ALL');
  const [filterSev, setFilterSev] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      fetch('/data/issues.json').then(r => r.json()).catch(() => []),
      fetch('/data/catalog.json').then(r => r.json()).catch(() => []),
    ]).then(([iss, cat]) => {
      setIssues(iss);
      setCatalog(cat);
      if (iss.length) setSelected(iss[0]);
      setLoading(false);
    });

    const saved = localStorage.getItem('catalog-reviews');
    if (saved) setReviews(JSON.parse(saved));
  }, []);

  const filteredIssues = issues.filter(iss => {
    if (filterCat !== 'ALL' && iss.category !== filterCat) return false;
    if (filterSev !== 'ALL' && iss.severity !== filterSev) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!iss.id.toLowerCase().includes(s) && !iss.evidence.toLowerCase().includes(s) &&
        !iss.record_ids.join(' ').toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const decide = useCallback((decision: ReviewDecision) => {
    if (!selected) return;
    const next: ReviewState = {
      ...reviews,
      [selected.id]: { decision, timestamp: Date.now() },
    };
    setReviews(next);
    localStorage.setItem('catalog-reviews', JSON.stringify(next));
  }, [selected, reviews]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'j' || e.key === 'J') {
        setSelectedIdx(i => {
          const next = Math.min(i + 1, filteredIssues.length - 1);
          setSelected(filteredIssues[next]);
          return next;
        });
      } else if (e.key === 'k' || e.key === 'K') {
        setSelectedIdx(i => {
          const prev = Math.max(i - 1, 0);
          setSelected(filteredIssues[prev]);
          return prev;
        });
      } else if (e.key === 'a' || e.key === 'A') {
        decide('ACCEPTED');
      } else if (e.key === 'r' || e.key === 'R') {
        decide('REJECTED');
      } else if (e.key === 'e' || e.key === 'E') {
        decide('ESCALATED');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [filteredIssues, decide]);

  const catalogMap = Object.fromEntries(catalog.map(r => [r.catalog_id, r]));

  const getDecisionStyle = (issueId: string) => {
    const d = reviews[issueId]?.decision;
    if (d === 'ACCEPTED') return 'border-l-2 border-l-green-500';
    if (d === 'REJECTED') return 'border-l-2 border-l-red-500';
    if (d === 'ESCALATED') return 'border-l-2 border-l-amber-500';
    return '';
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="shimmer h-8 w-48 rounded mb-6" />
        <div className="shimmer h-96 rounded-xl" />
      </div>
    );
  }

  const recA = selected?.record_ids[0] ? catalogMap[selected.record_ids[0]] : undefined;
  const recB = selected?.record_ids[1] ? catalogMap[selected.record_ids[1]] : undefined;

  const reviewed = Object.keys(reviews).length;
  const total = issues.length;

  return (
    <div className="flex flex-col h-screen page-enter" ref={containerRef}>
      {/* Header */}
      <div className="px-8 py-5 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold gradient-text">Review Queue</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {reviewed} / {total} reviewed · Shortcuts: J/K navigate · A accept · R reject · E escalate
            </p>
          </div>
          {/* Progress */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {total > 0 ? Math.round((reviewed / total) * 100) : 0}%
              </div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>complete</div>
            </div>
            <div className="w-24 h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${total > 0 ? (reviewed / total) * 100 : 0}%`, background: 'var(--accent-purple)' }}
              />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mt-4">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search issues…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-lg text-xs outline-none"
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                width: 200,
              }}
            />
          </div>
          <select
            value={filterCat}
            onChange={e => setFilterCat(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs outline-none"
            style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          >
            <option value="ALL">All Categories</option>
            {Object.keys(CATEGORY_LABELS).map(cat => (
              <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
            ))}
          </select>
          <select
            value={filterSev}
            onChange={e => setFilterSev(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs outline-none"
            style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          >
            <option value="ALL">All Severities</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <span className="ml-auto text-xs self-center" style={{ color: 'var(--text-muted)' }}>
            {filteredIssues.length} issues
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Issue list */}
        <div
          className="w-80 shrink-0 overflow-y-auto border-r"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
        >
          {filteredIssues.length === 0 ? (
            <div className="p-6 text-center" style={{ color: 'var(--text-muted)' }}>
              No issues match your filters
            </div>
          ) : (
            filteredIssues.map((iss, idx) => {
              const isActive = selected?.id === iss.id;
              const dec = reviews[iss.id]?.decision;
              return (
                <button
                  key={iss.id}
                  onClick={() => { setSelected(iss); setSelectedIdx(idx); }}
                  className={`w-full text-left px-4 py-3 border-b transition-colors ${getDecisionStyle(iss.id)}`}
                  style={{
                    borderColor: 'var(--border)',
                    background: isActive ? 'rgba(99,102,241,0.08)' : 'transparent',
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="mono text-xs" style={{ color: 'var(--text-muted)' }}>{iss.id}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium badge-${iss.severity.toLowerCase()}`}>
                      {iss.severity}
                    </span>
                  </div>
                  <div className="mt-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded badge-${iss.category}`}>
                      {CATEGORY_LABELS[iss.category] ?? iss.category}
                    </span>
                  </div>
                  <div className="mt-1.5 text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                    {iss.evidence.substring(0, 60)}…
                  </div>
                  {dec && (
                    <div className="mt-1 text-xs font-medium"
                      style={{ color: dec === 'ACCEPTED' ? '#34d399' : dec === 'REJECTED' ? '#fb7185' : '#fbbf24' }}>
                      ✓ {dec}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Detail panel */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selected ? (
            <div className="h-full flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
              Select an issue from the list
            </div>
          ) : (
            <div className="space-y-5">
              {/* Issue header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded badge-${selected.category}`}>
                      {CATEGORY_LABELS[selected.category] ?? selected.category}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded badge-${selected.severity.toLowerCase()}`}>
                      {selected.severity}
                    </span>
                    {selected.label && (
                      <span className={`text-xs px-2 py-0.5 rounded badge-${selected.label === 'AUTO_FLAG' ? 'auto' : selected.label === 'NEEDS_REVIEW' ? 'review' : 'distinct'}`}>
                        {selected.label}
                      </span>
                    )}
                  </div>
                  <div className="mono text-sm" style={{ color: 'var(--text-muted)' }}>{selected.id}</div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    id="btn-accept"
                    onClick={() => decide('ACCEPTED')}
                    className="btn-accept px-3 py-1.5 rounded-lg text-xs font-medium"
                  >
                    Accept (A)
                  </button>
                  <button
                    id="btn-reject"
                    onClick={() => decide('REJECTED')}
                    className="btn-reject px-3 py-1.5 rounded-lg text-xs font-medium"
                  >
                    Reject (R)
                  </button>
                  <button
                    id="btn-escalate"
                    onClick={() => decide('ESCALATED')}
                    className="btn-escalate px-3 py-1.5 rounded-lg text-xs font-medium"
                  >
                    Escalate (E)
                  </button>
                </div>
              </div>

              {/* Evidence */}
              <div className="glass-card p-4">
                <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                  Evidence
                </div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{selected.evidence}</p>
                <div className="mt-3 p-3 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--accent-cyan)' }}>Suggested Action</div>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{selected.suggested_action}</p>
                </div>
              </div>

              {/* Signal breakdown for duplicates */}
              {selected.signals && (
                <div className="glass-card p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                    Signal Breakdown
                  </div>
                  <div className="space-y-2">
                    {Object.entries(selected.signals).map(([name, value]) => (
                      <SignalBar key={name} name={name} value={value as number} />
                    ))}
                  </div>
                </div>
              )}

              {/* Record comparison */}
              {(recA || recB) && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                    Side-by-Side Comparison
                  </div>
                  <div className="flex gap-4">
                    {recA && <RecordCard record={recA} compareRecord={recB} label="Record A" />}
                    {recB && <RecordCard record={recB} compareRecord={recA} label="Record B" />}
                  </div>
                </div>
              )}

              {/* Single record detail */}
              {!recB && recA && (
                <div className="glass-card p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                    Record Detail
                  </div>
                  <RecordCard record={recA} label="Record" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
