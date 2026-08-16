import { describe, expect, it } from 'vitest';
import { findTextualRuns, relativeCost, releaseMetricKeys } from './experiments';
import type { ExperimentRow } from '../types';

const row = (label: string, metrics: Record<string, number>): ExperimentRow => ({
  id: label,
  display_order: 1,
  name: label,
  label,
  status: 'frozen',
  scope: 'Development24',
  metrics,
  source_sha256: 'a'.repeat(64),
  fixture_version: 'v1',
  fixture_bundle_sha256: 'b'.repeat(64),
  published: true,
});

describe('experiment presentation contract', () => {
  it('selects only the frozen Development Baseline and Ablation pair', () => {
    const pair = findTextualRuns([row('Stable', {}), row('Development Baseline', {}), row('Ablation', {})]);
    expect(pair?.baseline.label).toBe('Development Baseline');
    expect(pair?.ablation.label).toBe('Ablation');
  });

  it('computes latency and tool-call cost multipliers without changing source metrics', () => {
    expect(relativeCost(row('Development Baseline', { latency: 4 }), row('Ablation', { latency: 24 }), 'latency')).toBe(6);
  });

  it('uses release-specific headline metrics', () => {
    expect(releaseMetricKeys(row('Stable', {}))).toContain('structured_apply_rate');
    expect(releaseMetricKeys(row('Ablation', {}))).toContain('full_gold_chain_rate');
  });
});
