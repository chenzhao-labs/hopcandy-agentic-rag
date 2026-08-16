export function formatMetric(value: unknown, kind: 'decimal' | 'integer' | 'milliseconds' = 'decimal'): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
  if (kind === 'integer') return Math.round(value).toLocaleString('en-US');
  if (kind === 'milliseconds') {
    return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${value.toFixed(0)} ms`;
  }
  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

export function humanize(value: string): string {
  const labels: Record<string, string> = {
    structured: '结构化',
    textual: '文本型',
    full_agentic: '完整 Agent 流程',
    fast_path: '快速路径',
    keyword_search: '关键词检索',
    semantic_search: '语义检索',
    hybrid_search: '混合检索',
    read_chunk: '片段读取',
    machine_facts: '机器事实',
    calculator: '计算器',
    sufficient: '证据充分',
    insufficient: '证据不足',
    grounded: '已验证',
    answered: '已回答',
  };
  if (labels[value]) return labels[value];
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function normalizeQuestion(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function shortHash(value: string): string {
  return value ? `${value.slice(0, 8)}…${value.slice(-6)}` : 'N/A';
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    success: '已回答',
    clarification: '需要澄清',
    abstained: '安全弃答',
    error: '运行失败',
  };
  return labels[status] ?? humanize(status);
}
