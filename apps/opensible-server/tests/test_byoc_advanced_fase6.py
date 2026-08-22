"""Tests for BYOC & Multi-Cloud Resource Import Advanced Fase 6.

UC273: IAM Role-Based (Assume-Role / Service Account) Authentication.
"""
from __future__ import annotations

import json
from unittest.mock import patch
import pytest

from services import byoc


def test_byoc_aws_assume_role_validation(data_dir):
    """UC273: AWS AssumeRole validation with valid and invalid role_arn."""
    acct = byoc.create_account({
        "name": "AWS Production AssumeRole",
        "provider": "aws",
        "credentials": {
            "role_arn": "arn:aws:iam::123456789012:role/RadasCloudAdmin",
            "external_id": "ext-secret-123",
            "session_name": "radas-session",
        },
    })
    assert acct["id"] is not None
    assert acct["provider"] == "aws"

    val = byoc.validate_account(acct["id"])
    assert val["ok"] is True
    assert val["status"] == 200
    assert "IAM AssumeRole verified" in val["detail"]
    assert val["auth_type"] == "assume_role"

    # Verify saved account record has status verified
    updated = byoc.get_account(acct["id"])
    assert updated["status"] == "verified"


def test_byoc_aws_assume_role_invalid_arn(data_dir):
    """UC273: AWS AssumeRole validation rejects malformed role_arn."""
    acct = byoc.create_account({
        "name": "AWS Bad Role",
        "provider": "aws",
        "credentials": {
            "role_arn": "invalid-arn-string",
        },
    })
    val = byoc.validate_account(acct["id"])
    assert val["ok"] is False
    assert val["status"] == 400
    assert "invalid role_arn format" in val["detail"]

    updated = byoc.get_account(acct["id"])
    assert updated["status"] == "error"


def test_byoc_gcp_impersonate_validation(data_dir):
    """UC273: GCP Service Account Impersonation validation."""
    acct = byoc.create_account({
        "name": "GCP Staging Impersonate",
        "provider": "gcp",
        "credentials": {
            "service_account_email": "terraform-runner@my-project.iam.gserviceaccount.com",
        },
    })
    val = byoc.validate_account(acct["id"])
    assert val["ok"] is True
    assert val["status"] == 200
    assert "GCP Service Account impersonation verified" in val["detail"]
    assert val["auth_type"] == "gcp_impersonate"

    updated = byoc.get_account(acct["id"])
    assert updated["status"] == "verified"
