from __future__ import annotations

def test_probe_failure_detail_redacts_credentials():
    from services import byoc

    class Response:
        status_code = 401
        text = "password=super-secret token=abc123"
        headers = {}

    class Requests:
        @staticmethod
        def post(*args, **kwargs):
            return Response()

    import sys
    import types
    monkeypatch = types.SimpleNamespace()
    original = sys.modules.get("requests")
    sys.modules["requests"] = Requests
    try:
        detail = byoc._probe("openstack", {"os_auth_url": "https://keystone", "os_password": "super-secret"})["detail"]
        assert "super-secret" not in detail
        assert "[REDACTED]" in detail
    finally:
        if original is None:
            sys.modules.pop("requests", None)
        else:
            sys.modules["requests"] = original


def test_credential_failure_dispatches_redacted_notification(monkeypatch):
    from services import byoc

    account = byoc.create_account({
        "name": "notify-failure",
        "provider": "hetzner",
        "credentials": {"hcloud_token": "secret-token"},
        "org_id": "org-notify",
        "project_id": "project-notify",
    })
    sent = []
    monkeypatch.setattr(byoc, "_probe", lambda *_: {"ok": False, "status": 401, "detail": "Authorization: secret-token at https://provider"})
    monkeypatch.setattr("services.webhook_dispatcher.dispatch_event", lambda event, payload: sent.append((event, payload)) or 1)

    result = byoc.validate_account(account["id"])

    assert result["ok"] is False
    assert sent == [("byoc.credential_failure", {
        "account_id": account["id"],
        "provider": "hetzner",
        "status": 401,
        "project_id": "project-notify",
    })]
    assert "secret-token" not in str(sent)
    stored = byoc.get_account(account["id"])
    assert stored["status"] == "error"
    assert stored["last_notification"]["kind"] == "byoc.credential_failure"


def test_credential_failure_dispatch_is_best_effort(monkeypatch):
    from services import byoc

    account = byoc.create_account({
        "name": "notify-dispatch-error",
        "provider": "hetzner",
        "credentials": {"hcloud_token": "secret-token"},
        "org_id": "org-notify",
        "project_id": "project-notify",
    })
    monkeypatch.setattr(byoc, "_probe", lambda *_: {"ok": False, "status": 403, "detail": "forbidden"})
    monkeypatch.setattr("services.webhook_dispatcher.dispatch_event", lambda *_: (_ for _ in ()).throw(RuntimeError("webhook offline")))

    result = byoc.validate_account(account["id"])

    assert result["ok"] is False
    assert byoc.get_account(account["id"])["status"] == "error"


def test_successful_credential_validation_does_not_dispatch_failure(monkeypatch):
    from services import byoc

    account = byoc.create_account({
        "name": "notify-success",
        "provider": "hetzner",
        "credentials": {"hcloud_token": "secret-token"},
        "org_id": "org-notify",
        "project_id": "project-notify",
    })
    sent = []
    monkeypatch.setattr(byoc, "_probe", lambda *_: {"ok": True, "status": 200, "detail": "credentials accepted"})
    monkeypatch.setattr("services.webhook_dispatcher.dispatch_event", lambda event, payload: sent.append((event, payload)) or 1)

    result = byoc.validate_account(account["id"])

    assert result["ok"] is True
    assert sent == []


def test_provider_detection_shapes():
    from services.byoc import detect_provider
    assert detect_provider({"credentials":{"hcloud_token":"x"}})["provider"] == "hetzner"
    assert detect_provider({"credentials":{"access_key":"x","secret_key":"y"}})["provider"] == "aws"
    assert detect_provider({"credentials":{"unknown":"x"}})["provider"] is None

def test_unsupported_provider_probe_fails_closed():
    from services.byoc import _probe
    result = _probe("aws", {"access_key": "x", "secret_key": "y"})
    assert result["ok"] is False
    assert result["status"] == 501


def test_inventory_page_has_pagination_metadata(monkeypatch, data_dir):
    from services import byoc
    monkeypatch.setattr(byoc, "get_inventory", lambda _: {"resources": [{"id": "r1"}, {"id": "r2"}, {"id": "r3"}], "count": 3})
    page = byoc.get_inventory_page("account", limit=2, offset=1)
    assert [item["id"] for item in page["resources"]] == ["r2", "r3"]
    assert page["has_more"] is False
    assert page["next_offset"] is None


def test_account_budget_alert_uses_estimated_cost(monkeypatch, data_dir):
    from services import byoc
    account = byoc.create_account({"name": "h", "provider": "hetzner", "credentials": {"hcloud_token": "x"}})
    monkeypatch.setattr(byoc, "estimate_account_cost", lambda _: {"monthly": 110, "provider": "hetzner"})
    sent = []
    monkeypatch.setattr("services.webhook_dispatcher.dispatch_event", lambda event, payload: sent.append((event, payload)) or 1)
    byoc.set_account_budget(account["id"], 100, "USD", 100)
    result = byoc.check_account_budget(account["id"])
    assert result["alerted"] is True
    assert result["sent"] == 1
    assert sent[0][0] == "byoc.budget_alert"


def test_account_cost_uses_managed_resources(monkeypatch, data_dir):
    from services import byoc
    account = byoc.create_account({"name": "h", "provider": "hetzner", "credentials": {"hcloud_token": "x"}})
    monkeypatch.setattr(byoc, "list_managed_resources", lambda _: [{"resource_id": "r1", "type": "hcloud_server", "address": "server.one"}])
    monkeypatch.setattr("storage.cost_store.estimate_cost", lambda provider, resources: {"currency": "USD", "monthly": 12.5, "yearly": 150})
    result = byoc.estimate_account_cost(account["id"])
    assert result["provider"] == "hetzner"
    assert result["monthly"] == 12.5
    assert result["resource_count"] == 1


def test_state_sync_tracks_sanitized_resources(data_dir):
    from services import byoc
    account = byoc.create_account({"name": "h", "provider": "hetzner", "credentials": {"hcloud_token": "x"}})
    result = byoc.sync_state_resources(account["id"], {"resources": [
        {"id": "r1", "address": "hcloud_server.one", "type": "hcloud_server", "values": {"token": "must-not-persist"}},
        {"id": "", "address": "bad", "type": "server"},
    ]})
    assert result["resource_count"] == 1
    managed = byoc.list_managed_resources(account["id"])
    assert managed[0]["resource_id"] == "r1"
    assert "must-not-persist" not in str(managed)


def test_inventory_snapshots_are_bounded_and_listable(monkeypatch, data_dir):
    from services import byoc
    account = byoc.create_account({"name": "h", "provider": "hetzner", "credentials": {"hcloud_token": "x"}})
    monkeypatch.setattr(byoc, "_probe", lambda *args: {"ok": True})
    class Response:
        status_code = 200
        def json(self): return {"servers": [{"name": "one", "id": "r1", "datacenter": {"location": "fsn1"}}]}
    class Requests:
        @staticmethod
        def get(*args, **kwargs): return Response()
    import sys
    original = sys.modules.get("requests")
    sys.modules["requests"] = Requests
    try:
        byoc.get_inventory(account["id"])
        byoc.get_inventory(account["id"])
        snapshots = byoc.list_inventory_snapshots(account["id"], 20)
        assert len(snapshots) == 2
        assert snapshots[0]["resources"][0]["id"] == "r1"
    finally:
        if original is None: sys.modules.pop("requests", None)
        else: sys.modules["requests"] = original


def test_inventory_drift_compares_recent_snapshots(monkeypatch, data_dir):
    from services import byoc
    account = byoc.create_account({"name": "h", "provider": "hetzner", "credentials": {"hcloud_token": "x"}})
    snapshots = [{"id": "new", "resources": [{"id": "r2"}]}, {"id": "old", "resources": [{"id": "r1"}]}]
    monkeypatch.setattr(byoc, "list_inventory_snapshots", lambda account_id, limit=20: snapshots)
    drift = byoc.inventory_drift(account["id"])
    assert drift["drifted"] is True
    assert drift["added"] == ["r2"]
    assert drift["removed"] == ["r1"]


def test_managed_resource_tracking_and_release(monkeypatch, data_dir):
    from services import byoc
    account = byoc.create_account({"name": "h", "provider": "hetzner", "credentials": {"hcloud_token": "x"}})
    monkeypatch.setattr(byoc, "get_inventory", lambda _: {"resources": [{"id": "r1", "address": "hcloud_server.one", "type": "server"}]})
    managed = byoc.set_resource_management(account["id"], ["r1"], True)
    assert managed["managed_count"] == 1
    assert byoc.list_managed_resources(account["id"])[0]["resource_id"] == "r1"
    released = byoc.set_resource_management(account["id"], ["r1"], False)
    assert released["managed_count"] == 0
    assert byoc.list_managed_resources(account["id"]) == []


def test_import_rejects_duplicates_and_stale_ids(monkeypatch, data_dir):
    from services import byoc
    account=byoc.create_account({"name":"h","provider":"hetzner","credentials":{"hcloud_token":"x"}})
    monkeypatch.setattr(byoc,"get_inventory",lambda _: {"resources":[{"id":"r1","address":"hcloud_server.one","type":"server"}]})
    import pytest
    with pytest.raises(ValueError, match="duplicate"):
        byoc.generate_import(account["id"],["r1","r1"])
    with pytest.raises(ValueError, match="latest inventory"):
        byoc.generate_import(account["id"],["stale"])
