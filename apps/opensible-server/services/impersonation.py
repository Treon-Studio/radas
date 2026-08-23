"""Audited admin user impersonation service (UC636)."""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional

from auth.service import generate_token
from services.audit_events import record_audit_event
from services.user_service import UserService

logger = logging.getLogger(__name__)


def get_user_service(data_dir: Optional[Path] = None) -> UserService:
    """Get initialized UserService instance."""
    dd = Path(data_dir or os.environ.get("DATA_DIR", "data"))
    return UserService(dd)


def impersonate_user(
    admin_user_id: str,
    target_user_id: str,
    data_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """Impersonate another user. Strictly restricted to admins and audited (UC636)."""
    dd = Path(data_dir or os.environ.get("DATA_DIR", "data"))
    svc = UserService(dd)

    admin = svc.get_user_by_id(admin_user_id)
    if not admin or ("admin" not in admin.roles and "owner" not in admin.roles):
        raise PermissionError("Only admins or owners can impersonate users.")

    target = svc.get_user_by_id(target_user_id)
    if not target:
        raise ValueError(f"Target user '{target_user_id}' not found.")

    token = generate_token(
        user_id=target.id,
        username=target.username,
        roles=target.roles,
        data_dir=dd,
        extra_claims={
            "impersonated_by": admin.id,
            "impersonator_username": admin.username,
        },
    )

    record_audit_event(
        "user.impersonate",
        actor_user_id=admin.id,
        target_type="user",
        target_id=target.id,
        meta={
            "admin_username": admin.username,
            "target_username": target.username,
        },
    )

    logger.info(f"Admin '{admin.username}' impersonated user '{target.username}'")
    return {
        "success": True,
        "token": token,
        "impersonated_user": target.id,
        "impersonated_username": target.username,
        "original_admin": admin.id,
    }
