"""Validate a generated HopCandy public release without private workspace data."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any


MANIFEST_NAME = "PUBLIC_RELEASE_MANIFEST.json"
IGNORED_METADATA_DIRS = {".git", "__pycache__", ".pytest_cache"}
FORBIDDEN_DIRS = {
    "node_modules", "dist", "everything_copy", ".venv", "models",
    "indexes", "checkpoints", "logs", "results",
}
FORBIDDEN_FILES = {".env", ".DS_Store"}
SECRET_PATTERNS = (
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"\bsb_secret_[A-Za-z0-9_-]{12,}\b"),
    re.compile(r"(?i)(?:api[_-]?key|service[_-]?role[_-]?key)\s*[=:]\s*['\"]?[A-Za-z0-9_-]{16,}"),
)
ABSOLUTE_PATH = re.compile(r"(?:\b[A-Z]:[\\/]|/(?:home|root|Users|var|etc)/)")
ALLOWED_SUFFIXES = {
    ".css", ".example", ".html", ".jpeg", ".jpg", ".json", ".md", ".png", ".py",
    ".sql", ".svg", ".toml", ".ts", ".tsx", ".txt", ".webp", ".yml",
}
ALLOWED_SUFFIXLESS = {"LICENSE", ".gitignore", ".gitattributes"}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_digest(rows: list[dict[str, Any]]) -> str:
    encoded = json.dumps(rows, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def text_content(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return None


def audit_text(relative: str, content: str) -> str:
    # The sanitizer itself intentionally names patterns that the audit rejects.
    if relative == "hopcandy/backend/trace_adapter.py":
        return "\n".join(line for line in content.splitlines() if "_ROOT_PATH = re.compile" not in line)
    if relative == "tests/test_hopcandy_step1_contract.py":
        return "\n".join(line for line in content.splitlines() if "private_path =" not in line and "secret =" not in line)
    return content


def validate(root: Path) -> list[str]:
    root = root.resolve()
    errors: list[str] = []
    manifest_path = root / MANIFEST_NAME
    if not manifest_path.is_file():
        return [f"missing {MANIFEST_NAME}"]
    manifest: dict[str, Any] = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("release_name") != "hopcandy-agentic-rag":
        errors.append("unexpected release name")
    if manifest.get("license") != "MIT" or not (root / "LICENSE").is_file():
        errors.append("MIT license is missing")
    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, list) or not artifacts:
        return errors + ["manifest artifacts are missing"]
    expected = {row["path"]: row for row in artifacts}
    actual = {
        path.relative_to(root).as_posix(): path
        for path in root.rglob("*")
        if path.is_file()
        and path.name != MANIFEST_NAME
        and not any(part in IGNORED_METADATA_DIRS for part in path.relative_to(root).parts)
    }
    if set(actual) != set(expected):
        errors.append("manifest artifact set does not match exported files")
    for relative, row in expected.items():
        path = root / relative
        if not path.is_file():
            errors.append(f"missing artifact: {relative}")
            continue
        if path.stat().st_size != row.get("size_bytes") or sha256(path) != row.get("sha256"):
            errors.append(f"hash mismatch: {relative}")
    normalized = [
        {key: row[key] for key in ("path", "size_bytes", "sha256", "source_path", "source_sha256")}
        for row in artifacts
    ]
    if manifest.get("artifact_tree_sha256") != canonical_digest(normalized):
        errors.append("artifact tree digest mismatch")
    for relative, path in actual.items():
        parts = Path(relative).parts
        if any(part in FORBIDDEN_DIRS for part in parts):
            errors.append(f"forbidden artifact directory: {relative}")
        if path.name in FORBIDDEN_FILES or (path.name.startswith(".env") and path.name != ".env.example"):
            errors.append(f"forbidden environment file: {relative}")
        if path.suffix.lower() == ".pdf" or path.stat().st_size > 2_000_000:
            errors.append(f"prohibited or oversized artifact: {relative}")
        if path.suffix.lower() not in ALLOWED_SUFFIXES and path.name not in ALLOWED_SUFFIXLESS:
            errors.append(f"unexpected file type: {relative}")
        content = text_content(path)
        if content is None:
            continue
        content = audit_text(relative, content)
        if ABSOLUTE_PATH.search(content):
            errors.append(f"absolute path found: {relative}")
        if any(pattern.search(content) for pattern in SECRET_PATTERNS):
            errors.append(f"secret-like value found: {relative}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path.cwd())
    args = parser.parse_args()
    errors = validate(args.root)
    if errors:
        print("[hopcandy-public-release-audit] FAIL")
        for error in errors:
            print(f"  - {error}")
        return 1
    print("[hopcandy-public-release-audit] PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
