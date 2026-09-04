"""Per-model cost estimates for the RADAS 9Router module.

Prices are USD per 1M tokens from public provider pricing pages and are
estimates for observability only — never billing data. Unknown models cost 0
so telemetry never fabricates spend.
"""
from __future__ import annotations

# model substring -> (input_usd_per_1M, output_usd_per_1M)
_PRICES: tuple[tuple[str, tuple[float, float]], ...] = (
    ("gpt-4o-mini", (0.15, 0.60)),
    ("gpt-4o", (2.50, 10.00)),
    ("o4-mini", (1.10, 4.40)),
    ("claude-3-5-sonnet", (3.00, 15.00)),
    ("claude-3-5-haiku", (0.80, 4.00)),
    ("claude-sonnet-4", (3.00, 15.00)),
    ("gemini-1.5-flash", (0.075, 0.30)),
    ("gemini-1.5-pro", (1.25, 5.00)),
    ("gemini-2.5-flash", (0.30, 2.50)),
    ("gemini-2.5-pro", (1.25, 10.00)),
    ("deepseek-chat", (0.14, 0.28)),
    ("deepseek-coder", (0.14, 0.28)),
    ("whisper", (0.0, 0.0)),
    ("tts", (0.0, 0.0)),
)


def estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Estimated USD cost for one response; 0.0 when pricing is unknown."""
    value = (model or "").lower()
    for marker, (input_price, output_price) in _PRICES:
        if marker in value:
            return round(
                (prompt_tokens / 1_000_000) * input_price
                + (completion_tokens / 1_000_000) * output_price,
                6,
            )
    return 0.0
