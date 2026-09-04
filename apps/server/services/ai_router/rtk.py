"""RTK token-saver filters for the RADAS 9Router module.

RADAS-native port of the upstream 9Router RTK filter families
(`open-sse/rtk`): an ordered auto-detector plus pure text filters. Detection
order mirrors upstream — git-log → git-diff → git-status → build-output →
grep → find → tree → ls → read-numbered → dedup-log → smart-truncate — and
blobs under MIN_COMPRESS_SIZE pass through unchanged. All filters are
lossless-by-summary: they keep head/tail context and replace elided runs with
explicit markers so the model still sees the shape of the payload.
"""
from __future__ import annotations

import re
from typing import Callable, Optional

MIN_COMPRESS_SIZE = 500
DETECT_WINDOW = 1024
GIT_DIFF_HUNK_MAX_LINES = 100
GIT_LOG_MAX_LINES = 200
DEDUP_LINE_MAX = 2000
GREP_PER_FILE_MAX = 10
FIND_PER_DIR_MAX = 10
FIND_TOTAL_DIR_MAX = 20
STATUS_MAX_FILES = 10
TREE_MAX_LINES = 200
SMART_TRUNCATE_HEAD = 120
SMART_TRUNCATE_TAIL = 60
SMART_TRUNCATE_MIN_LINES = 250
READ_NUMBERED_MIN_HIT_RATIO = 0.7

_RE_GIT_DIFF = re.compile(r"^diff --git ", re.M)
_RE_GIT_DIFF_HUNK = re.compile(r"^@@ ", re.M)
_RE_GIT_STATUS = re.compile(r"^On branch |^nothing to commit|^Changes (not |to be )|^Untracked files:", re.M)
_RE_GIT_LOG = re.compile(r"^[*|/\\ ]*commit [0-9a-f]{7,40}$", re.M)
_RE_PORCELAIN = re.compile(r"^[ MADRCU?!][ MADRCU?!] \S")
_RE_BUILD_OUTPUT = re.compile(
    r"^(npm (warn|error|ERR!)|yarn (warn|error)|\s*Compiling\s+\S+|\s*Downloading\s+\S+|added \d+ package|\[ERROR\]|BUILD (SUCCESS|FAILED)|\s*Finished\s+|Successfully (installed|built)|ERROR:)",
    re.I | re.M,
)
_RE_TREE_GLYPH = re.compile(r"[├└]──|│  ")
_RE_LS_ROW = re.compile(r"^[-dlbcps][rwx-]{9}", re.M)
_RE_LS_TOTAL = re.compile(r"^total \d+$", re.M)
_RE_READ_NUMBERED = re.compile(r"^\s*\d+[|│]")


def _is_grep_line(line: str) -> bool:
    first = line.find(":")
    if first == -1:
        return False
    second = line.find(":", first + 1)
    if second == -1:
        return False
    return line[first + 1: second].isdigit()


def _is_path_like(line: str) -> bool:
    return ":" not in line and "/" in line


def _truncate_tail(out: list[str], cut: int, label: str) -> list[str]:
    out.append(f"... +{cut} {label} truncated (RTK)")
    return out


def git_log(text: str, max_lines: int = GIT_LOG_MAX_LINES) -> str:
    lines = text.split("\n")
    if len(lines) <= max_lines:
        return text
    kept = lines[:max_lines]
    kept.append(f"... +{len(lines) - max_lines} log lines truncated (RTK)")
    return "\n".join(kept)


def git_diff(diff: str, max_hunk_lines: int = GIT_DIFF_HUNK_MAX_LINES) -> str:
    """Cap each hunk at max_hunk_lines, keeping file headers intact."""
    lines = diff.split("\n")
    out: list[str] = []
    hunk_kept = 0
    hunk_cut = 0
    for line in lines:
        if line.startswith("diff --git ") or line.startswith("@@ "):
            if hunk_cut:
                out.append(f"... +{hunk_cut} hunk lines truncated (RTK)")
            hunk_kept = 0
            hunk_cut = 0
            out.append(line)
            continue
        if hunk_kept < max_hunk_lines:
            out.append(line)
            hunk_kept += 1
        else:
            hunk_cut += 1
    if hunk_cut:
        out.append(f"... +{hunk_cut} hunk lines truncated (RTK)")
    return "\n".join(out)


def git_status(input_text: str) -> str:
    lines = input_text.split("\n")
    if len(lines) == 0 or (len(lines) == 1 and not lines[0].strip()):
        return "Clean working tree"
    branch = ""
    groups: dict[str, list[str]] = {"staged": [], "modified": [], "untracked": []}
    counts: dict[str, int] = {"staged": 0, "modified": 0, "untracked": 0}
    conflicts = 0
    for raw in lines:
        if not raw.strip():
            continue
        long_branch = re.match(r"^On branch (\S+)", raw)
        if long_branch:
            branch = long_branch.group(1)
            continue
        if raw.startswith("##"):
            branch = raw[2:].strip()
            continue
        porcelain = re.match(r"^([ MADRCU?!][ MADRCU?!]) (.+)$", raw)
        if porcelain:
            x, y, path = porcelain.group(1)[0], porcelain.group(1)[1], porcelain.group(2)
            if raw[:2] == "??":
                key = "untracked"
            elif x in "MADRC" or y in "MADRC":
                key = "staged" if x != " " else "modified"
            elif x == "U" or y == "U":
                conflicts += 1
                continue
            else:
                key = "modified"
            counts[key] += 1
            if len(groups[key]) < STATUS_MAX_FILES:
                groups[key].append(path)
            continue
        if re.match(r"^\s*(modified|new file|deleted|renamed):", raw):
            counts["modified"] += 1
            path = raw.split(":", 1)[1].strip()
            if len(groups["modified"]) < STATUS_MAX_FILES:
                groups["modified"].append(path)
            continue
        if "Untracked files" in raw:
            continue
        if "nothing to commit" in raw:
            return "Clean working tree"

    out = [f"* {branch}" if branch else "* (detached)"]
    for label, title in (("staged", "+ Staged"), ("modified", "~ Modified"), ("untracked", "? Untracked")):
        if counts[label]:
            out.append(f"{title}: {counts[label]} files")
            out.extend(f"  {path}" for path in groups[label])
            if counts[label] > len(groups[label]):
                out.append(f"  ... +{counts[label] - len(groups[label])} more (RTK)")
    if conflicts:
        out.append(f"conflicts: {conflicts} files")
    if not counts["staged"] and not counts["modified"] and not counts["untracked"] and not conflicts:
        return "Clean working tree"
    return "\n".join(out)


def build_output(input_text: str) -> str:
    """Collapse repetitive Compiling/Downloading runs; keep warnings/errors."""
    out: list[str] = []
    run_label: Optional[str] = None
    run_count = 0

    def flush() -> None:
        nonlocal run_label, run_count
        if run_label is not None:
            out.append(f"{run_label} ({run_count} packages)" if run_count > 1 else run_label)
        run_label = None
        run_count = 0

    for line in input_text.split("\n"):
        match = re.match(r"^\s*(Compiling|Downloading)\s+(\S+)", line)
        if match:
            label = f"{match.group(1)} {match.group(2)}"
            prefix = f"{match.group(1)}"
            if run_label is not None and run_label.startswith(prefix):
                run_count += 1
                continue
            flush()
            run_label, run_count = label, 1
            continue
        flush()
        out.append(line)
    flush()
    return "\n".join(out)


def grep(input_text: str) -> str:
    per_file: dict[str, list[str]] = {}
    counts: dict[str, int] = {}
    order: list[str] = []
    for line in input_text.split("\n"):
        if not line.strip():
            continue
        first = line.find(":")
        second = line.find(":", first + 1) if first != -1 else -1
        file = line[:first] if first != -1 else "(no-file)"
        if file not in per_file:
            per_file[file] = []
            counts[file] = 0
            order.append(file)
        counts[file] += 1
        if counts[file] <= GREP_PER_FILE_MAX:
            per_file[file].append(line)
    out: list[str] = []
    for file in order:
        out.extend(per_file[file])
        if counts[file] > GREP_PER_FILE_MAX:
            out.append(f"... {file}: +{counts[file] - GREP_PER_FILE_MAX} more matches (RTK)")
    return "\n".join(out)


def find(input_text: str) -> str:
    dirs: dict[str, list[str]] = {}
    order: list[str] = []
    for line in input_text.split("\n"):
        if not line.strip():
            continue
        directory = line.rsplit("/", 1)[0] if "/" in line else "."
        if directory not in dirs:
            dirs[directory] = []
            order.append(directory)
        dirs[directory].append(line)
    kept_dirs = order[:FIND_TOTAL_DIR_MAX]
    out: list[str] = []
    for directory in kept_dirs:
        entries = dirs[directory]
        out.extend(entries[:FIND_PER_DIR_MAX])
        if len(entries) > FIND_PER_DIR_MAX:
            out.append(f"... {directory}: +{len(entries) - FIND_PER_DIR_MAX} more files (RTK)")
    if len(order) > FIND_TOTAL_DIR_MAX:
        out.append(f"... +{len(order) - FIND_TOTAL_DIR_MAX} more directories (RTK)")
    return "\n".join(out)


def tree(input_text: str) -> str:
    lines = input_text.split("\n")
    if len(lines) <= TREE_MAX_LINES:
        return input_text
    out = lines[:TREE_MAX_LINES]
    out.append(f"... +{len(lines) - TREE_MAX_LINES} tree lines truncated (RTK)")
    return "\n".join(out)


def ls(input_text: str) -> str:
    lines = input_text.split("\n")
    total = next((line for line in lines if _RE_LS_TOTAL.match(line)), None)
    rows = [line for line in lines if _RE_LS_ROW.match(line)]
    if len(rows) <= STATUS_MAX_FILES * 3:
        return input_text
    exts: dict[str, int] = {}
    for row in rows:
        parts = row.split()
        name = parts[-1] if parts else ""
        ext = name.rsplit(".", 1)[1] if "." in name else "(none)"
        exts[ext] = exts.get(ext, 0) + 1
    top = sorted(exts.items(), key=lambda kv: -kv[1])[:5]
    out = ([total] if total else []) + [f"[{len(rows)} entries: " + ", ".join(f"{ext}x{count}" for ext, count in top) + "] (RTK)"]
    out.extend(rows[:STATUS_MAX_FILES])
    out.append(f"... +{len(rows) - STATUS_MAX_FILES} more entries (RTK)")
    return "\n".join(out)


def read_numbered(input_text: str) -> str:
    """Numbered file dump: collapse blank runs and exact duplicate lines."""
    lines = input_text.split("\n")
    out: list[str] = []
    blank_streak = 0
    prev: Optional[str] = None
    for line in lines:
        if not line.strip():
            if blank_streak < 1:
                out.append(line)
            blank_streak += 1
            prev = None
            continue
        blank_streak = 0
        if line != prev:
            out.append(line)
        prev = line
    return "\n".join(out)


def dedup_log(input_text: str) -> str:
    out: list[str] = []
    prev: Optional[str] = None
    run_count = 0
    blank_streak = 0

    def flush() -> None:
        if prev is not None and run_count > 1:
            out.append(f"  ... ({run_count - 1} duplicate lines)")

    for line in input_text.split("\n"):
        if not line.strip():
            if blank_streak < 1:
                out.append(line)
            blank_streak += 1
            if prev is not None and run_count > 1:
                out.append(f"  ... ({run_count - 1} duplicate lines)")
            prev, run_count = None, 0
            continue
        blank_streak = 0
        if line == prev:
            run_count += 1
            continue
        if prev is not None and run_count > 1:
            out.append(f"  ... ({run_count - 1} duplicate lines)")
        out.append(line)
        prev, run_count = line, 1
        if len(out) >= DEDUP_LINE_MAX:
            out.append(f"... (truncated at {DEDUP_LINE_MAX} lines) (RTK)")
            return "\n".join(out)
    if prev is not None and run_count > 1:
        out.append(f"  ... ({run_count - 1} duplicate lines)")
    return "\n".join(out)


def smart_truncate(input_text: str) -> str:
    lines = input_text.split("\n")
    if len(lines) < SMART_TRUNCATE_MIN_LINES:
        return input_text
    head = lines[:SMART_TRUNCATE_HEAD]
    tail = lines[len(lines) - SMART_TRUNCATE_TAIL:]
    cut = len(lines) - len(head) - len(tail)
    return "\n".join([*head, f"... +{cut} lines truncated (RTK)", *tail])


def auto_detect_filter(text: str) -> Optional[Callable[[str], str]]:
    head = text[:DETECT_WINDOW]
    if _RE_GIT_LOG.search(head):
        return git_log
    if _RE_GIT_DIFF.search(head) or _RE_GIT_DIFF_HUNK.search(head):
        return git_diff
    if _RE_GIT_STATUS.search(head):
        return git_status
    if _RE_BUILD_OUTPUT.search(head):
        return build_output
    lines = head.split("\n")
    non_empty = [line for line in lines if line.strip()]
    if non_empty and sum(1 for line in non_empty if _RE_PORCELAIN.match(line)) / len(non_empty) >= 0.7:
        return git_status
    first5 = non_empty[:5]
    if first5 and any(_is_grep_line(line) for line in first5):
        return grep
    if len(non_empty) >= 3 and all(_is_path_like(line) for line in non_empty):
        return find
    if _RE_TREE_GLYPH.search(head):
        return tree
    if _RE_LS_TOTAL.search(head) or len(_RE_LS_ROW.findall(head)) >= 3:
        return ls
    if lines and len(lines) >= 20 and sum(1 for line in lines if _RE_READ_NUMBERED.match(line)) / len(lines) >= READ_NUMBERED_MIN_HIT_RATIO:
        return read_numbered
    if len(non_empty) >= 5:
        return dedup_log
    if len(text.split("\n")) >= SMART_TRUNCATE_MIN_LINES:
        return smart_truncate
    return None


FILTER_NAMES = {
    git_log: "git-log", git_diff: "git-diff", git_status: "git-status",
    build_output: "build-output", grep: "grep", find: "find", tree: "tree",
    ls: "ls", read_numbered: "read-numbered", dedup_log: "dedup-log",
    smart_truncate: "smart-truncate",
}


def compress_text(text: str) -> tuple[str, str]:
    """Compress one payload; returns (text, filter_name or '')."""
    if len(text) < MIN_COMPRESS_SIZE:
        return text, ""
    chosen = auto_detect_filter(text)
    if chosen is None:
        return text, ""
    compressed = chosen(text)
    return compressed, FILTER_NAMES.get(chosen, chosen.__name__)
