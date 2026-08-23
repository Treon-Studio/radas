import json
import pytest
from pathlib import Path


def test_template_share_export_and_import(tmp_path, monkeypatch):
    from services.template_share import export_template_bundle, import_template_bundle

    tpl_dir = tmp_path / "custom-templates"
    my_tpl = tpl_dir / "microservice-starter"
    my_tpl.mkdir(parents=True, exist_ok=True)
    (my_tpl / "main.tf").write_text('resource "docker_container" "app" {}\n', encoding="utf-8")
    (my_tpl / "variables.tf").write_text('variable "app_port" { default = 8080 }\n', encoding="utf-8")

    # 1. Export template bundle
    bundle = export_template_bundle("microservice-starter", base_dir=tpl_dir)
    assert bundle["name"] == "microservice-starter"
    assert "main.tf" in bundle["files"]
    assert "variables.tf" in bundle["files"]

    # 2. Import into a new destination
    dest_dir = tmp_path / "imported-templates"
    res = import_template_bundle(bundle, base_dir=dest_dir)
    assert res["success"] is True
    assert (dest_dir / "microservice-starter" / "main.tf").exists()
    assert "docker_container" in (dest_dir / "microservice-starter" / "main.tf").read_text()


def test_retry_engine_with_jitter():
    from services.retry_engine import retry_with_jitter

    attempts = 0

    def flaky_operation():
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise ConnectionResetError("Temporary network glitch")
        return "success-result"

    result = retry_with_jitter(
        flaky_operation,
        max_retries=4,
        base_delay=0.01,
        max_delay=0.1,
        exceptions=(ConnectionResetError,),
    )
    assert result == "success-result"
    assert attempts == 3


def test_locale_formatting():
    from utils.locale_format import format_currency, format_datetime_locale

    # 1. USD formatting in en_US
    assert format_currency(1250.50, currency="USD", locale="en_US") == "$1,250.50"

    # 2. IDR formatting in id_ID
    assert "1.250.000" in format_currency(1250000, currency="IDR", locale="id_ID")
    assert "Rp" in format_currency(1250000, currency="IDR", locale="id_ID")

    # 3. Datetime formatting
    ts = 1787400000.0  # Approx 2026
    dt_str = format_datetime_locale(ts, locale="en_US")
    assert "2026" in dt_str


def test_print_friendly_cost_report(pg_db):
    from services.cost_export import generate_cost_report
    from storage import pg

    # Seed stack with cost metadata
    pg.execute(
        "INSERT INTO stack_meta (project_id, stack, data) VALUES (%s, %s, %s)",
        ("proj-cost-1", "prod-cluster", json.dumps({"monthly_cost": 345.50, "currency": "USD", "provider": "hetzner"})),
    )

    # 1. Generate printable HTML cost report
    html = generate_cost_report(project_id="proj-cost-1", format_type="html")
    assert "<!DOCTYPE html>" in html
    assert "Infrastructure Cost Breakdown" in html
    assert "prod-cluster" in html
    assert "@media print" in html

    # 2. Generate JSON cost report
    json_str = generate_cost_report(project_id="proj-cost-1", format_type="json")
    data = json.loads(json_str)
    assert data["project_id"] == "proj-cost-1"
    assert "total_monthly_cost" in data


def test_slack_interactive_approval_handler(pg_db):
    from services.slack_interactive import handle_slack_interaction
    from services.approval_service import request_approval, get_approval

    # 1. Request an approval
    req = request_approval(stack="prod-app", project_id="p-slack", action="apply", requested_by="alice")
    apr_id = req["id"]

    # 2. Simulate Slack interactive button payload
    slack_payload = {
        "type": "block_actions",
        "user": {"id": "U12345", "username": "slack_admin"},
        "actions": [
            {
                "action_id": "approval_approve",
                "value": apr_id,
            }
        ],
    }

    resp = handle_slack_interaction(slack_payload)
    assert resp["success"] is True
    assert "approved" in resp["text"].lower()

    # 3. Verify approval in DB is now approved
    updated_apr = get_approval(apr_id)
    assert updated_apr["status"] == "approved"
    assert updated_apr["decided_by"] == "slack_admin"


def test_welcome_onboarding_email():
    from services.welcome_email import send_welcome_onboarding_email

    res = send_welcome_onboarding_email(
        email="newuser@example.com",
        username="newbie_dev",
        login_url="https://radas.internal/login",
        org_name="Treon Studio",
    )
    assert res["success"] is True
    assert res["recipient"] == "newuser@example.com"
    assert "Welcome to RADAS" in res["subject"]
    assert "https://radas.internal/login" in res["body"]


