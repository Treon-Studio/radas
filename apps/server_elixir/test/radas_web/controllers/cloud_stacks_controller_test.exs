defmodule RadasWeb.CloudStacksControllerTest do
  use Radas.DataCase, async: false

  # Contract tests for the cloud stack CRUD + state routes over the shared
  # DATA_DIR layout, stack_meta/stack_secrets tables (coexistence with Flask).
  # Runtime bodies mirror the Python v1 handlers (mirror of
  # apps/server/tests/test_v2_shared_domains.py cloud-stack section): the
  # platform plug turns flat errors into the error envelope, so error
  # assertions check the envelope's code, not the flat message.
  #
  # NOTE: never re-dispatch a response conn — the test adapter drops custom
  # headers (x-project-id), which silently re-routes the request into the
  # legacy default workspace. Always dispatch from the setup conn.
  import Phoenix.ConnTest
  import Plug.Conn

  @endpoint RadasWeb.Endpoint
  @jwt_secret "cs-e2e-jwt-000000"
  @project "proj-cs-e2e"

  setup do
    System.put_env("JWT_SECRET_KEY", @jwt_secret)
    System.put_env("GLOBAL_SECRETS_ENCRYPTION_KEY", "cs-test-global-secret")

    data_dir = Path.join(System.tmp_dir!(), "radas-cs-ctrl-#{System.unique_integer()}")
    System.put_env("DATA_DIR", data_dir)

    on_exit(fn ->
      System.delete_env("JWT_SECRET_KEY")
      System.delete_env("GLOBAL_SECRETS_ENCRYPTION_KEY")
      System.delete_env("DATA_DIR")
      File.rm_rf!(data_dir)
    end)

    # Seed the tenancy chain the @require_project_access port walks:
    # org → project (org-bound) → membership.
    RadasAI.DB.execute!(
      "INSERT INTO orgs (id, name, created_at) VALUES ('org-cs-e2e', 'CS Org', 0) ON CONFLICT (id) DO NOTHING",
      []
    )

    RadasAI.DB.execute!(
      "INSERT INTO projects (id, name, org_id) VALUES ($1, 'CS Proj', 'org-cs-e2e') ON CONFLICT (id) DO NOTHING",
      [@project]
    )

    RadasAI.DB.execute!(
      "INSERT INTO org_members (org_id, user_id, role, created_at) VALUES ('org-cs-e2e', 'cs-user', 'owner', 0) ON CONFLICT (org_id, user_id) DO NOTHING",
      []
    )

    token =
      RadasAI.AuthToken.encode(
        %{"user_id" => "cs-user", "username" => "cs", "roles" => [], "token_type" => "access", "exp" => System.system_time(:second) + 600, "iat" => System.system_time(:second)},
        @jwt_secret
      )

    conn =
      build_conn()
      |> put_req_header("authorization", "Bearer " <> token)
      |> put_req_header("x-project-id", @project)

    {:ok, conn: conn, data_dir: data_dir}
  end

  defp create_stack(conn, name, provider \\ "bytedc", values \\ %{}) do
    dispatch(conn, @endpoint, :post, "/api/v2/cloud/stacks", %{
      "name" => name,
      "provider" => provider,
      "values" => Map.merge(%{"env" => "dev", "region" => "cn-north-1", "project_name" => "proj"}, values)
    })
  end

  defp stack_sd(data_dir, name), do: Path.join([data_dir, "projects", @project, "stacks", "envs", name])

  test "requires auth and project access", %{conn: conn} do
    c = dispatch(build_conn(), @endpoint, :get, "/api/v2/cloud/stacks", nil)
    assert c.status == 401

    # A non-member (valid JWT, other user) is rejected for the org-bound project.
    other_token =
      RadasAI.AuthToken.encode(
        %{"user_id" => "outsider", "username" => "out", "roles" => [], "token_type" => "access", "exp" => System.system_time(:second) + 600, "iat" => System.system_time(:second)},
        @jwt_secret
      )

    c =
      build_conn()
      |> put_req_header("authorization", "Bearer " <> other_token)
      |> put_req_header("x-project-id", @project)
      |> dispatch(@endpoint, :get, "/api/v2/cloud/stacks", nil)

    assert c.status == 403
    %{"error" => err} = Jason.decode!(c.resp_body)
    assert err["code"] == "FORBIDDEN"
    assert err["message"] =~ "member of the organization"

    # Unknown, non-legacy project id → 403 as well.
    c =
      build_conn()
      |> put_req_header("authorization", "Bearer " <> other_token)
      |> put_req_header("x-project-id", "ghost-proj")
      |> dispatch(@endpoint, :get, "/api/v2/cloud/stacks", nil)

    assert c.status == 403

    _ = conn
  end

  test "create renders tfvars, backend.hcl placeholder and meta (201 {ok,name})", %{conn: conn, data_dir: data_dir} do
    c = create_stack(conn, "web-dev")

    assert c.status == 201
    %{"ok" => true, "name" => "web-dev"} = Jason.decode!(c.resp_body)

    # Files on disk mirror Flask layout.
    sd = stack_sd(data_dir, "web-dev")
    assert File.dir?(sd)
    tfvars = File.read!(Path.join(sd, "terraform.tfvars"))
    assert tfvars =~ ~s(project_name = "proj")
    assert tfvars =~ ~s(region = "cn-north-1")
    # tfvars order: env before region before project_name (bytedc order port).
    assert :binary.match(tfvars, "env =") < :binary.match(tfvars, "region =")
    assert File.exists?(Path.join(sd, "backend.hcl"))
    assert File.read!(Path.join(sd, "backend.hcl")) =~ "REPLACE_ME_TFSTATE_BUCKET"

    # Meta persisted in stack_meta jsonb (shared with Flask).
    meta = RadasAI.CloudStacks.load_meta(@project, "web-dev")
    assert meta["provider"] == "bytedc"
    assert meta["project_name"] == "proj"
    assert is_integer(meta["created_at"]) and is_integer(meta["updated_at"])
  end

  test "create separates secrets into stack_secrets and keeps them out of tfvars", %{conn: conn, data_dir: data_dir} do
    c = create_stack(conn, "sec-dev", "bytedc", %{"access_key" => "AK-1", "secret_key" => "SK-1"})

    assert c.status == 201
    tfvars = File.read!(Path.join(stack_sd(data_dir, "sec-dev"), "terraform.tfvars"))
    refute tfvars =~ "AK-1"
    refute tfvars =~ "SK-1"

    secrets = RadasAI.CloudStacks.load_secrets(@project, "sec-dev")
    assert secrets["access_key"] == "AK-1"

    # Materialization writes credentials.auto.tfvars, decrypting secrets.
    creds_path = RadasAI.CloudStacks.materialise_credentials(@project, "sec-dev")
    assert is_binary(creds_path)
    creds = File.read!(creds_path)
    assert creds =~ ~s(access_key = "AK-1")
    assert creds =~ ~s(secret_key = "SK-1")

    # Secret material never lands in plaintext tfvars on disk.
    refute File.read!(Path.join(stack_sd(data_dir, "sec-dev"), "terraform.tfvars")) =~ "SK-1"
  end

  test "invalid stack name is rejected with the error envelope", %{conn: conn} do
    c = create_stack(conn, "Bad Name!")
    assert c.status == 400

    %{"error" => err} = Jason.decode!(c.resp_body)
    assert err["code"] == "BAD_REQUEST"

    c = create_stack(conn, "ab")
    assert c.status == 400
  end

  test "unknown provider is rejected", %{conn: conn} do
    c = create_stack(conn, "web-x", "not-a-provider")
    assert c.status == 400

    # The platform layer normalizes flat errors: code from status, generic message.
    %{"error" => err} = Jason.decode!(c.resp_body)
    assert err["code"] == "BAD_REQUEST"
  end

  test "bytedc network-reuse validation rejects incomplete reuse", %{conn: conn} do
    c =
      create_stack(conn, "reuse-bad", "bytedc", %{
        "use_existing_network" => true,
        "existing_vpc_id" => ""
      })

    assert c.status == 400

    c =
      create_stack(conn, "reuse-bad2", "bytedc", %{
        "use_existing_network" => true,
        "existing_vpc_id" => "vpc-1"
      })

    assert c.status == 400
  end

  test "duplicate stack name → 409", %{conn: conn} do
    create_stack(conn, "dup-stack")
    c = create_stack(conn, "dup-stack")
    assert c.status == 409
  end

  test "list shows created stacks with tfvars probe", %{conn: conn} do
    create_stack(conn, "list-dev")

    c = dispatch(conn, @endpoint, :get, "/api/v2/cloud/stacks", nil)
    assert c.status == 200
    stacks = Jason.decode!(c.resp_body)["stacks"]

    entry = Enum.find(stacks, &(&1["name"] == "list-dev"))
    assert entry["has_tfvars"] == true
    assert entry["provider"] == "bytedc"
    assert entry["cloud_project"] == "proj"
    assert entry["region"] == "cn-north-1"
  end

  test "show returns the StackDetail payload; missing → 404", %{conn: conn} do
    create_stack(conn, "show-dev")

    c = dispatch(conn, @endpoint, :get, "/api/v2/cloud/stacks/show-dev", nil)
    assert c.status == 200
    detail = Jason.decode!(c.resp_body)
    assert detail["name"] == "show-dev"
    assert detail["provider"] == "bytedc"
    assert detail["terraform_tfvars"] =~ "project_name"
    assert detail["backend_hcl"] =~ "REPLACE_ME_TFSTATE_BUCKET"
    assert "terraform.tfvars" in detail["files"]
    assert detail["locked"] == false
    assert detail["drift"]["status"] == "unknown"
    assert detail["outputs"] == %{}

    c = dispatch(conn, @endpoint, :get, "/api/v2/cloud/stacks/ghost", nil)
    assert c.status == 404
    %{"error" => err} = Jason.decode!(c.resp_body)
    assert err["code"] == "NOT_FOUND"
  end

  test "update re-renders tfvars and returns {ok,name}", %{conn: conn, data_dir: data_dir} do
    create_stack(conn, "upd-dev")

    c =
      dispatch(conn, @endpoint, :put, "/api/v2/cloud/stacks/upd-dev", %{
        "values" => %{"region" => "cn-east-2", "project_name" => "proj2", "env" => "dev"}
      })

    assert c.status == 200
    %{"ok" => true, "name" => "upd-dev"} = Jason.decode!(c.resp_body)

    tfvars = File.read!(Path.join(stack_sd(data_dir, "upd-dev"), "terraform.tfvars"))
    assert tfvars =~ "cn-east-2"
    assert tfvars =~ "proj2"
  end

  test "delete removes the stack dir; local state requires force", %{conn: conn, data_dir: data_dir} do
    create_stack(conn, "del-dev")

    c = dispatch(conn, @endpoint, :delete, "/api/v2/cloud/stacks/del-dev", nil)
    assert c.status == 200
    assert Jason.decode!(c.resp_body) == %{"ok" => true}
    refute File.dir?(stack_sd(data_dir, "del-dev"))

    c = dispatch(conn, @endpoint, :delete, "/api/v2/cloud/stacks/ghost", nil)
    assert c.status == 404

    # State on disk → 409 unless ?force=true.
    create_stack(conn, "stated")
    File.write!(Path.join(stack_sd(data_dir, "stated"), "terraform.tfstate"), "{}")

    c = dispatch(conn, @endpoint, :delete, "/api/v2/cloud/stacks/stated", nil)
    assert c.status == 409

    c = dispatch(conn, @endpoint, :delete, "/api/v2/cloud/stacks/stated?force=true", nil)
    assert c.status == 200
    refute File.dir?(stack_sd(data_dir, "stated"))
  end

  test "state lock acquire/deny/release over HTTP", %{conn: conn} do
    create_stack(conn, "lock-dev")

    c =
      dispatch(conn, @endpoint, :post, "/api/v2/cloud/stacks/lock-dev/state/lock", %{
        "operation" => "apply"
      })

    assert c.status == 201
    %{"ok" => true, "lock" => %{"id" => lock_id}} = Jason.decode!(c.resp_body)

    # Second acquire denied with 409 (envelope — platform normalization).
    c2 =
      dispatch(
        conn,
        @endpoint,
        :post,
        "/api/v2/cloud/stacks/lock-dev/state/lock",
        %{"operation" => "destroy"}
      )

    assert c2.status == 409
    %{"error" => err} = Jason.decode!(c2.resp_body)
    assert err["code"] == "CONFLICT"

    # Release with the right id.
    c3 =
      dispatch(
        conn,
        @endpoint,
        :delete,
        "/api/v2/cloud/stacks/lock-dev/state/lock?lock_id=#{lock_id}",
        nil
      )

    assert %{"ok" => true, "released" => true} = Jason.decode!(c3.resp_body)

    c4 = dispatch(conn, @endpoint, :get, "/api/v2/cloud/stacks/lock-dev/state/lock", nil)
    assert Jason.decode!(c4.resp_body)["lock"] == nil
  end

  test "state versions snapshot and list", %{conn: conn, data_dir: data_dir} do
    create_stack(conn, "ver-dev")

    sd = stack_sd(data_dir, "ver-dev")
    File.write!(Path.join(sd, "terraform.tfstate"), ~s({"serial":7,"resources":[{"instances":[{},{}]}]}))

    c =
      dispatch(
        conn,
        @endpoint,
        :post,
        "/api/v2/cloud/stacks/ver-dev/state/versions",
        nil
      )

    assert c.status == 201
    %{"ok" => true, "version" => entry} = Jason.decode!(c.resp_body)
    assert entry["resource_count"] == 2
    assert entry["serial"] == 7

    c = dispatch(conn, @endpoint, :get, "/api/v2/cloud/stacks/ver-dev/state/versions", nil)
    body = Jason.decode!(c.resp_body)
    assert body["count"] == 1
    assert hd(body["versions"])["id"] == entry["id"]

    # Re-snapshotting identical state → 409 (nothing to snapshot).
    c =
      dispatch(
        conn,
        @endpoint,
        :post,
        "/api/v2/cloud/stacks/ver-dev/state/versions",
        nil
      )

    assert c.status == 409
  end

  test "action queues a plan run and returns the 202 payload", %{conn: conn, data_dir: data_dir} do
    create_stack(conn, "act-dev")

    c =
      dispatch(conn, @endpoint, :post, "/api/v2/cloud/stacks/act-dev/actions", %{
        "action" => "plan"
      })

    assert c.status == 202
    body = Jason.decode!(c.resp_body)
    assert body["ok"] == true
    assert body["status"] == "queued"
    assert body["project_id"] == @project
    assert is_binary(body["run_id"]) and body["run_id"] != ""

    # Execution record is a TOFU_RUN for the stack with the queued status.
    exe = RadasAI.Executions.get_execution(body["run_id"], @project)
    assert exe["status"] == "QUEUED"
    rp = exe["runParams"]
    assert rp["execution_type"] == "TOFU_RUN"
    assert rp["tofu_action"] == "plan"
    assert rp["stack_name"] == "act-dev"
    assert rp["provider"] == "bytedc"
    assert rp["env"]["TF_IN_AUTOMATION"] == "1"

    # Meta + audit trail updated.
    meta = RadasAI.CloudStacks.load_meta(@project, "act-dev")
    assert meta["last_action"] == "plan"
    assert meta["last_status"] == "queued"
    assert meta["last_run_id"] == body["run_id"]
  end

  test "action supports unknown action / drift gate / lock ops", %{conn: conn} do
    create_stack(conn, "gates-dev")

    c =
      dispatch(conn, @endpoint, :post, "/api/v2/cloud/stacks/gates-dev/actions", %{
        "action" => "reboot"
      })

    assert c.status == 400

    # drift is refused while disabled (default).
    c =
      dispatch(conn, @endpoint, :post, "/api/v2/cloud/stacks/gates-dev/actions", %{
        "action" => "drift"
      })

    assert c.status == 409

    # Operator lock/unlock round trip.
    c =
      dispatch(conn, @endpoint, :post, "/api/v2/cloud/stacks/gates-dev/actions", %{
        "action" => "lock",
        "reason" => "contract"
      })

    assert c.status == 200
    assert Jason.decode!(c.resp_body)["locked"] == true

    # Mutating action refused while operator-locked (423).
    c =
      dispatch(conn, @endpoint, :post, "/api/v2/cloud/stacks/gates-dev/actions", %{
        "action" => "apply"
      })

    assert c.status == 423
    %{"error" => err} = Jason.decode!(c.resp_body)
    # Python's platform layer maps 423 to HTTP_423 (no named code).
    assert err["code"] == "HTTP_423"

    c =
      dispatch(conn, @endpoint, :post, "/api/v2/cloud/stacks/gates-dev/actions", %{
        "action" => "unlock"
      })

    assert c.status == 200
    assert Jason.decode!(c.resp_body)["locked"] == false

    # force-unlock is routed to the state lock endpoint instead.
    c =
      dispatch(conn, @endpoint, :post, "/api/v2/cloud/stacks/gates-dev/actions", %{
        "action" => "force-unlock"
      })

    assert c.status == 400
  end

  test "mutating apply acquires the stack state lock and refuses a second run", %{conn: conn, data_dir: data_dir} do
    create_stack(conn, "lockrun-dev")

    c =
      dispatch(conn, @endpoint, :post, "/api/v2/cloud/stacks/lockrun-dev/actions", %{
        "action" => "apply"
      })

    assert c.status == 202
    %{"run_id" => run_id} = Jason.decode!(c.resp_body)

    # The stack state lock now exists, owned by the queued run.
    c = dispatch(conn, @endpoint, :get, "/api/v2/cloud/stacks/lockrun-dev/state/lock", nil)
    lock = Jason.decode!(c.resp_body)["lock"]
    assert lock["run_id"] == run_id
    assert lock["operation"] == "apply"

    # A second mutating run is refused with 409.
    c =
      dispatch(conn, @endpoint, :post, "/api/v2/cloud/stacks/lockrun-dev/actions", %{
        "action" => "apply"
      })

    assert c.status == 409

    # Pre-action snapshot was captured.
    assert RadasAI.StackSnapshots.list_snapshots(@project, "lockrun-dev") != []

    _ = data_dir
  end

  test "project lock blocks a second mutating run across stacks", %{conn: conn} do
    create_stack(conn, "pl-a")
    create_stack(conn, "pl-b")

    c = dispatch(conn, @endpoint, :post, "/api/v2/cloud/stacks/pl-a/actions", %{"action" => "apply"})
    assert c.status == 202

    c = dispatch(conn, @endpoint, :post, "/api/v2/cloud/stacks/pl-b/actions", %{"action" => "apply"})
    assert c.status == 409
    %{"error" => err} = Jason.decode!(c.resp_body)
    assert err["code"] == "CONFLICT"
  end

  test "taint requires an address", %{conn: conn} do
    create_stack(conn, "taint-dev")

    c =
      dispatch(conn, @endpoint, :post, "/api/v2/cloud/stacks/taint-dev/actions", %{
        "action" => "taint",
        "address" => ""
      })

    assert c.status == 400

    c =
      dispatch(conn, @endpoint, :post, "/api/v2/cloud/stacks/taint-dev/actions", %{
        "action" => "taint",
        "address" => "module.stack.aws_instance.web"
      })

    assert c.status == 200
    body = Jason.decode!(c.resp_body)
    assert body["queued"] == true
    assert is_binary(body["execution_id"])
  end

  test "providers catalog and schemas", %{conn: conn} do
    c = dispatch(conn, @endpoint, :get, "/api/v2/cloud/providers", nil)
    assert c.status == 200
    providers = Jason.decode!(c.resp_body)["providers"]
    ids = Enum.map(providers, & &1["id"])
    assert "bytedc" in ids and "aws" in ids and "hetzner" in ids

    c = dispatch(conn, @endpoint, :get, "/api/v2/cloud/bytedc/schema", nil)
    assert c.status == 200
    schema = Jason.decode!(c.resp_body)
    assert schema["provider"] == "bytedc"

    c = dispatch(conn, @endpoint, :get, "/api/v2/cloud/aws/schema", nil)
    assert c.status == 200

    c = dispatch(conn, @endpoint, :get, "/api/v2/cloud/notaprovider/schema", nil)
    assert c.status == 404
  end

  test "drift get/put round trip", %{conn: conn} do
    create_stack(conn, "drift-dev")

    c = dispatch(conn, @endpoint, :get, "/api/v2/cloud/stacks/drift-dev/drift", nil)
    assert c.status == 200
    assert Jason.decode!(c.resp_body)["enabled"] == false

    c =
      dispatch(conn, @endpoint, :put, "/api/v2/cloud/stacks/drift-dev/drift", %{"enabled" => true})

    assert c.status == 200
    assert Jason.decode!(c.resp_body)["ok"] == true

    c = dispatch(conn, @endpoint, :get, "/api/v2/cloud/stacks/drift-dev/drift", nil)
    assert Jason.decode!(c.resp_body)["enabled"] == true

    c =
      dispatch(conn, @endpoint, :put, "/api/v2/cloud/stacks/drift-dev/drift", %{"enabled" => "yes"})

    assert c.status == 200

    c =
      dispatch(conn, @endpoint, :put, "/api/v2/cloud/stacks/drift-dev/drift", %{"enabled" => 5})

    assert c.status == 400
  end

  test "runs list/get/stream round trip", %{conn: conn} do
    create_stack(conn, "runs-dev")

    c =
      dispatch(conn, @endpoint, :post, "/api/v2/cloud/stacks/runs-dev/actions", %{"action" => "plan"})

    assert c.status == 202
    %{"run_id" => run_id} = Jason.decode!(c.resp_body)

    c = dispatch(conn, @endpoint, :get, "/api/v2/cloud/stacks/runs-dev/runs", nil)
    assert c.status == 200
    runs = Jason.decode!(c.resp_body)["runs"]
    assert length(runs) == 1
    assert hd(runs)["run_id"] == run_id
    assert hd(runs)["status"] == "queued"
    assert hd(runs)["action"] == "plan"

    c = dispatch(conn, @endpoint, :get, "/api/v2/cloud/stacks/runs-dev/runs/#{run_id}", nil)
    assert c.status == 200
    run = Jason.decode!(c.resp_body)
    assert run["log"] =~ "waiting for a worker"

    c =
      dispatch(
        conn,
        @endpoint,
        :get,
        "/api/v2/cloud/stacks/runs-dev/runs/missing-id/runs/stream",
        nil
      )

    assert c.status == 404

    c = dispatch(conn, @endpoint, :get, "/api/v2/cloud/stacks/runs-dev/runs/#{run_id}/stream", nil)
    assert c.status == 200
  end

  test "state inspect reports addresses from tfstate", %{conn: conn, data_dir: data_dir} do
    create_stack(conn, "insp-dev")

    state = %{
      "serial" => 2,
      "lineage" => "lin",
      "terraform_version" => "1.9.0",
      "resources" => [
        %{
          "module" => "module.vm",
          "type" => "hcs_ecs_compute_instance",
          "name" => "this",
          "instances" => [%{"index_key" => 0}, %{"index_key" => "web"}]
        }
      ]
    }

    File.write!(
      Path.join(stack_sd(data_dir, "insp-dev"), "terraform.tfstate"),
      Jason.encode!(state)
    )

    c = dispatch(conn, @endpoint, :get, "/api/v2/cloud/stacks/insp-dev/state", nil)
    assert c.status == 200
    body = Jason.decode!(c.resp_body)
    assert body["state_present"] == true
    assert body["resource_count"] == 2
    assert body["resources"] == [
             "module.vm.hcs_ecs_compute_instance.this[0]",
             "module.vm.hcs_ecs_compute_instance.this[\"web\"]"
           ]
    assert body["serial"] == 2

    # No state file → present false with the explanatory message.
    create_stack(conn, "insp-empty")

    c = dispatch(conn, @endpoint, :get, "/api/v2/cloud/stacks/insp-empty/state", nil)
    body = Jason.decode!(c.resp_body)
    assert body["state_present"] == false
    assert body["resources"] == []
  end

  test "force-unlock records history + audit", %{conn: conn} do
    create_stack(conn, "fu-dev")

    c =
      dispatch(conn, @endpoint, :post, "/api/v2/cloud/stacks/fu-dev/force-unlock", %{})

    assert c.status == 400

    c =
      dispatch(conn, @endpoint, :post, "/api/v2/cloud/stacks/fu-dev/force-unlock", %{
        "lock_id" => "abc123"
      })

    assert c.status == 200
    body = Jason.decode!(c.resp_body)
    assert body["ok"] == true
    assert body["lock_id"] == "abc123"
    assert body["message"] =~ "successfully released"

    meta = RadasAI.CloudStacks.load_meta(@project, "fu-dev")
    assert [%{"lock_id" => "abc123", "success" => true}] = meta["unlock_history"]
  end

  test "state version get + rollback + audit + backend", %{conn: conn, data_dir: data_dir} do
    create_stack(conn, "sv-dev")

    File.write!(
      Path.join(stack_sd(data_dir, "sv-dev"), "terraform.tfstate"),
      ~s({"serial":9,"lineage":"l1","resources":[{"instances":[{}]}]})
    )

    c =
      dispatch(conn, @endpoint, :post, "/api/v2/cloud/stacks/sv-dev/state/versions", nil)

    assert c.status == 201
    %{"version" => entry} = Jason.decode!(c.resp_body)

    c =
      dispatch(
        conn,
        @endpoint,
        :get,
        "/api/v2/cloud/stacks/sv-dev/state/versions/#{entry["id"]}",
        nil
      )

    assert c.status == 200
    body = Jason.decode!(c.resp_body)
    assert body["id"] == entry["id"]
    assert body["serial"] == 9
    assert body["state"]["lineage"] == "l1"

    # Rollback requires confirm == stack name.
    c =
      dispatch(
        conn,
        @endpoint,
        :post,
        "/api/v2/cloud/stacks/sv-dev/state/versions/#{entry["id"]}/rollback",
        %{"confirm" => "wrong"}
      )

    assert c.status == 400

    c =
      dispatch(
        conn,
        @endpoint,
        :post,
        "/api/v2/cloud/stacks/sv-dev/state/versions/#{entry["id"]}/rollback",
        %{"confirm" => "sv-dev"}
      )

    assert c.status == 200
    assert Jason.decode!(c.resp_body)["ok"] == true

    c = dispatch(conn, @endpoint, :get, "/api/v2/cloud/stacks/sv-dev/state/audit", nil)
    assert c.status == 200
    assert Jason.decode!(c.resp_body)["count"] > 0

    c = dispatch(conn, @endpoint, :get, "/api/v2/cloud/stacks/sv-dev/state/backend", nil)
    assert c.status == 200
    assert Jason.decode!(c.resp_body)["backend_type"] == "local"
  end

  test "state overview reports state presence, lock and versions", %{conn: conn, data_dir: data_dir} do
    create_stack(conn, "ov-dev")

    File.write!(
      Path.join(stack_sd(data_dir, "ov-dev"), "terraform.tfstate"),
      ~s({"serial":3,"lineage":"lin-1","resources":[{"instances":[{}]}]})
    )

    c = dispatch(conn, @endpoint, :get, "/api/v2/cloud/stacks/ov-dev/state/overview", nil)
    assert c.status == 200
    body = Jason.decode!(c.resp_body)
    assert body["state_present"] == true
    assert body["state_source"] == "terraform.tfstate"
    assert body["serial"] == 3
    assert body["lineage"] == "lin-1"
    assert body["resource_count"] == 1
    assert body["lock"] == nil
    assert body["version_count"] == 0
  end
end
