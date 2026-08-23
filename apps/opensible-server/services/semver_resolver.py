"""Semantic version constraint resolver for modules and templates (UC512)."""
from __future__ import annotations

import re
from typing import List, Optional, Tuple


def _parse_version(v: str) -> Tuple[int, int, int]:
    clean = re.sub(r"^[^\d]*", "", v.strip())
    parts = [int(p) for p in clean.split(".") if p.isdigit()]
    while len(parts) < 3:
        parts.append(0)
    return (parts[0], parts[1], parts[2])


def _matches_constraint(ver: Tuple[int, int, int], constraint: str) -> bool:
    c = constraint.strip()
    if not c:
        return True

    # Caret constraint ^X.Y.Z
    if c.startswith("^"):
        target = _parse_version(c[1:])
        if target[0] > 0:
            return ver >= target and ver < (target[0] + 1, 0, 0)
        elif target[1] > 0:
            return ver >= target and ver < (0, target[1] + 1, 0)
        else:
            return ver == target

    # Tilde constraint ~> X.Y.Z or ~X.Y.Z
    if c.startswith("~>") or c.startswith("~"):
        raw = c[2:] if c.startswith("~>") else c[1:]
        target = _parse_version(raw)
        return ver >= target and ver < (target[0], target[1] + 1, 0)

    # Comparison constraints
    if c.startswith(">="):
        return ver >= _parse_version(c[2:])
    if c.startswith(">"):
        return ver > _parse_version(c[1:])
    if c.startswith("<="):
        return ver <= _parse_version(c[2:])
    if c.startswith("<"):
        return ver < _parse_version(c[1:])
    if c.startswith("==") or c.startswith("="):
        raw = c[2:] if c.startswith("==") else c[1:]
        return ver == _parse_version(raw)

    # Plain exact version
    return ver == _parse_version(c)


def resolve_semver_constraint(available_versions: List[str], constraint: str) -> Optional[str]:
    """Find the highest semver matching the constraint (UC512)."""
    if not available_versions:
        return None

    sub_constraints = [s.strip() for s in constraint.split(",") if s.strip()]

    candidates = []
    for v_str in available_versions:
        try:
            parsed = _parse_version(v_str)
            if all(_matches_constraint(parsed, sc) for sc in sub_constraints):
                candidates.append((parsed, v_str))
        except Exception:
            continue

    if not candidates:
        return None

    candidates.sort(key=lambda x: x[0], reverse=True)
    return candidates[0][1]
