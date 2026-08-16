"""Normalize a live AgentState before applying the frozen public contract."""

from __future__ import annotations

from typing import Any

from .trace_adapter import adapt_result


def _evidence_text(state: dict[str, Any], limit: int = 12) -> str:
    parts: list[str] = []
    seen: set[str] = set()
    for entry in state.get("evidence", []):
        if not isinstance(entry, dict):
            continue
        for result in entry.get("results", []):
            if not isinstance(result, dict):
                continue
            chunk_id = str(result.get("chunk_id") or "").strip()
            if not chunk_id or chunk_id in seen:
                continue
            seen.add(chunk_id)
            title = str(result.get("title") or "").strip()
            text = str(result.get("text") or "").strip()[:1200]
            parts.append(f"[{chunk_id}] {title}\n{text}".strip())
            if len(parts) >= limit:
                return "\n\n".join(parts)
    return "\n\n".join(parts)


def _release(state: dict[str, Any]) -> dict[str, str]:
    router = next(
        (
            item
            for item in state.get("trace", [])
            if isinstance(item, dict) and item.get("node") == "router"
        ),
        {},
    )
    if router.get("structured_route"):
        return {"label": "Stable", "name": "Structured Query Stable v1.0"}
    return {
        "label": "Development Baseline",
        "name": "Textual 2-hop Baseline v0.1",
    }


def adapt_live_state(
    state: dict[str, Any],
    *,
    question: str,
    request_id: str,
    model: str,
    latency_seconds: float,
):
    trace = [item for item in state.get("trace", []) if isinstance(item, dict)]
    verifier_events = [item for item in trace if item.get("node") == "verifier"]
    planner_iterations = {
        int(item.get("iteration") or 1)
        for item in trace
        if item.get("node") == "planner"
    }
    plan_steps = [
        step
        for item in trace
        if item.get("node") == "planner"
        for step in item.get("plan", [])
        if isinstance(step, dict)
    ]
    result = {
        "question": question,
        "prediction": state.get("final_answer", ""),
        "latency": latency_seconds,
        "status": "ok",
        "execution_trace": trace,
        "evidence_text": _evidence_text(state),
        "abstention_reason": state.get("abstention_reason", ""),
        "evidence_exhausted": bool(state.get("evidence_exhausted")),
        "diagnostics": {
            "iteration_count": int(state.get("iteration_count") or 0),
            "total_tool_calls": int(state.get("total_tool_calls") or 0),
        },
        "replan_diagnostics": {
            "num_replans": max(0, len(planner_iterations) - 1),
            "rounds": [],
        },
        "verifier_diagnostics": {
            "final_verdict": (
                verifier_events[-1].get("verdict", "") if verifier_events else ""
            )
        },
    }
    return adapt_result(
        result,
        request_id=request_id,
        mode="live",
        model=model,
        contract={
            "hop_count": max(
                (int(step.get("id") or 0) for step in plan_steps),
                default=0,
            ),
            "answerability": (
                "unanswerable"
                if state.get("abstention_reason") or state.get("evidence_exhausted")
                else "answerable"
            ),
        },
        release=_release(state),
        provenance={},
    )
