"""Stable public contracts for the HopCandy backend."""

from .schemas import API_SCHEMA_VERSION, BACKEND_VERSION, QueryResponse
from .trace_adapter import adapt_error, adapt_fixture_case, adapt_result

__all__ = [
    "API_SCHEMA_VERSION",
    "BACKEND_VERSION",
    "QueryResponse",
    "adapt_error",
    "adapt_fixture_case",
    "adapt_result",
]
