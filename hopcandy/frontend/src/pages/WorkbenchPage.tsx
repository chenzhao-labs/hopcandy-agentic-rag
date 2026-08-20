import { useEffect, useRef, useState } from 'react';
import { History, X } from 'lucide-react';
import { AnswerPanel } from '../components/workbench/AnswerPanel';
import { AgentTrace } from '../components/workbench/AgentTrace';
import { CasePanel } from '../components/workbench/CasePanel';
import { EvidenceChain } from '../components/workbench/EvidenceChain';
import { formatMetric, normalizeQuestion } from '../lib/format';
import { getLiveHealth, runLiveQuery } from '../lib/publication';
import type { DemoCase, LiveHealth, PublicationData } from '../types';
import type { MobilePanel, Mode, ReplayState } from '../types/ui';

const defaultHealth: LiveHealth = { status: 'ok', replay_available: true, live: { enabled: false, ready: false, state: 'on_demand', model: null } };

function MobileTabs({ active, onChange }: { active: MobilePanel; onChange: (value: MobilePanel) => void }) {
  return <div className="mobile-tabs" role="tablist" aria-label="结果面板">{(['answer', 'evidence', 'trace'] as MobilePanel[]).map((item) => <button key={item} role="tab" aria-selected={active === item} className={active === item ? 'active' : ''} onClick={() => onChange(item)}>{item === 'answer' ? '答案' : item === 'evidence' ? '证据' : '轨迹'}</button>)}</div>;
}

export function WorkbenchPage({ data, health, setHealth }: { data: PublicationData; health: LiveHealth; setHealth: (health: LiveHealth) => void }) {
  const defaultCase = data.cases.find((item) => item.case_type === 'textual_complete_chain_success') ?? data.cases[0];
  const [selected, setSelected] = useState(defaultCase);
  const [response, setResponse] = useState(defaultCase.response);
  const [mode, setMode] = useState<Mode>('replay');
  const [question, setQuestion] = useState(defaultCase.response.question);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('answer');
  const [replayState, setReplayState] = useState<ReplayState>('complete');
  const [visibleTimelineCount, setVisibleTimelineCount] = useState(defaultCase.response.timeline.length);
  const [visibleEvidenceCount, setVisibleEvidenceCount] = useState(defaultCase.response.evidence.length);
  const [showReleaseRibbon, setShowReleaseRibbon] = useState(true);
  const replayTimer = useRef<number | null>(null);
  const resultScrollRef = useRef<HTMLDivElement>(null);
  const clearReplayTimer = () => { if (replayTimer.current !== null) { window.clearInterval(replayTimer.current); replayTimer.current = null; } };
  useEffect(() => () => clearReplayTimer(), []);
  useEffect(() => { document.body.classList.add('workbench-active'); return () => document.body.classList.remove('workbench-active'); }, []);
  useEffect(() => { resultScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' }); }, [response.request_id]);
  const showReplayComplete = (item: DemoCase) => { clearReplayTimer(); setReplayState('complete'); setVisibleTimelineCount(item.response.timeline.length); setVisibleEvidenceCount(item.response.evidence.length); };
  const replayFrozenRun = (item: DemoCase = selected) => {
    clearReplayTimer(); setSelected(item); setResponse(item.response); setQuestion(item.response.question); setRunError(null); setMobilePanel('answer');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { showReplayComplete(item); return; }
    const totalSteps = Math.max(item.response.timeline.length, item.response.evidence.length, 1);
    let step = 0; setReplayState('playing'); setVisibleTimelineCount(0); setVisibleEvidenceCount(0);
    replayTimer.current = window.setInterval(() => { step += 1; setVisibleTimelineCount(Math.min(step, item.response.timeline.length)); setVisibleEvidenceCount(Math.min(Math.ceil((step / totalSteps) * item.response.evidence.length), item.response.evidence.length)); if (step >= totalSteps) showReplayComplete(item); }, 190);
  };
  const selectCase = (item: DemoCase) => { setSelected(item); setResponse(item.response); setQuestion(item.response.question); setRunError(null); setMobilePanel('answer'); showReplayComplete(item); };
  const switchMode = async (next: Mode) => {
    setMode(next); setRunError(null); clearReplayTimer(); setReplayState(next === 'replay' ? 'complete' : 'idle'); setVisibleTimelineCount(response.timeline.length); setVisibleEvidenceCount(response.evidence.length);
    if (next === 'live') { try { setHealth(await getLiveHealth()); } catch { setHealth({ ...defaultHealth, live: { ...defaultHealth.live, state: 'offline' } }); } }
  };
  const run = async () => {
    setRunning(true); setRunError(null);
    try {
      if (mode === 'replay') {
        const exact = data.cases.find((item) => normalizeQuestion(item.response.question) === normalizeQuestion(question));
        if (!exact) { setRunError('冻结回放只接受案例列表中的原始问题。请选择一个案例，或在 Live Agent 上线后运行新问题。'); return; }
        replayFrozenRun(exact);
      } else { const liveResponse = await runLiveQuery(question); setResponse(liveResponse); setReplayState('idle'); setVisibleTimelineCount(liveResponse.timeline.length); setVisibleEvidenceCount(liveResponse.evidence.length); }
    } catch (error) { setRunError(error instanceof DOMException && error.name === 'TimeoutError' ? 'Live Agent 超时。此次请求未生成伪造结果，请稍后重试。' : 'Live Backend 当前不可用。Replay 模式仍可正常浏览。'); } finally { setRunning(false); }
  };
  return <main className="workbench-shell">{showReleaseRibbon && <div className="release-ribbon"><span>当前发布</span><strong>Structured Query Stable v1.0</strong><i /> <strong>Textual 2-hop Baseline</strong><button type="button" className="release-ribbon-close" onClick={() => setShowReleaseRibbon(false)} aria-label="关闭发布说明" title="关闭发布说明"><X size={15} /></button></div>}<MobileTabs active={mobilePanel} onChange={setMobilePanel} /><div className="workbench-grid"><CasePanel cases={data.cases} selected={selected} mode={mode} question={question} running={running} health={health} onSelect={selectCase} onMode={switchMode} onQuestion={setQuestion} onRun={run} /><div className={`result-column mobile-${mobilePanel}`} ref={resultScrollRef}><div className="answer-slot"><AnswerPanel response={response} runError={runError} replayState={replayState} isReplay={mode === 'replay'} onReplay={() => replayFrozenRun(selected)} /></div><div className="evidence-slot"><EvidenceChain response={response} replayState={replayState} visibleEvidenceCount={visibleEvidenceCount} /></div></div><div className={`trace-slot mobile-${mobilePanel}`}><AgentTrace response={response} replayState={replayState} visibleTimelineCount={visibleTimelineCount} /></div></div></main>;
}
