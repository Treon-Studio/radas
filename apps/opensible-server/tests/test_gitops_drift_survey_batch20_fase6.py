import pytest


def test_review_apps_approval_and_comments(pg_db):
    from services.review_apps import (
        create_review_app,
        add_review_app_comment,
        get_review_app,
    )

    # 1. Create review app
    app = create_review_app(project_id="proj-gitops", pr_number=42, branch="feat/new-ui")
    app_id = app["id"]
    assert app["status"] == "pending_review"
    assert app["pr_number"] == 42

    # 2. Add discussion comment
    add_review_app_comment(app_id, author="alice", comment="Looks great! Testing login now.")
    app_updated = get_review_app(app_id)
    assert len(app_updated["comments"]) == 1
    assert app_updated["status"] == "pending_review"

    # 3. Add approval decision
    add_review_app_comment(app_id, author="lead-bob", comment="Approved for merge.", decision="approved")
    app_approved = get_review_app(app_id)
    assert len(app_approved["comments"]) == 2
    assert app_approved["status"] == "approved"
    assert app_approved["approved_by"] == "lead-bob"


def test_attribute_mapping_template():
    from services.attribute_mapper import expand_template_attributes

    tmpl = "Server ${env.APP_NAME} listening on ${env.HOST}:${env.PORT} with DB ${db.endpoint}"
    ctx = {
        "env": {
            "APP_NAME": "payment-api",
            "HOST": "0.0.0.0",
            "PORT": "8080",
        },
        "db": {
            "endpoint": "postgres.internal:5432",
        },
    }

    rendered = expand_template_attributes(tmpl, ctx)
    assert rendered == "Server payment-api listening on 0.0.0.0:8080 with DB postgres.internal:5432"


def test_drift_autofix_remediation(pg_db):
    import json
    from services.drift_autofix import evaluate_and_autofix_drift
    from storage import pg

    # 1. Seed drifted stack
    pg.execute(
        "INSERT INTO stack_meta (project_id, stack, data) VALUES (%s, %s, %s)",
        ("p-drift", "web-cluster", json.dumps({"drift_status": "drifted", "drifted_resources": 2})),
    )

    # 2. Evaluate with auto_apply = False (recommendation only)
    res_dry = evaluate_and_autofix_drift("p-drift", "web-cluster", auto_apply=False)
    assert res_dry["drift_detected"] is True
    assert res_dry["remediation_triggered"] is False
    assert res_dry["action"] == "manual_apply_required"

    # 3. Evaluate with auto_apply = True (triggers auto-fix)
    res_auto = evaluate_and_autofix_drift("p-drift", "web-cluster", auto_apply=True)
    assert res_auto["drift_detected"] is True
    assert res_auto["remediation_triggered"] is True
    assert res_auto["action"] == "auto_remediation_executed"


def test_cost_tag_and_branch_analytics(pg_db):
    import json
    from services.cost_tag_analytics import get_cost_analytics_by_dimension
    from storage import pg

    pg.execute(
        "INSERT INTO stack_meta (project_id, stack, data) VALUES "
        "(%s, %s, %s), (%s, %s, %s), (%s, %s, %s)",
        (
            "p-cost-dim", "app-a", json.dumps({"monthly_cost": 100.0, "branch": "main", "tags": {"team": "frontend"}}),
            "p-cost-dim", "app-b", json.dumps({"monthly_cost": 200.0, "branch": "main", "tags": {"team": "backend"}}),
            "p-cost-dim", "app-c", json.dumps({"monthly_cost": 50.0, "branch": "feature-x", "tags": {"team": "frontend"}}),
        ),
    )

    # By branch
    branch_analytics = get_cost_analytics_by_dimension("p-cost-dim", dimension="branch")
    assert branch_analytics["breakdown"]["main"] == 300.0
    assert branch_analytics["breakdown"]["feature-x"] == 50.0

    # By tag:team
    tag_analytics = get_cost_analytics_by_dimension("p-cost-dim", dimension="tag:team")
    assert tag_analytics["breakdown"]["frontend"] == 150.0
    assert tag_analytics["breakdown"]["backend"] == 200.0


def test_pr_plan_diff_formatting():
    from services.pr_plan_diff import format_pr_plan_comment

    plan_summary = {
        "to_add": 3,
        "to_change": 1,
        "to_destroy": 0,
        "resources": [
            {"address": "aws_s3_bucket.data", "action": "create"},
            {"address": "aws_iam_role.app", "action": "create"},
            {"address": "aws_security_group.web", "action": "update"},
        ],
    }

    markdown = format_pr_plan_comment(plan_summary, stack="infra-prod")
    assert "### 🚀 RADAS Infrastructure Plan: `infra-prod`" in markdown
    assert "**Plan:** 3 to add, 1 to change, 0 to destroy." in markdown
    assert "aws_s3_bucket.data (create)" in markdown


def test_pr_slash_commands_parsing(pg_db):
    from services.pr_slash_commands import parse_and_handle_slash_command

    # 1. /plan command
    res_plan = parse_and_handle_slash_command(
        comment_body="/plan env=staging",
        project_id="p-gitops",
        pr_number=101,
        author="developer-dan",
    )
    assert res_plan["recognized"] is True
    assert res_plan["command"] == "/plan"
    assert res_plan["status"] == "dispatched"

    # 2. /apply command
    res_apply = parse_and_handle_slash_command(
        comment_body="/apply",
        project_id="p-gitops",
        pr_number=101,
        author="lead-carol",
    )
    assert res_apply["recognized"] is True
    assert res_apply["command"] == "/apply"

    # 3. Unrecognized regular comment
    res_text = parse_and_handle_slash_command(
        comment_body="LGTM, can we merge this today?",
        project_id="p-gitops",
        pr_number=101,
        author="reviewer-sam",
    )
    assert res_text["recognized"] is False


