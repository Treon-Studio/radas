"""Local development and demo mode seed data generator (UC645, UC646)."""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from storage import pg

logger = logging.getLogger(__name__)


def seed_development_data(data_dir: Optional[Path] = None) -> Dict[str, Any]:
    """Seed sample projects, stacks, and demo configuration (UC645, UC646)."""
    base = Path(data_dir or os.environ.get("DATA_DIR", "data"))
    demo_proj = "demo-infra"

    proj_dir = base / "projects" / demo_proj
    stacks_dir = proj_dir / "stacks" / "envs" / "demo-k8s-cluster"
    stacks_dir.mkdir(parents=True, exist_ok=True)

    (stacks_dir / "main.tf").write_text('// OpenTofu Demo Stack\nresource "null_resource" "demo" {}\n', encoding="utf-8")
    (stacks_dir / "terraform.tfvars").write_text('cluster_name = "demo-cluster-01"\nnode_count = 3\n', encoding="utf-8")

    pg.execute(
        """
        INSERT INTO stack_meta (project_id, stack, data)
        VALUES (%s, %s, %s)
        ON CONFLICT (project_id, stack) DO UPDATE
        SET data = EXCLUDED.data
        """,
        (demo_proj, "demo-k8s-cluster", json.dumps({
            "provider": "hetzner",
            "env": "staging",
            "description": "Sample Kubernetes cluster for demo and development",
            "tags": ["demo", "k8s", "sandbox"],
        })),
    )

    logger.info(f"Successfully seeded development data for '{demo_proj}'")
    return {
        "success": True,
        "seeded_projects": [demo_proj],
        "seeded_stacks": ["demo-k8s-cluster"],
    }
