"""BYOC health-check scheduling + credential rotation (UC 289/290/301)."""
from __future__ import annotations

import time

def _acct(data_dir, provider="hetzner"):
    from services.byoc import create_account
    return create_account({"name": "h", "provider": provider,
                           "regions": ["fsn1"],
                           "credentials": {"hcloud_token": "tok"}})


def test_check_due_accounts_empty(data_dir):
    from services.byoc import check_due_accounts
    assert check_due_accounts() == []

def test_check_due_accounts_skips_fresh(data_dir):
    from services.byoc import _load, _save, check_due_accounts
    _acct(data_dir)
    items = _load()
    for a in items:
        a["last_check"] = int(time.time())
    _save(items)
    assert check_due_accounts(now=int(time.time()) + 1) == []

def test_check_due_accounts_includes_stale(data_dir, monkeypatch):
    from services.byoc import _load, _save, check_due_accounts
    _acct(data_dir)
    for a in _load():
        a["last_check"] = 0
    _save(_load())
    monkeypatch.setattr("services.byoc.validate_account",
                        lambda aid: {"ok": True, "status": 200, "detail": "mocked"})
    due = check_due_accounts(now=int(time.time()) + 7200)
    assert len(due) == 1 and due[0]["ok"] is True

def test_rotate_credentials_updates_encrypted(data_dir):
    from services.byoc import create_account, get_account, rotate_credentials, list_accounts
    acct = create_account({"name": "r", "provider": "hetzner", "regions": ["fsn1"],
                           "credentials": {"hcloud_token": "old"}})
    rot = rotate_credentials(acct["id"], {"hcloud_token": "newtoken"})
    assert rot["status"] == "unverified"
    stored = list_accounts()
    assert stored[0]["has_credentials"] is True
    # decrypted value is new
    from services.byoc import _load, _decrypt
    raw = next(a for a in _load() if a["id"] == acct["id"])
    assert _decrypt(raw["credentials"]["hcloud_token"]) == "newtoken"
