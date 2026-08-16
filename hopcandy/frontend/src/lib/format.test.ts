import { describe, expect, it } from 'vitest';
import { formatMetric, humanize, normalizeQuestion, statusLabel } from './format';

describe('format helpers', () => {
  it('normalizes replay questions without altering semantics', () => {
    expect(normalizeQuestion('  What  was\nrevenue? ')).toBe('what was revenue?');
  });

  it('formats exact frozen metrics consistently', () => {
    expect(formatMetric(0.479)).toBe('0.479');
    expect(formatMetric(12835.356, 'milliseconds')).toBe('12.84 s');
    expect(formatMetric(null)).toBe('N/A');
  });

  it('creates readable contract labels', () => {
    expect(humanize('full_agentic')).toBe('完整 Agent 流程');
    expect(statusLabel('abstained')).toBe('安全弃答');
  });
});
