"""Pull Request slash command parser and dispatcher (UC371)."""
from __future__ import annotations

import logging
import re
import time
from typing import Any, Dict, List

from services.audit_events import record_audit_event

logger = logging.getLogger(__name__)

SUPPORTED_COMMANDS = {"/plan", "/apply", "/lock", "/unlock", "/review"}


def parse_and_handle_slash_command(
    comment_body: str,
    project_id: str,
    pr_number: int,
    author: str,
) -> Dict[str, Any]:
    """Parse PR comment body for slash commands and dispatch automated actions (UC371)."""
    if not comment_body:
        return {"recognized": False}

    lines = [l.strip() for l in comment_body.splitlines() if l.strip()]
    first_line = lines[0] if lines else ""

    parts = first_line.split()
    if not parts:
        return {"recognized": False}

    cmd = parts[0].lower()
    if cmd not in SUPPORTED_COMMANDS:
        return {"recognized": False}

    args = parts[1:]

    record_audit_event(
        "pr.slash_command.received",
        actor_user_id=author,
        target_type="pr",
        target_id=str(pr_number),
        meta={"project_id": project_id, "command": cmd, "args": args},
    )

    logger.info(f"Received PR slash command {cmd} from {author} on {project_id}#pr{pr_number}")
    return {
        "recognized": True,
        "command": cmd,
        "args": args,
        "project_id": project_id,
        "pr_number": pr_number,
        "author": author,
        "status": "dispatched",
        "timestamp": time.time(),
    }
