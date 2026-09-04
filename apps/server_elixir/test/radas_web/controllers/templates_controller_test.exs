defmodule RadasWeb.TemplatesControllerTest do
  use Radas.DataCase, async: false

  # Contract tests for the templates catalog + render + the lean
  # /api/run_ansible execution-record creation.
  import Phoenix.ConnTest
  import Plug.Conn

  @endpoint RadasWeb.Endpoint
  @jwt_secret "tpl-e2e-jwt-000000"
  @project "proj-tpl-e2e"

  setup do
    System.put_env("JWT_SECRET_KEY", @jwt_secret)
    data_dir = Path.join(System.tmp_dir!(), "radas-tpl-#{System.unique_integer()}")
    System.put_env("DATA_DIR", data_dir)

    on_exit(fn ->
      System.delete_env("JWT_SECRET_KEY")
      System.delete_env("DATA_DIR")
      File.rm_rf!(data_dir)
    end)

    RadasAI.DB.execute!(
      "INSERT INTO orgs (id, name, created_at) VALUES ('org-tpl-e2e', 'Tpl Org', 0) ON CONFLICT (id) DO NOTHING",
      []
    )

    RadasAI.DB.execute!(
      "INSERT INTO projects (id, name, org_id) VALUES ($1, 'Tpl Proj', 'org-tpl-e2e') ON CONFLICT (id) DO NOTHING",
      [@project]
    )

    token =
      RadasAI.AuthToken.encode(
        %{"user_id" => "tpl-user", "username" => "tpl", "roles" => [], "token_type" => "access", "exp" => System.system_time(:second) + 600, "iat" => System.system_time(:second)},
        @jwt_secret
      )

    {:ok, conn: build_conn() |> put_req_header("authorization", "Bearer " <> token)}
  end

  test "GET /api/templates lists the catalog (generic first-class)", %{conn: conn} do
    conn = dispatch(conn, @endpoint, :get, "/api/templates", nil)
    assert conn.status == 200
    templates = Jason.decode!(conn.resp_body)["templates"]
    assert Enum.any?(templates, &(&1["id"] == "generic"))
  end

  test "GET template detail; unknown → 404", %{conn: conn} do
    conn = dispatch(conn, @endpoint, :get, "/api/templates/generic", nil)
    assert conn.status == 200
    assert Jason.decode!(conn.resp_body)["id"] == "generic"

    conn = dispatch(conn, @endpoint, :get, "/api/templates/ghost", nil)
    assert conn.status == 404
  end

  test "render generic template with raw playbook passthrough", %{conn: conn} do
    conn =
      dispatch(conn, @endpoint, :post, "/api/templates/generic/render", %{
        "values" => %{"raw_playbook" => "- hosts: all\n  tasks:\n    - debug: msg=hi"}
      })

    assert conn.status == 200
    body = Jason.decode!(conn.resp_body)
    assert body["yaml"] =~ "debug: msg=hi"
    assert body["template_id"] == "generic"
    assert is_binary(body["filename"])
  end

  test "render generic template composes play from fields", %{conn: conn} do
    conn =
      dispatch(conn, @endpoint, :post, "/api/templates/generic/render", %{
        "values" => %{"name" => "Install nginx", "hosts" => "web", "become" => true, "vars" => %{"port" => 80}, "raw_tasks" => "- apt: name=nginx"}
      })

    assert conn.status == 200
    yaml = Jason.decode!(conn.resp_body)["yaml"]
    assert yaml =~ "hosts: web"
    assert yaml =~ "become: true"
    assert yaml =~ "vars:"
    assert yaml =~ "apt: name=nginx"
  end

  test "render unknown template → 400", %{conn: conn} do
    conn = dispatch(conn, @endpoint, :post, "/api/templates/ghost/render", %{"values" => %{}})
    assert conn.status == 400
  end

  test "POST /api/run_ansible creates a QUEUED execution record", %{conn: conn} do
    RadasAI.DB.execute!(
      "INSERT INTO projects (id, name, org_id) VALUES ($1, 'Tpl', 'org-tpl-e2e') ON CONFLICT (id) DO NOTHING",
      [@project]
    )

    conn =
      dispatch(conn, @endpoint, :post, "/api/run_ansible", %{
        "project_id" => @project,
        "playbook_name" => "deploy.yml",
        "selected_hosts" => ["host-1"]
      })

    assert conn.status == 200
    body = Jason.decode!(conn.resp_body)
    assert body["success"] == true
    assert body["status"] == "QUEUED"

    execution = RadasAI.Executions.get_execution(body["execution_id"], @project)
    assert execution["status"] == "QUEUED"
    assert execution["playbookName"] == "deploy.yml"
  end

  test "run_ansible without hosts is rejected", %{conn: conn} do
    conn =
      dispatch(conn, @endpoint, :post, "/api/run_ansible", %{
        "project_id" => @project,
        "playbook_name" => "deploy.yml",
        "selected_hosts" => []
      })

    assert conn.status == 400
    assert Jason.decode!(conn.resp_body)["error"] =~ "host"
  end
end
