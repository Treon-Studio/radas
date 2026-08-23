import json
import pytest
from pathlib import Path


def test_audited_admin_impersonation(pg_db, data_dir, monkeypatch):
    from services.impersonation import impersonate_user
    from services.user_service import UserService
    from storage import pg

    monkeypatch.setenv("DATA_DIR", str(data_dir))
    pg.execute("INSERT INTO roles (id, name) VALUES ('admin', 'admin'), ('viewer', 'viewer') ON CONFLICT DO NOTHING")
    user_svc = UserService(data_dir)

    # 1. Create admin user and normal user
    admin_user = user_svc.create_user("admin_gov", "SuperSecretPass123!", roles=["admin"])
    dev_user = user_svc.create_user("developer_bob", "SuperSecretPass123!", roles=["viewer"])

    # 2. Impersonate developer_bob as admin_gov
    res = impersonate_user(admin_user_id=admin_user.id, target_user_id=dev_user.id, data_dir=data_dir)
    assert res["success"] is True
    assert "token" in res
    assert res["impersonated_user"] == dev_user.id
    assert res["original_admin"] == admin_user.id

    # 3. Verify audit log entry
    audit_rows = pg.query_all(
        "SELECT * FROM audit_log WHERE action = %s AND actor_user_id = %s",
        ("user.impersonate", admin_user.id),
    )
    assert len(audit_rows) >= 1
    assert audit_rows[0]["target_id"] == dev_user.id
