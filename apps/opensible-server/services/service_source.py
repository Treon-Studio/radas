"""Project-scoped Git source bindings for service instances."""
from __future__ import annotations

import re
import time
import uuid
from urllib.parse import urlsplit, urlunsplit
from typing import Any, Mapping

from storage import pg
from services.git_source_manager import GitSourceError, validate_git_repo_url

_SHA_RE = re.compile(r"^[0-9a-fA-F]{7,64}$")
_REF_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$")


class ServiceSourceError(ValueError):
    pass


def _sanitize_url(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        raise ServiceSourceError("repo_url is required")
    try:
        validate_git_repo_url(raw)
    except GitSourceError as exc:
        raise ServiceSourceError(exc.message) from exc
    parsed = urlsplit(raw)
    if parsed.username or parsed.password:
        raw = urlunsplit((parsed.scheme, parsed.hostname or "", parsed.path, parsed.query, parsed.fragment))
    return raw


def _ref(value: Any) -> str:
    result = str(value or "").strip()
    if not result or not _REF_RE.fullmatch(result) or ".." in result:
        raise ServiceSourceError("ref must be a safe branch, tag, or commit reference")
    return result


def _path(value: Any) -> str:
    result = str(value or "").strip().strip("/")
    if result and (result.startswith("/") or ".." in result or "\\" in result):
        raise ServiceSourceError("path must be a repository-relative path")
    return result


def _commit(value: Any, required: bool = False) -> str | None:
    result = str(value or "").strip().lower()
    if not result:
        if required:
            raise ServiceSourceError("commit_sha is required")
        return None
    if not _SHA_RE.fullmatch(result):
        raise ServiceSourceError("commit_sha must be a hexadecimal Git commit")
    return result


def _row(row: Mapping[str, Any]) -> dict[str, Any]:
    result = dict(row)
    result.pop("id", None)
    return result


def _instance(project_id: str, instance_id: str, actor_id: str | None) -> dict[str, Any]:
    row = pg.query_one(
        "SELECT id,org_id,project_id FROM service_instances WHERE id=%s AND project_id=%s",
        (instance_id, project_id),
    )
    if not row:
        raise ServiceSourceError("service instance not found")
    member = pg.query_one(
        "SELECT 1 FROM org_members WHERE org_id=%s AND user_id=%s", (row["org_id"], actor_id)
    ) if actor_id else None
    if not member:
        raise ServiceSourceError("project access denied")
    return row


def get(project_id: str, instance_id: str, actor_id: str | None) -> dict[str, Any] | None:
    instance = _instance(project_id, instance_id, actor_id)
    row = pg.query_one(
        "SELECT * FROM service_sources WHERE project_id=%s AND instance_id=%s",
        (project_id, instance_id),
    )
    return _row(row) if row else None


def bind(project_id: str, instance_id: str, actor_id: str | None, payload: Mapping[str, Any]) -> dict[str, Any]:
    instance = _instance(project_id, instance_id, actor_id)
    repo_url = _sanitize_url(payload.get("repo_url"))
    ref = _ref(payload.get("ref") or payload.get("branch") or "main")
    path = _path(payload.get("path"))
    commit_sha = _commit(payload.get("commit_sha"))
    auth_secret_id = str(payload.get("auth_secret_id") or "").strip() or None
    now = time.time()
    with pg.transaction() as conn:
        existing = conn.execute(
            "SELECT * FROM service_sources WHERE instance_id=%s FOR UPDATE", (instance_id,)
        ).fetchone()
        if existing and commit_sha and existing.get("commit_sha") and existing["commit_sha"] != commit_sha:
            raise ServiceSourceError("commit metadata is immutable; create a new source revision")
        source_id = existing["id"] if existing else str(uuid.uuid4())
        row = conn.execute(
            "INSERT INTO service_sources (id,org_id,project_id,instance_id,repo_url,ref,path,commit_sha,source_revision,auth_secret_id,created_at,updated_at) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
            "ON CONFLICT (instance_id) DO UPDATE SET repo_url=EXCLUDED.repo_url,ref=EXCLUDED.ref,path=EXCLUDED.path,auth_secret_id=EXCLUDED.auth_secret_id,updated_at=EXCLUDED.updated_at "
            "RETURNING *",
            (source_id, instance["org_id"], project_id, instance_id, repo_url, ref, path, commit_sha, commit_sha, auth_secret_id, now, now),
        ).fetchone()
    return _row(row)


def resolve_commit(project_id: str, instance_id: str, actor_id: str | None, commit_sha: str) -> dict[str, Any]:
    source = get(project_id, instance_id, actor_id)
    if not source:
        raise ServiceSourceError("source binding not found")
    commit = _commit(commit_sha, required=True)
    if source.get("commit_sha") and source["commit_sha"] != commit:
        raise ServiceSourceError("commit metadata is immutable; create a new source revision")
    now = time.time()
    row = pg.query_one(
        "UPDATE service_sources SET commit_sha=%s,source_revision=%s,updated_at=%s WHERE project_id=%s AND instance_id=%s RETURNING *",
        (commit, commit, now, project_id, instance_id),
    )
    return _row(row)
