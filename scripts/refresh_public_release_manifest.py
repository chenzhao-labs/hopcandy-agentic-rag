"""Refresh the public-release manifest after changing repository files.

Run from the public repository root:
    python scripts/refresh_public_release_manifest.py --root .
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


MANIFEST_NAME = "PUBLIC_RELEASE_MANIFEST.json"
IGNORED_METADATA_DIRS = {".git", "__pycache__", ".pytest_cache"}
FORBIDDEN_DIRS = {
    "node_modules", "dist", "everything_copy", ".venv", "models",
    "indexes", "checkpoints", "logs", "results",
}
FORBIDDEN_FILES = {".env", ".DS_Store"}
ALLOWED_SUFFIXES = {
    ".css", ".example", ".html", ".jpeg", ".jpg", ".json", ".md", ".png", ".py",
    ".sql", ".svg", ".toml", ".ts", ".tsx", ".txt", ".webp", ".yml",
}
ALLOWED_SUFFIXLESS = {"LICENSE", ".gitignore", ".gitattributes"}
MAXIMUM_FILE_SIZE_BYTES = 2_000_000


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_digest(rows: list[dict[str, Any]]) -> str:
    encoded = json.dumps(rows, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def artifact_paths(root: Path) -> list[Path]:
    paths: list[Path] = []
    for path in root.rglob("*"):
        if not path.is_file() or path.name == MANIFEST_NAME:
            continue
        relative = path.relative_to(root)
        if any(part in IGNORED_METADATA_DIRS for part in relative.parts):
            continue
        if any(part in FORBIDDEN_DIRS for part in relative.parts):
            raise ValueError(f"forbidden artifact directory: {relative.as_posix()}")
        if path.name in FORBIDDEN_FILES or (path.name.startswith(".env") and path.name != ".env.example"):
            raise ValueError(f"forbidden environment file: {relative.as_posix()}")
        if path.suffix.lower() == ".pdf" or path.stat().st_size > MAXIMUM_FILE_SIZE_BYTES:
            raise ValueError(f"prohibited or oversized artifact: {relative.as_posix()}")
        if path.suffix.lower() not in ALLOWED_SUFFIXES and path.name not in ALLOWED_SUFFIXLESS:
            raise ValueError(f"unexpected file type: {relative.as_posix()}")
        paths.append(path)
    return sorted(paths, key=lambda path: path.relative_to(root).as_posix())


def refresh(root: Path) -> dict[str, Any]:
    root = root.resolve()
    manifest_path = root / MANIFEST_NAME
    if not manifest_path.is_file():
        raise ValueError(f"missing {MANIFEST_NAME}: {root}")

    manifest: dict[str, Any] = json.loads(manifest_path.read_text(encoding="utf-8"))
    previous = {row["path"]: row for row in manifest.get("artifacts", [])}
    artifacts: list[dict[str, Any]] = []

    for path in artifact_paths(root):
        relative = path.relative_to(root).as_posix()
        digest = sha256(path)
        old = previous.get(relative)
        if old and old.get("sha256") == digest:
            source_path = old["source_path"]
            source_sha256 = old["source_sha256"]
        else:
            source_path = relative
            source_sha256 = digest
        artifacts.append(
            {
                "path": relative,
                "size_bytes": path.stat().st_size,
                "sha256": digest,
                "source_path": source_path,
                "source_sha256": source_sha256,
            }
        )

    manifest["artifacts"] = artifacts
    manifest["artifact_tree_sha256"] = canonical_digest(artifacts)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="Refresh the HopCandy public-release manifest.")
    parser.add_argument("--root", type=Path, default=Path.cwd())
    args = parser.parse_args()
    manifest = refresh(args.root)
    print("[hopcandy-public-release-manifest] PASS")
    print(f"  artifacts={len(manifest['artifacts'])}")
    print(f"  tree_sha256={manifest['artifact_tree_sha256']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
