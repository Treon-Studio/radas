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
