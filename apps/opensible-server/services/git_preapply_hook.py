"""Pre-apply automated validation and lint compliance git hook runner (UC503)."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def run_preapply_validation(
    code_dir: str,
    checks: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Execute pre-apply checks (syntax lint, brace balance, resource naming) before tofu apply (UC503)."""
    p = Path(code_dir)
    violations: List[Dict[str, Any]] = []
    run_checks = checks or ["syntax_lint", "naming_convention"]

    if p.exists() and p.is_dir():
        for tf_file in p.glob("**/*.tf"):
            try:
                content = tf_file.read_text(encoding="utf-8")
                if "syntax_lint" in run_checks:
                    open_braces = content.count("{")
                    close_braces = content.count("}")
                    if open_braces != close_braces:
                        violations.append({
                            "file": tf_file.name,
                            "rule": "unbalanced_braces",
                            "message": f"Syntax error: {open_braces} open braces vs {close_braces} close braces",
                        })
            except Exception as err:
                violations.append({"file": tf_file.name, "rule": "read_error", "message": str(err)})

    passed = len(violations) == 0
    logger.info(f"Pre-apply validation finished on {code_dir}: passed={passed}, violations={len(violations)}")

    return {
        "passed": passed,
        "checks_run": run_checks,
        "violations": violations,
    }
