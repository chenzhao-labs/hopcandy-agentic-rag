"""Convert heterogeneous Agent states into the stable HopCandy API contract."""

from __future__ import annotations

from collections import Counter, defaultdict
import re
from typing import Any

from .schemas import (
    API_SCHEMA_VERSION,
    EvidenceCard,
    GroundingSummary,
    PlanStep,
    PublicError,
    QueryResponse,
    ReplanEvent,
    ResponseProvenance,
    RouteInfo,
    RunMetrics,
    ScopeInfo,
    TimelineEvent,
    VerificationEvent,
    WarningItem,
)


_EVIDENCE_HEADER = re.compile(r"(?m)^\[([^\]\r\n]+)\]\s*([^\r\n]*)")
_CHUNK_ID = re.compile(r"^(bd|tx)_(\d{4})_ar(?:_|$)", re.IGNORECASE)
_WINDOWS_PATH = re.compile(r"(?i)\b[A-Z]:\\[^\r\n\t\"']+")
_ROOT_PATH = re.compile(r"/root/[^\s\"']+")
_SECRET = re.compile(r"(?:sk-[A-Za-z0-9_-]{16,}|sb_secret_[A-Za-z0-9_-]+)")
_TRACEBACK = re.compile(r"Traceback \(most recent call last\):[\s\S]*", re.IGNORECASE)
_COMPANY = {"bd": "Baidu", "tx": "Tencent"}


def _safe_text(value: Any, *, limit: int | None = None) -> str:
    text = "" if value is None else str(value)
    text = _WINDOWS_PATH.sub("[redacted-path]", text)
    text = _ROOT_PATH.sub("[redacted-path]", text)
    text = _SECRET.sub("[redacted-secret]", text)
    text = _TRACEBACK.sub("[internal error details removed]", text)
    if limit is not None and len(text) > limit:
        return text[: max(0, limit - 1)].rstrip() + "…"
    return text


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _last_event(trace: list[dict[str, Any]], node: str) -> dict[str, Any]:
    return next((event for event in reversed(trace) if event.get("node") == node), {})


def _router(trace: list[dict[str, Any]]) -> dict[str, Any]:
    return next((event for event in trace if event.get("node") == "router"), {})


def _status(result: dict[str, Any], trace: list[dict[str, Any]]) -> str:
    if str(result.get("status", "")).lower() in {"error", "failed", "system_error"}:
        return "error"
    structured = _last_event(trace, "structured_fast_path")
    if structured.get("structured_status") == "clarification":
        return "clarification"
    if result.get("abstention_reason") or result.get("evidence_exhausted"):
        return "abstained"
    synth = _last_event(trace, "synthesizer")
    if synth.get("abstention_reason") or synth.get("structured_status") == "evidence_exhausted":
        return "abstained"
    return "success"


def _grounding_status(
    status: str, result: dict[str, Any], trace: list[dict[str, Any]]
) -> str:
    if status == "abstained":
        return "abstained"
    if status in {"clarification", "error"}:
        return "not_applicable"
    hop_recall = result.get("diagnostics", {}).get("hop_recall")
    synth = _last_event(trace, "synthesizer")
    if hop_recall is not None and float(hop_recall) < 1:
        return "partial"
    if synth.get("grounding_complete") is True or hop_recall == 1:
        return "grounded"
    return "unknown"


def _route(result: dict[str, Any], trace: list[dict[str, Any]]) -> RouteInfo:
    router = _router(trace)
    query_type = _safe_text(router.get("query_type") or result.get("query_type") or "unknown")
    structured_route = router.get("structured_route")
    category = "structured" if structured_route else "textual"
    if not router:
        category = "unknown"
    return RouteInfo(
        category=category,
        query_type=query_type,
        path_type=_safe_text(router.get("path_type") or "unknown"),
        structured_route=_safe_text(structured_route) if structured_route else None,
        decision_source=_safe_text(router.get("decision_source") or "unknown"),
    )


def _plan(trace: list[dict[str, Any]]) -> list[PlanStep]:
    output: list[PlanStep] = []
    for event in trace:
        if event.get("node") != "planner":
            continue
        iteration = int(event.get("iteration") or 1)
        for step in _as_list(event.get("plan")):
            step_id = int(step.get("id") or len(output) + 1)
            output.append(
                PlanStep(
                    plan_id=f"plan-{iteration}-{step_id}",
                    iteration=iteration,
                    step_id=step_id,
                    sub_query=_safe_text(step.get("sub_query")),
                    tool=_safe_text(step.get("tool") or "unknown"),
                    depends_on=[int(value) for value in _as_list(step.get("depends_on"))],
                    status=_safe_text(step.get("status") or "unknown"),
                )
            )
    return output


def _gold_hops(contract: dict[str, Any]) -> tuple[dict[str, int], set[str]]:
    by_chunk: dict[str, int] = {}
    gold: set[str] = set()
    for hop in _as_list(contract.get("hops")):
        hop_index = int(hop.get("hop_idx") or hop.get("hop_id") or 0)
        chunk_ids: list[str] = []
        for key in ("acceptable_chunk_ids", "doc_chunk_ids"):
            chunk_ids.extend(str(item) for item in _as_list(hop.get(key)))
        for key in ("primary_chunk_id", "doc_chunk_id"):
            if hop.get(key):
                chunk_ids.append(str(hop[key]))
        for chunk_id in chunk_ids:
            gold.add(chunk_id)
            if hop_index:
                by_chunk.setdefault(chunk_id, hop_index)
    return by_chunk, gold


def _executor_lookup(
    trace: list[dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], Counter[str]]:
    lookup: dict[str, dict[str, Any]] = {}
    counts: Counter[str] = Counter()
    current_iteration = 1
    for event in trace:
        if event.get("node") == "planner":
            current_iteration = int(event.get("iteration") or current_iteration)
        if event.get("node") != "executor":
            continue
        enriched = {**event, "_iteration": current_iteration}
        for chunk_id in _as_list(event.get("result_chunk_ids")):
            chunk_id = str(chunk_id)
            counts[chunk_id] += 1
            lookup.setdefault(chunk_id, enriched)
    return lookup, counts


def _document_metadata(chunk_id: str, header: str) -> dict[str, Any]:
    match = _CHUNK_ID.match(chunk_id)
    document_id = None
    company = None
    report_year = None
    if match:
        company = _COMPANY.get(match.group(1).lower())
        report_year = int(match.group(2))
        document_id = f"{match.group(1).lower()}_{match.group(2)}_ar"
    section = None
    if " - " in header:
        candidate = header.rsplit(" - ", 1)[-1].strip()
        section = candidate or None
    return {
        "document_id": document_id,
        "company": company,
        "report_year": report_year,
        "section": _safe_text(section) if section else None,
    }


def _evidence(
    result: dict[str, Any],
    trace: list[dict[str, Any]],
    contract: dict[str, Any],
) -> tuple[list[EvidenceCard], dict[str, str]]:
    raw = _safe_text(result.get("evidence_text"))
    matches = list(_EVIDENCE_HEADER.finditer(raw))
    executors, retrieval_counts = _executor_lookup(trace)
    gold_hops, gold_chunks = _gold_hops(contract)
    cards: list[EvidenceCard] = []
    id_by_chunk: dict[str, str] = {}
    for index, match in enumerate(matches, start=1):
        chunk_id = _safe_text(match.group(1)).strip()
        header = _safe_text(match.group(2)).strip()
        end = matches[index].start() if index < len(matches) else len(raw)
        body = raw[match.end() : end].strip()
        text = (header + ("\n" + body if body else "")).strip()
        executor = executors.get(chunk_id, {})
        hop = gold_hops.get(chunk_id)
        if hop is None and executor.get("step_id") is not None:
            hop = int(executor["step_id"])
        evidence_id = f"evidence-{index}"
        id_by_chunk[chunk_id] = evidence_id
        cards.append(
            EvidenceCard(
                evidence_id=evidence_id,
                chunk_id=chunk_id,
                text=_safe_text(text),
                tool=_safe_text(executor.get("tool")) if executor.get("tool") else None,
                score=None,
                hop=hop,
                sub_query=_safe_text(executor.get("executed_query"), limit=1000)
                if executor.get("executed_query")
                else None,
                is_gold=chunk_id in gold_chunks if gold_chunks else None,
                retrieval_count=retrieval_counts.get(chunk_id, 0),
                page=None,
                **_document_metadata(chunk_id, header),
            )
        )
    return cards, id_by_chunk


def _verification(trace: list[dict[str, Any]]) -> list[VerificationEvent]:
    output: list[VerificationEvent] = []
    iteration = 1
    for event in trace:
        if event.get("node") == "planner":
            iteration = int(event.get("iteration") or iteration)
        if event.get("node") != "verifier":
            continue
        raw_verdict = str(event.get("verdict") or "unknown").lower()
        verdict = raw_verdict if raw_verdict in {"sufficient", "insufficient"} else "unknown"
        output.append(
            VerificationEvent(
                verification_id=f"verification-{len(output) + 1}",
                iteration=iteration,
                verdict=verdict,
                feedback=_safe_text(event.get("feedback"), limit=2000),
            )
        )
    return output


def _replans(
    trace: list[dict[str, Any]], result: dict[str, Any]
) -> list[ReplanEvent]:
    rounds = {
        int(item.get("replan_index") or 0): item
        for item in _as_list(result.get("replan_diagnostics", {}).get("rounds"))
    }
    output: list[ReplanEvent] = []
    last_feedback = ""
    for event in trace:
        if event.get("node") == "verifier":
            last_feedback = _safe_text(event.get("feedback"), limit=2000)
        if event.get("node") != "planner":
            continue
        iteration = int(event.get("iteration") or 1)
        if iteration <= 1:
            continue
        round_data = rounds.get(iteration - 1, {})
        output.append(
            ReplanEvent(
                replan_id=f"replan-{iteration - 1}",
                iteration=iteration,
                reason=_safe_text(event.get("replan_reason") or "verifier_feedback"),
                feedback=last_feedback,
                new_chunk_count=int(round_data.get("new_chunk_count") or 0),
                new_gold_hops=int(round_data.get("new_gold_hop_count") or 0),
            )
        )
    return output


def _event_detail(event: dict[str, Any], event_type: str) -> tuple[str, str, str]:
    node = str(event.get("node") or "unknown")
    if node == "router":
        route = event.get("structured_route") or event.get("query_type") or "unknown"
        return "Route selected", _safe_text(route), "completed"
    if node == "planner":
        iteration = int(event.get("iteration") or 1)
        kind = "Plan revised" if iteration > 1 else "Plan created"
        return kind, f"{len(_as_list(event.get('plan')))} steps", "completed"
    if node == "executor":
        tool = _safe_text(event.get("tool") or "unknown")
        status = str(event.get("tool_result_status", {}).get("status") or "success")
        return f"{tool} completed", f"{int(event.get('num_results') or 0)} results", "error" if status == "error" else "completed"
    if node == "verifier":
        verdict = str(event.get("verdict") or "unknown")
        status = verdict if verdict in {"sufficient", "insufficient"} else "completed"
        return "Evidence verified", _safe_text(event.get("feedback") or verdict, limit=1000), status
    if node == "synthesizer":
        abstained = bool(event.get("abstention_reason"))
        return ("Answer abstained" if abstained else "Answer generated", _safe_text(event.get("abstention_reason") or "Synthesis completed"), "abstained" if abstained else "completed")
    if node == "structured_fast_path":
        clarification = event.get("structured_status") == "clarification"
        return ("Clarification requested" if clarification else "Structured fast path completed", _safe_text(event.get("structured_status") or "completed"), "completed")
    if node == "entity_resolver":
        return "Entity resolved", _safe_text(event.get("resolved_entity") or event.get("selection") or "Entity binding completed", limit=1000), "completed"
    return node.replace("_", " ").title(), event_type, "completed"


def _timeline(
    trace: list[dict[str, Any]], id_by_chunk: dict[str, str]
) -> list[TimelineEvent]:
    output: list[TimelineEvent] = []
    iteration = 1
    for sequence, event in enumerate(trace, start=1):
        node = _safe_text(event.get("node") or "unknown")
        if node == "planner":
            iteration = int(event.get("iteration") or iteration)
        event_type = {
            "router": "route_decision",
            "planner": "plan_revised" if iteration > 1 else "plan_created",
            "executor": "tool_completed",
            "verifier": "evidence_sufficient" if event.get("verdict") == "sufficient" else "evidence_insufficient",
            "synthesizer": "abstained" if event.get("abstention_reason") else "answer_generated",
            "structured_fast_path": "clarification_requested" if event.get("structured_status") == "clarification" else "fast_path_completed",
            "entity_resolver": "entity_resolved",
        }.get(node, "node_completed")
        title, detail, status = _event_detail(event, event_type)
        evidence_ids = [
            id_by_chunk[chunk_id]
            for chunk_id in _as_list(event.get("result_chunk_ids"))
            if chunk_id in id_by_chunk
        ]
        output.append(
            TimelineEvent(
                event_id=f"event-{sequence}",
                sequence=sequence,
                node=node,
                event_type=event_type,
                status=status,
                title=title,
                detail=detail,
                iteration=iteration if node in {"planner", "executor", "verifier"} else None,
                step_id=int(event["step_id"]) if event.get("step_id") is not None else None,
                tool=_safe_text(event.get("tool")) if event.get("tool") else None,
                latency_ms=float(event["retrieval_latency_ms"])
                if event.get("retrieval_latency_ms") is not None
                else None,
                evidence_ids=evidence_ids,
            )
        )
    return output


def _scope(
    contract: dict[str, Any],
    trace: list[dict[str, Any]],
    release: dict[str, Any],
) -> ScopeInfo:
    companies: set[str] = set()
    years: set[int] = set()
    classification = _router(trace).get("classification") or {}
    companies.update(str(value) for value in _as_list(classification.get("companies")))
    years.update(int(value) for value in _as_list(classification.get("years")))
    for hop in _as_list(contract.get("hops")):
        for key in ("company", "resolved_company"):
            if hop.get(key):
                companies.add(str(hop[key]))
        doc_ids = list(_as_list(hop.get("doc_ids")))
        doc_ids.extend(_as_list(hop.get("doc_chunk_ids")))
        if hop.get("doc_chunk_id"):
            doc_ids.append(hop["doc_chunk_id"])
        if hop.get("primary_chunk_id"):
            doc_ids.append(hop["primary_chunk_id"])
        for doc_id in doc_ids:
            match = _CHUNK_ID.match(str(doc_id))
            if match:
                companies.add(_COMPANY.get(match.group(1).lower(), match.group(1)))
                years.add(int(match.group(2)))
    return ScopeInfo(
        companies=sorted(companies),
        years=sorted(years),
        corpus="Baidu and Tencent annual reports (2023-2025)",
        hop_count=int(contract.get("hop_count") or 0),
        answerability=_safe_text(contract.get("answerability") or "unknown"),
        release_label=_safe_text(release.get("label") or "Unspecified"),
        release_name=_safe_text(release.get("name") or "Unspecified"),
    )


def _warnings(
    mode: str,
    status: str,
    release: dict[str, Any],
    result: dict[str, Any],
    evidence: list[EvidenceCard],
) -> list[WarningItem]:
    output: list[WarningItem] = []
    if mode == "replay":
        output.append(WarningItem(code="FROZEN_REPLAY", message="This is a frozen experiment replay, not a live query.", severity="info"))
    label = release.get("label")
    if label == "Development Baseline":
        output.append(WarningItem(code="DEVELOPMENT_BASELINE", message="Textual 2-hop behavior is a development baseline with known limitations.", severity="warning"))
    elif label == "Ablation":
        output.append(WarningItem(code="ABLATION_ONLY", message="This result is a model-scale ablation, not an independent release result.", severity="warning"))
    hop_recall = result.get("diagnostics", {}).get("hop_recall")
    if hop_recall is not None and float(hop_recall) < 1:
        output.append(WarningItem(code="PARTIAL_GOLD_CHAIN", message=f"Only {float(hop_recall):.3f} of the Gold evidence hops were recalled.", severity="warning"))
    if status == "abstained":
        output.append(WarningItem(code="EVIDENCE_EXHAUSTED", message="The system abstained after the verifier remained insufficient.", severity="warning"))
    if result.get("evidence_text") and not evidence:
        output.append(WarningItem(code="EVIDENCE_PARSE_EMPTY", message="Evidence text was present but no evidence cards could be parsed.", severity="error"))
    return output


def adapt_result(
    result: dict[str, Any],
    *,
    request_id: str,
    mode: str,
    model: str,
    contract: dict[str, Any] | None = None,
    release: dict[str, Any] | None = None,
    provenance: dict[str, Any] | None = None,
    case_id: str | None = None,
    fixture_version: str | None = None,
) -> QueryResponse:
    """Adapt one frozen result row or live result state without mutating it."""
    contract = contract or {}
    release = release or {}
    provenance = provenance or {}
    trace = [event for event in _as_list(result.get("execution_trace")) if isinstance(event, dict)]
    status = _status(result, trace)
    grounding_status = _grounding_status(status, result, trace)
    evidence, evidence_ids = _evidence(result, trace, contract)
    diagnostics = result.get("diagnostics") or {}
    replan_diagnostics = result.get("replan_diagnostics") or {}
    verifier_diagnostics = result.get("verifier_diagnostics") or {}
    synth = _last_event(trace, "synthesizer")
    response = QueryResponse(
        api_schema_version=API_SCHEMA_VERSION,
        request_id=_safe_text(request_id),
        mode=mode,
        status=status,
        question=_safe_text(result.get("question")),
        answer=_safe_text(result.get("prediction") or synth.get("answer")),
        route=_route(result, trace),
        model=_safe_text(model or "unknown"),
        metrics=RunMetrics(
            latency_ms=round(float(result.get("latency") or 0) * 1000, 3),
            iterations=int(diagnostics.get("iteration_count") or 0),
            tool_calls=int(diagnostics.get("total_tool_calls") or 0),
            evidence_count=len(evidence),
            replans=int(replan_diagnostics.get("num_replans") or 0),
            hop_recall=float(diagnostics["hop_recall"])
            if diagnostics.get("hop_recall") is not None
            else None,
            grounding_status=grounding_status,
        ),
        timeline=_timeline(trace, evidence_ids),
        plan=_plan(trace),
        evidence=evidence,
        verification=_verification(trace),
        replans=_replans(trace, result),
        grounding=GroundingSummary(
            status=grounding_status,
            complete=synth.get("grounding_complete"),
            hop_recall=float(diagnostics["hop_recall"])
            if diagnostics.get("hop_recall") is not None
            else None,
            abstention_reason=_safe_text(synth.get("abstention_reason")) or None,
            final_verdict=_safe_text(verifier_diagnostics.get("final_verdict")) or None,
        ),
        warnings=_warnings(mode, status, release, result, evidence),
        scope=_scope(contract, trace, release),
        provenance=ResponseProvenance(
            source_kind="frozen_replay" if mode == "replay" else "live",
            case_id=case_id,
            fixture_version=fixture_version,
            source_result_sha256=provenance.get("result_file_sha256"),
            source_row_sha256=provenance.get("result_row_sha256"),
        ),
        error=None,
    )
    return response


def adapt_fixture_case(
    case: dict[str, Any],
    *,
    fixture_version: str,
    variant_id: str | None = None,
) -> QueryResponse:
    """Adapt one Step 0 fixture case, selecting an explicit ablation variant."""
    release = case.get("release") or {}
    if case.get("variants"):
        if not variant_id:
            raise ValueError("variant_id is required for a comparison case")
        variant = next(
            (item for item in case["variants"] if item.get("variant_id") == variant_id),
            None,
        )
        if variant is None:
            raise ValueError(f"unknown variant_id: {variant_id}")
        result = variant["result_snapshot"]
        model = variant.get("model") or "unknown"
        provenance = variant.get("provenance") or {}
        request_suffix = f"-{variant_id}"
    else:
        result = case["result_snapshot"]
        model = "Qwen3-8B" if "8B" in str(release.get("name")) else "Qwen3-4B"
        provenance = case.get("provenance") or {}
        request_suffix = ""
    return adapt_result(
        result,
        request_id=f"replay-{case['case_id']}{request_suffix}",
        mode="replay",
        model=model,
        contract=case.get("evaluation_contract") or {},
        release=release,
        provenance=provenance,
        case_id=case.get("case_id"),
        fixture_version=fixture_version,
    )


def adapt_error(
    *,
    request_id: str,
    question: str,
    mode: str = "live",
    model: str = "unknown",
    code: str = "INTERNAL_ERROR",
    message: str = "The query could not be completed.",
    retryable: bool = True,
) -> QueryResponse:
    """Return a stable public error without accepting an exception or stack trace."""
    return QueryResponse(
        request_id=_safe_text(request_id),
        mode=mode,
        status="error",
        question=_safe_text(question),
        answer="",
        route=RouteInfo(category="unknown", query_type="unknown", path_type="unknown", decision_source="error_boundary"),
        model=_safe_text(model),
        metrics=RunMetrics(latency_ms=0, iterations=0, tool_calls=0, evidence_count=0, replans=0, hop_recall=None, grounding_status="not_applicable"),
        timeline=[
            TimelineEvent(
                event_id="event-1",
                sequence=1,
                node="error_boundary",
                event_type="request_failed",
                status="error",
                title="Query failed",
                detail="Internal details were removed from the public response.",
            )
        ],
        grounding=GroundingSummary(status="not_applicable"),
        warnings=[WarningItem(code=_safe_text(code), message=_safe_text(message), severity="error")],
        scope=ScopeInfo(companies=[], years=[], corpus="Baidu and Tencent annual reports (2023-2025)", hop_count=0, answerability="unknown", release_label="Unspecified", release_name="Unspecified"),
        provenance=ResponseProvenance(source_kind="error"),
        error=PublicError(
            code=_safe_text(code),
            message=_safe_text(message),
            retryable=retryable,
        ),
    )
