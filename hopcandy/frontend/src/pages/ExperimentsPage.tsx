import { comparisonMetrics, findTextualRuns, metricNumber, relativeCost } from '../lib/experiments';
import { formatMetric, shortHash } from '../lib/format';
import { PageHeading } from '../components/common/PageHeading';
import { ReleaseBadge } from '../components/common/ReleaseBadge';
import type { ExperimentRow, PublicationData } from '../types';

type ExperimentHeadlineMetric = { label: string; value: string };

function formatExperimentDecimal(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : 'N/A';
}

function experimentHeadlineMetrics(experiment: ExperimentRow): ExperimentHeadlineMetric[] {
  const metric = (key: string) => formatExperimentDecimal(experiment.metrics[key]);
  if (experiment.label === 'Stable') {
    const samples = formatMetric(experiment.metrics.samples, 'integer');
    return [{ label: '发布门槛', value: `${samples} / ${samples} PASS` }, { label: 'F1', value: metric('f1') }, { label: '结构化适用率', value: metric('structured_apply_rate') }, { label: '证据归因准确率', value: metric('evidence_grounding_accuracy') }];
  }
  return [{ label: 'EM', value: metric('em') }, { label: 'F1', value: metric('f1') }, { label: 'Avg Hop Recall', value: metric('avg_hop_recall') }, { label: 'Full Gold Chain Rate', value: metric('full_gold_chain_rate') }];
}

function experimentPresentation(experiment: ExperimentRow) {
  if (experiment.label === 'Stable') return { name: 'Structured Query Stable v1.0', status: '已冻结 · PASS', description: '结构化金融查询、多事实计算、实体绑定与澄清能力。' };
  if (experiment.label === 'Development Baseline') return { name: 'Textual 2-hop Baseline v0.1', status: '开发基线 · 已知限制', description: '面向文本型两跳 Agentic RAG 的冻结开发基线。' };
  return { name: 'Qwen3-8B / 2048', status: '消融实验 · 非独立发布', description: '在相同 Development24、索引和 Agent 配置下，仅改变模型规模进行消融对照。' };
}

export function ExperimentsPage({ data }: { data: PublicationData }) {
  const textualRuns = findTextualRuns(data.experiments);
  return <main className="content-page experiments-page"><PageHeading title="实验不是装饰，是发布边界" description="所有数字来自稳定版、开发基线与消融实验冻结评测产物" /><div className="evaluation-scope" aria-label="评测范围"><span>评测范围</span><p>BT3Y · Baidu / Tencent · 2023–2025 · 冻结评测产物</p></div><section className="experiment-grid">{data.experiments.map((experiment) => { const presentation = experimentPresentation(experiment); return <article className="experiment-card" key={experiment.id}><div><ReleaseBadge label={experiment.label} /><span className="experiment-status">{presentation.status}</span></div><h2>{presentation.name}</h2><p>{presentation.description}</p><dl>{experimentHeadlineMetrics(experiment).map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl><footer><span>冻结来源</span><code>{shortHash(experiment.source_sha256)}</code></footer></article>; })}</section><section className="evaluation-boundary" aria-labelledby="evaluation-boundary-title"><span id="evaluation-boundary-title">评测边界</span><div className="release-contract-grid"><div><ReleaseBadge label="Stable" /><strong>通过冻结发布门槛</strong><p>可作为当前稳定能力表述。</p></div><div><ReleaseBadge label="Development Baseline" /><strong>开发阶段参考基线</strong><p>保留已知限制，不作为独立测试或稳定版。</p></div><div><ReleaseBadge label="Ablation" /><strong>模型规模诊断</strong><p>用于观察模型规模影响，不代表独立发布能力。</p></div></div></section>{textualRuns && <section className="comparison-section model-comparison"><div className="section-head"><div><span>同一开发集 · 模型规模对照</span><h2>Qwen3-4B 与 Qwen3-8B：质量提升及运行代价</h2></div><p>相同 Development24、索引和 Agent 配置；不是独立测试。</p></div><div className="table-wrap"><table><thead><tr><th>指标</th><th>Qwen3-4B / 2048</th><th>Qwen3-8B / 2048</th><th>观察到的变化</th></tr></thead><tbody>{comparisonMetrics.map((metric) => { const baseline = metricNumber(textualRuns.baseline, metric.key); const ablation = metricNumber(textualRuns.ablation, metric.key); const multiplier = relativeCost(textualRuns.baseline, textualRuns.ablation, metric.key); const delta = baseline !== null && ablation !== null ? ablation - baseline : null; return <tr key={metric.key}><td><strong>{metric.label}</strong><small>{metric.direction === 'higher' ? '数值越高越好' : metric.direction === 'lower' ? '数值越低越快' : '诊断成本'}</small></td><td>{formatMetric(baseline, metric.kind)}</td><td>{formatMetric(ablation, metric.kind)}</td><td className={delta !== null && ((metric.direction === 'higher' && delta > 0) || (metric.direction === 'lower' && delta < 0)) ? 'positive-change' : 'cost-change'}>{metric.kind === 'milliseconds' && multiplier !== null ? `${multiplier.toFixed(2)}× 延迟` : delta === null ? 'N/A' : `${delta > 0 ? '+' : ''}${formatMetric(delta, metric.kind)}`}</td></tr>; })}</tbody></table></div><div className="key-findings-heading">关键结论</div><div className="comparison-summary"><div><span>完整证据链</span><strong>{formatExperimentDecimal(textualRuns.baseline.metrics.full_gold_chain_rate)} → {formatExperimentDecimal(textualRuns.ablation.metrics.full_gold_chain_rate)}</strong><small>8B 检索到更完整的证据链。</small></div><div><span>P50 延迟</span><strong>{formatMetric(relativeCost(textualRuns.baseline, textualRuns.ablation, 'agent_latency_p50_ms'))}×</strong><small>来自冻结运行的实际耗时对照。</small></div><div><span>工具调用</span><strong>{formatMetric(textualRuns.baseline.metrics.avg_tool_calls)} → {formatMetric(textualRuns.ablation.metrics.avg_tool_calls)}</strong><small>更多规划与检索不代表 8B 已成为稳定版。</small></div></div><p className="model-conclusion">更大的模型显著改善 Hop Recall 和 Full Gold Chain，但同时带来明显的延迟与工具调用成本，因此该结果用于诊断模型规模影响，而不能替代系统层优化。</p></section>}</main>;
}
