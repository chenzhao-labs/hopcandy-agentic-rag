"""Environment-only configuration for the on-demand HopCandy backend."""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path


def _bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _origins(value: str) -> tuple[str, ...]:
    return tuple(item.strip().rstrip("/") for item in value.split(",") if item.strip())


@dataclass(frozen=True)
class BackendSettings:
    live_enabled: bool = False
    service_token: str = ""
    cors_origins: tuple[str, ...] = (
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    )
    query_timeout_seconds: float = 120.0
    question_max_length: int = 1000
    model: str = "Qwen3-4B"
    machine_facts_path: str = ""
    entity_catalog_path: str = ""
    index_dir: str = ""
    corpus_dir: str = ""
    validate_runtime_paths: bool = True

    @classmethod
    def from_env(cls) -> "BackendSettings":
        return cls(
            live_enabled=_bool("HOPCANDY_LIVE_ENABLED", False),
            service_token=os.environ.get("HOPCANDY_BACKEND_TOKEN", "").strip(),
            cors_origins=_origins(
                os.environ.get(
                    "HOPCANDY_CORS_ORIGINS",
                    "http://localhost:5173,http://127.0.0.1:5173",
                )
            ),
            query_timeout_seconds=float(
                os.environ.get("HOPCANDY_QUERY_TIMEOUT_SECONDS", "120")
            ),
            question_max_length=int(
                os.environ.get("HOPCANDY_QUESTION_MAX_LENGTH", "1000")
            ),
            model=os.environ.get("AGENT_LLM_MODEL", "Qwen3-4B").strip(),
            machine_facts_path=os.environ.get(
                "HOPCANDY_MACHINE_FACTS_PATH", ""
            ).strip(),
            entity_catalog_path=os.environ.get(
                "HOPCANDY_ENTITY_CATALOG_PATH", ""
            ).strip(),
            index_dir=os.environ.get("NEWS_INDEX_DIR", "").strip(),
            corpus_dir=os.environ.get("NEWS_CORPUS_DIR", "").strip(),
            validate_runtime_paths=_bool("HOPCANDY_VALIDATE_RUNTIME_PATHS", True),
        )

    def missing_configuration(self) -> list[str]:
        missing: list[str] = []
        if not self.service_token:
            missing.append("service_authentication")
        paths = {
            "machine_facts": self.machine_facts_path,
            "entity_catalog": self.entity_catalog_path,
            "retrieval_index": self.index_dir,
            "document_corpus": self.corpus_dir,
        }
        for name, value in paths.items():
            if not value or (
                self.validate_runtime_paths and not Path(value).expanduser().exists()
            ):
                missing.append(name)
        return missing

    @property
    def live_ready(self) -> bool:
        return self.live_enabled and not self.missing_configuration()
