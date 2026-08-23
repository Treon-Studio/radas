import pytest


def test_terraform_lockfile_parsing():
    from services.lockfile_manager import parse_terraform_lockfile

    lock_content = """
# This file is maintained automatically by "tofu init".
provider "registry.opentofu.org/hashicorp/aws" {
  version     = "5.30.0"
  constraints = "~> 5.0"
  hashes = [
    "h1:abc123def456=",
    "zh:789xyz000=",
  ]
}

provider "registry.opentofu.org/hashicorp/null" {
  version = "3.2.1"
  hashes = [
    "h1:nullhash123=",
  ]
}
"""

    parsed = parse_terraform_lockfile(lock_content)
    assert "registry.opentofu.org/hashicorp/aws" in parsed["providers"]
    aws = parsed["providers"]["registry.opentofu.org/hashicorp/aws"]
    assert aws["version"] == "5.30.0"
    assert len(aws["hashes"]) == 2
    assert "h1:abc123def456=" in aws["hashes"]

    assert "registry.opentofu.org/hashicorp/null" in parsed["providers"]
    assert parsed["providers"]["registry.opentofu.org/hashicorp/null"]["version"] == "3.2.1"


def test_backend_config_guard():
    from services.backend_guard import validate_backend_config_change

    old_backend = 'terraform {\n  backend "s3" {\n    key = "p-core/network/terraform.tfstate"\n    bucket = "radas-state"\n  }\n}\n'
    valid_new_backend = 'terraform {\n  backend "s3" {\n    key = "p-core/network/terraform.tfstate"\n    bucket = "radas-state"\n    region = "eu-central-1"\n  }\n}\n'
    corrupt_new_backend = 'terraform {\n  backend "s3" {\n    key = "corrupted/random/path.tfstate"\n  }\n}\n'

    # 1. Valid modification preserving key
    res_valid = validate_backend_config_change(old_backend, valid_new_backend, expected_state_key="p-core/network/terraform.tfstate")
    assert res_valid["valid"] is True

    # 2. Corrupt modification breaking key
    res_invalid = validate_backend_config_change(old_backend, corrupt_new_backend, expected_state_key="p-core/network/terraform.tfstate")
    assert res_invalid["valid"] is False
    assert "State key mismatch" in res_invalid["error"]


def test_init_skip_optimizer(pg_db):
    from services.init_optimizer import should_skip_init, record_init_success

    # 1. First run: No cache -> should not skip init
    assert should_skip_init("p-opt", "stack-a", current_config_hash="hash-v1") is False

    # 2. Record init success
    record_init_success("p-opt", "stack-a", config_hash="hash-v1")

    # 3. Same config -> should skip init
    assert should_skip_init("p-opt", "stack-a", current_config_hash="hash-v1") is True

    # 4. Config changed -> should not skip init
    assert should_skip_init("p-opt", "stack-a", current_config_hash="hash-v2") is False


def test_snapshot_annotations(pg_db):
    from services.snapshot_comment import annotate_snapshot, get_snapshot_annotation

    # 1. Annotate snapshot
    annotated = annotate_snapshot(
        snapshot_id="snap-pre-migration-42",
        title="Pre-Kubernetes 1.30 Upgrade",
        description="Full backup of etcd and VPC routes prior to major node rollouts.",
        tags=["upgrade", "k8s", "production"],
    )
    assert annotated["snapshot_id"] == "snap-pre-migration-42"
    assert annotated["title"] == "Pre-Kubernetes 1.30 Upgrade"

    # 2. Retrieve annotation
    retrieved = get_snapshot_annotation("snap-pre-migration-42")
    assert retrieved is not None
    assert "k8s" in retrieved["tags"]
    assert "etcd" in retrieved["description"]


def test_snapshot_scheduling(pg_db):
    from services.snapshot_scheduler import schedule_periodic_snapshots

    sched = schedule_periodic_snapshots("p-sched", "db-prod", cron_interval="0 2 * * *")
    assert sched["success"] is True
    assert sched["stack"] == "db-prod"
    assert sched["cron_interval"] == "0 2 * * *"
    assert sched["enabled"] is True


def test_snapshot_retention_enforcement():
    from services.snapshot_retention import enforce_snapshot_retention

    snapshots = [
        {"id": "snap-1", "timestamp": 100},
        {"id": "snap-2", "timestamp": 200},
        {"id": "snap-3", "timestamp": 300},
        {"id": "snap-4", "timestamp": 400},
        {"id": "snap-5", "timestamp": 500},
    ]

    # Retain top 3 newest (snap-5, snap-4, snap-3)
    res = enforce_snapshot_retention(snapshots, max_retention_count=3)
    assert len(res["retained_snapshots"]) == 3
    assert res["pruned_count"] == 2
    pruned_ids = [s["id"] for s in res["pruned_snapshots"]]
    assert "snap-1" in pruned_ids
    assert "snap-2" in pruned_ids


