"""Automated E2E Playwright test selector registry and data-testid standardizer (UC574, UC575)."""
from __future__ import annotations

import logging
from typing import List, Optional

logger = logging.getLogger(__name__)

_REGISTERED_SELECTORS: set[str] = set()


def get_stable_testid(
    component: str,
    action: str,
    entity_id: Optional[str] = None,
) -> str:
    """Generate and register a stable, kebab-case data-testid for Playwright E2E automation (UC574, UC575)."""
    cmp_clean = component.strip().lower().replace("_", "-").replace(" ", "-")
    act_clean = action.strip().lower().replace("_", "-").replace(" ", "-")

    if entity_id:
        ent_clean = str(entity_id).strip().replace(" ", "-")
        testid = f"{cmp_clean}-{act_clean}-{ent_clean}"
    else:
        testid = f"{cmp_clean}-{act_clean}"

    _REGISTERED_SELECTORS.add(testid)
    return testid


def list_registered_testids() -> List[str]:
    """List all registered test selector IDs (UC574, UC575)."""
    return sorted(list(_REGISTERED_SELECTORS))
