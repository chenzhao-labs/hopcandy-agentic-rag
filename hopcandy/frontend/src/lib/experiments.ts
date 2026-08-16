import type { ExperimentRow } from '../types';

export interface ComparisonMetric {
  key: string;
  label: string;
  kind: 'decimal' | 'integer' | 'milliseconds';
  direction: 'higher' | 'lower' | 'context';
}

export const comparisonMetrics: ComparisonMetric[] = [
  { key: 'em', label: 'EM', kind: 'decimal', direction: 'higher' },
  { key: 'f1', label: 'F1', kind: 'decimal', direction: 'higher' },
  { key: 'avg_hop_recall', label: 'Avg Hop Recall', kind: 'decimal', direction: 'higher' },
  { key: 'full_gold_chain_rate', label: 'Full Gold Chain Rate', kind: 'decimal', direction: 'higher' },
  { key: 'avg_tool_calls', label: 'Average Tool Calls', kind: 'decimal', direction: 'context' },
  { key: 'avg_iterations', label: 'Average Iterations', kind: 'decimal', direction: 'context' },
  { key: 'agent_latency_p50_ms', label: 'Agent Latency P50', kind: 'milliseconds', direction: 'lower' },
  { key: 'agent_latency_p95_ms', label: 'Agent Latency P95', kind: 'milliseconds', direction: 'lower' },
];

export function findTextualRuns(experiments: ExperimentRow[]): { baseline: ExperimentRow; ablation: ExperimentRow } | null {
  const baseline = experiments.find((item) => item.label === 'Development Baseline');
  const ablation = experiments.find((item) => item.label === 'Ablation');
  return baseline && ablation ? { baseline, ablation } : null;
}

export function metricNumber(experiment: ExperimentRow, key: string): number | null {
  const value = experiment.metrics[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function relativeCost(baseline: ExperimentRow, ablation: ExperimentRow, key: string): number | null {
  const from = metricNumber(baseline, key);
  const to = metricNumber(ablation, key);
  if (from === null || to === null || from === 0) return null;
  return to / from;
}

export function releaseMetricKeys(experiment: ExperimentRow): string[] {
  if (experiment.label === 'Stable') {
    return ['f1', 'structured_apply_rate', 'evidence_grounding_accuracy'];
  }
  return ['em', 'f1', 'avg_hop_recall', 'full_gold_chain_rate'];
}
