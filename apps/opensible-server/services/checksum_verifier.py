"""Cryptographic artifact checksum verification engine (UC515)."""
from __future__ import annotations

import hashlib
import hmac
import logging

logger = logging.getLogger(__name__)


def verify_artifact_checksum(
    data_bytes: bytes,
    expected_checksum: str,
    algorithm: str = "sha256",
) -> bool:
    """Verify cryptographic checksum of downloaded artifact or module (UC515)."""
    if not isinstance(data_bytes, bytes) or not expected_checksum:
        return False

    algo = algorithm.lower().strip()
    try:
        hasher = hashlib.new(algo)
    except ValueError:
        logger.error(f"Unsupported checksum algorithm: {algorithm}")
        return False

    hasher.update(data_bytes)
    computed = hasher.hexdigest().lower()
    expected = expected_checksum.strip().lower()

    return hmac.compare_digest(computed, expected)
