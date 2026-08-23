"""Multi-tenant organization boundary and project isolation guard (UC517)."""
from __future__ import annotations

import logging
from storage import pg

logger = logging.getLogger(__name__)


def validate_org_project_access(user_id: str, org_id: str, project_id: str) -> bool:
    """Validate that the user is an active member of org_id and that project_id belongs to org_id (UC517)."""
    clean_user = user_id.strip()
    clean_org = org_id.strip()
    clean_proj = project_id.strip()

    # 1. Verify user is in org_members
    member_row = pg.query_one(
        "SELECT role FROM org_members WHERE org_id = %s AND user_id = %s",
        (clean_org, clean_user),
    )
    if not member_row:
        logger.warning(f"Access denied: user {clean_user} is not a member of org {clean_org}")
        return False

    # 2. Verify project belongs to org
    proj_row = pg.query_one(
        "SELECT id FROM projects WHERE id = %s AND org_id = %s",
        (clean_proj, clean_org),
    )
    if not proj_row:
        logger.warning(f"Access denied: project {clean_proj} does not belong to org {clean_org}")
        return False

    return True
