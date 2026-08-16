export type RunStatus = 'success' | 'clarification' | 'abstained' | 'error';

export interface RouteDecision {
  category: string;
  query_type: string;
  path_type: string;
  structured_route: string | null;
  decision_source: string;
}

export interface RunMetrics {
  latency_ms: number | null;
  iterations: number;
  tool_calls: number;
  evidence_count: number;
  replans: number;
  hop_recall: number | null;
  grounding_status: string;
}

export interface TimelineEvent {
  event_id: string;
  sequence: number;
  node: string;
  event_type: string;
  status: string;
  title: string;
  detail: string;
  iteration: number | null;
  step_id: number | null;
  tool: string | null;
  latency_ms: number | null;
  evidence_ids: string[];
}

export interface PlanStep {
  plan_id: string;
  iteration: number;
  step_id: number;
  sub_query: string;
  tool: string;
  depends_on: number[];
  status: string;
}

export interface EvidenceItem {
  evidence_id: string;
  chunk_id: string;
  document_id: string;
  company: string | null;
  report_year: number | null;
  section: string | null;
  page: number | null;
  text: string;
  tool: string;
  score: number | null;
  hop: number | null;
  sub_query: string | null;
  is_gold: boolean | null;
  retrieval_count: number;
}

export interface VerificationItem {
  verification_id: string;
  iteration: number;
  verdict: string;
  feedback: string;
}

export interface ReplanItem {
  replan_id: string;
  iteration: number;
  reason: string;
  missing_evidence: string[];
}

export interface GroundingSummary {
  status: string;
  complete: boolean;
  hop_recall: number | null;
  abstention_reason: string | null;
  final_verdict: string;
}

export interface WarningItem {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export interface ScopeSummary {
  companies: string[];
  years: number[];
  corpus: string;
  hop_count: number;
  answerability: string;
  release_label: string;
  release_name: string;
}

export interface HopCandyResponse {
  api_schema_version: 'hopcandy-api-v1';
  request_id: string;
  mode: 'replay' | 'live';
  status: RunStatus;
  question: string;
  answer: string;
  route: RouteDecision;
  model: string;
  metrics: RunMetrics;
  timeline: TimelineEvent[];
  plan: PlanStep[];
  evidence: EvidenceItem[];
  verification: VerificationItem[];
  replans: ReplanItem[];
  grounding: GroundingSummary;
  warnings: WarningItem[];
  scope: ScopeSummary;
  provenance: Record<string, unknown>;
  error: { code: string; message: string; retryable: boolean } | null;
}

export interface DemoCase {
  id: string;
  display_order: number;
  title: string;
  case_type: string;
  release_label: string;
  release_name: string;
  response: HopCandyResponse;
  fixture_version: string;
  fixture_bundle_sha256: string;
  api_schema_version: string;
  contract_bundle_sha256: string;
  published: boolean;
}

export interface ExperimentRow {
  id: string;
  display_order: number;
  name: string;
  label: string;
  status: string;
  scope: string;
  metrics: Record<string, number | string | null>;
  source_sha256: string;
  fixture_version: string;
  fixture_bundle_sha256: string;
  published: boolean;
}

export interface PublicationEnvelope<T> {
  schema_version: string;
  publication_version: string;
  fixture_version: string;
  fixture_bundle_sha256: string;
  row_count: number;
  rows: T[];
}

export interface PublicationManifest {
  schema_version: string;
  publication_version: string;
  status: string;
  fixture_version: string;
  fixture_bundle_sha256: string;
  api_schema_version: string;
  contract_bundle_sha256: string;
  row_counts: Record<string, number>;
  publication_bundle_sha256: string;
}

export interface PublicationData {
  cases: DemoCase[];
  experiments: ExperimentRow[];
  manifest: PublicationManifest;
  source: 'supabase' | 'bundled';
}

export interface LiveHealth {
  status: string;
  replay_available: boolean;
  live: {
    enabled: boolean;
    ready: boolean;
    state: 'offline' | 'on_demand' | 'busy' | 'misconfigured' | string;
    model: string | null;
  };
}
