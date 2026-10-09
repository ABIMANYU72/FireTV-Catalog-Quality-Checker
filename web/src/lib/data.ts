// lib/data.ts
// Data fetching utilities for the static dashboard

import type { Issue, PairScore, Summary, Benchmark, CatalogRecord } from '@/types';

const BASE = '/data';

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.statusText}`);
  return res.json();
}

export async function getIssues(): Promise<Issue[]> {
  try {
    return await fetchJSON<Issue[]>('issues.json');
  } catch {
    return [];
  }
}

export async function getPairScores(): Promise<PairScore[]> {
  try {
    return await fetchJSON<PairScore[]>('pair_scores.json');
  } catch {
    return [];
  }
}

export async function getSummary(): Promise<Summary | null> {
  try {
    return await fetchJSON<Summary>('summary.json');
  } catch {
    return null;
  }
}

export async function getBenchmark(): Promise<Benchmark | null> {
  try {
    return await fetchJSON<Benchmark>('benchmark.json');
  } catch {
    return null;
  }
}

export async function getCatalog(): Promise<CatalogRecord[]> {
  try {
    return await fetchJSON<CatalogRecord[]>('catalog.json');
  } catch {
    return [];
  }
}
