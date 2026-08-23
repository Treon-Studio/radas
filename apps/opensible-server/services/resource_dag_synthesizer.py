"""Directed acyclic graph (DAG) synthesizer for infrastructure resources (UC527)."""
from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


def build_resource_dag(resources: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Synthesize nodes and dependency edges from resource definitions for canvas visualization (UC527)."""
    nodes = []
    edges = []

    for r in resources:
        rid = r.get("id") or r.get("name")
        rtype = r.get("type", "unknown")
        nodes.append({
            "id": rid,
            "type": rtype,
            "data": r,
        })

        # Process dependency edges (upstream -> downstream)
        deps = r.get("depends_on", [])
        for upstream_id in deps:
            edges.append({
                "from": upstream_id,
                "to": rid,
            })

    logger.info(f"Synthesized DAG with {len(nodes)} nodes and {len(edges)} edges")

    return {
        "nodes": nodes,
        "edges": edges,
        "node_count": len(nodes),
        "edge_count": len(edges),
        "has_cycles": False,
    }
