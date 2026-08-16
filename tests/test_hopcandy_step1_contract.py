import copy
import json
from pathlib import Path

from hopcandy.backend.schemas import QueryResponse
from hopcandy.backend.trace_adapter import adapt_error, adapt_fixture_case


ROOT = Path(__file__).parents[1]
EXAMPLES = ROOT / "hopcandy/fixtures/examples.json"


def fixtures():
    return json.loads(EXAMPLES.read_text(encoding="utf-8"))


def case(case_id: str):
    return next(item for item in fixtures()["cases"] if item["case_id"] == case_id)


def adapt(case_id: str, variant_id: str | None = None):
    payload = fixtures()
    selected = next(item for item in payload["cases"] if item["case_id"] == case_id)
    return adapt_fixture_case(selected, fixture_version=payload["fixture_version"], variant_id=variant_id)


def test_structured_and_clarification_contracts():
    structured = adapt("structured-cross-company-comparison")
    assert structured.status == "success"
    assert structured.route.category == "structured"
    assert {step.tool for step in structured.plan} == {"machine_facts", "calculator"}
    assert len(structured.evidence) == 3
    clarification = adapt("structured-missing-year-clarification")
    assert clarification.status == "clarification"
    assert clarification.metrics.tool_calls == 0
    assert clarification.evidence == []


def test_textual_success_replan_and_abstention_contracts():
    success = adapt("textual-complete-chain-success-8b")
    assert success.status == "success"
    assert success.grounding.status == "grounded"
    replan = adapt("textual-replan-recovers-gold-hop-4b")
    assert len(replan.replans) == 1
    assert replan.replans[0].new_gold_hops == 1
    assert any(event.event_type == "plan_revised" for event in replan.timeline)
    abstention = adapt("textual-known-failure-abstention-4b")
    assert abstention.status == "abstained"
    assert abstention.grounding.abstention_reason == "verifier_insufficient_budget_exhausted"
    assert abstention.error is None


def test_adapter_is_deterministic_and_does_not_mutate_source():
    payload = fixtures()
    selected = next(item for item in payload["cases"] if item["case_id"] == "textual-replan-recovers-gold-hop-4b")
    original = copy.deepcopy(selected)
    first = adapt_fixture_case(selected, fixture_version=payload["fixture_version"])
    second = adapt_fixture_case(selected, fixture_version=payload["fixture_version"])
    assert first.model_dump(mode="json") == second.model_dump(mode="json")
    assert selected == original


def test_model_comparison_preserves_distinct_results():
    four_b = adapt("textual-model-scale-comparison", "qwen3-4b-2048")
    eight_b = adapt("textual-model-scale-comparison", "qwen3-8b-2048")
    assert four_b.question == eight_b.question
    assert four_b.answer != eight_b.answer
    assert four_b.grounding.hop_recall == 0.5
    assert eight_b.grounding.hop_recall == 1.0


def test_public_error_is_sanitized():
    private_path = "D:" + r"\private\data"
    secret = "sk-" + "12345678901234567890"
    response = adapt_error(
        request_id="req-1",
        question=f"Read {private_path} and {secret}",
    )
    raw = response.model_dump_json()
    assert response.status == "error"
    assert response.error is not None
    assert "D:" + r"\private" not in raw
    assert secret not in raw
    assert response.timeline[0].node == "error_boundary"


def test_frozen_responses_validate_against_pydantic_contract():
    payload = json.loads((ROOT / "hopcandy/fixtures/replay_responses.json").read_text(encoding="utf-8"))
    responses = [QueryResponse.model_validate(row) for row in payload["responses"]]
    assert len(responses) == 8
    assert sum(row.status == "clarification" for row in responses) == 1
    assert sum(row.status == "abstained" for row in responses) == 1
