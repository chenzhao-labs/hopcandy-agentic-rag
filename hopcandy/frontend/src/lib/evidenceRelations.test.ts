import { describe, expect, it } from 'vitest';
import { displaySubQuery, evidenceRelation, evidenceStepReferences, plannedSubQuery } from './evidenceRelations';
import type { EvidenceItem, PlanStep, TimelineEvent } from '../types';

const evidence = (id: string, hop: number): EvidenceItem => ({
  evidence_id: id,
  chunk_id: id,
  document_id: 'bd_2025_ar',
  company: 'Baidu',
  report_year: 2025,
  section: null,
  page: null,
  text: 'evidence',
  tool: 'hybrid_search',
  score: null,
  hop,
  sub_query: null,
  is_gold: true,
  retrieval_count: 1,
});

const plan: PlanStep[] = [
  { plan_id: 'plan-1-1', iteration: 1, step_id: 1, sub_query: 'Find the anchor fact.', tool: 'hybrid_search', depends_on: [], status: 'done' },
  { plan_id: 'plan-1-2', iteration: 1, step_id: 2, sub_query: 'Find the dependent fact.', tool: 'hybrid_search', depends_on: [1], status: 'done' },
  { plan_id: 'plan-1-3', iteration: 1, step_id: 3, sub_query: 'Find another fact from the same anchor.', tool: 'hybrid_search', depends_on: [1], status: 'done' },
];

const timeline = (id: string, stepId: number): TimelineEvent[] => [{
  event_id: `event-${id}`,
  sequence: stepId,
  node: 'executor',
  event_type: 'completed',
  status: 'completed',
  title: 'completed',
  detail: 'completed',
  iteration: 1,
  step_id: stepId,
  tool: 'hybrid_search',
  latency_ms: null,
  evidence_ids: [id],
}];

describe('evidence relation presentation', () => {
  it('removes runtime dependency context and normalizes whitespace', () => {
    expect(displaySubQuery('Find a fact\n (dependency context: raw\ncontext)')).toBe('Find a fact');
  });

  it('uses planner dependencies for a controlled bridge label', () => {
    const references = evidenceStepReferences([...timeline('left', 1), ...timeline('right', 2)]);
    expect(evidenceRelation(evidence('left', 1), evidence('right', 2), plan, references)).toEqual({
      kind: 'dependent',
      label: '桥接关系',
      detail: '依赖步骤 1 的检索结果继续定位下一事实',
    });
  });

  it('keeps sibling retrieval steps as parallel evidence', () => {
    const references = evidenceStepReferences([...timeline('left', 2), ...timeline('right', 3)]);
    expect(evidenceRelation(evidence('left', 2), evidence('right', 2), plan, references)).toEqual({
      kind: 'parallel',
      label: '并行取证',
      detail: null,
    });
  });

  it('prefers the planner query over a runtime-expanded query', () => {
    const item = { ...evidence('right', 2), sub_query: 'Find the dependent fact. (dependency context: raw text)' };
    const references = evidenceStepReferences(timeline('right', 2));
    expect(plannedSubQuery(item, plan, references)).toBe('Find the dependent fact.');
  });
});
