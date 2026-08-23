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
