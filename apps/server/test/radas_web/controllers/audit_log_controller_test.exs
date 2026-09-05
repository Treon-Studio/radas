defmodule RadasWeb.AuditLogControllerTest do
  use Radas.DataCase, async: false

  # Contract tests for /api/audit-log (port of apps/server audit-log tests):
  # project-scoped access (owner/admin read), list/search/export/prune over
  # the shared audit_log table.
  import Phoenix.ConnTest
  import Plug.Conn

  @endpoint RadasWeb.Endpoint
  @jwt_secret "aud-e2e-jwt-000000"
  @project "proj-aud-e2e"

  setup do
    System.put_env("JWT_SECRET_KEY", @jwt_secret)

    RadasAI.DB.execute!(
      "INSERT INTO orgs (id, name, created_at) VALUES ('org-aud-e2e', 'Aud Org', 0) ON CONFLICT (id) DO NOTHING",
      []
    )

    RadasAI.DB.execute!(
      "INSERT INTO projects (id, name, org_id) VALUES ($1, 'Aud Proj', 'org-aud-e2e') ON CONFLICT (id) DO NOTHING",
      [@project]
    )

    RadasAI.DB.execute!(
      "INSERT INTO org_members (org_id, user_id, role, created_at) VALUES ('org-aud-e2e', 'aud-admin', 'admin', 0) ON CONFLICT (org_id, user_id) DO NOTHING",
      []
    )

    RadasAI.DB.execute!(
      "INSERT INTO org_members (org_id, user_id, role, created_at) VALUES ('org-aud-e2e', 'aud-viewer', 'viewer', 0) ON CONFLICT (org_id, user_id) DO NOTHING",
      []
    )

    token = token_for("aud-admin")
    viewer_token = token_for("aud-viewer")

    conn =
      build_conn()
      |> put_req_header("authorization", "Bearer " <> token)
      |> put_req_header("x-project-id", @project)

    viewer_conn =
      build_conn()
      |> put_req_header("authorization", "Bearer " <> viewer_token)
      |> put_req_header("x-project-id", @project)

    RadasAI.AuditEvents.record_audit_event("cloud.run.queued",
      actor_user_id: "aud-admin",
      target_type: "execution",
      target_id: "exec-1",
      meta: %{"project_id" => @project, "stack_name" => "web-dev"}
    )

    {:ok, conn: conn, viewer_conn: viewer_conn}
  end

  defp token_for(user_id) do
    RadasAI.AuthToken.encode(
      %{"user_id" => user_id, "username" => user_id, "roles" => [], "token_type" => "access", "exp" => System.system_time(:second) + 600, "iat" => System.system_time(:second)},
      @jwt_secret
    )
  end

  test "audit access requires owner/admin; viewer denied", %{conn: conn, viewer_conn: viewer_conn} do
    c = dispatch(conn, @endpoint, :get, "/api/audit-log", nil)
    assert c.status == 200
    assert Jason.decode!(c.resp_body)["success"] == true

    c = dispatch(viewer_conn, @endpoint, :get, "/api/audit-log", nil)
    assert c.status == 403
    assert Jason.decode!(c.resp_body)["error"] == "Audit access denied"
  end

  test "list filters by project via meta_json and target filters", %{conn: conn} do
    RadasAI.AuditEvents.record_audit_event("state.force_unlock",
      actor_user_id: "aud-admin",
      target_type: "stack",
      target_id: "st-1",
      meta: %{"project_id" => @project}
    )

    c = dispatch(conn, @endpoint, :get, "/api/audit-log", nil)
    entries = Jason.decode!(c.resp_body)["entries"]
    assert Enum.any?(entries, &(&1["action"] == "cloud.run.queued"))
    assert Enum.any?(entries, &(&1["action"] == "state.force_unlock"))
    # Meta arrives decoded (project scoping rides meta_json).
    assert hd(Enum.filter(entries, &(&1["action"] == "cloud.run.queued")))["meta"]["project_id"] == @project

    c = dispatch(conn, @endpoint, :get, "/api/audit-log?target_type=stack", nil)
    entries = Jason.decode!(c.resp_body)["entries"]
    assert Enum.all?(entries, &(&1["target_type"] == "stack"))
  end

  test "search filters by query substring", %{conn: conn} do
    c = dispatch(conn, @endpoint, :get, "/api/audit-log/search?query=force_unlock", nil)
    assert c.status == 200
    body = Jason.decode!(c.resp_body)
    assert body["success"] == true
    assert Enum.all?(body["entries"], &(&1["action"] =~ "force_unlock"))
  end

  test "export jsonl and csv", %{conn: conn} do
    c = dispatch(conn, @endpoint, :get, "/api/audit-log/export", nil)
    assert c.status == 200
    assert get_resp_header(c, "content-disposition") |> hd() =~ "audit-export.jsonl"

    c = dispatch(conn, @endpoint, :get, "/api/audit-log/export?format=csv", nil)
    assert c.status == 200
    assert c.resp_body =~ "id,actor_user_id,action"
  end

  test "prune deletes old entries only", %{conn: conn} do
    RadasAI.DB.execute!(
      "INSERT INTO audit_log (actor_user_id, action, target_type, target_id, meta_json, created_at) " <>
        "VALUES ('old', 'legacy.run', 'execution', 'exec-old', '{\"project_id\":\"" <> @project <> "\"}', '2000-01-01T00:00:00Z')",
      []
    )

    c = dispatch(conn, @endpoint, :post, "/api/audit-log/prune", %{"retention_days" => 30})
    assert c.status == 200
    body = Jason.decode!(c.resp_body)
    assert body["deleted_count"] >= 1

    c = dispatch(conn, @endpoint, :get, "/api/audit-log?target_id=exec-old", nil)
    assert Jason.decode!(c.resp_body)["count"] == 0
  end

  test "missing project scope rejected", %{conn: _conn} do
    token = token_for("aud-admin")

    c =
      build_conn()
      |> put_req_header("authorization", "Bearer " <> token)
      |> dispatch(@endpoint, :get, "/api/audit-log", nil)

    assert c.status == 422
    assert Jason.decode!(c.resp_body)["error"] == "X-Project-Id is required"
  end
end
