"""Versioned, provider-independent RADAS service catalog."""
from __future__ import annotations

import copy
import time
import uuid
from typing import Any, Mapping

from psycopg import errors as psycopg_errors
from psycopg.types.json import Jsonb

from schemas.service_definition import normalize_manifest, validation_errors
from storage import pg


class CatalogValidationError(ValueError):
    def __init__(self, errors: list[dict[str, Any]]):
        super().__init__("service definition manifest is invalid")
        self.errors = errors


class CatalogConflictError(ValueError):
    pass


class CatalogNotFoundError(LookupError):
    pass


def validate_manifest(manifest: Any) -> list[dict[str, Any]]:
    """Validate a v1 manifest and return stable structured errors."""
    return validation_errors(manifest)


def _validated(manifest: Mapping[str, Any]) -> dict[str, Any]:
    errors = validate_manifest(manifest)
    if errors:
        raise CatalogValidationError(errors)
    return normalize_manifest(manifest)


def _public_manifest(manifest: Mapping[str, Any]) -> dict[str, Any]:
    """Return a manifest safe for API responses and catalog cards."""
    # Secret declarations contain names and metadata only. Keep this copy
    # explicit so a future storage extension cannot accidentally expose values.
    result = copy.deepcopy(dict(manifest))
    result["secrets"] = [
        {key: value for key, value in declaration.items() if key in {"name", "required", "description"}}
        for declaration in result.get("secrets", [])
    ]
    return result


def _row_to_definition(row: Mapping[str, Any], *, include_manifest: bool = True) -> dict[str, Any]:
    definition = {
        "id": row["id"],
        "slug": row["slug"],
        "scope": row["scope_type"],
        "org_id": row.get("org_id"),
        "owner_id": row.get("owner_id"),
        "version": row["version"],
        "disabled": bool(row.get("disabled", False)),
        "created_at": row.get("created_at"),
        "published_at": row.get("published_at"),
    }
    if include_manifest:
        definition["manifest"] = _public_manifest(row["manifest"])
    return definition


def _scope_values(org_id: str | None, scope: str | None) -> tuple[str, str | None]:
    if scope is None:
        scope = "organization" if org_id else "platform"
    normalized = str(scope).strip().lower()
    if normalized in {"global", "platform"}:
        if org_id:
            raise ValueError("platform definitions cannot have an organization")
        return "platform", None
    if normalized in {"organization", "org", "private"}:
        if not org_id:
            raise ValueError("organization definitions require an organization")
        return "organization", org_id
    raise ValueError("scope must be platform or organization")


def _row_query(scope: str, org_id: str | None, include_disabled: bool) -> tuple[str, tuple[Any, ...]]:
    where = ["d.scope_type = %s"]
    params: list[Any] = [scope]
    if scope == "organization":
        where.append("d.org_id = %s")
        params.append(org_id)
    if not include_disabled:
        where.append("d.disabled = FALSE")
    return (
        "SELECT d.id, d.slug, d.scope_type, d.org_id, d.owner_id, d.disabled, "
        "v.version, v.manifest, d.created_at, v.published_at "
        "FROM service_definitions d JOIN service_definition_versions v "
        "ON v.definition_id = d.id AND v.version = d.current_version "
        f"WHERE {' AND '.join(where)} ORDER BY d.slug",
        tuple(params),
    )


def list_definitions(org_id: str | None, *, include_disabled: bool = False) -> list[dict[str, Any]]:
    """List platform definitions plus definitions explicitly scoped to ``org_id``.

    Passing ``None`` intentionally lists only platform definitions; there is no
    implicit tenant/default organization fallback.
    """
    rows: list[Mapping[str, Any]] = []
    query, params = _row_query("platform", None, include_disabled)
    rows.extend(pg.query_all(query, params))
    if org_id:
        query, params = _row_query("organization", org_id, include_disabled)
        rows.extend(pg.query_all(query, params))
    return [_row_to_definition(row) for row in rows]


def get_definition(
    slug: str, version: str | None = None, *, org_id: str | None = None, include_disabled: bool = False
) -> dict[str, Any] | None:
    """Fetch a platform definition and, when explicitly requested, an org definition."""
    if not slug or not isinstance(slug, str):
        return None
    scopes: list[tuple[str, str | None]] = []
    if org_id:
        scopes.append(("organization", org_id))
    scopes.append(("platform", None))
    for scope, scoped_org_id in scopes:
        where = ["d.slug = %s", "d.scope_type = %s"]
        where_params: list[Any] = [slug, scope]
        if scoped_org_id:
            where.append("d.org_id = %s")
            where_params.append(scoped_org_id)
        if version is None:
            join = "v.version = d.current_version"
            params = where_params
        else:
            join = "v.version = %s"
            params = [version, *where_params]
        if not include_disabled:
            where.append("d.disabled = FALSE")
        row = pg.query_one(
            "SELECT d.id, d.slug, d.scope_type, d.org_id, d.owner_id, d.disabled, "
            "v.version, v.manifest, d.created_at, v.published_at "
            "FROM service_definitions d JOIN service_definition_versions v ON v.definition_id = d.id AND "
            f"{join} WHERE {' AND '.join(where)}",
            tuple(params),
        )
        if row:
            return _row_to_definition(row)
    return None


def publish_definition(
    manifest: Mapping[str, Any], actor: str | Mapping[str, Any], org_id: str | None,
    *, scope: str | None = None,
) -> dict[str, Any]:
    """Publish an immutable manifest version, never replacing an existing version."""
    normalized = _validated(manifest)
    scope_type, scoped_org_id = _scope_values(org_id, scope)
    actor_id = actor.get("user_id") if isinstance(actor, Mapping) else str(actor)
    actor_id = actor_id or "unknown"
    actor_id = str(actor_id)
    definition_id = str(uuid.uuid4())
    now = time.time()
    try:
        with pg.transaction() as conn:
            if scoped_org_id is None:
                existing = conn.execute(
                    "SELECT id FROM service_definitions WHERE slug = %s AND scope_type = %s "
                    "AND org_id IS NULL",
                    (normalized["slug"], scope_type),
                ).fetchone()
            else:
                existing = conn.execute(
                    "SELECT id FROM service_definitions WHERE slug = %s AND scope_type = %s "
                    "AND org_id = %s",
                    (normalized["slug"], scope_type, scoped_org_id),
                ).fetchone()
            if existing:
                definition_id = existing["id"]
                version_row = conn.execute(
                    "SELECT 1 FROM service_definition_versions WHERE definition_id = %s AND version = %s",
                    (definition_id, normalized["version"]),
                ).fetchone()
                if version_row:
                    raise CatalogConflictError(
                        f"definition {normalized['slug']} version {normalized['version']} already exists"
                    )
                conn.execute(
                    "INSERT INTO service_definition_versions "
                    "(definition_id, version, manifest, published_by, published_at) VALUES (%s,%s,%s,%s,%s)",
                    (definition_id, normalized["version"], Jsonb(normalized), actor_id, now),
                )
                conn.execute(
                    "UPDATE service_definitions SET current_version = %s WHERE id = %s",
                    (normalized["version"], definition_id),
                )
            else:
                conn.execute(
                    "INSERT INTO service_definitions "
                    "(id, slug, scope_type, org_id, owner_id, current_version, disabled, created_at) "
                    "VALUES (%s,%s,%s,%s,%s,%s,FALSE,%s)",
                    (definition_id, normalized["slug"], scope_type, scoped_org_id,
                     actor_id if scope_type == "organization" else None, normalized["version"], now),
                )
                conn.execute(
                    "INSERT INTO service_definition_versions "
                    "(definition_id, version, manifest, published_by, published_at) VALUES (%s,%s,%s,%s,%s)",
                    (definition_id, normalized["version"], Jsonb(normalized), actor_id, now),
                )
    except CatalogConflictError:
        raise
    except psycopg_errors.UniqueViolation as exc:
        raise CatalogConflictError("definition or version already exists") from exc
    result = get_definition(
        normalized["slug"], normalized["version"],
        org_id=scoped_org_id if scope_type == "organization" else None,
    )
    if result is None:
        raise CatalogNotFoundError("published definition could not be read")
    return result


def seed_recommended_definitions() -> list[dict[str, Any]]:
    """Explicitly publish the harmless, pinned recommended catalog idempotently."""
    seeded: list[dict[str, Any]] = []
    for manifest in RECOMMENDED_DEFINITIONS:
        existing = get_definition(manifest["slug"], manifest["version"])
        if existing is None:
            try:
                seeded.append(publish_definition(manifest, "catalog-seed", None, scope="platform"))
            except CatalogConflictError:
                existing = get_definition(manifest["slug"], manifest["version"])
                if existing is None:
                    raise
                seeded.append(existing)
        else:
            seeded.append(existing)
    return seeded


def _manifest(
    slug: str, name: str, category: str, summary: str, image: str, *,
    production_ready: bool, persistence: str, health_port: int, health_path: str = "/",
    outputs: list[str], secrets: list[str] = (), storage: list[dict[str, Any]] = (),
    memory_mb: int = 256, supported_runtimes: list[str] = None,
) -> dict[str, Any]:
    return {
        "schema_version": 1, "slug": slug, "name": name, "version": "1.0.0",
        "category": category, "summary": summary, "runtime": "container", "image": image,
        "production_ready": production_ready, "persistence": persistence,
        "inputs": [{"name": "memory_mb", "type": "integer", "required": False, "default": memory_mb, "min": 128}],
        "secrets": [{"name": name} for name in secrets], "storage": list(storage),
        "healthcheck": {"path": health_path, "port": health_port, "interval_seconds": 30},
        "outputs": outputs, "supported_runtimes": supported_runtimes or ["docker", "podman", "kubernetes"],
        "minimum_resources": {"cpu_millicores": 100, "memory_mb": memory_mb, "storage_gb": storage[0]["size_gb"] if storage else 0},
    }


RECOMMENDED_DEFINITIONS: tuple[dict[str, Any], ...] = (
    _manifest("n8n", "n8n", "automation", "Workflow automation and integrations", "n8nio/n8n:1.107.4", production_ready=False, persistence="required", health_port=5678, health_path="/healthz", outputs=["endpoint", "admin_url"], secrets=["encryption_key"], storage=[{"name": "data", "size_gb": 10, "required": True, "mount_path": "/home/node/.n8n"}], memory_mb=1024),
    _manifest("activepieces", "Activepieces", "automation", "Composable workflow automation", "activepieces/activepieces:0.69.0", production_ready=False, persistence="required", health_port=80, outputs=["endpoint", "admin_url"], secrets=["encryption_key"], storage=[{"name": "data", "size_gb": 10, "required": True, "mount_path": "/root/.activepieces"}], memory_mb=1024),
    _manifest("waha-plus", "WAHA Plus", "messaging", "WhatsApp HTTP API service", "devlikeapro/waha-plus:2025.6.1", production_ready=False, persistence="required", health_port=3000, health_path="/health", outputs=["endpoint", "admin_url"], secrets=["license_key"], storage=[{"name": "sessions", "size_gb": 5, "required": True, "mount_path": "/app/.sessions"}], memory_mb=1024),
    _manifest("postgresql", "PostgreSQL", "data", "Relational database for applications", "postgres:16.4-alpine", production_ready=True, persistence="required", health_port=5432, outputs=["endpoint", "connection_string"], secrets=["postgres_password"], storage=[{"name": "data", "size_gb": 20, "required": True, "mount_path": "/var/lib/postgresql/data"}], memory_mb=512),
    _manifest("redis", "Redis", "data", "Cache and queue datastore", "redis:7.4.1-alpine", production_ready=True, persistence="optional", health_port=6379, outputs=["endpoint", "connection_string"], secrets=["redis_password"], storage=[{"name": "data", "size_gb": 5, "required": False, "mount_path": "/data"}], memory_mb=256),
    _manifest("minio", "MinIO", "storage", "S3-compatible object storage", "minio/minio:RELEASE.2024-08-03T04-33-23Z", production_ready=False, persistence="required", health_port=9000, health_path="/minio/health/live", outputs=["endpoint", "admin_url"], secrets=["root_password"], storage=[{"name": "data", "size_gb": 50, "required": True, "mount_path": "/data"}], memory_mb=1024),
    _manifest("uptime-kuma", "Uptime Kuma", "observability", "Endpoint monitoring and status pages", "louislam/uptime-kuma:1.23.16", production_ready=False, persistence="required", health_port=3001, outputs=["endpoint", "admin_url"], storage=[{"name": "data", "size_gb": 5, "required": True, "mount_path": "/app/data"}], memory_mb=512),
    _manifest("grafana", "Grafana", "observability", "Dashboards and metrics visualization", "grafana/grafana:11.2.0", production_ready=True, persistence="optional", health_port=3000, health_path="/api/health", outputs=["endpoint", "admin_url"], secrets=["admin_password"], storage=[{"name": "data", "size_gb": 10, "required": False, "mount_path": "/var/lib/grafana"}], memory_mb=512),
    _manifest("wordpress", "WordPress", "web", "Content management and publishing", "wordpress:6.6.2-php8.3-apache", production_ready=False, persistence="required", health_port=80, outputs=["endpoint", "admin_url"], secrets=["admin_password", "database_password"], storage=[{"name": "data", "size_gb": 20, "required": True, "mount_path": "/var/www/html"}], memory_mb=512),
    _manifest("static-web", "Static web app", "web", "Static website served from a container", "nginx:1.27.1-alpine", production_ready=True, persistence="stateless", health_port=80, outputs=["endpoint"], memory_mb=128),
    _manifest("custom-container", "Custom container", "web", "Advanced escape hatch for a pinned container image", "ghcr.io/raizora/radas-custom-container:1.0.0", production_ready=False, persistence="stateless", health_port=8080, outputs=["endpoint"], memory_mb=256),
)
