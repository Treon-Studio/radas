"""Organization-private OpenTofu module registry persistence (UC334)."""
from __future__ import annotations

import hashlib
import os
import re
import shutil
import tarfile
import time
import uuid
from pathlib import Path
from typing import Any, Mapping

from psycopg.types.json import Jsonb

from api.platform_contracts import redact_sensitive
from storage import pg

MAX_ARCHIVE_BYTES = 10 * 1024 * 1024
MAX_ARCHIVE_FILES = 500
_SEGMENT_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,61}$")
_SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$")


class ModuleConflictError(ValueError):
    """Raised when an immutable module version already exists."""


class ModuleValidationError(ValueError):
    """Raised when module metadata or archive content is invalid."""


class ModuleStorageError(RuntimeError):
    """Raised when publication cannot be committed atomically."""


def _version_key(version: str) -> tuple[Any, ...]:
    match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?", version)
    if not match:
        raise ModuleValidationError("version must be valid semantic version")
    prerelease = match.group(4)
    parts = () if prerelease is None else tuple(
        (0, int(part)) if part.isdigit() else (1, part) for part in prerelease.split(".")
    )
    return int(match.group(1)), int(match.group(2)), int(match.group(3)), prerelease is None, parts


def _normalise_manifest(manifest: Mapping[str, Any]) -> dict[str, Any]:
    slug = str(manifest.get("slug") or "").strip().lower()
    version = str(manifest.get("version") or "").strip()
    description = str(manifest.get("description") or "").strip()
    parts = slug.split("/")
    if len(parts) != 3 or any(not _SEGMENT_RE.fullmatch(part) for part in parts):
        raise ModuleValidationError("slug must be namespace/name/provider using lowercase letters, digits, and hyphens")
    if not _SEMVER_RE.fullmatch(version):
        raise ModuleValidationError("version must be valid semantic version")
    if not description:
        raise ModuleValidationError("description is required")
    tags = manifest.get("tags") or []
    if not isinstance(tags, list) or not all(isinstance(tag, str) for tag in tags):
        raise ModuleValidationError("tags must be a list of strings")
    return redact_sensitive({
        "slug": slug,
        "version": version,
        "description": description,
        "tags": tags,
        "inputs": manifest.get("inputs") or [],
        "outputs": manifest.get("outputs") or [],
    })


def _artifact_path(module_id: str, version: str) -> Path:
    return Path(os.environ.get("DATA_DIR", "data")) / "module-registry" / module_id / f"{version}.tar.gz"


def _validate_archive(path: Path) -> tuple[str, int, int]:
    if not path.is_file():
        raise ModuleValidationError("archive file is required")
    size = path.stat().st_size
    if size > MAX_ARCHIVE_BYTES:
        raise ModuleValidationError("archive exceeds the 10 MiB limit")
    try:
        with tarfile.open(path, "r:gz") as archive:
            members = archive.getmembers()
            if len(members) > MAX_ARCHIVE_FILES:
                raise ModuleValidationError("archive contains too many files")
            tofu_files = 0
            for member in members:
                member_path = Path(member.name)
                if member.name.startswith("/") or ".." in member_path.parts or member.issym() or member.islnk():
                    raise ModuleValidationError("archive contains unsafe paths or links")
                if member.isfile() and member_path.suffix == ".tf":
                    tofu_files += 1
    except tarfile.TarError as exc:
        raise ModuleValidationError("archive must be a valid gzip tar archive") from exc
    if not tofu_files:
        raise ModuleValidationError("archive must contain at least one .tf file")
    return hashlib.sha256(path.read_bytes()).hexdigest(), size, len(members)


def publish_module(manifest: Mapping[str, Any], archive: str | Path, *, actor_id: str, org_id: str) -> dict[str, Any]:
    """Publish an immutable organization-private module version."""
    item = _normalise_manifest(manifest)
    archive_path = Path(archive)
    sha256, size, file_count = _validate_archive(archive_path)
    module_id = str(uuid.uuid4())
    destination: Path | None = None
    now = time.time()
    try:
        with pg.transaction() as conn:
            existing = conn.execute(
                "SELECT id, current_version FROM tofu_modules WHERE org_id = %s AND slug = %s FOR UPDATE",
                (org_id, item["slug"]),
            ).fetchone()
            if existing:
                module_id = existing["id"]
                duplicate = conn.execute(
                    "SELECT 1 FROM tofu_module_versions WHERE definition_id = %s AND version = %s",
                    (module_id, item["version"]),
                ).fetchone()
                if duplicate:
                    raise ModuleConflictError(f"module {item['slug']} version {item['version']} already exists")
            else:
                conn.execute(
                    "INSERT INTO tofu_modules (id, slug, scope_type, org_id, owner_id, current_version, created_at) "
                    "VALUES (%s,%s,'organization',%s,%s,%s,%s)",
                    (module_id, item["slug"], org_id, actor_id, item["version"], now),
                )
            destination = _artifact_path(module_id, item["version"])
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(archive_path, destination)
            conn.execute(
                "INSERT INTO tofu_module_versions "
                "(definition_id, version, manifest, archive_path, sha256, size, file_count, published_by, published_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (module_id, item["version"], Jsonb(item), str(destination), sha256, size, file_count, actor_id, now),
            )
            if existing and _version_key(item["version"]) > _version_key(existing["current_version"]):
                conn.execute("UPDATE tofu_modules SET current_version = %s WHERE id = %s", (item["version"], module_id))
            conn.execute(
                "INSERT INTO audit_log (actor_user_id, action, target_type, target_id, meta_json, created_at) "
                "VALUES (%s,%s,%s,%s,%s,%s)",
                (actor_id, "module.publish", "tofu_module", module_id,
                 Jsonb({"slug": item["slug"], "version": item["version"], "org_id": org_id, "sha256": sha256}), now),
            )
    except ModuleConflictError:
        raise
    except Exception as exc:
        if destination and destination.exists():
            destination.unlink()
        raise ModuleStorageError("module publication could not be committed") from exc
    return get_module(item["slug"], item["version"], org_id=org_id, include_disabled=True) or {}


def get_module(slug: str, version: str | None = None, *, org_id: str, include_disabled: bool = False) -> dict[str, Any] | None:
    query = (
        "SELECT m.id, m.slug, m.org_id, m.current_version, m.disabled, mv.version, mv.manifest, "
        "mv.sha256, mv.size, mv.file_count, mv.published_by, mv.published_at "
        "FROM tofu_modules m JOIN tofu_module_versions mv ON mv.definition_id = m.id "
        "WHERE m.org_id = %s AND m.slug = %s"
    )
    params: list[Any] = [org_id, slug]
    if not include_disabled:
        query += " AND m.disabled = FALSE"
    if version:
        query += " AND mv.version = %s"
        params.append(version)
    else:
        query += " AND mv.version = m.current_version"
    row = pg.query_one(query, tuple(params))
    return dict(row) if row else None


def versions(slug: str, *, org_id: str) -> list[dict[str, Any]]:
    row = pg.query_one("SELECT id FROM tofu_modules WHERE org_id = %s AND slug = %s AND disabled = FALSE", (org_id, slug))
    if not row:
        return []
    return [dict(item) for item in pg.query_all(
        "SELECT version, sha256, size, published_at FROM tofu_module_versions WHERE definition_id = %s ORDER BY published_at DESC",
        (row["id"],),
    )]


def archive_path(module_id: str, version: str, *, org_id: str) -> Path | None:
    row = pg.query_one(
        "SELECT mv.archive_path FROM tofu_module_versions mv JOIN tofu_modules m ON m.id = mv.definition_id "
        "WHERE m.id = %s AND m.org_id = %s AND mv.version = %s AND m.disabled = FALSE",
        (module_id, org_id, version),
    )
    if not row:
        return None
    path = Path(row["archive_path"])
    return path if path.is_file() else None


def list_modules(org_id: str, *, include_disabled: bool = False) -> list[dict[str, Any]]:
    query = (
        "SELECT m.id, m.slug, m.org_id, m.current_version, m.disabled, mv.manifest, mv.sha256, mv.size, mv.file_count "
        "FROM tofu_modules m JOIN tofu_module_versions mv ON mv.definition_id = m.id AND mv.version = m.current_version "
        "WHERE m.org_id = %s"
    )
    if not include_disabled:
        query += " AND m.disabled = FALSE"
    query += " ORDER BY m.slug"
    modules = [dict(row) for row in pg.query_all(query, (org_id,))]
    for module in modules:
        module["versions"] = versions(str(module["slug"]), org_id=org_id)
    return modules
