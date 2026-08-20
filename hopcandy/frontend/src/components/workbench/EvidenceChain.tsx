import { Fragment, useEffect, useState } from 'react';
import { Check, ChevronDown, FileText, History, Search, ShieldCheck } from 'lucide-react';
import { formatMetric, humanize } from '../../lib/format';
import { displaySubQuery, evidenceRelation, evidenceStepReferences, plannedSubQuery } from '../../lib/evidenceRelations';
import { traceToolLabel } from '../../data/workbenchPresentation';
import type { EvidenceItem, HopCandyResponse } from '../../types';
import type { ReplayState } from '../../types/ui';

function EvidenceCard({ item, open, onToggle }: { item: EvidenceItem; open: boolean; onToggle: () => void }) {
  const subQuery = displaySubQuery(item.sub_query);
  return <article className={`evidence-card ${item.is_gold ? 'gold' : ''}`}><button className="evidence-summary" onClick={onToggle} aria-expanded={open}><span className="hop-chip">H{item.hop ?? '–'}</span><span className="evidence-title"><strong>{item.company ?? 'Source'} · {item.report_year ?? 'N/A'}</strong><small>{item.section ?? item.document_id}</small></span>{item.is_gold && <span className="gold-chip"><Check size={12} /> 金标</span>}<ChevronDown className={open ? 'rotate' : ''} size={17} /></button>{open && <div className="evidence-body">{subQuery && <p className="sub-query"><Search size={14} /><span><small>检索子问题</small>{subQuery}</span></p>}<span className="source-excerpt-label">原文证据</span><blockquote>{item.text}</blockquote><footer><code>{item.chunk_id}</code><span>{humanize(item.tool)}</span>{item.score !== null && <span>分数 {formatMetric(item.score)}</span>}</footer></div>}</article>;
}

function ChainEvidenceCard({ item, subQuery, detailOpen, onDetailToggle }: { item: EvidenceItem; subQuery: string | null; detailOpen: boolean; onDetailToggle: () => void }) {
  return <article className="chain-evidence-card"><div className="chain-evidence-head"><span className="hop-chip">H{item.hop ?? '–'}</span><div><strong>HOP {item.hop ?? '–'}</strong><span>{item.company ?? 'Source'} · {item.report_year ?? 'N/A'}</span></div><span className="gold-chip"><Check size={12} /> 金标</span></div>{subQuery && <div className="chain-row"><span>子问题</span><p>{subQuery}</p></div>}<div className="chain-row"><span>来源</span><p>{item.section ?? item.document_id}</p></div><div className="chain-excerpt"><span>原文证据</span><blockquote>{item.text}</blockquote></div><button className="evidence-detail-toggle" type="button" onClick={onDetailToggle} aria-expanded={detailOpen}><span>查看工程字段</span><ChevronDown className={detailOpen ? 'rotate' : ''} size={15} /></button><div className={`evidence-detail-list ${detailOpen ? 'is-open' : ''}`} aria-hidden={!detailOpen} inert={!detailOpen}><div><code>{item.chunk_id}</code><span>{item.document_id}</span>{item.page !== null && <span>第 {item.page} 页</span>}<span>{traceToolLabel(item.tool)}</span>{item.score !== null && <span>分数 {formatMetric(item.score)}</span>}</div></div></article>;
}

function ChainConnector({ previous, next, response }: { previous: EvidenceItem; next: EvidenceItem; response: HopCandyResponse }) {
  const relation = evidenceRelation(previous, next, response.plan, evidenceStepReferences(response.timeline));
  return <div className={`chain-connector ${relation.kind === 'dependent' ? 'has-bridge' : ''}`}><span className="chain-arrow" aria-hidden="true">↓</span>{relation.detail ? <div><span>{relation.label}</span><p>{relation.detail}</p></div> : <small>{relation.label}</small>}</div>;
}

export function EvidenceChain({ response, replayState, visibleEvidenceCount }: { response: HopCandyResponse; replayState: ReplayState; visibleEvidenceCount: number }) {
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [detailIds, setDetailIds] = useState<string[]>([]);
  const [showSupplemental, setShowSupplemental] = useState(false);
  useEffect(() => { setOpenIds([]); setDetailIds([]); setShowSupplemental(false); }, [response.request_id]);
  const displayedEvidence = replayState === 'playing' ? response.evidence.slice(0, visibleEvidenceCount) : response.evidence;
  const goldEvidence = displayedEvidence.filter((item) => item.is_gold).sort((left, right) => (left.hop ?? Number.MAX_SAFE_INTEGER) - (right.hop ?? Number.MAX_SAFE_INTEGER));
  const stepReferences = evidenceStepReferences(response.timeline);
  const supplementalEvidence = displayedEvidence.filter((item) => !item.is_gold);
  const awaitingGoldEvidence = replayState === 'playing' && goldEvidence.length === 0;
  return <section className={`evidence-panel ${replayState === 'playing' ? 'is-replaying' : ''}`}><div className="panel-title"><h2>证据链</h2><small>{goldEvidence.length} 个金标 · {supplementalEvidence.length} 个补充</small></div>{response.evidence.length === 0 ? <div className="empty-state"><FileText size={23} /><strong>没有返回证据</strong><span>{response.status === 'clarification' ? '澄清分支未启动检索。' : '系统选择了安全弃答。'}</span></div> : displayedEvidence.length === 0 || awaitingGoldEvidence ? <div className="replay-placeholder"><History size={19} /><span>正在依据冻结轨迹揭示证据链…</span></div> : <>{goldEvidence.length > 0 ? <div className="evidence-chain">{goldEvidence.map((item, index) => <Fragment key={item.evidence_id}><ChainEvidenceCard item={item} subQuery={plannedSubQuery(item, response.plan, stepReferences)} detailOpen={detailIds.includes(item.evidence_id)} onDetailToggle={() => setDetailIds((ids) => ids.includes(item.evidence_id) ? ids.filter((id) => id !== item.evidence_id) : [...ids, item.evidence_id])} />{index < goldEvidence.length - 1 && <ChainConnector previous={item} next={goldEvidence[index + 1]} response={response} />}</Fragment>)}</div> : <div className="no-gold-evidence"><ShieldCheck size={18} /><div><strong>没有金标证据</strong><span>该运行没有可展示的 Gold Evidence；补充检索结果仍可按需查看。</span></div></div>}{supplementalEvidence.length > 0 && <div className="supplemental-evidence"><button className="supplemental-toggle" type="button" aria-expanded={showSupplemental} onClick={() => setShowSupplemental((value) => !value)}><span>补充检索证据</span><small>{supplementalEvidence.length} 个片段</small><ChevronDown className={showSupplemental ? 'rotate' : ''} size={17} /></button><div className={`supplemental-list ${showSupplemental ? 'is-open' : ''}`} aria-hidden={!showSupplemental} inert={!showSupplemental}><div className="supplemental-list-inner">{supplementalEvidence.map((item) => <EvidenceCard key={item.evidence_id} item={item} open={openIds.includes(item.evidence_id)} onToggle={() => setOpenIds((ids) => ids.includes(item.evidence_id) ? ids.filter((id) => id !== item.evidence_id) : [...ids, item.evidence_id])} />)}</div></div></div>}</>}</section>;
}
