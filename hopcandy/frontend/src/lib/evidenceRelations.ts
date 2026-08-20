import type { EvidenceItem, PlanStep, TimelineEvent } from '../types';

export type EvidenceStepReference = {
  iteration: number;
  stepId: number;
};

export type EvidenceRelation = {
  kind: 'dependent' | 'parallel' | 'supplemental';
  label: string;
  detail: string | null;
};

export function displaySubQuery(subQuery: string | null): string | null {
  if (!subQuery) return null;
  const withoutRuntimeContext = subQuery.split(/\s*\(?\s*dependency context:/i, 1)[0];
  const normalized = withoutRuntimeContext.replace(/\s+/g, ' ').trim();
  return normalized || null;
}

export function evidenceStepReferences(timeline: TimelineEvent[]): Map<string, EvidenceStepReference> {
  const references = new Map<string, EvidenceStepReference>();
  for (const event of timeline) {
    if (event.node !== 'executor' || event.step_id === null || event.iteration === null) continue;
    for (const evidenceId of event.evidence_ids) {
      references.set(evidenceId, { iteration: event.iteration, stepId: event.step_id });
    }
  }
  return references;
}

function planStepForReference(
  reference: EvidenceStepReference | undefined,
  plan: PlanStep[],
): PlanStep | undefined {
  if (!reference) return undefined;
  return plan.find((step) => step.iteration === reference.iteration && step.step_id === reference.stepId);
}

function sharesDependency(left: number[], right: number[]): boolean {
  return left.some((stepId) => right.includes(stepId));
}

export function plannedSubQuery(
  item: EvidenceItem,
  plan: PlanStep[],
  references: Map<string, EvidenceStepReference>,
): string | null {
  return planStepForReference(references.get(item.evidence_id), plan)?.sub_query ?? displaySubQuery(item.sub_query);
}

export function evidenceRelation(
  previous: EvidenceItem,
  next: EvidenceItem,
  plan: PlanStep[],
  references: Map<string, EvidenceStepReference>,
): EvidenceRelation {
  const previousReference = references.get(previous.evidence_id);
  const nextReference = references.get(next.evidence_id);
  const previousStep = planStepForReference(previousReference, plan);
  const nextStep = planStepForReference(nextReference, plan);

  if (nextStep) {
    if (
      previousReference
      && nextReference
      && previousReference.iteration === nextReference.iteration
      && nextStep.depends_on.includes(previousReference.stepId)
    ) {
      return {
        kind: 'dependent',
        label: '桥接关系',
        detail: `依赖步骤 ${previousReference.stepId} 的检索结果继续定位下一事实`,
      };
    }
    if (previousStep && sharesDependency(previousStep.depends_on, nextStep.depends_on)) {
      return { kind: 'parallel', label: '并行取证', detail: null };
    }
    if (nextStep.depends_on.length > 0) {
      return {
        kind: 'dependent',
        label: '桥接关系',
        detail: `依赖步骤 ${nextStep.depends_on.join('、')} 的检索结果继续定位下一事实`,
      };
    }
    return { kind: 'parallel', label: '并行取证', detail: null };
  }

  if (previous.hop !== null && previous.hop === next.hop) {
    return { kind: 'parallel', label: '并行取证', detail: null };
  }
  return { kind: 'supplemental', label: '补充取证', detail: null };
}
