import json
from pathlib import Path

from scripts.refresh_public_release_manifest import refresh
from scripts.validate_public_release import validate


ROOT = Path(__file__).parents[1]


def test_generated_public_release_audit_passes():
    assert validate(ROOT) == []


def test_exported_text_artifacts_use_lf_line_endings():
    manifest = json.loads((ROOT / "PUBLIC_RELEASE_MANIFEST.json").read_text(encoding="utf-8"))
    for row in manifest["artifacts"]:
        path = ROOT / row["path"]
        if path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
            continue
        assert b"\r\n" not in path.read_bytes(), row["path"]


def test_public_release_matches_current_ui_scope_and_boundaries():
    app = (ROOT / "hopcandy/frontend/src/App.tsx").read_text(encoding="utf-8")
    header = (ROOT / "hopcandy/frontend/src/components/layout/GlobalHeader.tsx").read_text(encoding="utf-8")
    publication = (ROOT / "hopcandy/frontend/src/lib/publication.ts").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert 'path="/experiments"' in app
    assert 'path="/architecture"' in app
    assert "/engineering" not in app
    assert 'to="/engineering"' not in header
    assert "demo_cases" in publication and "experiments" in publication and "textual_holdout_matrix" in publication
    assert "timeline_entries" not in publication
    assert "Replay-first MVP 已完成" in readme
    assert "Textual 2-hop Baseline（Development）" in readme
    assert "Textual 2-hop 独立 Holdout 对照" in readme
    assert "冻结开发基线" in readme
    assert "Live Agent" in readme and "默认关闭" in readme
    assert "hopcandy/frontend/assets/WorkbenchPage.png" in readme


def test_manifest_documents_adapter_source_drift():
    manifest = json.loads((ROOT / "PUBLIC_RELEASE_MANIFEST.json").read_text(encoding="utf-8"))
    provenance = manifest["step1_contract_provenance"]
    assert provenance["source_lock_status"] == "documented_drift"
    assert provenance["source_byte_reproducible"] is False
    assert len(provenance["drifted_source_artifacts"]) == 2


def test_ci_uses_module_pytest_from_repository_root():
    workflow = (ROOT / ".github/workflows/public-release.yml").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    command = "python -m pytest tests/test_hopcandy_step1_contract.py tests/test_hopcandy_step3_backend.py tests/test_public_release.py"
    assert command in workflow
    assert command in readme
    assert "run: pytest " not in workflow


def test_manifest_refresh_rehashes_changed_artifacts(tmp_path):
    root = tmp_path / "release"
    root.mkdir()
    readme = root / "README.md"
    readme.write_text("before\n", encoding="utf-8")
    manifest_path = root / "PUBLIC_RELEASE_MANIFEST.json"
    manifest_path.write_text(
        json.dumps(
            {
                "release_name": "hopcandy-agentic-rag",
                "artifacts": [
                    {
                        "path": "README.md",
                        "size_bytes": len("before\n"),
                        "sha256": "obsolete",
                        "source_path": "README.md",
                        "source_sha256": "obsolete",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    readme.write_text("after\n", encoding="utf-8")
    refreshed = refresh(root)

    assert refreshed["artifacts"][0]["path"] == "README.md"
    assert refreshed["artifacts"][0]["sha256"] != "obsolete"
    assert refreshed["artifact_tree_sha256"]
