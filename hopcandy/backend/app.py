"""HopCandy Backend v0.1: publication reads and guarded live Agent queries."""

from __future__ import annotations

from contextlib import asynccontextmanager
import hmac
import re
import time
from typing import Callable
from uuid import uuid4

from fastapi import FastAPI, Header
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import BackendSettings
from .live_adapter import adapt_live_state
from .repository import PublicationRepository
from .runtime import LiveQueryRuntime, RuntimeBusyError, RuntimeTimeoutError
from .schemas import (
    API_SCHEMA_VERSION,
    BACKEND_VERSION,
    HealthResponse,
    LiveStatus,
    MetaResponse,
    PublicationRowsResponse,
    QueryRequest,
    QueryResponse,
)
from .trace_adapter import adapt_error


REQUEST_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")


def _default_runner(settings: BackendSettings) -> Callable[[str], dict]:
    def run(question: str) -> dict:
        from agents.graph import run_query

        return run_query(
            question,
            retrieval_mode="hybrid",
            hybrid_fusion_profile="rrf_rerank",
            hybrid_branch_top_k=20,
            verifier_profile="large",
            replan_mode="feedback",
            calculation_mode="structured",
            fact_extraction_profile="machine",
            machine_facts_path=settings.machine_facts_path,
            entity_binding_profile="enforce",
            entity_catalog_path=settings.entity_catalog_path,
            metric_scope_profile="enforce",
        )

    return run


def _error_response(
    *,
    status_code: int,
    request_id: str,
    question: str,
    model: str,
    code: str,
    message: str,
    retryable: bool,
) -> JSONResponse:
    body = adapt_error(
        request_id=request_id,
        question=question,
        model=model,
        code=code,
        message=message,
        retryable=retryable,
    )
    return JSONResponse(status_code=status_code, content=body.model_dump(mode="json"))


def create_app(
    *,
    settings: BackendSettings | None = None,
    repository: PublicationRepository | None = None,
    runner: Callable[[str], dict] | None = None,
) -> FastAPI:
    settings = settings or BackendSettings.from_env()
    repository = repository or PublicationRepository()
    runtime = LiveQueryRuntime(
        runner or _default_runner(settings), settings.query_timeout_seconds
    )

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        yield
        runtime.close()

    app = FastAPI(
        title="HopCandy Agentic RAG API",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.repository = repository
    app.state.runtime = runtime

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.cors_origins),
            allow_credentials=False,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["Content-Type", "X-HopCandy-Backend-Token"],
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request, _error):
        body = adapt_error(
            request_id=f"invalid-{uuid4().hex}",
            question="",
            model=settings.model,
            code="INVALID_REQUEST",
            message="The request body does not satisfy the public API contract.",
            retryable=False,
        )
        return JSONResponse(status_code=422, content=body.model_dump(mode="json"))

    @app.get("/api/v1/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        missing = settings.missing_configuration() if settings.live_enabled else []
        if not settings.live_enabled:
            live_state = "offline"
        elif missing:
            live_state = "misconfigured"
        elif runtime.busy:
            live_state = "busy"
        else:
            live_state = "on_demand"
        return HealthResponse(
            status="ok" if not missing else "degraded",
            replay_available=True,
            live=LiveStatus(
                enabled=settings.live_enabled,
                ready=settings.live_ready,
                state=live_state,
                model=settings.model,
                concurrency_limit=1,
                timeout_seconds=settings.query_timeout_seconds,
                missing_configuration=missing,
            ),
        )

    @app.get("/api/v1/meta", response_model=MetaResponse)
    def meta() -> MetaResponse:
        manifest = repository.manifest()
        return MetaResponse(
            fixture_version=manifest["fixture_version"],
            fixture_bundle_sha256=manifest["fixture_bundle_sha256"],
            contract_bundle_sha256=manifest["contract_bundle_sha256"],
            publication_version=manifest["publication_version"],
            publication_bundle_sha256=manifest["publication_bundle_sha256"],
            data_scope="Baidu and Tencent annual reports (2023-2025)",
            capabilities={
                "structured": "Structured Query Stable v1.0",
                "textual": "Textual 2-hop Baseline v0.1 (Development, known limitations)",
                "live": "On-demand guarded GPU query",
            },
        )

    @app.get("/api/v1/examples", response_model=PublicationRowsResponse)
    def examples() -> PublicationRowsResponse:
        payload = repository.examples()
        return PublicationRowsResponse(
            publication_version=payload["publication_version"],
            source="bundled_json_fallback",
            row_count=payload["row_count"],
            rows=payload["rows"],
        )

    @app.get("/api/v1/experiments", response_model=PublicationRowsResponse)
    def experiments() -> PublicationRowsResponse:
        payload = repository.experiments()
        return PublicationRowsResponse(
            publication_version=payload["publication_version"],
            source="bundled_json_fallback",
            row_count=payload["row_count"],
            rows=payload["rows"],
        )

    @app.post("/api/v1/query", response_model=QueryResponse)
    def query(
        payload: QueryRequest,
        backend_token: str | None = Header(
            default=None, alias="X-HopCandy-Backend-Token"
        ),
    ):
        question = payload.question.strip()
        request_id = (
            payload.request_id
            if payload.request_id and REQUEST_ID.fullmatch(payload.request_id)
            else f"live-{uuid4().hex}"
        )
        if not question or len(question) > settings.question_max_length:
            return _error_response(
                status_code=422,
                request_id=request_id,
                question=question,
                model=settings.model,
                code="INVALID_QUESTION",
                message=f"Question must contain 1-{settings.question_max_length} characters.",
                retryable=False,
            )
        if not settings.live_enabled:
            return _error_response(
                status_code=503,
                request_id=request_id,
                question=question,
                model=settings.model,
                code="LIVE_OFFLINE",
                message="Live Agent is offline. Frozen Replay remains available.",
                retryable=True,
            )
        if not backend_token or not hmac.compare_digest(
            backend_token, settings.service_token
        ):
            return _error_response(
                status_code=401,
                request_id=request_id,
                question=question,
                model=settings.model,
                code="UNAUTHORIZED",
                message="A valid service token is required.",
                retryable=False,
            )
        if settings.missing_configuration():
            return _error_response(
                status_code=503,
                request_id=request_id,
                question=question,
                model=settings.model,
                code="LIVE_MISCONFIGURED",
                message="Live Agent is not ready. Frozen Replay remains available.",
                retryable=True,
            )

        started = time.perf_counter()
        try:
            state = runtime.execute(question)
            return adapt_live_state(
                state,
                question=question,
                request_id=request_id,
                model=settings.model,
                latency_seconds=time.perf_counter() - started,
            )
        except RuntimeBusyError:
            return _error_response(
                status_code=429,
                request_id=request_id,
                question=question,
                model=settings.model,
                code="LIVE_BUSY",
                message="The single Live Agent slot is currently busy.",
                retryable=True,
            )
        except RuntimeTimeoutError:
            return _error_response(
                status_code=504,
                request_id=request_id,
                question=question,
                model=settings.model,
                code="LIVE_TIMEOUT",
                message="The Live Agent did not return within the configured timeout.",
                retryable=True,
            )
        except Exception:
            return _error_response(
                status_code=500,
                request_id=request_id,
                question=question,
                model=settings.model,
                code="INTERNAL_ERROR",
                message="The query could not be completed.",
                retryable=True,
            )

    return app


app = create_app()
