import { AlertTriangle, History, Play } from 'lucide-react';
import { formatMetric, humanize } from '../../lib/format';
import { warningLabel, warningMessage } from '../../data/workbenchPresentation';
import type { HopCandyResponse } from '../../types';
import type { ReplayState } from '../../types/ui';

export function AnswerPanel({ response, runError, replayState, isReplay, onReplay }: { response: HopCandyResponse; runError: string | null; replayState: ReplayState; isReplay: boolean; onReplay: () => void }) {
  return (
    <section className="answer-panel">
      {runError && <div className="inline-error"><AlertTriangle size={18} /><div><strong>回放未命中</strong><span>{runError}</span></div></div>}
      <div className={`answer-copy ${response.status}`}>
        <div className="answer-label-row"><span>{response.status === 'clarification' ? '澄清请求' : response.status === 'abstained' ? '安全响应' : '最终答案'}</span><span className="model-chip">{response.model}</span></div>
        <div className="answer-content"><h1>{response.answer || response.grounding.abstention_reason || '未返回答案。'}</h1></div>
      </div>
      {response.warnings.length > 0 && <div className="answer-status-meta"><div className="answer-status-tags">{response.warnings.map((warning) => <span key={warning.code} className={`answer-status-tag ${warning.severity}`} title={warningMessage(warning.code, warning.message)}>{warningLabel(warning.code)}</span>)}</div><p>{response.warnings.map((warning) => warningMessage(warning.code, warning.message)).join(' ')}</p></div>}
      <div className="run-summary"><div className="runtime-toolbar"><div className="runtime-summary-line" aria-label="运行摘要"><span><b>{humanize(response.route.category)}</b></span><i>·</i><span>{formatMetric(response.metrics.latency_ms, 'milliseconds')}</span><i>·</i><span>{formatMetric(response.metrics.tool_calls, 'integer')} 次工具调用</span><i>·</i><span>{formatMetric(response.metrics.iterations, 'integer')} 轮</span><i>·</i><span>证据链召回 {formatMetric(response.metrics.hop_recall)}</span><i>·</i><span className="runtime-grounding">{humanize(response.metrics.grounding_status)}</span></div>{isReplay && <div className={`replay-state ${replayState}`}><History size={13} /><span>{replayState === 'playing' ? '正在回放冻结轨迹' : '冻结执行回放'}</span><button type="button" onClick={onReplay} disabled={replayState === 'playing'}><Play size={12} />{replayState === 'playing' ? '回放中' : '重放'}</button></div>}</div></div>
    </section>
  );
}
