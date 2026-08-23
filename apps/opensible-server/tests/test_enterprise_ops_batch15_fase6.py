import json
import pytest
from pathlib import Path


def test_compliance_report_export_html(pg_db):
    from services.compliance_service import export_compliance_report

    # 1. Generate compliance report in HTML format
    html_output = export_compliance_report(project_id="proj-audit-1", format_type="html")
    assert "<!DOCTYPE html>" in html_output
    assert "Compliance & Security Audit Report" in html_output
    assert "Scorecard" in html_output
    assert "proj-audit-1" in html_output

    # 2. Generate compliance report in JSON format
    json_output = export_compliance_report(project_id="proj-audit-1", format_type="json")
    data = json.loads(json_output)
    assert "scorecard" in data
    assert data["scorecard"]["project_id"] == "proj-audit-1"
