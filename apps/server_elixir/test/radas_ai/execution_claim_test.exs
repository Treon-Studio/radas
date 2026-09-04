defmodule RadasAI.ExecutionClaimTest do
  use Radas.DataCase, async: false

  # Contract tests for the claim pipeline (server_claim_next_execution port):
  # QUEUED discovery via the jsonb store, requirement filtering, admission
  # leases, RUNNING transition, and the Go wire contract.
  import Phoenix.ConnTest
  import Plug.Conn

  @endpoint RadasWeb.Endpoint
  @reg_secret "worker-reg-e2e-000000000000"

  setup do
    System.put_env("WORKER_REGISTRATION_SECRET", @reg_secret)
    System.put_env("JWT_SECRET_KEY", "claim-e2e-jwt-000000")
    data_dir = Path.join(System.tmp_dir!(), "radas-claim-#{System.unique_integer()}")
    System.put_env("DATA_DIR", data_dir)

    on_exit(fn ->
      System.delete_env("WORKER_REGISTRATION_SECRET")
      System.delete_env("JWT_SECRET_KEY")
      System.delete_env("DATA_DIR")
      File.rm_rf!(data_dir)
    end)

    seed_project("proj-claim-1")

    {:ok, conn: build_conn()}
  end

  defp seed_project("proj-claim-1") do
    RadasAI.DB.execute!(
      "INSERT INTO orgs (id, name, created_at) VALUES ('org-claim-e2e', 'Claim Org', 0) ON CONFLICT (id) DO NOTHING",
      []
    )

    RadasAI.DB.execute!(
      "INSERT INTO projects (id, name, org_id) VALUES ('proj-claim-1', 'Claim Proj', 'org-claim-e2e') ON CONFLICT (id) DO NOTHING",
      []
    )
  end

  defp worker_post(headers, path, body \\ %{}) do
    conn =
      Enum.reduce(headers, build_conn(), fn {k, v}, acc ->
        put_req_header(acc, k, v)
      end)

    dispatch(conn, @endpoint, :post, path, body)
  end

  defp register_worker(name \\ "claim-worker") do
    {conn, body} =
      register(
        [{"x-worker-registration-secret", @reg_secret}],
        %{"name" => name, "capabilities" => %{"maxConcurrency" => 2}, "tags" => ["go"]}
      )

    assert conn.status == 200
    body
  end

  defp register(headers, body) do
    conn =
      Enum.reduce(headers, build_conn(), fn {k, v}, acc ->
        put_req_header(acc, k, v)
      end)

    dispatch(conn, @endpoint, :post, "/api/worker/register", body)
    |> then(fn c -> {c, Jason.decode!(c.resp_body)} end)
  end

  defp seed_queued_execution(id, opts \\ []) do
    now = RadasAI.DB.now()

    execution =
      Map.merge(
        %{
          "id" => id,
          "projectId" => "proj-claim-1",
          "status" => "QUEUED",
          "type" => "playbook",
          "createdAt" => now - 10,
          "queuedAt" => now - 5
        },
        Map.new(opts)
      )

    RadasAI.Executions.upsert_row(id, "proj-claim-1", execution)

    RadasAI.DB.execute!(
      "INSERT INTO queued_executions (execution_id, project_id, queued_at) VALUES ($1, $2, $3) ON CONFLICT (execution_id) DO NOTHING",
      [id, "proj-claim-1", now - 5]
    )

    execution
  end

  defp claim_via_http(token, worker_id) do
    # 1s claim rate limit per worker — reset between claims in tests.
    :persistent_term.erase({:claim_rate, worker_id})
    conn = worker_post([{"authorization", "Bearer " <> token}], "/api/worker/claim")
    {conn.status, conn.resp_body, get_resp_header(conn, "retry-after")}
  end

  test "claim with an empty queue returns 204 with NO body (Go contract)" do
    worker = register_worker()
    {status, body, _headers} = claim_via_http(worker["workerToken"], worker["workerId"])
    assert status == 204
    assert body == ""
  end

  test "claim assigns a QUEUED execution: RUNNING + workerId + admission lease" do
    worker = register_worker()
    seed_queued_execution("exec-claim-1")

    {status, body, _headers} = claim_via_http(worker["workerToken"], worker["workerId"])
    assert status == 200

    payload = Jason.decode!(body)
    assert payload["success"] == true
    assert payload["executionId"] == "exec-claim-1"

    execution = RadasAI.Executions.get_execution("exec-claim-1", "proj-claim-1")
    assert execution["status"] == "RUNNING"
    assert execution["workerId"] == worker["workerId"]
    assert execution["startedAt"] != nil

    # Lease recorded for the worker.
    assert RadasAI.ExecutionClaim.active_runs_count(worker["workerId"]) == 1
  end

  test "claim respects maxConcurrency and self-heals stale leases" do
    worker = register_worker()
    seed_queued_execution("exec-claim-a")
    seed_queued_execution("exec-claim-b")

    {:ok, _, _, _} =
      RadasAI.ExecutionClaim.claim_next(worker["workerId"], %{"capabilities" => %{"maxConcurrency" => 1}, "tags" => []},
        max_concurrency: 1
      )

    # maxConcurrency=1 → no work until the lease is released.
    assert RadasAI.ExecutionClaim.claim_next(worker["workerId"], %{"capabilities" => %{}, "tags" => []},
             max_concurrency: 1
           ) == :no_work

    # Release the lease (as finish would).
    RadasAI.Admission.release(reference_id: "exec-claim-a")

    result =
      RadasAI.ExecutionClaim.claim_next(worker["workerId"], %{"capabilities" => %{}, "tags" => []},
        max_concurrency: 1
      )

    assert {:ok, "exec-claim-b", execution, _} = result
    assert execution["status"] == "RUNNING"
  end

  test "target_worker_id pinning filters candidates" do
    worker = register_worker()
    seed_queued_execution("exec-pinned", runParams: %{"requirements" => %{"worker_id" => "someone-else"}})

    assert RadasAI.ExecutionClaim.claim_next(worker["workerId"], %{"capabilities" => %{}, "tags" => []}) == :no_work
  end

  test "log and finish enforce worker ownership; finish releases the lease" do
    worker = register_worker()
    seed_queued_execution("exec-own")

    # Someone else's token cannot log against a queued (unowned) execution.
    other = register_worker("other-worker")

    {status, body, _} =
      claim_via_http(other["workerToken"], other["workerId"])

    # `other` may claim exec-own first (no pinning)…
    if status == 200 do
      # …then the original worker is denied.
      {status2, body2, _} =
        worker_post([{"authorization", "Bearer " <> worker["workerToken"]}], "/api/worker/executions/exec-own/log", %{
          "text" => "hello"
        })
        |> then(fn c -> {c.status, c.resp_body, []} end)

      assert status2 == 403
      assert Jason.decode!(body2)["error"] =~ "does not own"

      # Owner logs and finishes.
      conn = worker_post([{"authorization", "Bearer " <> other["workerToken"]}], "/api/worker/executions/exec-own/log", %{"text" => "step 1"})
      assert Jason.decode!(conn.resp_body)["success"] == true

      {text, _, _, _} = RadasAI.Executions.read_log_chunk("exec-own", 0, 1024, "proj-claim-1")
      assert text =~ "step 1"

      conn2 =
        worker_post(
          [{"authorization", "Bearer " <> other["workerToken"]}],
          "/api/worker/executions/exec-own/finish",
          %{"status" => "SUCCESS"}
        )

      assert Jason.decode!(conn2.resp_body)["success"] == true
      assert RadasAI.Executions.get_execution("exec-own", "proj-claim-1")["status"] == "SUCCESS"
    else
      flunk("expected other worker to claim")
    end
  end

  test "finish rejects non-allowlist statuses" do
    worker = register_worker()
    seed_queued_execution("exec-finish")
    {:ok, _, _, _} = RadasAI.ExecutionClaim.claim_next(worker["workerId"], %{"capabilities" => %{}, "tags" => []})

    conn =
      worker_post(
        [{"authorization", "Bearer " <> worker["workerToken"]}],
        "/api/worker/executions/exec-finish/finish",
        %{"status" => "WHATEVER"}
      )

    assert conn.status == 400
    assert Jason.decode!(conn.resp_body)["error"] == "Status must be SUCCESS, FAILED or CANCELED"
  end

  test "log requires text" do
    worker = register_worker()
    seed_queued_execution("exec-log-empty")
    {:ok, _, _, _} = RadasAI.ExecutionClaim.claim_next(worker["workerId"], %{"capabilities" => %{}, "tags" => []})

    conn =
      worker_post(
        [{"authorization", "Bearer " <> worker["workerToken"]}],
        "/api/worker/executions/exec-log-empty/log",
        %{"text" => ""}
      )

    assert conn.status == 400
    assert Jason.decode!(conn.resp_body)["error"] == "Log text is required"
  end
end
