from __future__ import annotations

import io
import json
import tarfile
from pathlib import Path

import flask

from api import register_blueprints
from auth import middleware
from auth.service import generate_token
from storage import pg


def _app(data_dir: Path):
    middleware.set_data_dir(data_dir)
    app = flask.Flask(__name__)
    app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False)
    register_blueprints(app)
    return app


def _headers(data_dir: Path, project_id: str) -> dict[str, str]:
    token = generate_token("owner", "owner", [], data_dir, token_type="access")
    return {"Authorization": f"Bearer {token}", "X-Project-Id": project_id}


def _seed() -> tuple[str, str]:
    org_id, project_id = "org-routes", "project-routes"
    pg.execute("INSERT INTO users (id, username, password_hash) VALUES (%s,%s,%s)", ("owner", "owner", "x"))
    pg.execute("INSERT INTO orgs (id, name, created_by, created_at) VALUES (%s,%s,%s,%s)", (org_id, "Routes", "owner", 1.0))
    pg.execute("INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s,%s,%s,%s)", (org_id, "owner", "owner", 1.0))
    pg.execute("INSERT INTO projects (id, org_id, owner_id, name, description, is_archived, updated_at) VALUES (%s,%s,%s,%s,%s,0,%s)", (project_id, org_id, "owner", "Routes", "", 1.0))
    return org_id, project_id


def _archive() -> io.BytesIO:
    content = io.BytesIO()
    with tarfile.open(fileobj=content, mode="w:gz") as archive:
        data = b"terraform {}"
        info = tarfile.TarInfo("main.tf")
        info.size = len(data)
        archive.addfile(info, io.BytesIO(data))
    content.seek(0)
    return content


def test_management_and_protocol_routes(pg_db, tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    _, project_id = _seed()
    client = _app(tmp_path).test_client()
    headers = _headers(tmp_path, project_id)
    manifest = {"slug": "internal/network/aws", "version": "1.0.0", "description": "network"}
    published = client.post(
        f"/api/projects/{project_id}/tofu-modules",
        headers=headers,
        data={"manifest": json.dumps(manifest), "archive": (_archive(), "module.tar.gz")},
        content_type="multipart/form-data",
    )
    assert published.status_code == 201
    assert published.get_json()["data"]["module"]["slug"] == manifest["slug"]
    listed = client.get(f"/api/projects/{project_id}/tofu-modules", headers=headers)
    assert listed.status_code == 200
    assert len(listed.get_json()["data"]["modules"]) == 1
    versions_meta = listed.get_json()["data"]["modules"][0]["versions"]
    assert len(versions_meta) == 1
    assert versions_meta[0]["version"] == "1.0.0"
    assert versions_meta[0]["sha256"] == published.get_json()["data"]["module"]["sha256"]
    assert versions_meta[0]["size"] > 0
    discovered = client.get("/.well-known/terraform.json", headers=headers)
    assert discovered.status_code == 200
    assert discovered.get_json()["modules.v1"] == "/v1/modules/"
    versions = client.get("/v1/modules/internal/network/aws/versions", headers=headers)
    assert versions.status_code == 200
    assert versions.get_json()["modules"][0]["versions"] == [{"version": "1.0.0"}]
    download = client.get("/v1/modules/internal/network/aws/1.0.0/download", headers=headers)
    assert download.status_code == 302
    assert "/v1/modules/download/" in download.headers["X-Terraform-Get"]


def test_readonly_member_can_list_but_cannot_publish(pg_db, tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    org_id, project_id = _seed()
    pg.execute("INSERT INTO users (id, username, password_hash) VALUES (%s,%s,%s)", ("readonly", "readonly", "x"))
    pg.execute(
        "INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s,%s,%s,%s)",
        (org_id, "readonly", "readonly", 1.0),
    )
    client = _app(tmp_path).test_client()
    token = generate_token("readonly", "readonly", [], tmp_path, token_type="access")
    headers = {"Authorization": f"Bearer {token}", "X-Project-Id": project_id}
    listed = client.get(f"/api/projects/{project_id}/tofu-modules", headers=headers)
    assert listed.status_code == 200
    denied = client.post(
        f"/api/projects/{project_id}/tofu-modules",
        headers=headers,
        data={"manifest": json.dumps({"slug": "internal/readonly/aws", "version": "1.0.0", "description": "x"}), "archive": (_archive(), "module.tar.gz")},
        content_type="multipart/form-data",
    )
    assert denied.status_code == 403
    assert denied.get_json()["error"]["code"] == "FORBIDDEN"


def test_cross_org_archive_download_is_denied_and_redirect_has_no_path(pg_db, tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    org_id, project_id = _seed()
    client = _app(tmp_path).test_client()
    owner_headers = _headers(tmp_path, project_id)
    published = client.post(
        f"/api/projects/{project_id}/tofu-modules",
        headers=owner_headers,
        data={"manifest": json.dumps({"slug": "internal/network/aws", "version": "1.0.0", "description": "network"}), "archive": (_archive(), "module.tar.gz")},
        content_type="multipart/form-data",
    )
    assert published.status_code == 201
    redirect = client.get("/v1/modules/internal/network/aws/1.0.0/download", headers=owner_headers)
    assert redirect.status_code == 302
    location = redirect.headers["X-Terraform-Get"]
    assert "module-registry" not in location
    assert "/Users/" not in location
    archive = client.get(location, headers=owner_headers)
    assert archive.status_code == 200
    assert archive.data.startswith(b"\x1f\x8b")

    other_org = "org-routes-other"
    other_project = "project-routes-other"
    pg.execute("INSERT INTO users (id, username, password_hash) VALUES (%s,%s,%s)", ("other", "other", "x"))
    pg.execute("INSERT INTO orgs (id, name, created_by, created_at) VALUES (%s,%s,%s,%s)", (other_org, "Other", "other", 1.0))
    pg.execute("INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s,%s,%s,%s)", (other_org, "other", "owner", 1.0))
    pg.execute("INSERT INTO projects (id, org_id, owner_id, name, description, is_archived, updated_at) VALUES (%s,%s,%s,%s,%s,0,%s)", (other_project, other_org, "other", "Other", "", 1.0))
    other_token = generate_token("other", "other", [], tmp_path, token_type="access")
    denied = client.get(location, headers={"Authorization": f"Bearer {other_token}", "X-Project-Id": other_project})
    assert denied.status_code == 404


def test_private_module_routes_require_authorized_project(pg_db, tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    _, project_id = _seed()
    client = _app(tmp_path).test_client()
    assert client.get(f"/api/projects/{project_id}/tofu-modules").status_code == 401
    outsider_token = generate_token("outsider", "outsider", [], tmp_path, token_type="access")
    denied = client.get(f"/api/projects/{project_id}/tofu-modules", headers={"Authorization": f"Bearer {outsider_token}"})
    assert denied.status_code == 403
