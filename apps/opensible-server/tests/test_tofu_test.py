"""OpenTofu test execution wrapper (UC 163, 184)."""
from __future__ import annotations

def test_tofu_test_requires_stack(data_dir):
    from services.test_cases import create_test_case, run_tofu_test
    tc = create_test_case({"name": "t", "stack": "nope", "kind": "tofu_test", "assertions": []})
    try:
        run_tofu_test(None, tc["id"])
        assert False, "should raise"
    except ValueError as e:
        assert "stack" in str(e).lower()

def test_tofu_test_queues_execution(data_dir, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path := __import__("tempfile").mkdtemp()))
    envs = __import__("pathlib").Path(tmp_path) / "cloud-provisioning" / "default" / "envs"
    envs.mkdir(parents=True, exist_ok=True)
    (envs / "demo").mkdir()
    (envs / "demo" / "main.tf").write_text('resource "null_resource" "x" {}\n')
    (envs / "demo" / "main.tftest.hcl").write_text(
        'run "plan" { command = plan assert { condition = true error_message = "no" } }\n')
    from services.test_cases import create_test_case, run_tofu_test
    tc = create_test_case({"name": "t", "stack": "demo", "kind": "tofu_test", "assertions": []})
    out = run_tofu_test(None, tc["id"])
    assert out["passed"] is True
    assert out["queued"] is True