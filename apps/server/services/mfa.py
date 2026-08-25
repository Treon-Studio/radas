"""TOTP MFA (Fase 5 — UC 40). RFC 6238 with stdlib only."""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import sqlite3
import struct
import time
from pathlib import Path
from typing import Optional


def _auth_db() -> Path:
    try:
        import app as _app
        return Path(getattr(_app, "DATA_DIR", "data")) / "auth" / "auth.db"
    except Exception:
        return Path("data") / "auth" / "auth.db"


def _b32decode(s: str) -> bytes:
    return base64.b32decode(s.upper().replace(" ", ""))


def _b32encode(raw: bytes) -> str:
    return base64.b32encode(raw).decode().rstrip("=")


def generate_secret() -> str:
    return _b32encode(os.urandom(20))


def totp(secret: str, at: Optional[int] = None) -> str:
    key = _b32decode(secret)
    t = int((at if at is not None else time.time()) // 30)
    msg = struct.pack(">Q", t)
    digest = hmac.new(key, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(code % 1_000_000).zfill(6)


def verify(secret: str, code: str, window: int = 1) -> bool:
    code = (code or "").strip()
    if not code:
        return False
    now = int(time.time())
    for w in range(-window, window + 1):
        if hmac.compare_digest(totp(secret, now + w * 30), code):
            return True
    return False


def get_secret(user_id: str) -> str:
    try:
        from storage import pg
        row = pg.query_one("SELECT mfa_secret FROM users WHERE id = %s", (user_id,))
        return (row["mfa_secret"] or "") if row else ""
    except Exception:
        return ""


def set_secret(user_id: str, secret: Optional[str]) -> bool:
    try:
        from storage import pg
        pg.execute("UPDATE users SET mfa_secret = %s WHERE id = %s", (secret, user_id))
        return True
    except Exception:
        return False


def otpauth_url(user_id: str, username: str, secret: str, issuer: str = "Radas") -> str:
    label = f"{issuer}:{username}"
    return f"otpauth://totp/{label}?secret={secret}&issuer={issuer}"
