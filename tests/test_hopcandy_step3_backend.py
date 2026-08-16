import time
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from hopcandy.backend.app import create_app
from hopcandy.backend.config import BackendSettings
from hopcandy.backend.runtime import (
    LiveQueryRuntime,
    RuntimeBusyError,
    RuntimeTimeoutError,
)
from hopcandy.backend.schemas import QueryResponse


TOKEN = "test-service-token-that-is-long-enough"


def settings(**overrides):
    values = {
        "live_enabled": False,
        "service_token": TOKEN,
        "cors_origins": ("https://hopcandy.example",),
        "query_timeout_seconds": 0.2,
        "question_max_length": 1000,
        "model": "Qwen3-4B",
        "machine_facts_path": "machine-facts.json",
        "entity_catalog_path": "entity-catalog.json",
        "index_dir": "index",
        "corpus_dir": "corpus",
        "validate_runtime_paths": False,
    }
    values.update(overrides)
    return BackendSettings(**values)


def live_state(question: str):
    return {
        "query": question,
        "query_type": "multi_hop",
        "final_answer": "A grounded live answer.",
        "iteration_count": 1,
        "total_tool_calls": 1,
        "evidence": [
            {
                "results": [
                    {
                        "chunk_id": "bd_2024_ar_0001",
                        "title": "Baidu 2024 Annual Report - Business",
                        "text": "Grounded source text.",
                    }
                ]
            }
        ],
        "trace": [
            {
                "node": "router",
                "query_type": "multi_hop",
                "path_type": "full_agentic",
                "decision_source": "llm_router",
            },
            {
                "node": "planner",
                "iteration": 1,
                "plan": [
                    {
                        "id": 1,
                        "sub_query": "Find grounded evidence",
                        "tool": "hybrid_search",
                        "depends_on": [],
                        "status": "done",
                    }
                ],
            },
            {
                "node": "executor",
                "step_id": 1,
                "tool": "hybrid_search",
                "num_results": 1,
                "result_chunk_ids": ["bd_2024_ar_0001"],
                "executed_query": "Find grounded evidence",
                "retrieval_latency_ms": 12.5,
            },
            {"node": "verifier", "verdict": "sufficient", "feedback": "ok"},
            {"node": "synthesizer", "answer": "A grounded live answer."},
        ],
    }


def test_offline_health_and_public_reads_remain_available():
    with TestClient(create_app(settings=settings())) as client:
        health = client.get("/api/v1/health")
        assert health.status_code == 200
        assert health.json()["live"]["state"] == "offline"
        assert health.json()["replay_available"] is True
        meta = client.get("/api/v1/meta")
        examples = client.get("/api/v1/examples")
        experiments = client.get("/api/v1/experiments")
        assert meta.json()["api_schema_version"] == "hopcandy-api-v1"
        assert examples.json()["row_count"] == 8
        assert experiments.json()["row_count"] == 3
        assert examples.json()["source"] == "bundled_json_fallback"


def test_query_offline_and_auth_errors_use_public_contract():
    offline_app = create_app(settings=settings())
    with TestClient(offline_app) as client:
        response = client.post("/api/v1/query", json={"question": "test"})
        assert response.status_code == 503
        body = QueryResponse.model_validate(response.json())
        assert body.error.code == "LIVE_OFFLINE"

    live_app = create_app(settings=settings(live_enabled=True), runner=live_state)
    with TestClient(live_app) as client:
        response = client.post("/api/v1/query", json={"question": "test"})
        assert response.status_code == 401
        body = QueryResponse.model_validate(response.json())
        assert body.error.code == "UNAUTHORIZED"


def test_live_query_returns_observable_contract_without_internal_state_dump():
    app = create_app(settings=settings(live_enabled=True), runner=live_state)
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/query",
            headers={"X-HopCandy-Backend-Token": TOKEN},
            json={"question": "What happened?", "request_id": "public-request-1"},
        )
        assert response.status_code == 200
        body = QueryResponse.model_validate(response.json())
        assert body.request_id == "public-request-1"
        assert body.mode == "live"
        assert body.status == "success"
        assert body.route.category == "textual"
        assert len(body.timeline) == 5
        assert len(body.evidence) == 1
        assert body.scope.hop_count == 1
        assert body.provenance.source_kind == "live"
        raw = response.text
        assert '"execution_trace"' not in raw
        assert '"final_answer"' not in raw


def test_validation_cors_and_internal_errors_are_sanitized():
    private_path = "D:" + r"\private\index"
    secret = "sk-" + "12345678901234567890"

    def failing_runner(_question):
        raise RuntimeError(f"Traceback (most recent call last): {private_path} {secret}")

    app = create_app(settings=settings(live_enabled=True), runner=failing_runner)
    with TestClient(app) as client:
        invalid = client.post("/api/v1/query", json={"question": "x" * 1001})
        assert invalid.status_code == 422
        assert QueryResponse.model_validate(invalid.json()).error.code == "INVALID_REQUEST"

        response = client.post(
            "/api/v1/query",
            headers={"X-HopCandy-Backend-Token": TOKEN},
            json={"question": "trigger error"},
        )
        assert response.status_code == 500
        assert "D:" + r"\private" not in response.text
        assert secret not in response.text

        preflight = client.options(
            "/api/v1/query",
            headers={
                "Origin": "https://hopcandy.example",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "X-HopCandy-Backend-Token",
            },
        )
        assert preflight.status_code == 200
        assert preflight.headers["access-control-allow-origin"] == "https://hopcandy.example"


def test_runtime_enforces_single_concurrency_and_holds_slot_after_timeout():
    call_count = 0

    def slow_runner(question):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            time.sleep(0.12)
        return {"question": question}

    runtime = LiveQueryRuntime(slow_runner, timeout_seconds=0.03)
    try:
        try:
            runtime.execute("first")
            assert False, "expected RuntimeTimeoutError"
        except RuntimeTimeoutError:
            pass
        try:
            runtime.execute("second")
            assert False, "expected RuntimeBusyError"
        except RuntimeBusyError:
            pass
        time.sleep(0.13)
        assert runtime.execute("third")["question"] == "third"
    finally:
        runtime.close()


def test_runtime_rejects_parallel_second_query():
    def slow_runner(question):
        time.sleep(0.08)
        return {"question": question}

    runtime = LiveQueryRuntime(slow_runner, timeout_seconds=1)
    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(runtime.execute, "first")
            time.sleep(0.01)
            second = executor.submit(runtime.execute, "second")
            assert first.result()["question"] == "first"
            try:
                second.result()
                assert False, "expected RuntimeBusyError"
            except RuntimeBusyError:
                pass
    finally:
        runtime.close()
