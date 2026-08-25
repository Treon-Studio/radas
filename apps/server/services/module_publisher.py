"""Organization-private OpenTofu module publisher and artifact packager (UC511)."""
from __future__ import annotations

import hashlib
import json
import logging
import time
import uuid
from typing import Any, Dict

from storage import pg

logger = logging.getLogger(__name__)


def publish_module_tarball(
    org_id: str,
    slug: str,
    version: str,
    manifest: Dict[str, Any],
    archive_bytes: bytes,
    publisher: str = "admin",
) -> Dict[str, Any]:
    """Validate, checksum, and publish a new module version into the private registry (UC511)."""
    clean_org = org_id.strip()
    clean_slug = slug.strip()
    clean_ver = version.strip()
    now = time.time()

    sha256_hash = hashlib.sha256(archive_bytes).hexdigest()
    size_bytes = len(archive_bytes)

    with pg.transaction() as conn:
        # Check or create tofu_modules row
        row = conn.execute(
            "SELECT id FROM tofu_modules WHERE org_id = %s AND slug = %s",
            (clean_org, clean_slug),
        ).fetchone()

        if row:
            module_id = row["id"]
            conn.execute(
                "UPDATE tofu_modules SET current_version = %s WHERE id = %s",
                (clean_ver, module_id),
            )
        else:
            module_id = f"mod-{uuid.uuid4().hex[:8]}"
            conn.execute(
                "INSERT INTO tofu_modules (id, slug, scope_type, org_id, owner_id, current_version, created_at) "
                "VALUES (%s, %s, 'organization', %s, %s, %s, %s)",
                (module_id, clean_slug, clean_org, publisher, clean_ver, now),
            )

        # Upsert tofu_module_versions row
        archive_path = f"modules/{clean_org}/{clean_slug}/{clean_ver}.tar.gz"
        conn.execute(
            "INSERT INTO tofu_module_versions (definition_id, version, manifest, archive_path, sha256, size, file_count, published_by, published_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) "
            "ON CONFLICT (definition_id, version) DO UPDATE SET manifest = EXCLUDED.manifest, sha256 = EXCLUDED.sha256, size = EXCLUDED.size, published_at = EXCLUDED.published_at",
            (module_id, clean_ver, json.dumps(manifest), archive_path, sha256_hash, size_bytes, 1, publisher, now),
        )

    logger.info(f"Published module {clean_org}/{clean_slug} v{clean_ver} (sha256={sha256_hash[:8]})")

    return {
        "success": True,
        "module_id": module_id,
        "org_id": clean_org,
        "slug": clean_slug,
        "version": clean_ver,
        "sha256": sha256_hash,
        "size": size_bytes,
        "archive_path": archive_path,
        "published_by": publisher,
    }
