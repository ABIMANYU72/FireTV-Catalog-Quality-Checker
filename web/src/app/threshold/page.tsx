'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Scatter, ScatterChart,
} from 'recharts';
import { Sliders, Info } from 'lucide-react';
import type { PairScore } from '@/types';

export default function ThresholdLabPage() {
  const [pairScores, setPairScores] = useState<PairScore[]>([]);
  const [trueLabels, setTrueLabels] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [autoFlagThresh, setAutoFlagThresh] = useState(0.82);
  const [needsReviewThresh, setNeedsReviewThresh] = useState(0.65);

  useEffect(() => {
    Promise.all([
      fetch('/data/pair_scores.json').then(r => r.json()).catch(() => []),
    ]).then(([ps]) => {
      setPairScores(ps);
      setLoading(false);
    });
  }, []);

  // Compute PR curve data by sweeping the AUTO_FLAG threshold
  const prCurveData = useMemo(() => {
    if (!pairScores.length) return [];
    const points: { threshold: number; precision: number; recall: number; f1: number }[] = [];

    // Use the NEEDS_REVIEW threshold as a fixed lower boundary
    // and sweep the AUTO_FLAG threshold
    for (let t = 0; t <= 1.0; t += 0.02) {
      const detected = pairScores.filter(p => p.signals.composite >= t);
      // Without ground truth in the UI, use label from server as proxy
      const truePos = detected.filter(p => p.label === 'AUTO_FLAG' || p.label === 'NEEDS_REVIEW').length;
      const falsePos = detected.filter(p => p.label === 'DISTINCT').length;
      const totalPositives = pairScores.filter(p => p.label !== 'DISTINCT').length;
      const falseNeg = totalPositives - truePos;

      const precision = (truePos + falsePos) > 0 ? truePos / (truePos + falsePos) : 1;
      const recall = totalPositives > 0 ? truePos / totalPositives : 0;
      const f1 = (precision + recall) > 0 ? 2 * precision * recall / (precision + recall) : 0;

      points.push({
        threshold: parseFloat(t.toFixed(2)),
        precision: parseFloat(precision.toFixed(3)),
        recall: parseFloat(recall.toFixed(3)),
        f1: parseFloat(f1.toFixed(3)),
      });
    }
    return points;
  }, [pairScores]);

  // Live stats at current threshold
  const liveStats = useMemo(() => {
    const autoFlagged = pairScores.filter(p => p.signals.composite >= autoFlagThresh);
    const needsReview = pairScores.filter(
      p => p.signals.composite >= needsReviewThresh && p.signals.composite < autoFlagThresh
    );
    const distinct = pairScores.filter(p => p.signals.composite < needsReviewThresh);

    const truePos = autoFlagged.filter(p => p.label === 'AUTO_FLAG').length;
    const falsePos = autoFlagged.filter(p => p.label === 'DISTINCT').length;
    const totalPos = pairScores.filter(p => p.label !== 'DISTINCT').length;
    const falseNeg = totalPos - truePos;
    const precision = (truePos + falsePos) > 0 ? truePos / (truePos + falsePos) : 1;
    const recall = totalPos > 0 ? truePos / totalPos : 0;
    const f1 = (precision + recall) > 0 ? 2 * precision * recall / (precision + recall) : 0;

    return {
      autoFlagged: autoFlagged.length,
      needsReview: needsReview.length,
      distinct: distinct.length,
      precision,
      recall,
      f1,
    };
  }, [pairScores, autoFlagThresh, needsReviewThresh]);

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
        <h1 className="text-2xl font-bold gradient-text mb-1">Threshold Lab</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Adjust classification thresholds and see precision/recall change live from pre-computed pair scores.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Threshold controls */}
        <div className="col-span-1 space-y-6">
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Sliders size={14} style={{ color: 'var(--accent-purple)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Thresholds
              </span>
            </div>

            {/* AUTO_FLAG slider */}
            <div className="mb-5">
              <div className="flex justify-between mb-2">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  AUTO_FLAG threshold
                </label>
                <span className="text-xs font-bold" style={{ color: 'var(--accent-rose)' }}>
                  {autoFlagThresh.toFixed(2)}
                </span>
              </div>
              <input
                id="auto-flag-slider"
                type="range"
                min={needsReviewThresh + 0.01}
                max={1.0}
                step={0.01}
                value={autoFlagThresh}
                onChange={e => setAutoFlagThresh(parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                <span>{(needsReviewThresh + 0.01).toFixed(2)}</span>
                <span>1.00</span>
              </div>
            </div>

            {/* NEEDS_REVIEW slider */}
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  NEEDS_REVIEW threshold
                </label>
                <span className="text-xs font-bold" style={{ color: 'var(--accent-amber)' }}>
                  {needsReviewThresh.toFixed(2)}
                </span>
              </div>
              <input
                id="needs-review-slider"
                type="range"
                min={0.1}
                max={autoFlagThresh - 0.01}
                step={0.01}
                value={needsReviewThresh}
                onChange={e => setNeedsReviewThresh(parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                <span>0.10</span>
                <span>{(autoFlagThresh - 0.01).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Live stats */}
          <div className="glass-card p-5 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
              Live Classification
            </div>
            {[
              { label: 'AUTO_FLAG', value: liveStats.autoFlagged, color: '#fb7185' },
              { label: 'NEEDS_REVIEW', value: liveStats.needsReview, color: '#fbbf24' },
              { label: 'DISTINCT', value: liveStats.distinct, color: '#34d399' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                <span className="text-sm font-bold" style={{ color }}>{value}</span>
              </div>
            ))}

            <div className="border-t pt-3" style={{ borderColor: 'var(--border)' }}>
              {[
                { label: 'Precision', value: liveStats.precision, color: '#6366f1' },
                { label: 'Recall', value: liveStats.recall, color: '#06b6d4' },
                { label: 'F1', value: liveStats.f1, color: '#10b981' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between mb-2">
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  <span className="text-sm font-bold" style={{ color }}>
                    {(value * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-1.5 mt-2 p-2 rounded" style={{ background: 'var(--bg-tertiary)' }}>
              <Info size={11} className="mt-0.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Precision/Recall computed from server-labelled pairs (AUTO_FLAG/NEEDS_REVIEW as positive).
                Use seeded_labels.json for ground-truth evaluation.
              </p>
            </div>
          </div>
        </div>

        {/* PR Curve */}
        <div className="col-span-2 glass-card p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-5" style={{ color: 'var(--text-muted)' }}>
            Precision–Recall & F1 vs Threshold
          </h2>
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={prCurveData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(31,35,49,0.8)" />
              <XAxis
                dataKey="threshold"
                tick={{ fill: '#4a5568', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                label={{ value: 'Threshold', position: 'insideBottom', fill: '#4a5568', fontSize: 11, dy: 10 }}
              />
              <YAxis
                tick={{ fill: '#4a5568', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                domain={[0, 1]}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <ReferenceLine
                x={autoFlagThresh}
                stroke="#fb7185"
                strokeDasharray="4 2"
                label={{ value: 'AUTO', fill: '#fb7185', fontSize: 10 }}
              />
              <ReferenceLine
                x={needsReviewThresh}
                stroke="#fbbf24"
                strokeDasharray="4 2"
                label={{ value: 'REVIEW', fill: '#fbbf24', fontSize: 10 }}
              />
              <Line type="monotone" dataKey="precision" stroke="#6366f1" strokeWidth={2} dot={false} name="Precision" />
              <Line type="monotone" dataKey="recall" stroke="#06b6d4" strokeWidth={2} dot={false} name="Recall" />
              <Line type="monotone" dataKey="f1" stroke="#10b981" strokeWidth={2} dot={false} name="F1" />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex gap-6 mt-3 justify-center">
            {[
              { label: 'Precision', color: '#6366f1' },
              { label: 'Recall', color: '#06b6d4' },
              { label: 'F1', color: '#10b981' },
              { label: 'AUTO_FLAG line', color: '#fb7185' },
              { label: 'NEEDS_REVIEW line', color: '#fbbf24' },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="w-4 h-0.5 rounded" style={{ background: color }} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pair score scatter */}
      <div className="glass-card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>
          Pair Scores Distribution (composite score)
        </h2>
        <ResponsiveContainer width="100%" height={180}>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(31,35,49,0.8)" />
            <XAxis
              type="number"
              dataKey="x"
              name="composite"
              tick={{ fill: '#4a5568', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              domain={[0, 1]}
              label={{ value: 'Composite Score', position: 'insideBottom', fill: '#4a5568', fontSize: 11, dy: 10 }}
            />
            <YAxis type="number" dataKey="y" name="index" hide />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              contentStyle={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 11,
              }}
              formatter={(value: any, name: any) => [Number(value).toFixed(3), name]}
            />
            <ReferenceLine x={autoFlagThresh} stroke="#fb7185" strokeDasharray="4 2" />
            <ReferenceLine x={needsReviewThresh} stroke="#fbbf24" strokeDasharray="4 2" />
            <Scatter
              data={pairScores.slice(0, 500).map((p, i) => ({
                x: p.signals.composite,
                y: Math.random(),
                label: p.label,
              }))}
              fill="#6366f1"
              opacity={0.5}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
