import json
from pathlib import Path

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
    assert "demo_cases" in publication and "experiments" in publication
    assert "timeline_entries" not in publication
    assert "Replay-first MVP 已完成" in readme
    assert "Textual 2-hop Baseline v0.1" in readme
    assert "开发基线" in readme and "已知限制" in readme
    assert "Live Agent" in readme and "默认关闭" in readme
    assert "hopcandy/frontend/assets/WorkbenchPage.jpg" in readme


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
