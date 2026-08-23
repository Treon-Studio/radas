"""Client network offline fallback state and banner manager (UC582)."""
from __future__ import annotations

import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)


def get_offline_banner_state(
    is_connected: bool,
    pending_queue_size: int = 0,
) -> Dict[str, Any]:
    """Emit network status indicator and pending sync mutation queue state (UC582)."""
    return {
        "status": "online" if is_connected else "offline",
        "show_badge": not is_connected,
        "badge_text": "Offline Mode" if not is_connected else "Connected",
        "pending_queue_size": max(0, int(pending_queue_size)),
        "message": "Changes will sync automatically once reconnected." if not is_connected else "All systems connected.",
    }
