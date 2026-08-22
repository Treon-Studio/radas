import json
import pytest
from flask import Flask, request, g
from unittest.mock import patch


@pytest.fixture
def app():
    # Patch auth middleware functions globally before blueprint import
    with patch('auth.middleware.require_auth', lambda f: f), \
         patch('auth.middleware.require_project_access', lambda f: f):
        from api.ai_routes import bp as ai_bp
        app = Flask(__name__)
        app.register_blueprint(ai_bp)

        @app.before_request
        def set_context():
            request.current_user = {"user_id": "test-user", "username": "tester"}
            g.project_id = request.args.get("project_id", "test-proj")

        return app


@pytest.fixture
def client(app):
    return app.test_client()


def test_review_plan_detects_public_cidr(client):
    plan_text = """
resource "aws_security_group" "example" {
  ingress {
    cidr_blocks = ["0.0.0.0/0"]
  }
}
"""
    response = client.post(
        '/api/ai/review-plan',
        json={"plan_text": plan_text, "context": "test"},
        query_string={"project_id": "test-proj"}
    )
    assert response.status_code == 200
    data = json.loads(response.data)
    assert "findings" in data
    findings = data["findings"]
    public_cidr_finding = any(
        "Public CIDR" in f.get("risk", "") for f in findings
    )
    assert public_cidr_finding


def test_review_plan_detects_missing_tags(client):
    plan_text = """
resource "aws_instance" "example" {
  instance_type = "t2.micro"
  tags = {}
}
"""
    response = client.post(
        '/api/ai/review-plan',
        json={"plan_text": plan_text},
        query_string={"project_id": "test-proj"}
    )
    assert response.status_code == 200
    data = json.loads(response.data)
    findings = data["findings"]
    missing_tags = any(
        "without tags" in f.get("risk", "").lower() for f in findings
    )
    assert missing_tags


def test_review_plan_no_issues(client):
    plan_text = """
resource "aws_instance" "example" {
  instance_type = "t2.micro"
  tags = {
    Environment = "prod"
  }
}
"""
    response = client.post(
        '/api/ai/review-plan',
        json={"plan_text": plan_text},
        query_string={"project_id": "test-proj"}
    )
    assert response.status_code == 200
    data = json.loads(response.data)
    findings = data["findings"]
    info_finding = any(
        f.get("severity") == "info" for f in findings
    )
    assert info_finding