import pytest


def test_quick_project_switcher_lru(pg_db):
    from services.quick_project_switcher import record_project_access, get_recent_projects

    # 1. Record accesses
    record_project_access("user-101", "proj-a")
    record_project_access("user-101", "proj-b")
    record_project_access("user-101", "proj-c")

    recent = get_recent_projects("user-101", limit=2)
    assert len(recent) == 2
    assert recent[0]["project_id"] == "proj-c"
    assert recent[1]["project_id"] == "proj-b"

    # 2. Re-access proj-a (moves it to the front)
    record_project_access("user-101", "proj-a")
    recent_all = get_recent_projects("user-101", limit=5)
    assert recent_all[0]["project_id"] == "proj-a"
    assert recent_all[1]["project_id"] == "proj-c"
    assert recent_all[2]["project_id"] == "proj-b"


def test_large_stack_list_pagination():
    from services.large_stack_indexer import paginate_large_stack_list

    # Generate 600 stacks
    stacks = [{"id": f"stack-{i:03d}", "name": f"production-service-{i}", "env": "prod"} for i in range(600)]

    # 1. Paginate first page
    p1 = paginate_large_stack_list(stacks, page=1, page_size=50)
    assert len(p1["items"]) == 50
    assert p1["total_items"] == 600
    assert p1["total_pages"] == 12
    assert p1["has_next"] is True
    assert p1["has_prev"] is False

    # 2. Filter search query
    filtered = paginate_large_stack_list(stacks, page=1, page_size=50, filter_query="service-10")
    # Matches service-10, service-100..service-109
    assert filtered["total_items"] >= 11
    assert p1["items"][0]["id"] == "stack-000"


def test_optimistic_state_update_and_revert(pg_db):
    from services.optimistic_state_manager import (
        apply_optimistic_update,
        revert_optimistic_update,
        commit_optimistic_update,
    )

    prev_state = {"enabled": False, "value": "off"}
    next_state = {"enabled": True, "value": "on"}

    # 1. Apply optimistic update
    opt = apply_optimistic_update("feature_flag", "flag-killswitch", prev_state, next_state)
    assert opt["status"] == "pending"
    assert opt["current_state"] == next_state
    update_id = opt["update_id"]

    # 2. Revert on server error
    reverted = revert_optimistic_update(update_id)
    assert reverted["status"] == "reverted"
    assert reverted["current_state"] == prev_state

    # 3. Apply again and commit
    opt2 = apply_optimistic_update("feature_flag", "flag-killswitch", prev_state, next_state)
    committed = commit_optimistic_update(opt2["update_id"])
    assert committed["status"] == "committed"
    assert committed["current_state"] == next_state


def test_e2e_playwright_test_selector_registry():
    from services.e2e_test_selector_registry import get_stable_testid, list_registered_testids

    # 1. Generate testid with entity id
    tid1 = get_stable_testid(component="flag-toggle", action="click", entity_id="kill_switch")
    assert tid1 == "flag-toggle-click-kill_switch"

    # 2. Generate generic testid
    tid2 = get_stable_testid(component="header-search", action="input")
    assert tid2 == "header-search-input"

    # 3. Check registered list
    all_tids = list_registered_testids()
    assert "flag-toggle-click-kill_switch" in all_tids
    assert "header-search-input" in all_tids


def test_bundle_budget_validation_and_lazy_split():
    from services.bundle_budget_validator import validate_bundle_budgets

    chunks = {
        "index.js": 240,
        "vendor-react.js": 180,
        "charts-recharts.js": 620,
        "monaco-editor.js": 750,
    }

    # Max chunk budget 500 KB
    res = validate_bundle_budgets(chunks, max_chunk_kb=500)
    assert res["within_budget"] is False
    assert len(res["oversized_chunks"]) == 2
    assert "charts-recharts.js" in res["oversized_chunks"]
    assert "monaco-editor.js" in res["oversized_chunks"]
    assert "charts-recharts.js" in res["lazy_load_candidates"]
    assert res["total_bundle_kb"] == 1790


def test_swr_cache_headers_generation():
    from services.swr_cache_manager import generate_swr_headers

    data = {"project": "p-core", "status": "active", "stacks_count": 12}
    headers = generate_swr_headers(data, max_age_sec=60, stale_sec=300)

    assert "Cache-Control" in headers
    assert "max-age=60" in headers["Cache-Control"]
    assert "stale-while-revalidate=300" in headers["Cache-Control"]
    assert "ETag" in headers
    assert headers["ETag"].startswith('W/"')


