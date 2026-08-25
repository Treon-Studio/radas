"""User satisfaction rating and feedback capture service (UC603)."""
from __future__ import annotations

import logging
import time
import uuid
from typing import Any, Dict, Optional

from storage.kv import kv_set

logger = logging.getLogger(__name__)

FEEDBACK_SCOPE = "user_feedback"


def submit_user_feedback(
    user_id: str,
    rating: int,
    comment: Optional[str] = None,
    page_url: Optional[str] = None,
) -> Dict[str, Any]:
    """Capture user CSAT rating (1-5 stars) and qualitative feedback (UC603)."""
    feedback_id = f"fb-{uuid.uuid4().hex[:10]}"
    clean_rating = max(1, min(5, int(rating)))
    now = time.time()

    entry = {
        "feedback_id": feedback_id,
        "user_id": user_id.strip(),
        "rating": clean_rating,
        "comment": comment.strip() if comment else None,
        "page_url": page_url.strip() if page_url else None,
        "submitted_at": now,
    }
    kv_set(FEEDBACK_SCOPE, feedback_id, entry)
    logger.info(f"Recorded user feedback {feedback_id} from {user_id}: {clean_rating} stars")

    return {"success": True, **entry}
