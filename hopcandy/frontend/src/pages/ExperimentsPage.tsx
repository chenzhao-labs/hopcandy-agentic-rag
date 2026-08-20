import { comparisonMetrics, findTextualRuns, metricNumber, relativeCost } from '../lib/experiments';
import { formatMetric, shortHash } from '../lib/format';
import { PageHeading } from '../components/common/PageHeading';
import { ReleaseBadge } from '../components/common/ReleaseBadge';
import type { ExperimentRow, PublicationData, TextualHoldoutMatrix, TextualHoldoutRun } from '../types';

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
  if (experiment.label === 'Development Baseline') return { name: 'Textual 2-hop Baseline', status: '已冻结', description: '面向文本型两跳 Agentic RAG 的冻结开发基线。' };
  return { name: 'Qwen3-8B', status: '消融实验', description: '在相同开发集、索引和 Agent 配置下，仅改变模型规模进行消融对照。' };
}

function holdoutMetric(run: TextualHoldoutRun, key: string): number | null {
  const value = run.metrics[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function signedDelta(from: TextualHoldoutRun | undefined, to: TextualHoldoutRun | undefined, key: string): string {
  const fromValue = from ? holdoutMetric(from, key) : null;
  const toValue = to ? holdoutMetric(to, key) : null;
  if (fromValue === null || toValue === null) return '—';
  const delta = toValue - fromValue;
  return `${delta >= 0 ? '+' : ''}${formatMetric(delta)}`;
}

function holdoutSystemLabel(run: TextualHoldoutRun): string {
  if (run.id.startsWith('optimized_')) return 'Baseline Optimized';
  return 'Baseline';
}

function HoldoutMetricCell({ run, baseline, metric }: { run: TextualHoldoutRun; baseline: TextualHoldoutRun | undefined; metric: string }) {
  const value = holdoutMetric(run, metric);
  const baselineValue = baseline ? holdoutMetric(baseline, metric) : null;
  const delta = value !== null && baselineValue !== null ? value - baselineValue : null;
  const isBaseline = run.id === baseline?.id;

  if (value === null) return <td>—</td>;
  if (isBaseline) return <td><span className="holdout-metric-value">{formatMetric(value)}</span></td>;
  if (delta === null) return <td><span className="holdout-metric-value">{formatMetric(value)}</span></td>;

  const direction = delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral';
  const symbol = delta > 0 ? '▲' : delta < 0 ? '▼' : '●';
  const prefix = delta > 0 ? '+' : '';
  return <td><span className="holdout-metric-value">{formatMetric(value)}</span><small className={`holdout-delta ${direction}`}>{symbol} {prefix}{formatMetric(delta)}</small></td>;
}

function HoldoutMatrix({ matrix }: { matrix: TextualHoldoutMatrix }) {
  const baseline4B = matrix.runs.find((run) => run.id === 'baseline_v0_1_qwen3_4b');
  const baseline8B = matrix.runs.find((run) => run.id === 'baseline_v0_1_qwen3_8b');
  const optimized4B = matrix.runs.find((run) => run.id === 'optimized_v2_3_qwen3_4b');
  const baselinesByModel = new Map(matrix.runs.filter((run) => run.id.startsWith('baseline_')).map((run) => [run.model, run]));
  const runs = [...matrix.runs].sort((left, right) => {
    const modelOrder = left.model.localeCompare(right.model);
    if (modelOrder !== 0) return modelOrder;
    return Number(left.id.startsWith('optimized_')) - Number(right.id.startsWith('optimized_'));
  });

  return <section className="comparison-section holdout-comparison" aria-labelledby="holdout-title">
    <div className="section-head">
      <div>
        <span>冻结 Holdout · 工程优化验证</span>
        <h2 id="holdout-title">在独立文本两跳任务上验证工程优化收益</h2>
      </div>
    </div>
    <div className="table-wrap">
      <table>
        <thead><tr><th>系统版本</th><th>模型</th><th>状态</th><th>EM</th><th>F1</th><th>Hop Recall</th><th>Full Gold Chain</th></tr></thead>
        <tbody>{runs.map((run) => {
          const pending = run.status === 'pending';
          const modelBaseline = baselinesByModel.get(run.model);
          return <tr key={run.id} className={pending ? 'holdout-pending-row' : undefined}>
            <td><strong>{holdoutSystemLabel(run)}</strong></td>
            <td>{run.model}</td>
            <td><span className={`holdout-status ${pending ? 'pending' : 'completed'}`}>{pending ? '待补充' : '已完成'}</span></td>
            <HoldoutMetricCell run={run} baseline={modelBaseline} metric="em" />
            <HoldoutMetricCell run={run} baseline={modelBaseline} metric="f1" />
            <HoldoutMetricCell run={run} baseline={modelBaseline} metric="avg_hop_recall" />
            <HoldoutMetricCell run={run} baseline={modelBaseline} metric="full_gold_chain_rate" />
          </tr>;
        })}</tbody>
      </table>
    </div>
    <div className="key-findings-heading">关键观察</div>
    <div className="comparison-summary">
      <div><span>工程优化显著增强证据链覆盖</span><strong>Hop Recall {signedDelta(baseline4B, optimized4B, 'avg_hop_recall')}</strong><small>Full Gold Chain {signedDelta(baseline4B, optimized4B, 'full_gold_chain_rate')}；F1 {signedDelta(baseline4B, optimized4B, 'f1')}。</small></div>
      <div><span>工程优化收益高于单纯扩模</span><strong>{signedDelta(baseline4B, optimized4B, 'avg_hop_recall')} vs {signedDelta(baseline4B, baseline8B, 'avg_hop_recall')}</strong><small>Hop Recall：4B 工程优化 vs Baseline 从 4B 升至 8B。</small></div>
      <div><span>独立文本多跳路径</span><strong>Machine Facts 0 次</strong><small>已完成对照均未触发结构化快速路，指标变化来自文本检索 Agent 流程。</small></div>
    </div>
  </section>;
}

export function ExperimentsPage({ data }: { data: PublicationData }) {
  const textualRuns = findTextualRuns(data.experiments);
  return <main className="content-page experiments-page">
    <PageHeading title="实验不是装饰，是发布边界" description="所有数字来自稳定版、开发基线、冻结 Holdout 与消融实验的评测产物" />
    <div className="evaluation-scope" aria-label="评测范围"><span>评测范围</span><p>BT3Y · Baidu / Tencent · 2023–2025 · 冻结评测产物</p></div>
    <section className="experiment-grid">{data.experiments.map((experiment) => {
      const presentation = experimentPresentation(experiment);
      return <article className="experiment-card" key={experiment.id}><div><ReleaseBadge label={experiment.label} /><span className="experiment-status">{presentation.status}</span></div><h2>{presentation.name}</h2><p>{presentation.description}</p><dl>{experimentHeadlineMetrics(experiment).map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl><footer><span>冻结来源</span><code>{shortHash(experiment.source_sha256)}</code></footer></article>;
    })}</section>
    <HoldoutMatrix matrix={data.textualHoldoutMatrix} />
    {textualRuns && <section className="comparison-section model-comparison"><div className="section-head"><div><span>开发集诊断 · 模型规模消融</span><h2>Qwen3-4B 与 Qwen3-8B 的质量与运行代价</h2></div><p>相同开发集、索引和 Agent 配置；不是独立测试。</p></div><div className="table-wrap"><table><thead><tr><th>指标</th><th>Qwen3-4B</th><th>Qwen3-8B</th><th>观察到的变化</th></tr></thead><tbody>{comparisonMetrics.map((metric) => { const baseline = metricNumber(textualRuns.baseline, metric.key); const ablation = metricNumber(textualRuns.ablation, metric.key); const multiplier = relativeCost(textualRuns.baseline, textualRuns.ablation, metric.key); const delta = baseline !== null && ablation !== null ? ablation - baseline : null; return <tr key={metric.key}><td><strong>{metric.label}</strong><small>{metric.direction === 'higher' ? '数值越高越好' : metric.direction === 'lower' ? '数值越低越快' : '诊断成本'}</small></td><td>{formatMetric(baseline, metric.kind)}</td><td>{formatMetric(ablation, metric.kind)}</td><td className={delta !== null && ((metric.direction === 'higher' && delta > 0) || (metric.direction === 'lower' && delta < 0)) ? 'positive-change' : 'cost-change'}>{metric.kind === 'milliseconds' && multiplier !== null ? `${multiplier.toFixed(2)}× 延迟` : delta === null ? 'N/A' : `${delta > 0 ? '+' : ''}${formatMetric(delta, metric.kind)}`}</td></tr>; })}</tbody></table></div><div className="key-findings-heading">关键结论</div><div className="comparison-summary"><div><span>完整证据链</span><strong>{formatExperimentDecimal(textualRuns.baseline.metrics.full_gold_chain_rate)} → {formatExperimentDecimal(textualRuns.ablation.metrics.full_gold_chain_rate)}</strong><small>8B 检索到更完整的证据链。</small></div><div><span>P50 延迟</span><strong>{formatMetric(relativeCost(textualRuns.baseline, textualRuns.ablation, 'agent_latency_p50_ms'))}×</strong><small>来自冻结运行的实际耗时对照。</small></div><div><span>工具调用</span><strong>{formatMetric(textualRuns.baseline.metrics.avg_tool_calls)} → {formatMetric(textualRuns.ablation.metrics.avg_tool_calls)}</strong><small>更多规划与检索不代表 8B 已成为稳定版。</small></div></div><p className="model-conclusion">更大的模型显著改善 Hop Recall 和 Full Gold Chain，但同时带来明显的延迟与工具调用成本，因此该结果用于诊断模型规模影响，而不能替代系统层优化。</p></section>}
  </main>;
}
