#!/usr/bin/env python3
"""Route parity checker: the CLI route manifest vs. the served Flask routes.

Task 2.4 of the 2026-08-27 console-CLI integration plan. The checker mounts
the same blueprint surface production mounts (via
``scripts/export_openapi.build_contract_app``), extracts the ``(method, path)``
set from ``app.url_map`` for ``/api/*`` routes — blueprint prefixes (e.g. the
cloud_provisioning ``/api/cloud`` prefix) are already resolved into the full
served paths — and compares it against the reviewed CLI route manifest at
``contracts/cli-route-manifest.json``.

Failures (exit 1):

* a ``remote`` manifest entry whose path matches no registered route
  ("missing server route");
* a ``remote`` entry whose path exists but with a different method set
  ("method mismatch");
* an entry still marked ``remote-broken`` — known mismatches must be fixed or
  explicitly reclassified, never waived silently;
* a ``local`` command with no decision note ("unclassified local-only command")
  or a ``local`` command that declares a request path;
* a manifest path containing a literal ``/_current/`` segment — that segment is
  rewritten client-side by the console (``apps/console/src/lib/api.ts``) and
  never reaches the server, so it is documented, not compared literally.

Server routes with no client coverage are reported informationally.

Usage:

    cd apps/server
    .venv/bin/python scripts/check_route_parity.py \
        --client-manifest contracts/cli-route-manifest.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

SERVER_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVER_ROOT.parents[1]
DEFAULT_MANIFEST = REPO_ROOT / "contracts" / "cli-route-manifest.json"

# Only /api/* routes are client surface.
API_PREFIX = "/api"

VALID_KINDS = {"remote", "local", "remote-broken"}

CONSOLE_API_SOURCE = "apps/console/src/lib/api.ts"
CONSOLE_CURRENT_NOTE = (
    "Console /_current/ rewriting: apps/console/src/lib/api.ts rewrites the literal "
    "path segment '/_current/' to the concrete project id before the request leaves "
    "the browser, so the server never registers or sees a /_current/ route. The CLI "
    "resolves a concrete project id and sends X-Project-Id; it never uses /_current/ "
    "paths. Manifest paths containing a literal /_current/ segment fail with a "
    "dedicated diagnostic instead of being compared against app.url_map."
)


def _ensure_server_on_path() -> None:
    for path in (str(SERVER_ROOT / "scripts"), str(SERVER_ROOT)):
        if path not in sys.path:
            sys.path.insert(0, path)


def build_app():
    """Mount the full production blueprint surface (same boot as app.py)."""
    _ensure_server_on_path()
    os_chdir_target = SERVER_ROOT
    import os

    os.chdir(os_chdir_target)
    from scripts.export_openapi import build_contract_app

    return build_contract_app()


# ---------------------------------------------------------------------------
# Server route set
# ---------------------------------------------------------------------------


def extract_server_routes(app) -> dict[str, set[str]]:
    """Return {served_path: {METHOD, ...}} for every /api/* route in url_map.

    Blueprint prefixes are already part of ``rule.rule`` (e.g. the
    cloud_provisioning blueprint contributes ``/api/cloud/...`` paths), and
    Flask variable segments keep their ``<converter:name>`` syntax.
    """
    routes: dict[str, set[str]] = {}
    for rule in app.url_map.iter_rules():
        path = rule.rule
        if not path.startswith(API_PREFIX):
            continue
        methods = {m for m in rule.methods or set() if m not in ("HEAD", "OPTIONS")}
        if not methods:
            continue
        routes.setdefault(path, set()).update(methods)
    return routes


_SEGMENT_PARAM_RE = re.compile(r"^<[^>]+>$")


def _segments(path: str) -> list[str]:
    return [seg for seg in path.strip("/").split("/") if seg != ""]


def _segment_matches(manifest_seg: str, server_seg: str) -> bool:
    """One manifest segment matches one server segment.

    ``%s`` (Go fmt verb) or ``<...>`` in the manifest matches any single Flask
    variable segment (``<name>``, ``<int:workflow_id>``, ...); a literal
    manifest segment must equal the server segment (variable converters still
    match a literal, because the checker compares shapes, not concrete ids).
    """
    if manifest_seg == server_seg:
        return True
    manifest_wild = manifest_seg == "%s" or _SEGMENT_PARAM_RE.match(manifest_seg)
    server_is_param = _SEGMENT_PARAM_RE.match(server_seg) is not None
    if manifest_wild and server_is_param:
        return True
    # A literal CLI segment sent where the server declares a variable segment
    # is a runtime-valid match only if the converter is untyped or accepts it;
    # treat untyped ``<name>`` as matching literals for shape comparison.
    if server_is_param and not manifest_wild:
        return server_seg == "<name>" or server_seg.startswith("<string:") or server_seg.startswith("<path")
    return False


def match_route(routes: dict[str, set[str]], method: str, path: str) -> tuple[bool, str]:
    """Match a manifest (method, path) against the registered route set."""
    base = path.split("?", 1)[0]
    method = method.upper()
    candidates: list[tuple[str, set[str]]] = []
    for server_path, server_methods in routes.items():
        m_seg = _segments(base)
        s_seg = _segments(server_path)
        if len(m_seg) != len(s_seg):
            continue
        if all(_segment_matches(ms, ss) for ms, ss in zip(m_seg, s_seg)):
            candidates.append((server_path, server_methods))
    if not candidates:
        return False, f"missing server route: no registered /api route matches {method} {base}"
    if any(method in methods for _, methods in candidates):
        return True, "matched"
    allowed = sorted({m for _, methods in candidates for m in methods})
    return False, (
        f"method mismatch: {base} is registered but never with {method} "
        f"(allowed: {', '.join(allowed)})"
    )


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------


def load_manifest(path: str | Path) -> dict[str, Any]:
    with open(path, encoding="utf-8") as fh:
        manifest = json.load(fh)
    if not isinstance(manifest, dict) or not isinstance(manifest.get("commands"), list):
        raise ValueError(f"{path}: expected an object with a 'commands' array")
    return manifest


def canonical_json(manifest: dict) -> str:
    return json.dumps(manifest, indent=2, sort_keys=False, ensure_ascii=False) + "\n"


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------


@dataclass
class ParityResult:
    failures: list[str] = field(default_factory=list)
    info: list[str] = field(default_factory=list)
    counts: dict[str, int] = field(default_factory=dict)
    console_note: str = CONSOLE_CURRENT_NOTE

    def render(self) -> str:
        lines: list[str] = []
        lines.append("route parity check (CLI manifest vs. app.url_map)")
        lines.append(self.console_note)
        lines.append(
            "blueprint prefixes are accounted for: app.url_map rules are compared "
            "as full served paths (e.g. the cloud_provisioning blueprint prefix "
            "/api/cloud is part of every cloud route)."
        )
        lines.append(
            "counts: "
            + ", ".join(f"{k}={v}" for k, v in sorted(self.counts.items()))
            if self.counts
            else "counts: none"
        )
        if self.failures:
            lines.append(f"FAILURES ({len(self.failures)}):")
            lines.extend(f"  - {f}" for f in self.failures)
        else:
            lines.append("OK: every remote command matches a registered server route; every local command is classified.")
        if self.info:
            lines.append(f"informational ({len(self.info)}):")
            lines.extend(f"  - {i}" for i in self.info)
        return "\n".join(lines)


def evaluate(app, manifest: dict) -> ParityResult:
    result = ParityResult()
    routes = extract_server_routes(app)
    covered: set[tuple[str, str]] = set()

    commands = manifest.get("commands", [])
    kind_counts: dict[str, int] = {}
    for entry in commands:
        command = str(entry.get("command") or "<unnamed>")
        kind = entry.get("kind")
        method = str(entry.get("method") or "")
        path = str(entry.get("path") or "")
        note = str(entry.get("note") or "")
        kind_counts[kind] = kind_counts.get(kind, 0) + 1

        if kind not in VALID_KINDS:
            result.failures.append(
                f"{command}: unknown kind {kind!r} (expected one of {sorted(VALID_KINDS)})"
            )
            continue

        if kind == "remote-broken":
            result.failures.append(
                f"{command}: still marked remote-broken — known mismatches must be "
                f"fixed to a real route or reclassified with an explicit decision "
                f"note, not waived silently ({note or 'no note recorded'})"
            )
            continue

        if kind == "local":
            if path or method:
                result.failures.append(
                    f"{command}: classified local but declares a request path "
                    f"({method or '-'} {path or '-'}) — classify it remote or drop the path"
                )
            if not note:
                result.failures.append(
                    f"{command}: unclassified local-only command — record an explicit "
                    f"decision note (why it makes no server call)"
                )
            continue

        # kind == "remote"
        if not path.startswith(API_PREFIX):
            result.failures.append(
                f"{command}: remote path {path or '(empty)'} must be an absolute {API_PREFIX}/* path"
            )
            continue
        if "/_current/" in path:
            result.failures.append(
                f"{command}: path {path} contains a literal /_current/ segment — that "
                f"segment is rewritten client-side by the console ({CONSOLE_API_SOURCE}) "
                f"and never reaches the server; record the concrete path the client "
                f"actually sends instead of comparing the rewritten form"
            )
            continue
        if not method:
            result.failures.append(f"{command}: remote entry without an HTTP method")
            continue

        matched, detail = match_route(routes, method, path)
        if not matched:
            result.failures.append(f"{command}: {detail}")
            continue
        base = path.split("?", 1)[0]
        for seg_pair in _path_variants(base):
            covered.add(seg_pair)
        result.info.append(f"{command}: {method} {base} -> {detail}")

    result.counts = {
        "commands": len(commands),
        **{f"kind_{k}": v for k, v in kind_counts.items()},
    }

    # Server routes with no client coverage: informational.
    covered_paths = {path for path, _ in covered}
    uncovered = 0
    for server_path in sorted(routes):
        if any(_path_shape_matches(server_path, p) for p in covered_paths):
            continue
        for method in sorted(routes[server_path]):
            result.info.append(f"uncovered server route: {method} {server_path}")
            uncovered += 1
    result.counts["uncovered_server_methods"] = uncovered
    return result


def _path_variants(base: str) -> Iterable[tuple[str, str]]:
    """Yield (path, method-agnostic) keys used for coverage bookkeeping."""
    yield base, ""


def _path_shape_matches(server_path: str, manifest_path: str) -> bool:
    m_seg = _segments(manifest_path)
    s_seg = _segments(server_path)
    if len(m_seg) != len(s_seg):
        return False
    return all(_segment_matches(ms, ss) for ms, ss in zip(m_seg, s_seg)) or all(
        ms == ss for ms, ss in zip(m_seg, s_seg)
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Check CLI route manifest parity against the served Flask routes."
    )
    parser.add_argument(
        "--client-manifest",
        type=Path,
        default=DEFAULT_MANIFEST,
        help=f"path to the CLI route manifest (default: {DEFAULT_MANIFEST})",
    )
    args = parser.parse_args(argv)

    try:
        manifest = load_manifest(args.client_manifest)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    try:
        app = build_app()
    except Exception as exc:  # noqa: BLE001 - boot failure is a hard error
        print(f"error: could not mount the server blueprint surface: {exc}", file=sys.stderr)
        return 2

    result = evaluate(app, manifest)
    print(result.render())
    return 1 if result.failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
