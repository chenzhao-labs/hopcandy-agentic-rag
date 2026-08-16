"""Read-only access to deterministic HopCandy publication artifacts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
PUBLIC_DATA = ROOT / "hopcandy" / "public_data"


class PublicationRepository:
    def __init__(self, public_data: Path = PUBLIC_DATA) -> None:
        self.public_data = public_data

    def _load(self, filename: str) -> dict[str, Any]:
        return json.loads((self.public_data / filename).read_text(encoding="utf-8"))

    def examples(self) -> dict[str, Any]:
        return self._load("demo_cases.json")

    def experiments(self) -> dict[str, Any]:
        return self._load("experiments.json")

    def manifest(self) -> dict[str, Any]:
        return self._load("publication_manifest.json")

