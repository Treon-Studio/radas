"""OpenAPI 3.1.0 specification generator and API schema versioning (UC640, UC642)."""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional
from flask import Flask


def get_api_schema_version() -> Dict[str, Any]:
    """Get the current API schema version and capabilities (UC640)."""
    return {
        "version": "2026-08-23",
        "supported_versions": ["2026-08-23", "v2", "v1"],
        "status": "stable",
        "features": [
            "cursor_pagination",
            "rate_limiting",
            "unified_search",
            "code_registry",
            "impersonation",
        ],
    }


def _format_operation_id(method: str, path: str) -> str:
    """Derive consistent operationId from HTTP method and route path (UC642)."""
    clean_path = re.sub(r"[<>]", "", path)
    parts = [p for p in re.split(r"[/_-]+", clean_path) if p]
    return f"{method.lower()}_{'_'.join(parts)}"


def _flask_path_to_openapi_path(path: str) -> str:
    """Convert Flask URL path parameters e.g. <name> to OpenAPI {name}."""
    return re.sub(r"<(?:\w+:)?(\w+)>", r"{\1}", path)


def generate_openapi_spec(app: Optional[Flask] = None) -> Dict[str, Any]:
    """Generate OpenAPI 3.1.0 specification dictionary from registered Flask routes (UC642)."""
    spec: Dict[str, Any] = {
        "openapi": "3.1.0",
        "info": {
            "title": "RADAS Cloud Provisioning & Automation API",
            "version": "2026-08-23",
            "description": "Enterprise cloud provisioning, state management, Ansible playbooks, and BYOC code registry.",
        },
        "servers": [
            {"url": "/api", "description": "RADAS API Base"},
        ],
        "paths": {},
    }

    if not app:
        return spec

    for rule in app.url_map.iter_rules():
        if rule.rule.startswith("/static"):
            continue

        openapi_path = _flask_path_to_openapi_path(rule.rule)
        spec["paths"].setdefault(openapi_path, {})

        path_params = []
        for param in re.findall(r"<(?:\w+:)?(\w+)>", rule.rule):
            path_params.append({
                "name": param,
                "in": "path",
                "required": True,
                "schema": {"type": "string"},
            })

        for method in rule.methods or []:
            if method in ("HEAD", "OPTIONS"):
                continue

            op_id = _format_operation_id(method, rule.rule)
            spec["paths"][openapi_path][method.lower()] = {
                "operationId": op_id,
                "summary": rule.endpoint.replace(".", " ").replace("_", " ").title(),
                "parameters": list(path_params),
                "responses": {
                    "200": {"description": "Successful operation"},
                    "400": {"description": "Bad request / validation failure"},
                    "401": {"description": "Unauthorized"},
                    "403": {"description": "Forbidden"},
                    "404": {"description": "Resource not found"},
                    "429": {"description": "Rate limit exceeded"},
                    "500": {"description": "Internal server error"},
                },
            }

    return spec
