"""Notification courier for delivering user-facing messages.

The courier is the single delivery channel for account/system messages
(currently password-reset links). It tries, in order:

1. Kurir NOS email (``POST /v1/emails``) when configured — the primary
   channel for user-facing reset links.
2. The user's configured Slack webhook (``notif_prefs``).
3. Any outbound webhook subscribed to ``auth.password_reset``.
4. Inline (the caller returns the link in the API response).

Delivery is best-effort: a failure to deliver never fails the underlying
request, and no user identifier other than what the caller supplies is ever
leaked to the transport.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

KURIR_API_URL = os.environ.get("KURIR_API_URL", "").strip().rstrip("/")
KURIR_API_KEY = os.environ.get("KURIR_API_KEY", "").strip()
KURIR_PRODUCT_ID = os.environ.get("KURIR_PRODUCT_ID", "").strip()


def kurir_configured() -> bool:
    return bool(KURIR_API_URL and KURIR_API_KEY and KURIR_PRODUCT_ID)


def _slack_webhook_for(user_id: str) -> Optional[str]:
    try:
        from services.notif_prefs import get_prefs
        prefs = get_prefs(user_id)
        hook = str(prefs.get("slack_webhook") or "").strip()
        return hook or None
    except Exception as e:  # pragma: no cover - defensive
        logger.warning(f"[courier] notif_prefs unavailable: {e}")
        return None


def _deliver_slack(hook: str, text: str) -> bool:
    import requests
    try:
        r = requests.post(hook, json={"text": text}, timeout=8)
        return 200 <= r.status_code < 300
    except Exception as e:
        logger.warning(f"[courier] slack delivery failed: {e}")
        return False


def _dispatch_webhook(reset_url: str, username: str) -> int:
    try:
        from services.webhook_dispatcher import dispatch_event
        return dispatch_event("auth.password_reset", {
            "username": username,
            "reset_url": reset_url,
        })
    except Exception as e:  # pragma: no cover - defensive
        logger.warning(f"[courier] webhook dispatch failed: {e}")
        return 0


def _deliver_kurir_email(email: str, username: str, reset_url: str) -> bool:
    """Send the reset link via Kurir NOS ``POST /v1/emails`` (Resend)."""
    if not kurir_configured() or not email:
        return False
    import uuid
    import requests

    html = (
        "<h3>Reset password Anda</h3>"
        f"<p>Halo <b>{username}</b>,</p>"
        "<p>Kami menerima permintaan reset password untuk akun Anda.</p>"
        f'<p><a href="{reset_url}">Klik di sini untuk set password baru</a></p>'
        "<p>Link ini berlaku <b>15 menit</b> dan hanya bisa dipakai sekali.</p>"
        "<p>Jika Anda tidak meminta reset ini, abaikan email ini.</p>"
        "<p>— Radas</p>"
    )
    payload = {
        "productId": KURIR_PRODUCT_ID,
        "to": email,
        "subject": "Radas — Reset password",
        "html": html,
    }
    try:
        r = requests.post(
            f"{KURIR_API_URL}/v1/emails",
            json=payload,
            headers={
                "Authorization": f"Bearer {KURIR_API_KEY}",
                "Idempotency-Key": f"radas-reset-{uuid.uuid4()}",
            },
            timeout=10,
        )
        if 200 <= r.status_code < 300:
            logger.info(f"[courier] reset email queued to kurir for {email}")
            return True
        logger.warning(f"[courier] kurir email failed: http {r.status_code}: {r.text[:200]}")
    except Exception as e:
        logger.warning(f"[courier] kurir email crashed: {e}")
    return False


def deliver_reset_link(user_id: str, username: str, email: Optional[str],
                       reset_url: str) -> Dict[str, Any]:
    """Deliver a password-reset link to ``user_id`` via the courier.

    Returns a summary of what was attempted so callers can fall back to
    returning the link inline when no channel is configured.
    """
    result: Dict[str, Any] = {
        "delivered": False,
        "channel": None,
        "webhooks_dispatched": 0,
    }

    # 1) Kurir NOS email (primary channel).
    if kurir_configured() and email:
        ok = _deliver_kurir_email(email, username, reset_url)
        result["delivered"] = ok
        result["channel"] = "email" if ok else None
        if ok:
            return result

    # 2) Per-user Slack webhook.
    hook = _slack_webhook_for(user_id)
    if hook:
        text = (
            f"Radas: password reset requested for *{username}*.\n"
            f"Open the link to set a new password (valid for 15 minutes):\n{reset_url}"
        )
        ok = _deliver_slack(hook, text)
        result["delivered"] = ok
        result["channel"] = "slack" if ok else None
        if ok:
            return result

    # 3) Outbound webhooks subscribed to auth.password_reset.
    dispatched = _dispatch_webhook(reset_url, username)
    result["webhooks_dispatched"] = dispatched
    result["delivered"] = dispatched > 0
    result["channel"] = result["channel"] or ("webhook" if dispatched else None)
    return result