"""Locale-aware number, currency, and date formatting utilities (UC605)."""
from __future__ import annotations

import datetime
from typing import Optional


def format_currency(amount: float, currency: str = "USD", locale: str = "en_US") -> str:
    """Format numeric amount to currency string according to locale (UC605)."""
    curr = currency.upper()
    loc = (locale or "en_US").lower()

    if "id" in loc:
        val_int = int(round(amount))
        formatted = f"{val_int:,}".replace(",", ".")
        return f"Rp {formatted}"

    if "de" in loc or "fr" in loc:
        formatted = f"{amount:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        sym = "€" if curr == "EUR" else ("$" if curr == "USD" else curr)
        return f"{formatted} {sym}"

    sym = "$" if curr == "USD" else ("€" if curr == "EUR" else f"{curr} ")
    return f"{sym}{amount:,.2f}"


def format_datetime_locale(timestamp: float, locale: str = "en_US") -> str:
    """Format unix epoch timestamp to locale datetime string (UC605)."""
    dt = datetime.datetime.fromtimestamp(timestamp, tz=datetime.timezone.utc)
    loc = (locale or "en_US").lower()

    if "id" in loc:
        return dt.strftime("%d/%m/%Y %H:%M:%S UTC")
    if "de" in loc:
        return dt.strftime("%d.%m.%Y %H:%M:%S UTC")

    return dt.strftime("%Y-%m-%d %H:%M:%S UTC")
