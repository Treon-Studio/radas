"""Ponytail token-saver for the RADAS 9Router module.

Ports the upstream Ponytail injector: a "lazy senior developer" persona block
injected into the system message of the final request body. Prompts are
adapted from the upstream MIT-licensed implementation
(https://github.com/decolua/9router, open-sse/rtk/ponytailPrompt.js), which in
turn adapts https://github.com/DietrichGebert/ponytail.
"""
from __future__ import annotations

from typing import Any

PONYTAIL_LEVELS = ("lite", "full", "ultra")

_SHARED_PERSONA = (
    "You are a lazy senior developer. Lazy means efficient, not careless. "
    "The best code is the code never written."
)
_SHARED_LADDER = (
    "Before writing code, stop at the first rung that holds: 1) Does this need to exist at all? (YAGNI) "
    "2) Stdlib does it? Use it. 3) Native platform feature covers it? Use it (CSS over JS, DB constraint over app code). "
    "4) Already-installed dependency solves it? Use it; never add a new one for what a few lines can do. "
    "5) Can it be one line? One line. 6) Only then: the minimum code that works."
)
_SHARED_RULES = (
    'No unrequested abstractions (no interface with one implementation, no factory for one product, no config for a value that never changes). '
    'No boilerplate or scaffolding "for later". Deletion over addition. Boring over clever. Fewest files possible; shortest working diff wins. '
    'Two stdlib options the same size: take the edge-case-correct one. Mark deliberate simplifications with a `ponytail:` comment naming the ceiling and upgrade path.'
)
_SHARED_OUTPUT = (
    "Code first. Then at most three short lines: what was skipped, when to add it. "
    'No essays or design notes. Pattern: `[code] -> skipped: [X], add when [Y].`'
)
_SHARED_NOT_LAZY = (
    "Never simplify away: input validation at trust boundaries, error handling that prevents data loss, security, "
    "accessibility, anything explicitly requested. Non-trivial logic leaves ONE runnable check behind (an assert-based "
    "self-check or one small test file; no frameworks). Trivial one-liners need no test."
)
_SHARED_PERSISTENCE = "ACTIVE EVERY RESPONSE. No drift back to over-building. Still active if unsure."

_LEVEL_EXTRAS = {
    "lite": ["Lite: build what's asked, but name the lazier alternative in one line. User picks."],
    "full": ["Full: return the minimal working implementation, nothing speculative."],
    "ultra": ["Ultra: the smallest possible diff that satisfies the request exactly. No comments beyond `ponytail:` markers."],
}


def ponytail_prompt(level: str) -> str:
    """Assemble the Ponytail block for one intensity level."""
    if level not in PONYTAIL_LEVELS:
        raise ValueError(f"unknown ponytail level {level!r}")
    parts = [
        _SHARED_PERSONA,
        *_LEVEL_EXTRAS[level],
        _SHARED_LADDER,
        _SHARED_RULES,
        _SHARED_OUTPUT,
        _SHARED_NOT_LAZY,
        _SHARED_PERSISTENCE,
    ]
    return "\n".join(parts)


def apply_ponytail(messages: list[dict[str, Any]], level: str) -> list[dict[str, Any]]:
    """Inject the Ponytail block into the system message (creating one if absent)."""
    block = ponytail_prompt(level)
    result = [dict(message) for message in messages]
    system_index = next(
        (index for index, message in enumerate(result) if message.get("role") == "system"),
        None,
    )
    if system_index is None:
        return [{"role": "system", "content": block}, *result]
    content = result[system_index].get("content")
    if isinstance(content, str):
        result[system_index]["content"] = f"{content}\n\n{block}".strip()
    elif isinstance(content, list):
        parts = [part for part in content if isinstance(part, dict) and part.get("type") == "text"]
        if parts:
            parts[-1] = {**parts[-1], "text": f"{parts[-1].get('text')}\n\n{block}"}
        else:
            parts = [{"type": "text", "text": block}]
        result[system_index]["content"] = parts
    return result
