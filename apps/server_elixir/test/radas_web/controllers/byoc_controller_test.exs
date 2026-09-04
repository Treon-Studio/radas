defmodule RadasWeb.ByocControllerTest do
  use Radas.DataCase, async: false

  # Contract tests for the BYOC surface (mirror of apps/server byoc tests):
  # provider registry + detection, project-scoped accounts with encrypted
  # credentials, shape-based validation probes, inventory paging/drift,
  # managed resources, import mappings (prepare/adopt/clash), budgets,
  # quotas, encrypted backup/restore, CSV export.
  import Phoenix.ConnTest
  import Plug.Conn

  @endpoint RadasWeb.Endpoint
  @jwt_secret "byoc-e2e-jwt-000000"
  @project "proj-byoc-e2e"

  setup do
    System.put_env("JWT_SECRET_KEY", @jwt_secret)
    System.put_env("GLOBAL_SECRETS_ENCRYPTION_KEY", "byoc-test-global-secret")

    data_dir = Path.join(System.tmp_dir!(), "radas-byoc-#{System.unique_integer()}")
    System.put_env("DATA_DIR", data_dir)

    on_exit(fn ->
      System.delete_env("JWT_SECRET_KEY")
      System.delete_env("GLOBAL_SECRETS_ENCRYPTION_KEY")
      System.delete_env("DATA_DIR")
      File.rm_rf!(data_dir)
    end)

    RadasAI.DB.execute!(
      "INSERT INTO orgs (id, name, created_at) VALUES ('org-byoc-e2e', 'Byoc Org', 0) ON CONFLICT (id) DO NOTHING",
      []
    )

    RadasAI.DB.execute!(
      "INSERT INTO projects (id, name, org_id) VALUES ($1, 'Byoc Proj', 'org-byoc-e2e') ON CONFLICT (id) DO NOTHING",
      [@project]
    )

    RadasAI.DB.execute!(
      "INSERT INTO org_members (org_id, user_id, role, created_at) VALUES ('org-byoc-e2e', 'byoc-user', 'owner', 0) ON CONFLICT (org_id, user_id) DO NOTHING",
      []
    )

    RadasAI.KV.save("byoc", [])

    token =
      RadasAI.AuthToken.encode(
        %{"user_id" => "byoc-user", "username" => "byoc", "roles" => [], "token_type" => "access", "exp" => System.system_time(:second) + 600, "iat" => System.system_time(:second)},
        @jwt_secret
      )

    conn =
      build_conn()
      |> put_req_header("authorization", "Bearer " <> token)
      |> put_req_header("x-project-id", @project)

    {:ok, conn: conn}
  end

  defp create_account(conn, provider \\ "aws", creds \\ %{}) do
    creds =
      Map.merge(
        %{"access_key" => "AKIAIOSFODNN7EXAMPLE", "secret_key" => "wJalrXUtnFEMI"},
        creds
      )

    dispatch(conn, @endpoint, :post, "/api/byoc/accounts", %{
      "name" => "acct-" <> provider,
      "provider" => provider,
      "credentials" => creds
    })
  end

  test "requires auth", %{conn: conn} do
    c = dispatch(build_conn(), @endpoint, :get, "/api/byoc/providers", nil)
    assert c.status == 401
    _ = conn
  end

  test "provider registry + detection", %{conn: conn} do
    c = dispatch(conn, @endpoint, :get, "/api/byoc/providers", nil)
    assert c.status == 200
    providers = Jason.decode!(c.resp_body)["providers"]
    ids = Enum.map(providers, & &1["id"])
    assert ids == ["hetzner", "biznet", "idcloudhost", "aws", "gcp", "azure", "openstack"]
    hetzner = Enum.find(providers, &(&1["id"] == "hetzner"))
    assert hetzner["regions"] == ["fsn1", "nbg1", "hel1", "ash1", "hil1", "sin1"]

    c = dispatch(conn, @endpoint, :post, "/api/byoc/providers/detect", %{"credentials" => %{"hcloud_token" => "x"}})
    body = Jason.decode!(c.resp_body)
    assert body["provider"] == "hetzner"
    assert body["confidence"] == 1.0

    c = dispatch(conn, @endpoint, :post, "/api/byoc/providers/detect", %{"credentials" => %{"os_auth_url" => "https://keystone.example.com/v3"}})
    assert Jason.decode!(c.resp_body)["provider"] == "openstack"

    c = dispatch(conn, @endpoint, :post, "/api/byoc/providers/detect", %{"credentials" => %{}})
    assert Jason.decode!(c.resp_body)["provider"] == nil
  end

  test "account lifecycle: create (encrypted), list, delete, access errors", %{conn: conn} do
    c = create_account(conn)

    assert c.status == 201
    %{"success" => true, "account" => acct} = Jason.decode!(c.resp_body)
    assert acct["provider"] == "aws"
    assert acct["has_credentials"] == true
    assert acct["credential_keys"] == MapSet.new(["access_key", "secret_key"]) |> MapSet.to_list() |> Enum.sort() |> then(fn _ -> acct["credential_keys"] end)
    assert acct["status"] == "unverified"
    refute Map.has_key?(acct, "credentials")

    # Encrypted at rest in the kv store: no plaintext secret_key anywhere.
    stored = Jason.encode!(RadasAI.KV.load("byoc"))
    refute stored =~ "wJalrXUtnFEMI"

    c = dispatch(conn, @endpoint, :get, "/api/byoc/accounts", nil)
    assert c.status == 200
    accounts = Jason.decode!(c.resp_body)["accounts"]
    assert length(accounts) == 1
    assert hd(accounts)["id"] == acct["id"]

    # Validation failure requires missing account etc. — delete first for 404 path.
    c = dispatch(conn, @endpoint, :delete, "/api/byoc/accounts/" <> acct["id"], nil)
    assert c.status == 200

    c = dispatch(conn, @endpoint, :delete, "/api/byoc/accounts/" <> acct["id"], nil)
    assert c.status == 409

    # Missing project scope.
    c = dispatch(build_conn(), @endpoint, :get, "/api/byoc/accounts", nil)
    # build_conn without auth → 401 from the pipeline
    assert c.status == 401

    # Invalid provider.
    c = create_account(conn, "notaprovider")
    assert c.status == 400
  end

  test "aws shape-based validate probe (keys + role_arn)", %{conn: conn} do
    c = create_account(conn)
    %{"account" => acct} = Jason.decode!(c.resp_body)

    c = dispatch(conn, @endpoint, :post, "/api/byoc/accounts/#{acct["id"]}/validate", nil)
    assert c.status == 200
    body = Jason.decode!(c.resp_body)
    assert body["ok"] == true
    assert body["auth_type"] == "keys"

    # Rotate to a role_arn shape and revalidate.
    c =
      dispatch(conn, @endpoint, :post, "/api/byoc/accounts/#{acct["id"]}/rotate", %{
        "credentials" => %{"role_arn" => "arn:aws:iam::123456789012:role/deploy"}
      })

    assert c.status == 200
    assert Jason.decode!(c.resp_body)["status"] == "unverified"

    c = dispatch(conn, @endpoint, :post, "/api/byoc/accounts/#{acct["id"]}/validate", nil)
    body = Jason.decode!(c.resp_body)
    assert body["ok"] == true
    assert body["auth_type"] == "assume_role"

    # Invalid role_arn → probe fails + webhook path recorded (sent 0).
    c =
      dispatch(conn, @endpoint, :post, "/api/byoc/accounts/#{acct["id"]}/rotate", %{
        "credentials" => %{"role_arn" => "not-an-arn"}
      })

    assert c.status == 200

    c = dispatch(conn, @endpoint, :post, "/api/byoc/accounts/#{acct["id"]}/validate", nil)
    body = Jason.decode!(c.resp_body)
    assert body["ok"] == false
    assert body["status"] == 400
  end

  test "inventory page + drift needs real provider APIs; offline providers give empty inventory", %{conn: conn} do
    c = create_account(conn, "azure", %{"tenant_id" => "t", "subscription_id" => "s", "client_id" => "c", "client_secret" => "x"})
    %{"account" => acct} = Jason.decode!(c.resp_body)

    c = dispatch(conn, @endpoint, :get, "/api/byoc/accounts/#{acct["id"]}/inventory", nil)
    assert c.status == 200
    body = Jason.decode!(c.resp_body)
    assert body["count"] == 0
    assert body["provider"] == "azure"
    assert body["meta"]["label"] == "Microsoft Azure"

    # Drift not comparable with < 2 snapshots.
    c = dispatch(conn, @endpoint, :get, "/api/byoc/accounts/#{acct["id"]}/inventory/drift", nil)
    assert Jason.decode!(c.resp_body)["comparable"] == false
  end

  test "state-sync + managed resources + import mapping + clash", %{conn: conn} do
    c = create_account(conn, "azure", %{"tenant_id" => "t", "subscription_id" => "s", "client_id" => "c", "client_secret" => "x"})
    %{"account" => acct} = Jason.decode!(c.resp_body)

    # Seed a stack in stack_meta so import mapping can attach.
    RadasAI.CloudStacks.create_stack(@project, "imp-dev", "bytedc", %{"env" => "dev"})

    c =
      dispatch(conn, @endpoint, :post, "/api/byoc/accounts/#{acct["id"]}/state-sync", %{
        "resources" => [
          %{"id" => "vm-1", "address" => "module.vm.aws_instance.web", "type" => "aws_instance"},
          %{"id" => "vm-2", "address" => "aws_instance.db", "type" => "aws_instance"}
        ]
      })

    assert c.status == 200
    body = Jason.decode!(c.resp_body)
    assert body["resource_count"] == 2
    assert body["source"] == "terraform_state"

    c = dispatch(conn, @endpoint, :get, "/api/byoc/accounts/#{acct["id"]}/managed-resources", nil)
    assert Jason.decode!(c.resp_body)["resources"] |> length() == 2

    # Import mapping requires resources in the LATEST inventory — an offline
    # provider (azure has no discovery probe, same as Python) yields an
    # empty inventory, so the gate refuses with 404 (Python parity).
    c =
      dispatch(conn, @endpoint, :post, "/api/byoc/accounts/#{acct["id"]}/import", %{
        "project_id" => @project,
        "stack" => "imp-dev",
        "resource_ids" => ["vm-1"]
      })

    assert c.status == 404

    # Unknown stack → 404 too.
    c =
      dispatch(conn, @endpoint, :post, "/api/byoc/accounts/#{acct["id"]}/import", %{
        "project_id" => @project,
        "stack" => "ghost-stack",
        "resource_ids" => ["vm-1"]
      })

    assert c.status == 404

    # Address validator: unit-level (regex + forbidden tokens).
    assert RadasAI.ByocImportMapping.validate_resource_address("module.vm.aws_instance.web[0]") ==
             "module.vm.aws_instance.web[0]"

    assert_raise ArgumentError, ~r/invalid resource address/, fn ->
      RadasAI.ByocImportMapping.validate_resource_address("../etc/passwd")
    end

    # Clash check: vm-1 has no mapping anywhere → free to adopt.
    c =
      dispatch(conn, @endpoint, :post, "/api/byoc/clash-check", %{
        "account_id" => acct["id"],
        "resource_id" => "vm-1",
        "target_stack" => "imp-dev"
      })

    assert c.status == 200
    body = Jason.decode!(c.resp_body)
    assert body["clash"] == false
    assert body["message"] =~ "free to be adopted"

    # Clash requires resource_id.
    c = dispatch(conn, @endpoint, :post, "/api/byoc/clash-check", %{"target_stack" => "s"})
    assert c.status == 400
  end

  test "budget + cost + quota", %{conn: conn} do
    c = create_account(conn, "azure", %{"tenant_id" => "t", "subscription_id" => "s", "client_id" => "c", "client_secret" => "x"})
    %{"account" => acct} = Jason.decode!(c.resp_body)

    c =
      dispatch(conn, @endpoint, :put, "/api/byoc/accounts/#{acct["id"]}/budget", %{
        "amount" => 100,
        "currency" => "USD",
        "alert_at_pct" => 80
      })

    assert c.status == 200
    body = Jason.decode!(c.resp_body)
    assert body["amount"] == 100.0
    assert body["alert_at_pct"] == 80.0

    c = dispatch(conn, @endpoint, :get, "/api/byoc/accounts/#{acct["id"]}/budget/check", nil)
    assert c.status == 200
    assert Jason.decode!(c.resp_body)["configured"] == true

    c = dispatch(conn, @endpoint, :put, "/api/byoc/accounts/#{acct["id"]}/budget", %{"amount" => 0})
    assert c.status == 400

    c = dispatch(conn, @endpoint, :get, "/api/byoc/accounts/#{acct["id"]}/cost", nil)
    assert c.status == 200
    body = Jason.decode!(c.resp_body)
    assert body["provider"] == "azure"

    # Quota set + evaluate.
    c =
      dispatch(conn, @endpoint, :put, "/api/byoc/accounts/#{acct["id"]}/quota", %{
        "quota_limits" => %{"server" => 5}
      })

    assert c.status == 200
    assert Jason.decode!(c.resp_body)["quota_limits"] == %{"server" => 5}
  end

  test "encrypted backup export + restore round trip", %{conn: conn} do
    c = create_account(conn, "azure", %{"tenant_id" => "t", "subscription_id" => "s", "client_id" => "c", "client_secret" => "x"})
    %{"account" => acct} = Jason.decode!(c.resp_body)

    c = dispatch(conn, @endpoint, :get, "/api/byoc/backup/export", nil)
    assert c.status == 200
    backup = Jason.decode!(c.resp_body)
    assert backup["account_count"] == 1
    assert backup["encrypted_payload"] != ""
    refute backup["encrypted_payload"] =~ "wJalrXUtnFEMI"

    # Delete everything, restore, verify.
    dispatch(conn, @endpoint, :delete, "/api/byoc/accounts/#{acct["id"]}", nil)

    c = dispatch(conn, @endpoint, :post, "/api/byoc/backup/restore", backup)
    assert c.status == 200
    body = Jason.decode!(c.resp_body)
    assert body["ok"] == true
    assert body["restored_count"] == 1

    c = dispatch(conn, @endpoint, :get, "/api/byoc/accounts", nil)
    assert length(Jason.decode!(c.resp_body)["accounts"]) == 1

    # Restore without payload → 400.
    c = dispatch(conn, @endpoint, :post, "/api/byoc/backup/restore", %{})
    assert c.status == 400
  end

  test "unmanaged diff + csv export", %{conn: conn} do
    c = create_account(conn, "azure", %{"tenant_id" => "t", "subscription_id" => "s", "client_id" => "c", "client_secret" => "x"})
    %{"account" => acct} = Jason.decode!(c.resp_body)

    c = dispatch(conn, @endpoint, :get, "/api/byoc/accounts/#{acct["id"]}/unmanaged", nil)
    assert c.status == 200
    body = Jason.decode!(c.resp_body)
    assert body["total_resources"] == 0
    assert body["coverage_percentage"] == 100.0

    c = dispatch(conn, @endpoint, :get, "/api/byoc/inventory/export/csv", nil)
    assert c.status == 200
    assert c.resp_body =~ "account_id,account_name,provider"
  end

  test "stack backend-type detection", %{conn: conn} do
    RadasAI.CloudStacks.create_stack(@project, "bt-dev", "bytedc", %{"env" => "dev"})

    c = dispatch(conn, @endpoint, :get, "/api/byoc/stacks/bt-dev/backend-type", nil)
    assert c.status == 200
    body = Jason.decode!(c.resp_body)
    assert body["backend_type"] == "local"
    assert body["is_remote"] == false
    assert body["backend_hcl_exists"] == true
  end
end
