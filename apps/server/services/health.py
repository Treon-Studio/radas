"""Health/readiness + error envelope + logging redaction (Fase 5 cross-cutting — UC 107/109/111)."""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Dict


def _data_dir() -> Path:
    try:
        import app as _app
        return Path(getattr(_app, "DATA_DIR", "data"))
    except Exception:
        return Path("data")


def readiness() -> Dict:
    ok = True
    checks = {}
    try:
        from storage import pg
        pg.ping()
        checks["postgres"] = True
    except Exception:
        checks["postgres"] = False
    try:
        d = _data_dir()
        d.mkdir(parents=True, exist_ok=True)
        probe = d / ".ready_probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
        checks["data_dir"] = True
    except Exception:
        checks["data_dir"] = False

    # Blueprint registration policy (Task 0.2): a required module failure is
    # never reported healthy. database_ok/contract_version mirror the fields
    # console/CLI contract consumers rely on for gate decisions.
    try:
        from api.route_inventory import (
            contract_version as _contract_version,
            required_blueprints_ok as _required_blueprints_ok,
        )
        required_blueprints_ok_value = bool(_required_blueprints_ok())
        version_value = str(_contract_version())
    except Exception:
        # The route-inventory module is part of the server itself; if it cannot
        # even be imported, the process is not in a state we may call ready.
        required_blueprints_ok_value = False
        version_value = "legacy"

    if checks.get("postgres") is not True or checks.get("data_dir") is not True:
        ok = False
    if not required_blueprints_ok_value:
        ok = False
    return {
        "ok": ok,
        "checks": checks,
        "database_ok": checks.get("postgres") is True,
        "required_blueprints_ok": required_blueprints_ok_value,
        "contract_version": version_value,
    }


_REDACT_KEYS = ("token", "password", "secret", "api_key", "authorization", "passwd")
_REDACT_RE = re.compile(
    r"""(?i)(\b[\w.-]*?(?:%s)\b["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,}]+)""" % "|".join(_REDACT_KEYS),
)


def redact(text: str) -> str:
    if not text:
        return text
    return _REDACT_RE.sub(lambda m: m.group(1) + "[REDACTED]", text)


class RedactFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            for attr in ("msg", "message"):
                v = getattr(record, attr, None)
                if isinstance(v, str):
                    setattr(record, attr, redact(v))
            if record.args:
                record.args = tuple(redact(a) if isinstance(a, str) else a for a in record.args)
        except Exception:
            pass
        return True


def install_redaction() -> None:
    try:
        logging.getLogger().addFilter(RedactFilter())
    except Exception:
        pass


def json_error_payload(message: str, code: str = "internal_error", status: int = 500) -> Dict:
    return {"error": code, "message": message, "code": code}
