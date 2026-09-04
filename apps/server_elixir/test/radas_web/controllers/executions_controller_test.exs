defmodule RadasWeb.ExecutionsControllerTest do
  use Radas.DataCase, async: false

  # Contract tests for the /api/executions/* surface (JWT via Plugs.Auth),
  # plus the worker-token verify path used by the Go worker for log/finish.
  import Phoenix.ConnTest
  import Plug.Conn

  @endpoint RadasWeb.Endpoint
  @jwt_secret "exec-e2e-jwt-000000"
  @project "proj-exec-e2e"

  setup do
    System.put_env("JWT_SECRET_KEY", @jwt_secret)
    data_dir = Path.join(System.tmp_dir!(), "radas-exec-#{System.unique_integer()}")
    System.put_env("DATA_DIR", data_dir)

    on_exit(fn ->
      System.delete_env("JWT_SECRET_KEY")
      System.delete_env("DATA_DIR")
      File.rm_rf!(data_dir)
    end)

    RadasAI.DB.execute!(
      "INSERT INTO orgs (id, name, created_at) VALUES ('org-exec-e2e', 'Exec Org', 0) ON CONFLICT (id) DO NOTHING",
      []
    )

    RadasAI.DB.execute!(
      "INSERT INTO projects (id, name, org_id) VALUES ($1, 'Exec Proj', 'org-exec-e2e') ON CONFLICT (id) DO NOTHING",
      [@project]
    )

    RadasAI.DB.execute!("DELETE FROM executions WHERE project_id = $1", [@project])

    token =
      RadasAI.AuthToken.encode(
        %{"user_id" => "exec-user", "username" => "exec", "roles" => [], "token_type" => "access", "exp" => System.system_time(:second) + 600, "iat" => System.system_time(:second)},
        @jwt_secret
      )

    conn = build_conn() |> put_req_header("authorization", "Bearer " <> token)
    {:ok, conn: conn, token: token}
  end

  defp seed_execution(id, status \\ "QUEUED", extra \\ %{}) do
    now = RadasAI.DB.now()

    execution =
      Map.merge(
        %{
          "id" => id,
          "projectId" => @project,
          "status" => status,
          "playbookName" => "deploy.yml",
          "createdAt" => now - 10,
          "selectionSnapshot" => %{"playbookId" => "pb-1"}
        },
        Map.new(extra)
      )

    RadasAI.Executions.upsert_row(id, @project, execution)

    execution
  end

  defp fresh_conn(token, project_id) do
    build_conn()
    |> put_req_header("authorization", "Bearer " <> token)
    |> put_req_header("x-project-id", project_id)
  end

  test "GET list requires auth" do
    conn = build_conn() |> get("/api/executions")
    assert conn.status == 401
  end

  test "GET list returns executions for the project", %{conn: conn} do
    seed_execution("exec-list-1")

    IO.puts("DBG_ROWS=#{RadasAI.DB.query_all!("SELECT id, data->>'status' AS s, data->>'projectId' AS p FROM executions", []) |> inspect(limit: 200)}")
    IO.puts("DBG_HDR=#{conn |> get_req_header("x-project-id") |> inspect()}")
    conn = dispatch(conn |> put_req_header("x-project-id", @project), @endpoint, :get, "/api/executions", nil)
    assert conn.status == 200
    body = Jason.decode!(conn.resp_body)
    IO.puts("DBG_BODY=#{inspect(body)}")
    assert [%{"id" => "exec-list-1"}] = body["executions"]
  end

  test "POST create + GET show round trip", %{conn: conn, token: token} do
    conn =
      dispatch(
        conn |> put_req_header("x-project-id", @project),
        @endpoint,
        :post,
        "/api/executions",
        %{"playbookName" => "pb.yml"}
      )

    assert conn.status == 200
    %{"executionId" => id} = Jason.decode!(conn.resp_body)

    IO.puts("DBG_CREATED=#{id}")
    IO.puts("DBG_DIRECT=#{inspect(RadasAI.Executions.get_execution(id, @project))}")
    IO.puts("DBG_ROW=#{inspect(RadasAI.DB.query_all!("SELECT id, project_id FROM executions WHERE id = $1", [id]))}")
    conn = dispatch(fresh_conn(token, @project), @endpoint, :get, "/api/executions/#{id}", nil)
    IO.puts("DBG_SHOW=#{conn.status} #{String.slice(conn.resp_body, 0, 200)}")
    assert Jason.decode!(conn.resp_body)["execution"]["status"] == "QUEUED"
  end

  test "PATCH updates the record", %{conn: conn} do
    seed_execution("exec-patch")

    conn =
      dispatch(
        conn |> put_req_header("x-project-id", @project),
        @endpoint,
        :patch,
        "/api/executions/exec-patch",
        %{"priority" => 5}
      )

    assert conn.status == 200
    assert RadasAI.Executions.get_execution("exec-patch", @project)["priority"] == 5
  end

  test "cancel QUEUED → CANCELED releases the lease; wrong state → 409", %{conn: conn} do
    seed_execution("exec-cancel")
    RadasAI.Admission.admit(@project, limit: 5, kind: "legacy_execution", reference_id: "exec-cancel")

    conn =
      dispatch(conn, @endpoint, :post, "/api/projects/#{@project}/executions/exec-cancel/cancel", %{})

    assert conn.status == 200
    assert Jason.decode!(conn.resp_body)["status"] == "CANCELED"
    assert RadasAI.ExecutionClaim.active_runs_count("someone") == 0

    # Cancel again → 409 (already CANCELED, a final state).
    conn2 = dispatch(conn, @endpoint, :post, "/api/projects/#{@project}/executions/exec-cancel/cancel", %{})
    assert conn2.status == 409
  end

  test "stop QUEUED → 409 (must go through CANCELING); RUNNING → CANCELING", %{conn: conn} do
    seed_execution("exec-stop-queued")
    seed_execution("exec-stop-running", "RUNNING", %{"workerId" => "w1"})

    conn = dispatch(conn, @endpoint, :post, "/api/projects/#{@project}/executions/exec-stop-queued/stop", %{})

    assert conn.status == 409

    conn = dispatch(conn, @endpoint, :post, "/api/projects/#{@project}/executions/exec-stop-running/stop", %{})

    assert conn.status == 200
    assert Jason.decode!(conn.resp_body)["status"] == "CANCELING"
  end

  test "log append + incremental GET with offset tracking", %{conn: conn, token: token} do
    seed_execution("exec-logs", "RUNNING", %{"workerId" => "w-log"})

    {worker_id, worker_token} = RadasAI.WorkerRegistry.create_worker("w-log")
    # Point the execution at the real worker uuid (ownership check).
    RadasAI.Executions.update_execution_record("exec-logs", %{"workerId" => worker_id}, @project)

    # Worker appends via the worker protocol.
    conn =
      dispatch(
        build_conn() |> put_req_header("authorization", "Bearer " <> worker_token),
        @endpoint,
        :post,
        "/api/worker/executions/exec-logs/log",
        %{"text" => "TASK [debug] ok:1"}
      )

    assert conn.status == 200

    conn2 =
      dispatch(
        fresh_conn(token, @project),
        @endpoint,
        :get,
        "/api/executions/exec-logs/log",
        %{"offset" => "0"}
      )

    body = Jason.decode!(conn2.resp_body)
    assert body["success"] == true
    assert body["text"] =~ "TASK [debug]"
    assert body["fileSize"] > 0

    # Parsed logs view with level detection.
    conn3 =
      dispatch(
        fresh_conn(token, @project),
        @endpoint,
        :get,
        "/api/executions/exec-logs/logs",
        nil
      )

    lines = Jason.decode!(conn3.resp_body)["lines"]
    # "ok:" classifies as success (Python parity)
    assert hd(lines)["level"] == "success"
  end

  test "log stream SSE emits chunk frames", %{conn: conn, token: token} do
    seed_execution("exec-stream", "RUNNING")
    append_result = RadasAI.Executions.append_execution_log("exec-stream", "line-1\n", @project)
    IO.puts("DBG_APPEND=#{inspect(append_result)}")

    conn =
      dispatch(
        build_conn() |> put_req_header("authorization", "Bearer " <> token),
        @endpoint,
        :get,
        "/api/executions/exec-stream/log/stream",
        %{"offset" => "0", "project_id" => @project}
      )

    assert conn.status == 200
    assert conn.resp_body =~ ~s("type":"chunk")
    assert conn.resp_body =~ "line-1"
  end

  test "stats and settings", %{conn: conn, token: token} do
    seed_execution("exec-stats-1")
    seed_execution("exec-stats-2", "SUCCESS")

    conn = dispatch(fresh_conn(token, @project), @endpoint, :get, "/api/executions/stats", nil)
    stats = Jason.decode!(conn.resp_body)["stats"]
    assert stats["queued"] >= 1
    assert stats["success"] >= 1

    conn = build_conn() |> get("/api/execution_settings")
    assert conn.status == 200
    assert Jason.decode!(conn.resp_body)["settings"]["save_history"] == true

    conn = build_conn() |> post("/api/execution_settings", %{"save_history" => false})
    assert Jason.decode!(conn.resp_body)["settings"]["save_history"] == false
  end

  test "clear deletes all executions for the project", %{conn: conn, token: token} do
    seed_execution("exec-clear-1")
    seed_execution("exec-clear-2")

    :ok

    # clear is project-scoped via header
    conn2 = dispatch(fresh_conn(token, @project), @endpoint, :post, "/api/executions/clear", %{})
    assert Jason.decode!(conn2.resp_body)["deletedCount"] >= 2
    assert RadasAI.ExecutionHistory.get_execution_stats(@project)["total"] == 0
  end
end
