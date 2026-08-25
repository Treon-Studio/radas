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


def test_motion_transitions_and_reduced_motion():
    from services.motion_styles import get_transition_class

    # Standard animation
    anim = get_transition_class("fade_in", prefers_reduced_motion=False)
    assert "transition-" in anim
    assert "duration-" in anim

    # Reduced motion override
    reduced = get_transition_class("fade_in", prefers_reduced_motion=True)
    assert "motion-reduce:none" in reduced or "transition-none" in reduced


def test_skeleton_card_schemas():
    from services.skeleton_registry import get_skeleton_schema

    schema_stack = get_skeleton_schema("stack_card")
    assert schema_stack["type"] == "stack_card"
    assert len(schema_stack["blocks"]) >= 3

    schema_metric = get_skeleton_schema("metric_card")
    assert schema_metric["type"] == "metric_card"


def test_status_code_tooltips():
    from services.status_tooltip import format_status_tooltip

    tip_200 = format_status_tooltip(200, "OK")
    assert "Success" in tip_200["description"] or "200" in tip_200["title"]

    tip_404 = format_status_tooltip(404, "Not Found")
    assert "404" in tip_404["title"]
    assert "Resource not found" in tip_404["description"]


def test_command_palette_search_and_shortcuts():
    from services.command_palette import search_command_palette

    # 1. Empty query returns top actions
    all_cmds = search_command_palette()
    assert len(all_cmds) >= 4
    shortcuts = {c["title"]: c.get("shortcut") for c in all_cmds}
    assert "Focus Search" in shortcuts
    assert shortcuts["Focus Search"] == "/"

    # 2. Search query filter
    results = search_command_palette("stack")
    assert any("Stack" in c["title"] for c in results)


def test_undo_action_window_and_execution(pg_db):
    from services.undo_action_manager import register_undoable_action, execute_undo_action

    # 1. Register toggle flag undo
    revert_data = {"flag_id": "beta-dark-mode", "value": False}
    reg = register_undoable_action("user-1", "toggle_flag", revert_data, ttl_seconds=5)
    assert reg["success"] is True
    action_id = reg["action_id"]

    # 2. Execute undo before TTL
    reverted = execute_undo_action(action_id)
    assert reverted["success"] is True
    assert reverted["reverted_data"] == revert_data

    # 3. Subsequent undo attempt fails
    second_attempt = execute_undo_action(action_id)
    assert second_attempt["success"] is False


def test_inapp_help_documentation():
    from services.inapp_help_docs import get_help_doc_for_route

    help_flags = get_help_doc_for_route("/flags")
    assert "Feature Flags" in help_flags["title"]
    assert len(help_flags["articles"]) >= 1

    help_unknown = get_help_doc_for_route("/unknown/route")
    assert "RADAS Documentation" in help_unknown["title"]


def test_product_changelog_feed():
    from services.product_changelog import get_product_changelog

    logs = get_product_changelog(limit=5)
    assert len(logs) >= 1
    assert "version" in logs[0]
    assert "highlights" in logs[0]


def test_user_feedback_submission(pg_db):
    from services.user_feedback import submit_user_feedback

    fb = submit_user_feedback(
        user_id="user-qa-1",
        rating=5,
        comment="Awesome console performance!",
        page_url="https://radas.internal/stacks",
    )
    assert fb["success"] is True
    assert fb["rating"] == 5
    assert "feedback_id" in fb


def test_rtl_layout_resolution():
    from services.rtl_layout_manager import resolve_layout_direction

    assert resolve_layout_direction("en-US") == "ltr"
    assert resolve_layout_direction("id-ID") == "ltr"
    assert resolve_layout_direction("ar-SA") == "rtl"
    assert resolve_layout_direction("he") == "rtl"



