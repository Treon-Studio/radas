"""Tests for Cross-cutting Reliability, Security & Observability Fase 6 Batch 8.

UC456: Strict CORS Origin Whitelisting.
"""
from __future__ import annotations

import json
from pathlib import Path
import pytest

from auth import middleware


def test_cors_origin_whitelisting(monkeypatch):
    """UC456: Valid and invalid origin verification."""
    # 1. Default whitelisted origins
    assert middleware.is_allowed_cors_origin("http://localhost:5173") is True
    assert middleware.is_allowed_cors_origin("http://localhost:8080") is True

    # 2. Rogue / evil origin
    assert middleware.is_allowed_cors_origin("https://evil-hacker.com") is False
    assert middleware.is_allowed_cors_origin("http://localhost:9999") is False

    # 3. Custom whitelist via env
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://console.radas.io,https://app.radas.io")
    assert middleware.is_allowed_cors_origin("https://console.radas.io") is True
    assert middleware.is_allowed_cors_origin("https://app.radas.io") is True
    assert middleware.is_allowed_cors_origin("https://malicious.com") is False
