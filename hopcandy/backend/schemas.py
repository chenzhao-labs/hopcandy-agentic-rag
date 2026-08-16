"""Versioned response models shared by Replay and Live query modes."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


API_SCHEMA_VERSION = "hopcandy-api-v1"
BACKEND_VERSION = "hopcandy-backend-v0.1"


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class QueryRequest(ContractModel):
    question: str = Field(min_length=1, max_length=1000)
    request_id: str | None = Field(default=None, min_length=1, max_length=128)


class LiveStatus(ContractModel):
    enabled: bool
    ready: bool
    state: Literal["offline", "on_demand", "busy", "misconfigured"]
    model: str
    concurrency_limit: int = Field(ge=1)
    timeout_seconds: float = Field(gt=0)
    missing_configuration: list[str] = Field(default_factory=list)


class HealthResponse(ContractModel):
    api_schema_version: Literal["hopcandy-api-v1"] = API_SCHEMA_VERSION
    backend_version: Literal["hopcandy-backend-v0.1"] = BACKEND_VERSION
    status: Literal["ok", "degraded"]
    replay_available: bool
    live: LiveStatus


class MetaResponse(ContractModel):
    api_schema_version: Literal["hopcandy-api-v1"] = API_SCHEMA_VERSION
    backend_version: Literal["hopcandy-backend-v0.1"] = BACKEND_VERSION
    fixture_version: str
    fixture_bundle_sha256: str
    contract_bundle_sha256: str
    publication_version: str
    publication_bundle_sha256: str
    data_scope: str
    capabilities: dict[str, str]


class PublicationRowsResponse(ContractModel):
    api_schema_version: Literal["hopcandy-api-v1"] = API_SCHEMA_VERSION
    publication_version: str
    source: Literal["bundled_json_fallback"]
    row_count: int = Field(ge=0)
    rows: list[dict[str, Any]] = Field(default_factory=list)


class RouteInfo(ContractModel):
    category: Literal["structured", "textual", "unknown"]
    query_type: str
    path_type: str
    structured_route: str | None = None
    decision_source: str


class RunMetrics(ContractModel):
    latency_ms: float = Field(ge=0)
    iterations: int = Field(ge=0)
    tool_calls: int = Field(ge=0)
    evidence_count: int = Field(ge=0)
    replans: int = Field(ge=0)
    hop_recall: float | None = Field(default=None, ge=0, le=1)
    grounding_status: Literal[
        "grounded", "partial", "abstained", "not_applicable", "unknown"
    ]


class PlanStep(ContractModel):
    plan_id: str
    iteration: int = Field(ge=1)
    step_id: int = Field(ge=1)
    sub_query: str
    tool: str
    depends_on: list[int] = Field(default_factory=list)
    status: str


class EvidenceCard(ContractModel):
    evidence_id: str
    chunk_id: str
    document_id: str | None = None
    company: str | None = None
    report_year: int | None = None
    section: str | None = None
    page: int | None = None
    text: str
    tool: str | None = None
    score: float | None = None
    hop: int | None = None
    sub_query: str | None = None
    is_gold: bool | None = None
    retrieval_count: int = Field(default=0, ge=0)


class VerificationEvent(ContractModel):
    verification_id: str
    iteration: int = Field(ge=1)
    verdict: Literal["sufficient", "insufficient", "unknown"]
    feedback: str


class ReplanEvent(ContractModel):
    replan_id: str
    iteration: int = Field(ge=2)
    reason: str
    feedback: str
    new_chunk_count: int = Field(default=0, ge=0)
    new_gold_hops: int = Field(default=0, ge=0)


class GroundingSummary(ContractModel):
    status: Literal[
        "grounded", "partial", "abstained", "not_applicable", "unknown"
    ]
    complete: bool | None = None
    hop_recall: float | None = Field(default=None, ge=0, le=1)
    abstention_reason: str | None = None
    final_verdict: str | None = None


class TimelineEvent(ContractModel):
    event_id: str
    sequence: int = Field(ge=1)
    node: str
    event_type: str
    status: Literal["completed", "sufficient", "insufficient", "abstained", "error"]
    title: str
    detail: str
    iteration: int | None = Field(default=None, ge=1)
    step_id: int | None = Field(default=None, ge=1)
    tool: str | None = None
    latency_ms: float | None = Field(default=None, ge=0)
    evidence_ids: list[str] = Field(default_factory=list)


class WarningItem(ContractModel):
    code: str
    message: str
    severity: Literal["info", "warning", "error"]


class ScopeInfo(ContractModel):
    companies: list[str] = Field(default_factory=list)
    years: list[int] = Field(default_factory=list)
    corpus: str
    hop_count: int = Field(ge=0)
    answerability: str
    release_label: str
    release_name: str


class ResponseProvenance(ContractModel):
    source_kind: Literal["frozen_replay", "live", "error"]
    case_id: str | None = None
    fixture_version: str | None = None
    source_result_sha256: str | None = None
    source_row_sha256: str | None = None


class PublicError(ContractModel):
    code: str
    message: str
    retryable: bool


class QueryResponse(ContractModel):
    api_schema_version: Literal["hopcandy-api-v1"] = API_SCHEMA_VERSION
    request_id: str
    mode: Literal["replay", "live"]
    status: Literal["success", "clarification", "abstained", "error"]
    question: str
    answer: str
    route: RouteInfo
    model: str
    metrics: RunMetrics
    timeline: list[TimelineEvent] = Field(default_factory=list)
    plan: list[PlanStep] = Field(default_factory=list)
    evidence: list[EvidenceCard] = Field(default_factory=list)
    verification: list[VerificationEvent] = Field(default_factory=list)
    replans: list[ReplanEvent] = Field(default_factory=list)
    grounding: GroundingSummary
    warnings: list[WarningItem] = Field(default_factory=list)
    scope: ScopeInfo
    provenance: ResponseProvenance
    error: PublicError | None = None
