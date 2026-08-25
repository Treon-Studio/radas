"""Multi-currency converter and locale currency formatter (UC559)."""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

DEFAULT_RATES_TO_USD = {
    "USD": 1.0,
    "EUR": 0.92,
    "GBP": 0.78,
    "IDR": 15500.0,
    "JPY": 150.0,
    "SGD": 1.34,
}


def convert_currency(
    amount: float,
    from_curr: str = "USD",
    to_curr: str = "IDR",
    custom_rates: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """Convert financial amount between currencies using exchange rates (UC559)."""
    rates = custom_rates or DEFAULT_RATES_TO_USD
    fc = from_curr.upper().strip()
    tc = to_curr.upper().strip()

    from_rate = rates.get(fc, 1.0)
    to_rate = rates.get(tc, 1.0)

    amount_in_usd = float(amount) / from_rate if from_rate > 0 else float(amount)
    target_amount = amount_in_usd * to_rate

    return {
        "source_amount": float(amount),
        "source_currency": fc,
        "target_amount": round(target_amount, 2),
        "target_currency": tc,
        "exchange_rate": round(to_rate / from_rate, 4) if from_rate > 0 else 1.0,
    }


def format_currency(amount: float, currency: str = "USD") -> str:
    """Format currency values with appropriate symbol and punctuation (UC559)."""
    c = currency.upper().strip()
    amt = float(amount)

    if c == "USD":
        return f"${amt:,.2f}"
    if c == "EUR":
        return f"€{amt:,.2f}"
    if c == "GBP":
        return f"£{amt:,.2f}"
    if c == "IDR":
        return f"Rp {int(round(amt)):,}"
    if c == "JPY":
        return f"¥{int(round(amt)):,}"

    return f"{c} {amt:,.2f}"
