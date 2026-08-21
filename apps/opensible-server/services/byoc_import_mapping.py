"""Project-scoped, deterministic BYOC resource import mappings."""
from __future__ import annotations

import re
import time
from collections.abc import Mapping
from typing import Any

from services import byoc, org_service
from services.cloud_provisioning import _load_meta, _save_meta
from storage import pg

_ADDRESS_RE = re.compile(
    r"^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\[(?:\"[A-Za-z0-9_-]+\"|[0-9]+)\])*$"
)


def validate_resource_address(address: str) -> str:
    value = str(address or "").strip()
    forbidden = ("..", "/", "\\", ";", "&", "|", "$", "`", "'", '"', " ")
    if not value or not _ADDRESS_RE.fullmatch(value) or any(token in value for token in forbidden):
        raise ValueError("invalid resource address")
    return value


def _project_org(project_id: str) -> str:
    row = pg.query_one("SELECT org_id FROM projects WHERE id=%s", (project_id,))
    if not row or not row.get("org_id"):
        raise ValueError("project access denied")
    return str(row["org_id"])


def _authorize(account: Mapping[str, Any], project_id: str, actor_id: str | None) -> None:
    project_org = _project_org(project_id)
    account_org = str(account.get("org_id") or "")
    account_project = str(account.get("project_id") or "")
    if account_org and account_org != project_org:
        raise ValueError("tenant access denied")
    if account_project and account_project != project_id:
        raise ValueError("project access denied")
    if actor_id != "__internal__" and not org_service.is_member(project_org, actor_id):
        raise ValueError("project access denied")


def _stack_exists(project_id: str, stack: str) -> None:
    row = pg.query_one(
        "SELECT 1 AS present FROM stack_meta WHERE project_id=%s AND stack=%s",
        (project_id, stack),
    )
    if not row:
        raise ValueError("stack not found")


def _persist_mapping(project_id: str, stack: str, mapping: dict[str, Any]) -> None:
    metadata = dict(_load_meta(project_id, stack))
    metadata["byoc_import_mapping"] = mapping
    _save_meta(project_id, stack, **metadata)


def prepare_import_mapping(
    account_id: str,
    *,
    project_id: str,
    stack: str,
    resource_ids: list[str],
    address_overrides: Mapping[str, str] | None = None,
    actor_id: str | None = None,
) -> dict[str, Any]:
    project_id = str(project_id or "").strip()
    stack = str(stack or "").strip()
    if not project_id or not stack:
        raise ValueError("project_id and stack are required")
    _stack_exists(project_id, stack)
    account = byoc.get_account(account_id)
    if not account:
        raise ValueError("account not found")
    _authorize(account, project_id, actor_id)

    inventory = byoc.get_inventory(account_id)
    available = {str(item.get("id")): item for item in inventory.get("resources") or []}
    ids = [str(value).strip() for value in resource_ids or []]
    if not ids or len(ids) != len(set(ids)):
        raise ValueError("resource_ids must be non-empty and unique")
    if any(resource_id not in available for resource_id in ids):
        raise ValueError("resource ids are not in the latest inventory")

    overrides = dict(address_overrides or {})
    now = int(time.time())
    mappings: list[dict[str, Any]] = []
    seen_addresses: set[str] = set()
    for resource_id in sorted(ids):
        item = available[resource_id]
        raw_address = overrides.get(resource_id) or item.get("address") or f"resource.{item.get('type')}.{resource_id}"
        address = validate_resource_address(str(raw_address))
        if address in seen_addresses:
            raise ValueError("duplicate address")
        seen_addresses.add(address)
        mappings.append(
            {
                "resource_id": resource_id,
                "type": str(item.get("type") or "resource"),
                "address": address,
                "source": "override" if resource_id in overrides else "inventory",
                "mapped_at": now,
            }
        )

    _persist_mapping(
        project_id,
        stack,
        {
            "account_id": str(account_id),
            "project_id": project_id,
            "stack": stack,
            "mappings": mappings,
            "updated_at": now,
        },
    )
    import_block = "\n\n".join(
        f'import {{\n  to = {item["address"]}\n  id = "{item["resource_id"]}"\n}}' for item in mappings
    )
    return {
        "account_id": str(account_id),
        "project_id": project_id,
        "stack": stack,
        "provider": str(account.get("provider") or ""),
        "resource_count": len(mappings),
        "mappings": mappings,
        "import_block": import_block,
    }
