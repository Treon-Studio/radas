"""Versioned, provider-independent RADAS service catalog."""
from __future__ import annotations

import copy
import json
import re
import time
import uuid
from typing import Any, Mapping

from psycopg import errors as psycopg_errors
from psycopg.types.json import Jsonb

from schemas.service_definition import normalize_manifest, validation_errors
from storage import pg


def _audit_publication(conn: Any, action: str, actor_id: str, definition: Mapping[str, Any]) -> None:
    """Append publication audit data using the publication transaction."""
    conn.execute(
        "INSERT INTO audit_log(actor_user_id, action, target_type, target_id, meta_json, created_at) "
        "VALUES (%s,%s,%s,%s,%s,%s)",
        (
            actor_id,
            action,
            "service_definition",
            str(definition.get("id")),
            json.dumps({
                "slug": definition.get("slug"), "version": definition.get("version"),
                "scope": definition.get("scope"), "org_id": definition.get("org_id"),
                "published_at": definition.get("published_at"),
            }, ensure_ascii=False),
            time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
        ),
    )


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
    # Persist only the public form.  In particular, arbitrary nested metadata
    # is redacted before it can enter the JSONB manifest column.
    return _public_manifest(normalize_manifest(manifest))


_SENSITIVE_KEY_RE = re.compile(
    r"(?:secret|password|credential|token|private.?key|api.?key|access.?key|authorization|bearer|value)",
    re.IGNORECASE,
)


def _redact_nested(value: Any, *, sensitive_parent: bool = False) -> Any:
    """Deeply redact arbitrary metadata without mutating the stored object."""
    if isinstance(value, Mapping):
        redacted: dict[str, Any] = {}
        for key, child in value.items():
            key_text = str(key)
            sensitive = sensitive_parent or bool(_SENSITIVE_KEY_RE.search(key_text))
            if isinstance(child, (Mapping, list, tuple)):
                redacted[key_text] = _redact_nested(child, sensitive_parent=sensitive)
            else:
                redacted[key_text] = "[REDACTED]" if sensitive else _redact_nested(child)
        return redacted
    if isinstance(value, list):
        return [_redact_nested(item, sensitive_parent=sensitive_parent) for item in value]
    if isinstance(value, tuple):
        return [_redact_nested(item, sensitive_parent=sensitive_parent) for item in value]
    return "[REDACTED]" if sensitive_parent else copy.deepcopy(value)


def _public_manifest(manifest: Mapping[str, Any]) -> dict[str, Any]:
    """Return a deeply redacted manifest safe for storage and API responses."""
    result = copy.deepcopy(dict(manifest))
    result["secrets"] = [
        {key: value for key, value in declaration.items() if key in {"name", "required", "description"}}
        for declaration in result.get("secrets", [])
    ]
    if "metadata" in result:
        result["metadata"] = _redact_nested(result["metadata"])
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
    """List visible definitions using a private-disabled shadow policy.

    ``org_id`` must already have been authorized by the API layer. A private
    definition shadows the platform slug even while disabled; callers without
    an explicit disabled-admin view therefore see neither definition. This is
    the same boundary used by :func:`get_definition` and prevents fallback
    leaks through list responses.
    """
    platform_query, platform_params = _row_query("platform", None, include_disabled)
    platform_rows: list[Mapping[str, Any]] = list(pg.query_all(platform_query, platform_params))
    org_rows: list[Mapping[str, Any]] = []
    if org_id:
        # Include disabled private rows to calculate shadows before applying
        # the caller's visibility filter.
        org_query, org_params = _row_query("organization", org_id, True)
        org_rows = list(pg.query_all(org_query, org_params))
        if not include_disabled:
            disabled_slugs = {str(row["slug"]) for row in org_rows if row.get("disabled")}
            platform_rows = [row for row in platform_rows if str(row["slug"]) not in disabled_slugs]
            org_rows = [row for row in org_rows if not row.get("disabled")]
    rows = [*platform_rows, *org_rows]
    by_slug = {str(row["slug"]): row for row in rows}
    return [_row_to_definition(by_slug[slug]) for slug in sorted(by_slug)]


def project_org_id(project_id: str) -> str | None:
    """Derive an organization's id from a project, never from client metadata."""
    if not isinstance(project_id, str) or not project_id.strip():
        return None
    row = pg.query_one("SELECT org_id FROM projects WHERE id = %s", (project_id,))
    return row.get("org_id") if row and row.get("org_id") else None


def get_definition(
    slug: str, version: str | None = None, *, org_id: str | None = None, include_disabled: bool = False
) -> dict[str, Any] | None:
    """Fetch a visible definition with private-org precedence.

    A requested organization is an explicit visibility boundary. If that org
    has the slug but not the requested version, the lookup returns not found
    rather than falling through to a platform version.
    """
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
        if org_id and scope == "organization" and pg.query_one(
            "SELECT 1 AS present FROM service_definitions WHERE slug = %s AND scope_type = %s AND org_id = %s",
            (slug, scope, scoped_org_id),
        ):
            return None
    return None


def _semantic_version_key(version: str) -> tuple[Any, ...]:
    """Return a SemVer ordering key (build metadata does not affect order)."""
    match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?", version)
    if not match:
        raise ValueError(f"invalid semantic version: {version}")
    prerelease = match.group(4)
    identifiers = () if prerelease is None else tuple(
        (0, int(part)) if part.isdigit() else (1, part) for part in prerelease.split(".")
    )
    # A stable release sorts after every prerelease for the same base version.
    return (int(match.group(1)), int(match.group(2)), int(match.group(3)), prerelease is None, identifiers)


def publish_definition(
    manifest: Mapping[str, Any], actor: str | Mapping[str, Any], org_id: str | None,
    *, scope: str | None = None,
) -> dict[str, Any]:
    """Publish an immutable version and retain the highest semantic version as current."""
    normalized = _validated(manifest)
    scope_type, scoped_org_id = _scope_values(org_id, scope)
    actor_id = actor.get("user_id") if isinstance(actor, Mapping) else str(actor)
    actor_id = str(actor_id or "unknown")
    definition_id = str(uuid.uuid4())
    now = time.time()
    try:
        with pg.transaction() as conn:
            if scoped_org_id is None:
                existing = conn.execute(
                    "SELECT id, current_version FROM service_definitions "
                    "WHERE slug = %s AND scope_type = %s AND org_id IS NULL FOR UPDATE",
                    (normalized["slug"], scope_type),
                ).fetchone()
            else:
                existing = conn.execute(
                    "SELECT id, current_version FROM service_definitions "
                    "WHERE slug = %s AND scope_type = %s AND org_id = %s FOR UPDATE",
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
                if _semantic_version_key(normalized["version"]) > _semantic_version_key(existing["current_version"]):
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
            # Keep definition and required audit record in one transaction.
            _audit_publication(conn, "catalog.publish", actor_id, {
                "id": definition_id, "slug": normalized["slug"], "version": normalized["version"],
                "scope": scope_type, "org_id": scoped_org_id, "published_at": now,
            })
    except CatalogConflictError:
        raise
    except psycopg_errors.UniqueViolation as exc:
        raise CatalogConflictError("definition or version already exists") from exc
    except Exception as exc:
        # Audit/storage failures must not be reported as a successful publish.
        raise CatalogConflictError("publication could not be committed") from exc
    result = get_definition(
        normalized["slug"], normalized["version"],
        org_id=scoped_org_id if scope_type == "organization" else None,
        include_disabled=True,
    )
    if result is None:
        raise CatalogNotFoundError("published definition could not be read")
    return result


def seed_recommended_definitions() -> list[dict[str, Any]]:
    """Explicitly publish the harmless, pinned recommended catalog idempotently."""
    seeded: list[dict[str, Any]] = []
    for manifest in RECOMMENDED_DEFINITIONS:
        existing = get_definition(manifest["slug"], manifest["version"], include_disabled=True)
        if existing is None:
            try:
                seeded.append(publish_definition(manifest, "catalog-seed", None, scope="platform"))
            except CatalogConflictError:
                existing = get_definition(manifest["slug"], manifest["version"], include_disabled=True)
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
    license_policy: str | None = None, inputs: list[dict[str, Any]] = (),
) -> dict[str, Any]:
    metadata = {"license_policy": license_policy} if license_policy else {}
    return {
        "schema_version": 1, "slug": slug, "name": name, "version": "1.0.0",
        "category": category, "summary": summary, "runtime": "container", "image": image,
        "production_ready": production_ready, "persistence": persistence,
        "inputs": [{"name": "memory_mb", "type": "integer", "required": False, "default": memory_mb, "min": 128}, *list(inputs)],
        "secrets": [{"name": name} for name in secrets], "storage": list(storage),
        "ports": [{"name": "http", "port": health_port, "protocol": "tcp", "public": True}],
        "endpoints": [{"name": "endpoint", "port": "http", "path": health_path, "public": True}],
        "healthcheck": {"path": health_path, "port": health_port, "interval_seconds": 30},
        "lifecycle": {"start": True, "stop": True, "restart": True, "update": True, "rollback": True, "destroy": True},
        "dependencies": [], "outputs": outputs, "supported_runtimes": supported_runtimes or ["docker", "podman", "kubernetes"],
        "minimum_resources": {"cpu_millicores": 100, "memory_mb": memory_mb, "storage_gb": storage[0]["size_gb"] if storage else 0},
        "metadata": metadata,
    }


RECOMMENDED_DEFINITIONS: tuple[dict[str, Any], ...] = (
    _manifest("n8n", "n8n", "automation", "Workflow automation and integrations", "n8nio/n8n:1.107.4", production_ready=False, persistence="required", health_port=5678, health_path="/healthz", outputs=["endpoint", "admin_url"], secrets=["encryption_key"], storage=[{"name": "data", "size_gb": 10, "required": True, "mount_path": "/home/node/.n8n"}], memory_mb=1024, inputs=[{"name": "domain", "type": "domain"}, {"name": "database_type", "type": "enum", "choices": ["sqlite", "postgres"], "default": "sqlite"}]),
    _manifest("activepieces", "Activepieces", "automation", "Composable workflow automation", "activepieces/activepieces:0.69.0", production_ready=False, persistence="required", health_port=80, outputs=["endpoint", "admin_url"], secrets=["encryption_key"], storage=[{"name": "data", "size_gb": 10, "required": True, "mount_path": "/root/.activepieces"}], memory_mb=1024, inputs=[{"name": "domain", "type": "domain"}, {"name": "database_type", "type": "enum", "choices": ["sqlite", "postgres"], "default": "sqlite"}]),
    _manifest("waha-plus", "WAHA Plus", "messaging", "WhatsApp HTTP API service", "devlikeapro/waha-plus:2025.6.1", production_ready=False, persistence="required", health_port=3000, health_path="/health", outputs=["endpoint", "admin_url"], secrets=["license_key"], storage=[{"name": "sessions", "size_gb": 5, "required": True, "mount_path": "/app/.sessions"}], memory_mb=1024, license_policy="requires_valid_waha_license_for_production", inputs=[{"name": "domain", "type": "domain"}]),
    _manifest("postgresql", "PostgreSQL", "data", "Relational database for applications", "postgres:16.4-alpine", production_ready=True, persistence="required", health_port=5432, outputs=["endpoint", "connection_string"], secrets=["postgres_password"], storage=[{"name": "data", "size_gb": 20, "required": True, "mount_path": "/var/lib/postgresql/data"}], memory_mb=512, inputs=[{"name": "database_name", "type": "string", "required": True}, {"name": "domain", "type": "domain"}]),
    _manifest("redis", "Redis", "data", "Cache and queue datastore", "redis:7.4.1-alpine", production_ready=True, persistence="optional", health_port=6379, outputs=["endpoint", "connection_string"], secrets=["redis_password"], storage=[{"name": "data", "size_gb": 5, "required": False, "mount_path": "/data"}], memory_mb=256, inputs=[{"name": "domain", "type": "domain"}]),
    _manifest("minio", "MinIO", "storage", "S3-compatible object storage", "minio/minio:RELEASE.2024-08-03T04-33-23Z", production_ready=False, persistence="required", health_port=9000, health_path="/minio/health/live", outputs=["endpoint", "admin_url"], secrets=["root_password"], storage=[{"name": "data", "size_gb": 50, "required": True, "mount_path": "/data"}], memory_mb=1024, inputs=[{"name": "domain", "type": "domain"}, {"name": "api_port", "type": "port", "default": 9000}, {"name": "console_port", "type": "port", "default": 9001}]),
    _manifest("uptime-kuma", "Uptime Kuma", "observability", "Endpoint monitoring and status pages", "louislam/uptime-kuma:1.23.16", production_ready=False, persistence="required", health_port=3001, outputs=["endpoint", "admin_url"], storage=[{"name": "data", "size_gb": 5, "required": True, "mount_path": "/app/data"}], memory_mb=512, inputs=[{"name": "domain", "type": "domain"}]),
    _manifest("grafana", "Grafana", "observability", "Dashboards and metrics visualization", "grafana/grafana:11.2.0", production_ready=True, persistence="optional", health_port=3000, health_path="/api/health", outputs=["endpoint", "admin_url"], secrets=["admin_password"], storage=[{"name": "data", "size_gb": 10, "required": False, "mount_path": "/var/lib/grafana"}], memory_mb=512, inputs=[{"name": "domain", "type": "domain"}, {"name": "database_type", "type": "enum", "choices": ["sqlite", "postgres", "mysql"], "default": "sqlite"}]),
    _manifest("wordpress", "WordPress", "web", "Content management and publishing", "wordpress:6.6.2-php8.3-apache", production_ready=False, persistence="required", health_port=80, outputs=["endpoint", "admin_url"], secrets=["admin_password", "database_password"], storage=[{"name": "data", "size_gb": 20, "required": True, "mount_path": "/var/www/html"}], memory_mb=512, inputs=[{"name": "domain", "type": "domain"}, {"name": "database_type", "type": "enum", "choices": ["mysql", "mariadb"], "default": "mysql"}, {"name": "database_host", "type": "string", "required": True}]),
    _manifest("static-web", "Static web app", "web", "Static website served from a container", "nginx:1.27.1-alpine", production_ready=True, persistence="stateless", health_port=80, outputs=["endpoint"], memory_mb=128, inputs=[{"name": "domain", "type": "domain"}, {"name": "image", "type": "string", "required": False}]),
    _manifest("custom-container", "Custom container", "web", "Advanced escape hatch for a pinned container image", "ghcr.io/raizora/radas-custom-container:1.0.0", production_ready=False, persistence="stateless", health_port=8080, outputs=["endpoint"], memory_mb=256, inputs=[{"name": "image", "type": "string", "required": True}, {"name": "domain", "type": "domain"}, {"name": "port", "type": "port", "default": 8080}]),
)
