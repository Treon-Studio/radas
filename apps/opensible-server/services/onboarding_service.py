"""Onboarding status service for first-time users (UC397)."""
from __future__ import annotations

import time
from typing import Any, Optional

from storage import pg


def get_status(user_id: str) -> dict[str, Any]:
    """Get onboarding status for a user."""
    row = pg.query_one(
        "SELECT completed_at, created_at, updated_at FROM onboarding_status WHERE user_id = %s",
        (user_id,)
    )
    if not row:
        return {"completed": False, "completed_at": None}
    return {
        "completed": row["completed_at"] is not None,
        "completed_at": row["completed_at"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def mark_completed(user_id: str) -> dict[str, Any]:
    """Mark onboarding as completed for a user."""
    now = time.time()
    pg.execute(
        "INSERT INTO onboarding_status (user_id, completed_at, created_at, updated_at) "
        "VALUES (%s, %s, %s, %s) "
        "ON CONFLICT (user_id) DO UPDATE SET completed_at = EXCLUDED.completed_at, updated_at = EXCLUDED.updated_at",
        (user_id, now, now, now)
    )
    return get_status(user_id)


def reset_onboarding(user_id: str) -> dict[str, Any]:
    """Reset onboarding status (for testing)."""
    pg.execute("DELETE FROM onboarding_status WHERE user_id = %s", (user_id,))
    return get_status(user_id)