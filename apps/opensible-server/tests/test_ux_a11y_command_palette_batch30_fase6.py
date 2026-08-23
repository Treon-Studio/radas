import pytest


def test_nav_prefetch_routing():
    from services.nav_prefetch import get_prefetch_routes

    # When on /stacks/prod-db, prefetch logs, history, settings
    routes = get_prefetch_routes("/stacks/prod-db")
    assert "/stacks/prod-db/runs" in routes
    assert "/stacks/prod-db/settings" in routes


def test_offline_fallback_badge():
    from services.offline_fallback import get_offline_banner_state

    # Online
    online = get_offline_banner_state(is_connected=True)
    assert online["show_badge"] is False
    assert online["status"] == "online"

    # Offline with queued mutations
    offline = get_offline_banner_state(is_connected=False, pending_queue_size=3)
    assert offline["show_badge"] is True
    assert offline["status"] == "offline"
    assert offline["pending_queue_size"] == 3


def test_theme_semantic_tokens():
    from services.theme_semantic_vars import get_semantic_theme_tokens

    dark = get_semantic_theme_tokens("dark")
    assert "--color-success" in dark
    assert "--color-danger" in dark
    assert "--color-bg-card" in dark


def test_accessibility_color_contrast():
    from services.a11y_validator import calculate_contrast_ratio

    # White on black -> ratio 21:1 (AAA pass)
    res_high = calculate_contrast_ratio("#ffffff", "#000000")
    assert res_high["contrast_ratio"] >= 20.0
    assert res_high["wcag_aaa_normal"] is True

    # Low contrast gray on white
    res_low = calculate_contrast_ratio("#cccccc", "#ffffff")
    assert res_low["contrast_ratio"] < 3.0
    assert res_low["wcag_aa_normal"] is False
