"""Ephemeral review app lifecycle and approval comments manager (UC345)."""
from __future__ import annotations

import logging
import time
import uuid
from typing import Any, Dict, List, Optional

from storage.kv import kv_get, kv_set

logger = logging.getLogger(__name__)

REVIEW_APPS_SCOPE = "review_apps"


def create_review_app(project_id: str, pr_number: int, branch: str) -> Dict[str, Any]:
    """Create an ephemeral review app record for a PR (UC345)."""
    app_id = f"rev-{project_id}-pr{pr_number}"
    entry = {
        "id": app_id,
        "project_id": project_id,
        "pr_number": pr_number,
        "branch": branch,
        "status": "pending_review",
        "comments": [],
        "created_at": time.time(),
        "updated_at": time.time(),
    }
    kv_set(REVIEW_APPS_SCOPE, app_id, entry)
    logger.info(f"Created review app {app_id} for PR #{pr_number}")
    return entry


def get_review_app(app_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve review app details."""
    val = kv_get(REVIEW_APPS_SCOPE, app_id)
    return dict(val) if isinstance(val, dict) else None


def add_review_app_comment(
    app_id: str,
    author: str,
    comment: str,
    decision: Optional[str] = None,
) -> Dict[str, Any]:
    """Add a review discussion comment or approval/rejection decision (UC345)."""
    app = get_review_app(app_id)
    if not app:
        raise ValueError(f"Review app '{app_id}' not found")

    comment_entry = {
        "id": str(uuid.uuid4())[:8],
        "author": author,
        "comment": comment,
        "decision": decision,
        "created_at": time.time(),
    }
    app.setdefault("comments", []).append(comment_entry)
    app["updated_at"] = time.time()

    if decision == "approved":
        app["status"] = "approved"
        app["approved_by"] = author
        app["approved_at"] = time.time()
    elif decision == "rejected":
        app["status"] = "rejected"
        app["rejected_by"] = author
        app["rejected_at"] = time.time()

    kv_set(REVIEW_APPS_SCOPE, app_id, app)
    logger.info(f"Added comment to review app {app_id} by {author} (decision={decision})")
    return app
