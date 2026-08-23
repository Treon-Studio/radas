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
