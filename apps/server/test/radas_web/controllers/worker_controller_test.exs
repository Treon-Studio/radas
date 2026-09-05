defmodule RadasWeb.WorkerControllerTest do
  use Radas.DataCase, async: false

  # Contract tests for the Go worker protocol slice served by Elixir
  # (register / heartbeat / system-info) with token interoperability: tokens
  # minted here verify in Flask's index (same worker_tokens table + hash
  # scheme) and vice versa.
  import Phoenix.ConnTest
  import Plug.Conn

  @endpoint RadasWeb.Endpoint
  @reg_secret "worker-reg-e2e-000000000000"

  setup do
    System.put_env("WORKER_REGISTRATION_SECRET", @reg_secret)
    data_dir = Path.join(System.tmp_dir!(), "radas-worker-#{System.unique_integer()}")
    System.put_env("DATA_DIR", data_dir)

    on_exit(fn ->
      System.delete_env("WORKER_REGISTRATION_SECRET")
      System.delete_env("DATA_DIR")
      File.rm_rf!(data_dir)
    end)

    {:ok, conn: build_conn(), data_dir: data_dir}
  end

  # Raw dispatch so custom headers survive (post/3 recycles away
  # x-worker-registration-secret).
  defp worker_post(headers, path, body \\ %{}) do
    conn =
      Enum.reduce(headers, build_conn(), fn {k, v}, acc ->
        put_req_header(acc, k, v)
      end)

    dispatch(conn, @endpoint, :post, path, body)
  end

  defp register(headers \\ [{"x-worker-registration-secret", @reg_secret}], body \\ %{"name" => "go-worker-e2e"}) do
    conn = worker_post(headers, "/api/worker/register", body)
    {conn, Jason.decode!(conn.resp_body)}
  end

  test "register with the secret returns workerId + workerToken and persists the index", %{data_dir: data_dir} do
    {conn, body} = register()
    assert conn.status == 200
    assert body["success"] == true
    assert is_binary(body["workerId"])
    assert is_binary(body["workerToken"])

    # Token file contract (worker side): profile persisted, hash scheme matches.
    profile_path = Path.join([data_dir, "workers", body["workerId"] <> ".json"])
    assert File.exists?(profile_path)
    profile = Jason.decode!(File.read!(profile_path))
    expected_hash = Base.encode16(:crypto.hash(:sha256, body["workerToken"] <> profile["tokenSalt"]), case: :lower)
    assert profile["tokenHash"] == expected_hash

    # Postgres token index row exists (shared with Flask).
    assert [_row] =
             RadasAI.DB.query_all!("SELECT worker_id FROM worker_tokens WHERE worker_id = $1", [body["workerId"]])
  end

  test "register without any secret is rejected" do
    {conn, body} = register([], %{"name" => "sneaky"})
    assert conn.status == 401
    assert body["error"] =~ "Authentication required"
  end

  test "register with a wrong secret is rejected" do
    {conn, _body} = register([{"x-worker-registration-secret", "wrong"}], %{"name" => "sneaky"})
    assert conn.status == 403
  end

  test "register without a name is rejected" do
    {conn2, body2} = register([{"x-worker-registration-secret", @reg_secret}], %{})
    assert conn2.status == 400
    assert body2["error"] == "Worker name is required"
  end

  test "heartbeat with the minted token returns workerId; system-info round trip clears the flag" do
    {conn, body} = register()
    assert conn.status == 200
    token = body["workerToken"]
    worker_id = body["workerId"]

    {:ok, _} = Application.ensure_all_started(:radas)
    RadasAI.WorkerRegistry.request_system_info(worker_id)

    conn1 = worker_post([{"authorization", "Bearer " <> token}], "/api/worker/heartbeat")
    assert conn1.status == 200
    body1 = Jason.decode!(conn1.resp_body)
    assert body1["success"] == true
    assert body1["workerId"] == worker_id
    assert body1["requestSystemInfo"] == true

    conn2 = worker_post([{"authorization", "Bearer " <> token}], "/api/worker/system-info", %{"systemInfo" => %{"os" => "linux"}})
    assert conn2.status == 200
    assert Jason.decode!(conn2.resp_body)["success"] == true

    conn3 = worker_post([{"authorization", "Bearer " <> token}], "/api/worker/heartbeat")
    assert Jason.decode!(conn3.resp_body)["requestSystemInfo"] == false
  end

  test "invalid worker token is rejected with the exact Go-expected body" do
    conn = worker_post([{"authorization", "Bearer not-a-real-token"}], "/api/worker/heartbeat")
    assert conn.status == 401
    assert Jason.decode!(conn.resp_body) == %{"success" => false, "error" => "Invalid worker token"}
  end

  test "token minted here verifies through the same verify_token Flask uses" do
    {_conn, body} = register()
    {worker_id, worker} = RadasAI.WorkerRegistry.verify_token(body["workerToken"])
    assert worker_id == body["workerId"]
    assert worker["name"] == "go-worker-e2e"
  end
end
