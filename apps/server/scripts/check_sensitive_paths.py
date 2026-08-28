#!/usr/bin/env python3
"""Static checks for sensitive-path patterns in the server codebase.

Scans Python sources for constructs that historically leak credentials or
enable command injection, so they cannot be added silently:

- SP001  subprocess execution with ``shell=True`` (or ``os.system`` /
         ``os.popen`` / ``commands.*`` equivalents).
- SP002  f-string / ``%``-interpolated / ``str.format`` commands passed to
         subprocess-family calls, or interpolated into a list that is being
         built as a command argv. Plain argv list literals are the house
         convention (see ``services/runtime_providers/local_container.py``).
- SP003  logger calls embedding a Flask request body verbatim (``request.json``,
         ``request.get_json()``, ``request.data``, ...): request bodies carry
         credential material and must never reach logs unredacted.

A hit may be allowlisted with an inline ``# sensitive-path-ok`` marker on the
offending line or on the preceding comment line, ideally with a short
justification. The script exits 1 when unallowlisted hits remain, 0 otherwise.

Usage: python3 scripts/check_sensitive_paths.py [root]
       (root defaults to the apps/server tree that ships this script)
"""
from __future__ import annotations

import ast
import sys
from dataclasses import dataclass
from pathlib import Path

MARKER = "# sensitive-path-ok"
SKIP_DIRS = {"__pycache__", ".venv", "venv", "node_modules", ".git"}

SUBPROCESS_FUNCS = {
    "run", "Popen", "call", "check_call", "check_output",
    "getoutput", "getstatusoutput",
}
SHELL_FUNCS = {"system", "popen", "popen2", "popen3", "popen4"}
COMMAND_BUILDERS = {"extend", "append", "insert"}
ARGV_NAMES = {"argv", "cmd", "command", "cmds", "commands", "args_list"}
LOGGER_LEVELS = {"debug", "info", "warning", "warn", "error", "exception", "critical", "log"}
REQUEST_BODY_ATTRS = {"json", "data", "form", "files", "body"}
REQUEST_BODY_CALLS = {"get_json", "get_data"}


@dataclass
class Hit:
    rule: str
    path: Path
    lineno: int
    snippet: str


def _is_interpolated(node: ast.AST) -> bool:
    """Whether the expression embeds f-string/%/format interpolation."""
    for inner in ast.walk(node):
        if isinstance(inner, ast.JoinedStr):
            return True
        if isinstance(inner, ast.BinOp) and isinstance(inner.op, ast.Mod):
            return True
        if (
            isinstance(inner, ast.Call)
            and isinstance(inner.func, ast.Attribute)
            and inner.func.attr == "format"
        ):
            return True
    return False


def _callee_dotted(call: ast.Call) -> str:
    """Best-effort dotted name of the call target (e.g. 'subprocess.Popen')."""
    parts: list[str] = []
    node: ast.AST = call.func
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
    return ".".join(reversed(parts))


def _argv_builder_name(call: ast.Call) -> str | None:
    """Return the builder variable name for ``<argv-ish>.extend/append(...)``."""
    func = call.func
    if isinstance(func, ast.Attribute) and func.attr in COMMAND_BUILDERS:
        target = func.value
        if isinstance(target, ast.Name) and target.id.lower() in ARGV_NAMES:
            return target.id
        if (
            isinstance(target, ast.Attribute)
            and target.attr.lower() in ARGV_NAMES
        ):
            return target.attr
    return None


def _references_request_body(node: ast.AST) -> bool:
    """Whether the expression embeds a Flask request body verbatim."""
    for inner in ast.walk(node):
        if isinstance(inner, ast.Attribute) and inner.attr in REQUEST_BODY_ATTRS:
            if isinstance(inner.value, ast.Name) and inner.value.id == "request":
                return True
        if (
            isinstance(inner, ast.Call)
            and isinstance(inner.func, ast.Attribute)
            and inner.func.attr in REQUEST_BODY_CALLS
            and isinstance(inner.func.value, ast.Name)
            and inner.func.value.id == "request"
        ):
            return True
    return False


def check_file(path: Path, root: Path) -> list[Hit]:
    try:
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as exc:
        return [Hit("SP000", path.relative_to(root), exc.lineno or 1, f"syntax error: {exc.msg}")]
    lines = source.splitlines()

    def allowed(lineno: int) -> bool:
        if 0 < lineno <= len(lines) and MARKER in lines[lineno - 1]:
            return True
        # Walk the contiguous comment block immediately above the line so a
        # multi-line justification comment can carry the marker.
        index = lineno - 2
        while index >= 0:
            stripped = lines[index].strip()
            if not stripped.startswith("#"):
                break
            if MARKER in stripped:
                return True
            index -= 1
        return False

    hits: list[Hit] = []

    def record(rule: str, lineno: int) -> None:
        if allowed(lineno):
            return
        snippet = lines[lineno - 1].strip() if 0 < lineno <= len(lines) else ""
        hits.append(Hit(rule, path.relative_to(root), lineno, snippet[:100]))

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        dotted = _callee_dotted(node)
        tail = dotted.rsplit(".", 1)[-1]
        module = dotted.rsplit(".", 1)[0] if "." in dotted else ""

        # SP001: shell execution.
        shell_true = any(
            keyword.arg == "shell"
            and isinstance(keyword.value, ast.Constant)
            and keyword.value.value is True
            for keyword in node.keywords
        )
        # os.system / os.popen* and the shell-backed commands/subprocess helpers.
        shell_helper = (module == "os" and tail in SHELL_FUNCS) or (
            module in {"commands", "subprocess"} and tail in {"getoutput", "getstatusoutput"}
        )
        if shell_true or shell_helper:
            record("SP001", node.lineno)
            continue

        is_subprocess_call = (
            module in {"subprocess", "commands"}
            or dotted.startswith("subprocess.")
            or dotted.startswith("asyncio.subprocess.")
        ) and tail in SUBPROCESS_FUNCS
        is_shell_call = module == "os" and tail in SHELL_FUNCS
        if is_subprocess_call or is_shell_call:
            # SP002: interpolated commands reaching a subprocess call.
            arguments = [arg for arg in node.args] + [kw.value for kw in node.keywords]
            if any(_is_interpolated(argument) for argument in arguments):
                record("SP002", node.lineno)
                continue

        # SP002: interpolation into a list that is being assembled as argv.
        builder = _argv_builder_name(node)
        if builder is not None:
            for argument in node.args:
                if isinstance(argument, ast.List) and any(
                    _is_interpolated(element) for element in argument.elts
                ):
                    record("SP002", node.lineno)
                    break
                if _is_interpolated(argument):
                    record("SP002", node.lineno)
                    break

        # SP003: logger calls embedding request bodies.
        if isinstance(node.func, ast.Attribute) and node.func.attr in LOGGER_LEVELS:
            receiver = node.func.value
            receiver_source = ast.get_source_segment(source, receiver) or ""
            if "logger" in receiver_source.lower() or receiver_source.endswith(".logger"):
                if any(
                    _references_request_body(argument)
                    for argument in list(node.args) + [kw.value for kw in node.keywords]
                ):
                    record("SP003", node.lineno)

    return hits


def collect_sources(root: Path) -> list[Path]:
    if root.is_file():
        return [root]
    return sorted(
        path
        for path in root.rglob("*.py")
        if not (set(path.parts) & SKIP_DIRS)
    )


def main(argv: list[str]) -> int:
    default_root = Path(__file__).resolve().parents[1]
    root = Path(argv[1]).resolve() if len(argv) > 1 else default_root
    if not root.exists():
        print(f"error: scan root does not exist: {root}", file=sys.stderr)
        return 2

    scanned = 0
    hits: list[Hit] = []
    for path in collect_sources(root):
        scanned += 1
        hits.extend(check_file(path, root))

    for hit in hits:
        print(f"{hit.rule} {hit.path}:{hit.lineno}: {hit.snippet}")
    if hits:
        print(
            f"\nFAIL: {len(hits)} sensitive-path hit(s). Fix the site or allowlist "
            f"it with an inline '{MARKER}' comment plus justification.",
            file=sys.stderr,
        )
        return 1
    print(f"OK: no sensitive-path violations in {scanned} file(s) under {root.name}/")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
