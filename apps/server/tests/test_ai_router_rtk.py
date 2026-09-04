from __future__ import annotations

from services.ai_router.rtk import (
    auto_detect_filter,
    build_output,
    compress_text,
    dedup_log,
    find,
    git_diff,
    git_log,
    git_status,
    grep,
    ls,
    read_numbered,
    smart_truncate,
    tree,
)
from services.ai_router.compression import compress_messages


def _diff(hunk_lines: int) -> str:
    return "diff --git a/main.go b/main.go\n@@ -1,2 +1,2 @@\n" + "\n".join(f"+ line {i}" for i in range(hunk_lines))


def test_git_diff_caps_each_hunk():
    compressed = git_diff(_diff(150))
    assert "... +50 hunk lines truncated (RTK)" in compressed
    assert "+ line 0" in compressed and "+ line 149" not in compressed


def test_git_log_caps_output():
    log = "\n".join(f"commit {'a' * 40}{i}" for i in range(300))
    compressed = git_log(log)
    assert compressed.count("commit") == 200
    assert "+100 log lines truncated (RTK)" in compressed


def test_git_status_porcelain_summary():
    status = "## main...origin/main\n" + "\n".join(f"M  src/file{i}.go" for i in range(15)) + "\n?? new.py\n"
    compressed = git_status(status)
    assert compressed.startswith("* main")
    assert "~ Modified: 0 files" not in compressed
    assert "+ Staged: 15 files" in compressed
    assert "... +5 more (RTK)" in compressed  # STATUS_MAX_FILES = 10
    assert "? Untracked: 1 files" in compressed


def test_git_status_long_form_clean():
    assert git_status("On branch main\nnothing to commit, working tree clean") == "Clean working tree"


def test_build_output_collapses_runs():
    text = "\n".join(["Compiling pkg-a", "Compiling pkg-b", "Downloading pkg-c", "ERROR: boom"])
    compressed = build_output(text)
    assert "Compiling pkg-a (2 packages)" in compressed
    assert "Downloading pkg-c" in compressed
    assert "ERROR: boom" in compressed


def test_grep_caps_per_file():
    text = "\n".join(f"src/app.py:{i}:print('x')" for i in range(25))
    compressed = grep(text)
    assert compressed.count(":print('x')") == 10
    assert "+15 more matches (RTK)" in compressed


def test_find_groups_directories():
    text = "\n".join(f"src/dir{i}/file{j}.py" for i in range(30) for j in range(3))
    compressed = find(text)
    assert "..." in compressed and "more directories (RTK)" in compressed


def test_tree_caps_lines():
    text = "\n".join("├── item" for _ in range(300))
    compressed = tree(text)
    assert "... +100 tree lines truncated (RTK)" in compressed


def test_ls_summarizes_extensions():
    rows = "\n".join(f"-rw-r--r-- 1 u u 10 i file{i}.py" for i in range(60))
    compressed = ls("total 120\n" + rows)
    assert "[60 entries:" in compressed
    assert "... +50 more entries (RTK)" in compressed


def test_read_numbered_collapses_blank_runs():
    text = "\n".join(f"{i}|content line" for i in range(1, 38))
    text += "\n38|content line\n38|content line\n\n\n\n40|tail line\n"
    compressed = read_numbered(text)
    assert compressed.count("38|content line") == 1
    # Blank runs collapse to a single blank line, never two.
    assert compressed.count("\n\n\n") == 0


def test_dedup_log_collapses_consecutive_duplicates():
    text = "\n".join(["ERROR: request failed"] * 50)
    compressed = dedup_log(text)
    assert "ERROR: request failed" in compressed
    assert "(49 duplicate lines)" in compressed


def test_smart_truncate_keeps_head_and_tail():
    text = "\n".join(f"row {i}" for i in range(400))
    compressed = smart_truncate(text)
    assert compressed.startswith("row 0")
    assert compressed.endswith("row 399")
    assert "... +220 lines truncated (RTK)" in compressed


def test_dedup_log_hard_cap():
    text = "\n".join(f"unique line {i}" for i in range(3000))
    compressed = dedup_log(text)
    assert "truncated at 2000 lines" in compressed


def test_autodetect_order():
    assert auto_detect_filter(_diff(200)).__name__ == "git_diff"
    assert auto_detect_filter("\n".join(f"commit {'a' * 40}{i}" for i in range(50))).__name__ == "git_log"
    assert auto_detect_filter("On branch main\nM  a.py").__name__ == "git_status"
    assert auto_detect_filter("src/a.py:12:def f():\nsrc/b.py:30:def g():").__name__ == "grep"
    assert auto_detect_filter("├── a\n└── b").__name__ == "tree"
    assert auto_detect_filter("total 5\n-rw-r--r-- 1 u u 1 1 a.py\n-rw-r--r-- 1 u u 1 1 b.py\n-rw-r--r-- 1 u u 1 1 c.py").__name__ == "ls"
    assert auto_detect_filter("\n".join(f"line {i}" for i in range(30))).__name__ == "dedup_log"


def test_compress_text_skips_small_payloads():
    assert compress_text("short text") == ("short text", "")


def test_compress_text_detects_and_compresses():
    text = "\n".join(f"unique {i}" for i in range(2500))
    compressed, name = compress_text(text)
    assert name == "dedup-log"
    assert "truncated at 2000 lines" in compressed
    assert len(compressed) < len(text)


def test_compress_messages_with_caveman_and_route_flags():
    big_log = "\n".join(["request failed: timeout"] * 200)
    messages = [{"role": "user", "content": big_log}, {"role": "user", "content": "tiny"}]
    compressed, saved = compress_messages(messages, enabled=True, mode="full")
    assert saved > 0
    assert "(199 duplicate lines)" in compressed[0]["content"]
    assert "[Be concise." not in compressed[0]["content"]  # RTK filters only
    assert compressed[1]["content"] == "tiny\n[Be concise. Prefer actionable steps and compact code.]"

    unchanged, zero = compress_messages(messages, enabled=False)
    assert unchanged[0]["content"] == big_log and zero == 0
