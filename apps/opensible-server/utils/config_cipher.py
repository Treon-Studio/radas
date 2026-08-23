"""At-rest symmetric configuration value encryption and decryption envelope (UC489)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
from typing import Optional

_DEFAULT_SECRET_KEY = os.getenv("CONFIG_ENCRYPTION_KEY", "radas-default-in-memory-key-fase6")
CIPHER_PREFIX = "enc:v1:"


def _derive_key(secret: str) -> bytes:
    return hashlib.sha256(secret.encode("utf-8")).digest()


def encrypt_config_value(plain_text: str, secret_key: Optional[str] = None) -> str:
    """Encrypt plain string configuration value at rest (UC489)."""
    if not plain_text:
        return ""
    key = _derive_key(secret_key or _DEFAULT_SECRET_KEY)
    raw_bytes = plain_text.encode("utf-8")

    keystream = bytearray()
    while len(keystream) < len(raw_bytes):
        keystream.extend(hashlib.sha256(key + bytes([len(keystream) % 256])).digest())

    encrypted = bytes(b ^ k for b, k in zip(raw_bytes, keystream[: len(raw_bytes)]))
    tag = hmac.new(key, encrypted, hashlib.sha256).digest()[:8]

    payload = base64.urlsafe_b64encode(tag + encrypted).decode("ascii")
    return f"{CIPHER_PREFIX}{payload}"


def decrypt_config_value(cipher_text: str, secret_key: Optional[str] = None) -> str:
    """Decrypt at-rest encrypted string value (UC489)."""
    if not cipher_text or not cipher_text.startswith(CIPHER_PREFIX):
        return cipher_text

    raw_payload = cipher_text[len(CIPHER_PREFIX) :]
    decoded = base64.urlsafe_b64decode(raw_payload.encode("ascii"))
    tag = decoded[:8]
    encrypted = decoded[8:]

    key = _derive_key(secret_key or _DEFAULT_SECRET_KEY)
    expected_tag = hmac.new(key, encrypted, hashlib.sha256).digest()[:8]
    if not hmac.compare_digest(tag, expected_tag):
        raise ValueError("Cipher integrity verification failed (invalid key or tampered ciphertext)")

    keystream = bytearray()
    while len(keystream) < len(encrypted):
        keystream.extend(hashlib.sha256(key + bytes([len(keystream) % 256])).digest())

    plain_bytes = bytes(b ^ k for b, k in zip(encrypted, keystream[: len(encrypted)]))
    return plain_bytes.decode("utf-8")
