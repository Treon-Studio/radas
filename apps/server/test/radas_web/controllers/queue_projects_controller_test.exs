defmodule RadasWeb.QueueProjectsControllerTest do
  use Radas.DataCase, async: false

  # Contract tests for GET /api/queue (QUEUED executions view) and
  # GET/POST /api/projects (org-scoped platform project list/create).
  import Phoenix.ConnTest
  import Plug.Conn

  @endpoint RadasWeb.Endpoint
  @jwt_secret "qp-e2e-jwt-000000"
  @project "proj-qp-e2e"
  @org "org-qp-e2e"

  setup do
    System.put_env("JWT_SECRET_KEY", @jwt_secret)

    RadasAI.DB.execute!(
      "INSERT INTO orgs (id, name, created_at) VALUES ('#{@org}', 'QP Org', 0) ON CONFLICT (id) DO NOTHING",
      []
    )

    RadasAI.DB.execute!(
      "INSERT INTO projects (id, name, org_id) VALUES ($1, 'QP Proj', '#{@org}') ON CONFLICT (id) DO NOTHING",
      [@project]
    )

    RadasAI.DB.execute!(
      "INSERT INTO org_members (org_id, user_id, role, created_at) VALUES ('#{@org}', 'qp-user', 'owner', 0) ON CONFLICT (org_id, user_id) DO NOTHING",
      []
    )

    RadasAI.DB.execute!("DELETE FROM executions WHERE project_id = $1", [@project])

    token =
      RadasAI.AuthToken.encode(
        %{"user_id" => "qp-user", "username" => "qp", "roles" => [], "token_type" => "access", "exp" => System.system_time(:second) + 600, "iat" => System.system_time(:second)},
        @jwt_secret
      )

    conn =
      build_conn()
      |> put_req_header("authorization", "Bearer " <> token)
      |> put_req_header("x-project-id", @project)

    {:ok, conn: conn}
  end

  defp seed_execution(id, status) do
    RadasAI.ExecutionHistory.create_execution_record(
      %{
        "id" => id,
        "status" => status,
        "playbookName" => "pb.yml",
        "mode" => "PLAYBOOK",
        "runName" => "run",
        "priority" => 0,
        "runParams" => %{}
      },
      @project,
      id
    )
  end

  test "queue returns only QUEUED executions", %{conn: conn} do
    seed_execution("q-1", "QUEUED")
    seed_execution("q-2", "RUNNING")

    c = dispatch(conn, @endpoint, :get, "/api/queue", nil)
    assert c.status == 200
    body = Jason.decode!(c.resp_body)
    assert body["success"] == true
    assert body["count"] == 1
    assert hd(body["queued"])["id"] == "q-1"
  end

  test "projects list scopes to the user's orgs and hides archived", %{conn: conn} do
    c = dispatch(conn, @endpoint, :get, "/api/projects", nil)
    assert c.status == 200
    projects = Jason.decode!(c.resp_body)["projects"]
    assert Enum.any?(projects, &(&1["id"] == @project))
    assert Enum.all?(projects, &(&1["org_id"] == @org))

    # Archived project hidden by default.
    RadasAI.DB.execute!(
      "INSERT INTO projects (id, name, org_id, is_archived) VALUES ('proj-arch', 'Arch', $1, 1) ON CONFLICT (id) DO NOTHING",
      [@org]
    )

    c = dispatch(conn, @endpoint, :get, "/api/projects", nil)
    refute Enum.any?(Jason.decode!(c.resp_body)["projects"], &(&1["id"] == "proj-arch"))

    c = dispatch(conn, @endpoint, :get, "/api/projects?include_archived=true", nil)
    assert Enum.any?(Jason.decode!(c.resp_body)["projects"], &(&1["id"] == "proj-arch"))
  end

  test "project create validates name and stamps the org", %{conn: conn} do
    c = dispatch(conn, @endpoint, :post, "/api/projects", %{"name" => ""})
    assert c.status == 400

    c =
      dispatch(conn, @endpoint, :post, "/api/projects", %{
        "name" => "New Proj",
        "description" => "from contract test"
      })

    assert c.status == 200
    body = Jason.decode!(c.resp_body)
    assert body["project"]["name"] == "New Proj"
    assert body["project"]["org_id"] == @org

    c = dispatch(conn, @endpoint, :get, "/api/projects", nil)
    assert Enum.any?(Jason.decode!(c.resp_body)["projects"], &(&1["name"] == "New Proj"))
  end
end
