import { useEffect, useRef, useState } from 'react';
import { BrainCircuit, ChevronDown, History, ShieldCheck, Wrench } from 'lucide-react';
import { formatMetric, humanize } from '../../lib/format';
import { tracePrimaryLabel, traceToolLabel } from '../../data/workbenchPresentation';
import type { HopCandyResponse } from '../../types';
import type { ReplayState } from '../../types/ui';

export function AgentTrace({ response, replayState, visibleTimelineCount }: { response: HopCandyResponse; replayState: ReplayState; visibleTimelineCount: number }) {
  const visibleTimeline = replayState === 'playing' ? response.timeline.slice(0, visibleTimelineCount) : response.timeline;
  const [planOpen, setPlanOpen] = useState(false);
  const traceScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => setPlanOpen(false), [response.request_id]);
  useEffect(() => { traceScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' }); }, [response.request_id]);
  return <aside className="trace-panel" aria-label="执行轨迹"><div className="panel-title trace-panel-header"><h2>执行轨迹</h2><small>{visibleTimeline.length}/{response.timeline.length} 个事件</small></div><div className="trace-scroll" ref={traceScrollRef}>{replayState === 'playing' && <div className="trace-replay-notice"><History size={14} /><span>按冻结 Timeline 顺序回放，不触发模型。</span></div>}{response.plan.length > 0 && <div className="plan-box"><button className="plan-toggle" type="button" aria-expanded={planOpen} onClick={() => setPlanOpen((value) => !value)}><strong><BrainCircuit size={15} /> 执行计划 <small>· {response.plan.length} steps</small></strong><ChevronDown className={planOpen ? 'rotate' : ''} size={16} /></button><div className={`plan-steps ${planOpen ? 'is-open' : ''}`} aria-hidden={!planOpen} inert={!planOpen}><div>{response.plan.map((step) => <p key={step.plan_id}><b>{step.step_id}</b><span>{step.sub_query}</span></p>)}</div></div></div>}<ol className={`trace-list ${replayState === 'playing' ? 'is-replaying' : ''}`}>{visibleTimeline.map((event) => <li key={event.event_id} className={event.status}><span className="trace-node"><i>{event.sequence}</i></span><div className="trace-copy"><div><strong><span className="trace-stage">{event.node.toUpperCase()}</span>{tracePrimaryLabel(event)}</strong>{event.latency_ms !== null && <time>{formatMetric(event.latency_ms, 'milliseconds')}</time>}</div><code>{event.node} · {event.event_type}</code>{event.detail && <p>{event.detail}</p>}{event.tool && <span className="tool-chip"><Wrench size={12} />{traceToolLabel(event.tool)}</span>}</div></li>)}</ol>{response.verification.length > 0 && <div className="verdict-box"><ShieldCheck size={17} /><div><span>最终验证</span><strong>{humanize(response.grounding.final_verdict)}</strong><small>证据支撑：{humanize(response.grounding.status)}</small></div></div>}</div></aside>;
}
