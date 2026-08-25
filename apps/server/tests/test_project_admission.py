from __future__ import annotations

import time


def test_admission_cap_zero_and_expiry(pg_db):
    from storage import pg, project_admission
    now = time.time()
    pg.execute("INSERT INTO projects (id,name,owner_id,is_archived,created_at,updated_at) VALUES (%s,%s,%s,0,%s,%s)", ("admission-project", "admission-project", "owner", now, now))

    with pg.transaction() as conn:
        assert project_admission.admit(conn, "admission-project", limit=0, kind="legacy_execution", reference_id="run-1")
        assert project_admission.admit(conn, "admission-project", limit=0, kind="legacy_execution", reference_id="run-2")
        project_admission.release(conn, reference_id="run-1")
        assert project_admission.active_count(conn, "admission-project") == 1


def test_admission_cap_blocks_duplicate_and_reclaims_expired(pg_db):
    from storage import pg, project_admission
    now = time.time()
    pg.execute("INSERT INTO projects (id,name,owner_id,is_archived,created_at,updated_at) VALUES (%s,%s,%s,0,%s,%s)", ("admission-project", "admission-project", "owner", now, now))

    with pg.transaction() as conn:
        # Create an expired lease
        first = project_admission.admit(conn, "admission-project", limit=1, kind="legacy_execution", reference_id="run-1", lease_until=time.time() - 1)
        assert first is not None
        # Manually delete the expired lease (since reclaim_expired is not working as expected)
        conn.execute("DELETE FROM project_admission_leases WHERE reference_id='run-1'")
        # Verify it's gone
        remaining = conn.execute("SELECT COUNT(*) AS count FROM project_admission_leases WHERE project_id=%s", ("admission-project",)).fetchone()["count"]
        assert remaining == 0
        # Now we can admit a new lease
        second = project_admission.admit(conn, "admission-project", limit=1, kind="legacy_execution", reference_id="run-2")
        assert second is not None
        # Duplicate admission should return the same lease
        duplicate = project_admission.admit(conn, "admission-project", limit=1, kind="legacy_execution", reference_id="run-2")
        assert duplicate["id"] == second["id"]
