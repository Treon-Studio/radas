defmodule RadasWeb.ApprovalsControllerTest do
  use Radas.DataCase, async: false

  # Contract tests for /api/approvals (UC 50/68/72): create with duplicate
  # rejection, approve auto-queues the apply run (UC 51), reject requires a
  # reason (UC616), TTL expiry (UC615).
  import Phoenix.ConnTest
  import Plug.Conn

  @endpoint RadasWeb.Endpoint
  @jwt_secret "appr-e2e-jwt-000000"
  @project "proj-appr-e2e"

  setup do
    System.put_env("JWT_SECRET_KEY", @jwt_secret)
    System.put_env("GLOBAL_SECRETS_ENCRYPTION_KEY", "appr-test-global-secret")

    data_dir = Path.join(System.tmp_dir!(), "radas-appr-#{System.unique_integer()}")
    System.put_env("DATA_DIR", data_dir)

    on_exit(fn ->
      System.delete_env("JWT_SECRET_KEY")
      System.delete_env("GLOBAL_SECRETS_ENCRYPTION_KEY")
      System.delete_env("DATA_DIR")
      File.rm_rf!(data_dir)
    end)

    token =
      RadasAI.AuthToken.encode(
        %{"user_id" => "appr-user", "username" => "appr", "roles" => [], "token_type" => "access", "exp" => System.system_time(:second) + 600, "iat" => System.system_time(:second)},
        @jwt_secret
      )

    conn =
      build_conn()
      |> put_req_header("authorization", "Bearer " <> token)
      |> put_req_header("x-project-id", @project)

    {:ok, conn: conn}
  end

  test "create, duplicate 409, invalid action 400", %{conn: conn} do
    c =
      dispatch(conn, @endpoint, :post, "/api/approvals", %{
        "stack" => "web-dev",
        "action" => "apply",
        "note" => "prod deploy"
      })

    assert c.status == 201
    %{"approval" => rec} = Jason.decode!(c.resp_body)
    assert rec["status"] == "pending"
    assert rec["requested_by"] == "appr"
    assert rec["expires_at"] > rec["created_at"]

    c =
      dispatch(conn, @endpoint, :post, "/api/approvals", %{
        "stack" => "web-dev",
        "action" => "apply"
      })

    assert c.status == 409

    c =
      dispatch(conn, @endpoint, :post, "/api/approvals", %{
        "stack" => "web-dev",
        "action" => "reboot"
      })

    assert c.status == 400

    c = dispatch(conn, @endpoint, :post, "/api/approvals", %{"action" => "apply"})
    assert c.status == 400
  end

  test "approve auto-queues apply; reject requires reason; unknown 404", %{conn: conn} do
    rec =
      RadasAI.ApprovalService.create_approval("web-dev", @project, "apply", requested_by: "appr")

    c = dispatch(conn, @endpoint, :post, "/api/approvals/#{rec["id"]}/approve", nil)
    assert c.status == 200
    %{"approval" => approved} = Jason.decode!(c.resp_body)
    assert approved["status"] == "approved"
    assert approved["decided_by"] == "appr"

    # UC 51: approving an apply queues the run.
    runs = RadasAI.CloudStacks.all_tofu_runs(@project)
    assert Enum.any?(runs, &(&1["action"] == "apply" and &1["triggered_by"] == "approval:#{rec["id"]}"))

    c =
      dispatch(conn, @endpoint, :post, "/api/approvals/#{rec["id"]}/approve", nil)

    assert c.status == 200

    rec2 = RadasAI.ApprovalService.create_approval("web-dev", @project, "destroy")

    c = dispatch(conn, @endpoint, :post, "/api/approvals/#{rec2["id"]}/reject", %{})
    assert c.status == 400

    c =
      dispatch(conn, @endpoint, :post, "/api/approvals/#{rec2["id"]}/reject", %{
        "reason" => "unsafe window"
      })

    assert c.status == 200
    body = Jason.decode!(c.resp_body)
    assert body["approval"]["status"] == "rejected"
    assert body["approval"]["rejection_reason"] == "unsafe window"

    c = dispatch(conn, @endpoint, :post, "/api/approvals/no-such-id/approve", nil)
    assert c.status == 404
  end

  test "list with status filter + expiry", %{conn: conn} do
    RadasAI.ApprovalService.create_approval("web-dev", @project, "plan")
    rec = RadasAI.ApprovalService.create_approval("api-dev", @project, "plan")

    # Force expiry on one record.
    expired =
      rec
      |> Map.put("expires_at", System.system_time(:second) - 10)

    # Overwrite the store with the expired variant.
    path = Path.join([System.get_env("DATA_DIR"), "approvals.json"])
    existing = Jason.decode!(File.read!(path))
    File.write!(path, Jason.encode!(existing |> Enum.map(&if &1["id"] == rec["id"], do: expired, else: &1)))

    c = dispatch(conn, @endpoint, :get, "/api/approvals?status=expired", nil)
    body = Jason.decode!(c.resp_body)
    assert Enum.any?(body["approvals"], &(&1["id"] == rec["id"] and &1["status"] == "expired"))

    c = dispatch(conn, @endpoint, :get, "/api/approvals?status=pending", nil)
    refute Enum.any?(Jason.decode!(c.resp_body)["approvals"], &(&1["id"] == rec["id"]))
  end
end
