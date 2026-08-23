"""HTTP status code tooltip descriptive text formatter (UC593)."""
from __future__ import annotations

import logging
from typing import Dict

logger = logging.getLogger(__name__)

STATUS_EXPLANATIONS = {
    200: ("200 OK", "Request succeeded and changes applied successfully."),
    201: ("201 Created", "Resource created and initialized successfully."),
    204: ("204 No Content", "Action completed successfully with no response body."),
    400: ("400 Bad Request", "Invalid input parameters or syntax error."),
    401: ("401 Unauthorized", "Authentication token is missing or expired."),
    403: ("403 Forbidden", "Insufficient permissions for this operation."),
    404: ("404 Not Found", "Resource not found or has been deleted."),
    409: ("409 Conflict", "Conflicting operation or state lock collision."),
    422: ("422 Unprocessable Entity", "Validation error in request payload."),
    500: ("500 Internal Server Error", "Unexpected server error encountered."),
    502: ("502 Bad Gateway", "Upstream cloud service or worker unreachable."),
    503: ("503 Service Unavailable", "Server or worker pool is temporarily overloaded."),
}


def format_status_tooltip(status_code: int, status_label: str = "") -> Dict[str, str]:
    """Format title and detailed description for status badges and tooltips (UC593)."""
    code = int(status_code)
    if code in STATUS_EXPLANATIONS:
        title, desc = STATUS_EXPLANATIONS[code]
    else:
        title = f"{code} {status_label}".strip()
        desc = f"HTTP status response code {code}."

    return {
        "status_code": str(code),
        "title": title,
        "description": desc,
    }
