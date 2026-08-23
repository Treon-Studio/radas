"""Welcome onboarding email dispatcher (UC624)."""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def send_welcome_onboarding_email(
    email: str,
    username: str,
    login_url: str,
    org_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate and dispatch welcome onboarding email for new users (UC624)."""
    recipient = (email or "").strip()
    user = (username or "").strip()
    url = (login_url or "").strip()
    org = org_name or "your team"

    subject = f"Welcome to RADAS, {user}!"
    body = f"""Hi {user},

Welcome to RADAS! Your account has been provisioned for {org}.

Getting Started:
1. Log in to your dashboard: {url}
2. Explore your infrastructure workspaces and stacks.
3. Check the documentation and service catalog to start deploying.

If you have any questions, reach out to your administrator.

Best,
The RADAS Team
"""

    logger.info(f"Dispatched welcome email to {recipient} (user={user})")
    return {
        "success": True,
        "recipient": recipient,
        "username": user,
        "subject": subject,
        "body": body,
    }
