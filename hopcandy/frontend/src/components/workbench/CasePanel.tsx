import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, BarChart3, ChevronRight, CircleHelp, Database, GitBranch, History, LoaderCircle, Play, Radio, RefreshCw, ServerOff, ShieldCheck } from 'lucide-react';
import type { DemoCase, LiveHealth } from '../../types';
import type { Mode } from '../../types/ui';

function CaseIcon({ type }: { type: string }) {
  if (type.includes('clarification')) return <CircleHelp size={17} />;
  if (type.includes('failure')) return <AlertTriangle size={17} />;
  if (type.includes('replan')) return <RefreshCw size={17} />;
  if (type.includes('structured')) return <Database size={17} />;
  if (type.includes('model')) return <BarChart3 size={17} />;
  return <GitBranch size={17} />;
}

export function CasePanel({
  cases, selected, mode, question, running, health, onSelect, onMode, onQuestion, onRun,
}: {
  cases: DemoCase[]; selected: DemoCase; mode: Mode; question: string; running: boolean; health: LiveHealth;
  onSelect: (item: DemoCase) => void; onMode: (mode: Mode) => void; onQuestion: (question: string) => void; onRun: () => void;
}) {
  const replayQuestionRef = useRef<HTMLDivElement>(null);
  const [questionExpanded, setQuestionExpanded] = useState(false);
  const [questionCanExpand, setQuestionCanExpand] = useState(false);

  useEffect(() => { setQuestionExpanded(false); }, [mode, selected.id]);
  useEffect(() => {
    if (mode !== 'replay') { setQuestionCanExpand(false); return; }
    if (questionExpanded) { setQuestionCanExpand(true); return; }
    const node = replayQuestionRef.current;
    if (!node) return;
    const updateOverflow = () => setQuestionCanExpand(node.scrollHeight > node.clientHeight + 1);
    const frame = window.requestAnimationFrame(updateOverflow);
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(node);
    return () => { window.cancelAnimationFrame(frame); observer.disconnect(); };
  }, [mode, question, questionExpanded]);

  return (
    <aside className="query-column" aria-label="查询输入">
      <div className="column-heading"><div><h2>{mode === 'replay' ? '案例问题' : '问题输入'}</h2></div><div className="mode-switch" role="group" aria-label="运行模式"><button className={mode === 'replay' ? 'active' : ''} onClick={() => onMode('replay')}><History size={14} /> 回放</button><button className={mode === 'live' ? 'active' : ''} onClick={() => onMode('live')}><Radio size={14} /> 在线</button></div></div>
      <div className={`mode-notice ${mode === 'live' ? 'live' : 'compact'}`}>
        {mode === 'replay' ? <ShieldCheck size={17} /> : <ServerOff size={17} />}
        {mode === 'replay' ? <strong>冻结实验回放</strong> : <div><strong>{health.live.ready ? '在线 Agent 已就绪' : '在线推理当前不可用'}</strong><span>{health.live.ready ? '将调用真实 Agent，完成后一次性返回轨迹。' : 'GPU 按需启动；回放始终可用。'}</span></div>}
      </div>
      {mode === 'replay' ? <>
        <div id="question-label" className="question-label">冻结案例原问题</div>
        <div id="question-input" ref={replayQuestionRef} className={`case-question-readonly ${questionExpanded ? 'is-expanded' : ''}`} role="textbox" aria-labelledby="question-label" aria-readonly="true">{question}</div>
        {questionCanExpand && <button type="button" className="question-expand" onClick={() => setQuestionExpanded((value) => !value)}>{questionExpanded ? '收起' : '展开全文'}</button>}
      </> : <>
        <label className="question-label" htmlFor="question-input">输入问题</label>
        <textarea id="question-input" value={question} onChange={(event) => onQuestion(event.target.value)} rows={7} maxLength={1200} />
      </>}
      {mode === 'live' && <div className="composer-foot"><span>{question.length}/1200</span><button className="run-button" disabled={running || !question.trim() || !health.live.ready} onClick={onRun}>{running ? <LoaderCircle className="spin" size={17} /> : <Play size={17} />}运行 Agent</button></div>}
      <div className="preset-heading"><span>冻结案例</span><small>{cases.length} 条</small></div>
      <div className="preset-list">{cases.map((item) => <button key={item.id} className={`preset ${selected.id === item.id ? 'selected' : ''}`} onClick={() => onSelect(item)}><span className="preset-icon"><CaseIcon type={item.case_type} /></span><span className="preset-copy"><strong>{item.title}</strong><small>{item.response.model} · {item.response.scope.hop_count} hop</small></span><ChevronRight size={16} /></button>)}</div>
    </aside>
  );
}
