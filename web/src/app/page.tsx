'use client';

import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend,
} from 'recharts';
import {
  Database, AlertTriangle, CheckCircle2, Clock, Zap, Target, TrendingUp,
} from 'lucide-react';
import type { Summary, Benchmark } from '@/types';

const CATEGORY_COLORS: Record<string, string> = {
  DUPLICATE: '#6366f1',
  MISSING_METADATA: '#f59e0b',
  METADATA_MISMATCH: '#06b6d4',
  INVALID_FORMAT: '#f43f5e',
};

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color = '#6366f1',
  glow = false,
}: {
  icon: React.ComponentType<any>;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={`glass-card p-5 flex flex-col gap-3 ${glow ? 'kpi-glow' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${color}22` }}
        >
          <Icon size={15} style={{ color }} />
        </div>
      </div>
      <div>
        <div className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {value}
        </div>
        {sub && (
          <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ color }}>{(value * 100).toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value * 100}%`, background: color }}
        />
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/data/summary.json').then(r => r.json()).catch(() => null),
      fetch('/data/benchmark.json').then(r => r.json()).catch(() => null),
    ]).then(([s, b]) => {
      setSummary(s);
      setBenchmark(b);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="p-8 page-enter">
        <div className="shimmer h-8 w-48 rounded mb-8" />
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => <div key={i} className="shimmer h-32 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-screen">
        <AlertTriangle size={48} style={{ color: 'var(--accent-amber)' }} className="mb-4" />
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          No data found
        </h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          Run <code className="mono px-2 py-0.5 rounded" style={{ background: 'var(--bg-tertiary)' }}>python run_pipeline.py</code> first to generate dashboard data.
        </p>
      </div>
    );
  }

  const categoryData = Object.entries(summary.category_counts || {}).map(([name, count]) => ({
    name: name.replace(/_/g, ' '),
    rawName: name,
    count,
  }));

  const timeSaved = benchmark?.time_savings_ESTIMATES?.total_time_saved_minutes ?? null;
  const speedup = benchmark?.time_savings_ESTIMATES?.speedup_factor ?? null;
  const detectionSecs = summary.detection_time_seconds ?? benchmark?.measured?.detection_time_seconds;

  return (
    <div className="p-8 page-enter">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold gradient-text mb-1">Overview</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          Catalog quality analysis · {summary.total_records.toLocaleString()} records
          {detectionSecs !== undefined && ` · detected in ${detectionSecs.toFixed(2)}s`}
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard
          icon={Database}
          label="Total Records"
          value={summary.total_records.toLocaleString()}
          sub="in catalog"
          color="#6366f1"
          glow
        />
        <KpiCard
          icon={AlertTriangle}
          label="Total Issues"
          value={summary.total_issues}
          sub={`${categoryData.length} categories`}
          color="#f43f5e"
        />
        <KpiCard
          icon={Target}
          label="Dups Detected"
          value={summary.seeded_dups_detected !== undefined
            ? `${summary.seeded_dups_detected} / ${summary.total_seeded_dups}`
            : (summary.auto_flagged ?? '—')}
          sub={summary.f1 !== undefined ? `F1: ${(summary.f1 * 100).toFixed(1)}%` : 'of 100 seeded'}
          color="#10b981"
        />
        <KpiCard
          icon={Zap}
          label={timeSaved !== null ? 'Time Saved (Est.)' : 'Comparisons Saved'}
          value={timeSaved !== null ? `${timeSaved} min` : `${summary.comparisons_saved_pct?.toFixed(1)}%`}
          sub={timeSaved !== null ? `~${speedup}× faster (estimate)` : `vs ${(summary.n_squared ?? 0).toLocaleString()} n²`}
          color="#06b6d4"
        />
      </div>

      {/* Precision / Recall / F1 */}
      {summary.precision !== undefined && (
        <div className="glass-card p-6 mb-6">
          <h2 className="text-sm font-semibold mb-4 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Detection Performance
          </h2>
          <div className="space-y-3">
            <MetricBar label="Precision" value={summary.precision!} color="#6366f1" />
            <MetricBar label="Recall" value={summary.recall!} color="#06b6d4" />
            <MetricBar label="F1 Score" value={summary.f1!} color="#10b981" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              { label: 'True Positives', value: summary.true_positives, color: '#10b981' },
              { label: 'False Positives', value: summary.false_positives, color: '#f43f5e' },
              { label: 'False Negatives', value: summary.false_negatives, color: '#f59e0b' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center p-3 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
                <div className="text-xl font-bold" style={{ color }}>{value ?? '—'}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6">
        {/* Bar chart: issues by category */}
        <div className="glass-card p-6">
          <h2 className="text-sm font-semibold mb-5 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Issues by Category
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={categoryData} barCategoryGap="35%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(31,35,49,0.8)" />
              <XAxis
                dataKey="name"
                tick={{ fill: '#4a5568', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: '#4a5568', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--text-primary)',
                  fontSize: 12,
                }}
                cursor={{ fill: 'rgba(99,102,241,0.05)' }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {categoryData.map((entry) => (
                  <Cell
                    key={entry.rawName}
                    fill={CATEGORY_COLORS[entry.rawName] ?? '#6366f1'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart: blocking efficiency + more stats */}
        <div className="glass-card p-6">
          <h2 className="text-sm font-semibold mb-5 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Blocking Efficiency
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={[
                  { name: 'Evaluated', value: summary.candidate_pairs },
                  { name: 'Skipped', value: summary.comparisons_saved },
                ]}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
                dataKey="value"
              >
                <Cell fill="#6366f1" />
                <Cell fill="rgba(31,35,49,0.9)" />
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--text-primary)',
                  fontSize: 12,
                }}
              />
              <Legend
                formatter={(value) => (
                  <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="text-center -mt-2">
            <span className="text-2xl font-bold gradient-text">
              {summary.comparisons_saved_pct?.toFixed(1)}%
            </span>
            <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>comparisons saved</span>
          </div>
        </div>
      </div>

      {/* Benchmark time savings */}
      {benchmark && (
        <div className="glass-card p-6 mt-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={14} style={{ color: 'var(--accent-amber)' }} />
            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Time Savings{' '}
              <span className="text-xs normal-case font-normal">
                (manual baseline = ESTIMATE)
              </span>
            </h2>
          </div>
          <div className="grid grid-cols-4 gap-4">
            {[
              {
                label: 'Detection Time',
                value: `${benchmark.measured.detection_time_seconds.toFixed(2)}s`,
                sub: 'measured',
                color: '#6366f1',
              },
              {
                label: 'Manual Estimate',
                value: `${(benchmark.manual_baseline_ESTIMATES.total_manual_review_seconds / 60).toFixed(0)} min`,
                sub: `ESTIMATE @ ${benchmark.manual_baseline_ESTIMATES.seconds_per_record}s/record`,
                color: '#f59e0b',
              },
              {
                label: 'Time Saved',
                value: `${benchmark.time_savings_ESTIMATES.total_time_saved_minutes} min`,
                sub: 'ESTIMATE',
                color: '#10b981',
              },
              {
                label: 'Speedup Factor',
                value: `${benchmark.time_savings_ESTIMATES.speedup_factor}×`,
                sub: 'vs manual ESTIMATE',
                color: '#06b6d4',
              },
            ].map(({ label, value, sub, color }) => (
              <div key={label} className="text-center p-4 rounded-xl" style={{ background: 'var(--bg-tertiary)' }}>
                <div className="text-xl font-bold" style={{ color }}>{value}</div>
                <div className="text-xs font-medium mt-1" style={{ color: 'var(--text-secondary)' }}>{label}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
