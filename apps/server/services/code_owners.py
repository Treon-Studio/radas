"""CODEOWNERS file parser and file path reviewer mapper (UC510)."""
from __future__ import annotations

import fnmatch
import logging
from typing import List

logger = logging.getLogger(__name__)


def find_code_owners(codeowners_content: str, file_path: str) -> List[str]:
    """Parse CODEOWNERS syntax and return matching owner handles for a file path (UC510)."""
    clean_path = file_path.strip().lstrip("/")
    matched_owners: List[str] = []

    for line in codeowners_content.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue

        parts = line.split()
        if len(parts) < 2:
            continue

        pattern = parts[0].lstrip("/")
        owners = parts[1:]

        # Handle global wildcard
        if pattern == "*":
            matched_owners = owners
            continue

        # Check standard wildcard / glob match
        if fnmatch.fnmatch(clean_path, pattern) or fnmatch.fnmatch(clean_path, pattern.rstrip("/") + "/*") or fnmatch.fnmatch(clean_path, pattern.replace("/**", "/*")):
            matched_owners = owners

    logger.info(f"Resolved {len(matched_owners)} code owners for {file_path}")
    return matched_owners
