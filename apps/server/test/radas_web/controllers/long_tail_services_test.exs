defmodule RadasWeb.LongTailServicesTest do
  use Radas.DataCase, async: false

  # Contract tests for the last Phase-8 long-tail ports:
  #   * /api/registry          (services/code_registry.py, UC 382+/661-666)
  #   * /api/compliance/*      (services/compliance_service.py, UC 44/45/73)
  #   * /api/users/invites     (services/user_invite_service.py, UC625)
  #   * /api/tests, /api/test-cases/score (services/test_cases.py, UC 161+/202)
  import Phoenix.ConnTest
  import Plug.Conn

  @endpoint RadasWeb.Endpoint
  @jwt_secret "lt-e2e-jwt-000000"
  @project "proj-lt-e2e"
  @org "org-lt-e2e"

  setup do
    System.put_env("JWT_SECRET_KEY", @jwt_secret)
    System.put_env("GLOBAL_SECRETS_ENCRYPTION_KEY", "lt-test-global-secret")

    data_dir = Path.join(System.tmp_dir!(), "radas-lt-#{System.unique_integer()}")
    System.put_env("DATA_DIR", data_dir)

    # Isolate the code registry: copy the tracked catalog into a temp
    # REGISTRY_DIR so import/publish tests never pollute the repo tree.
    registry_dir = Path.join(data_dir, "registry")
    File.mkdir_p!(data_dir)
    File.cp_r!(Path.expand(Path.join([File.cwd!(), "priv", "registry"])), registry_dir)
    System.put_env("REGISTRY_DIR", registry_dir)

    on_exit(fn ->
      System.delete_env("JWT_SECRET_KEY")
      System.delete_env("GLOBAL_SECRETS_ENCRYPTION_KEY")
      System.delete_env("REGISTRY_DIR")
      System.delete_env("DATA_DIR")
      File.rm_rf!(data_dir)
    end)

    RadasAI.DB.execute!(
      "INSERT INTO orgs (id, name, created_at) VALUES ('#{@org}', 'LT Org', 0) ON CONFLICT (id) DO NOTHING",
      []
    )

    RadasAI.DB.execute!(
      "INSERT INTO projects (id, name, org_id) VALUES ($1, 'LT Proj', '#{@org}') ON CONFLICT (id) DO NOTHING",
      [@project]
    )

    RadasAI.DB.execute!(
      "INSERT INTO org_members (org_id, user_id, role, created_at) VALUES ('#{@org}', 'lt-user', 'owner', 0) ON CONFLICT (org_id, user_id) DO NOTHING",
      []
    )

    token =
      RadasAI.AuthToken.encode(
        %{"user_id" => "lt-user", "username" => "lt", "roles" => [], "token_type" => "access", "exp" => System.system_time(:second) + 600, "iat" => System.system_time(:second)},
        @jwt_secret
      )

    conn =
      build_conn()
      |> put_req_header("authorization", "Bearer " <> token)
      |> put_req_header("x-project-id", @project)

    {:ok, conn: conn, data_dir: data_dir}
  end

  # -- registry ------------------------------------------------------------------

  test "registry catalog lists tracked items; install/uninstall copies code", %{conn: conn} do
    c = dispatch(conn, @endpoint, :get, "/api/registry", nil)
    assert c.status == 200
    items = Jason.decode!(c.resp_body)["items"]
    assert Enum.any?(items, &(&1["name"] == "vpc" and &1["type"] == "tofu-block"))

    RadasAI.CloudStacks.create_stack(@project, "reg-dev", "bytedc", %{"env" => "dev"})

    c =
      dispatch(conn, @endpoint, :post, "/api/registry/vpc/install", %{"stack" => "reg-dev"})

    assert c.status == 201, c.resp_body
    body = Jason.decode!(c.resp_body)
    assert body["installed"]["files_copied"] != []

    # Copied into the stack workspace + tracked in the manifest.
    sd = RadasAI.CloudStacks.stack_dir(@project, "reg-dev")
    assert Enum.all?(body["installed"]["files_copied"], &File.exists?(Path.join(sd, &1)))

    c = dispatch(conn, @endpoint, :get, "/api/registry/installed?stack=reg-dev", nil)
    assert Jason.decode!(c.resp_body)["installed"] |> hd() |> Map.get("name") == "vpc"

    # Double install refused.
    c = dispatch(conn, @endpoint, :post, "/api/registry/vpc/install", %{"stack" => "reg-dev"})
    assert c.status == 400

    c =
      dispatch(conn, @endpoint, :post, "/api/registry/vpc/uninstall", %{"stack" => "reg-dev"})

    assert c.status == 200

    c = dispatch(conn, @endpoint, :get, "/api/registry/installed?stack=reg-dev", nil)
    assert Jason.decode!(c.resp_body)["installed"] == []
  end

  test "registry item detail + changelog + export/import round trip", %{conn: conn} do
    c = dispatch(conn, @endpoint, :get, "/api/registry/vpc", nil)
    assert c.status == 200
    item = Jason.decode!(c.resp_body)
    assert item["type"] == "tofu-block"
    assert item["files"] != []

    c = dispatch(conn, @endpoint, :get, "/api/registry/nope/changelog", nil)
    assert c.status == 404

    c = dispatch(conn, @endpoint, :get, "/api/registry/vpc/export", nil)
    assert c.status == 200
    %{"bundle" => bundle} = Jason.decode!(c.resp_body)
    assert bundle["name"] == "vpc"
    assert bundle["files"] != %{}

    # Import the bundle under a new name, then see it in the catalog.
    renamed = Map.put(bundle, "name", "vpc-clone")

    c = dispatch(conn, @endpoint, :post, "/api/registry/import", %{"bundle" => renamed})
    assert c.status == 201

    c = dispatch(conn, @endpoint, :get, "/api/registry/vpc-clone", nil)
    assert c.status == 200
  end

  test "registry publish from stack + diff", %{conn: conn, data_dir: data_dir} do
    RadasAI.CloudStacks.create_stack(@project, "pub-dev", "bytedc", %{"env" => "dev"})
    File.write!(Path.join([data_dir, "projects", @project, "stacks", "envs", "pub-dev", "block.tf"]), "resource \"x\" \"y\" {}\n")

    c =
      dispatch(conn, @endpoint, :post, "/api/registry/publish", %{
        "stack" => "pub-dev",
        "name" => "custom-block",
        "type" => "tofu-block",
        "file_patterns" => ["block.tf"]
      })

    assert c.status == 201, c.resp_body
    assert Jason.decode!(c.resp_body)["files_published"] == ["block.tf"]

    # Diff is for INSTALLED items — install the published item first.
    c =
      dispatch(conn, @endpoint, :post, "/api/registry/custom-block/install", %{"stack" => "pub-dev"})

    assert c.status == 201, c.resp_body

    c = dispatch(conn, @endpoint, :get, "/api/registry/stacks/pub-dev/items/custom-block/diff", nil)
    assert c.status == 200
    IO.puts("DIFF_BODY: #{c.resp_body |> String.slice(0, 200)}")
    body = Jason.decode!(c.resp_body)
    assert body["diff"]["has_changes"] == false
    assert body["file_diffs"] != []

    _ = data_dir
  end

  # -- compliance ----------------------------------------------------------------

  test "compliance scorecard + report + export", %{conn: conn} do
    RadasAI.AuditEvents.record_audit_event("cloud.run.queued",
      actor_user_id: "lt-user",
      target_type: "execution",
      target_id: "e-1",
      meta: %{"project_id" => @project}
    )

    c = dispatch(conn, @endpoint, :get, "/api/compliance/scorecard", nil)
    assert c.status == 200
    body = Jason.decode!(c.resp_body)
    assert body["max"] == 100
    assert body["score"] in 0..100
    assert length(body["checks"]) == 6

    c = dispatch(conn, @endpoint, :get, "/api/compliance/report", nil)
    assert c.status == 200
    body = Jason.decode!(c.resp_body)
    assert body["audit_30d"]["total"] >= 1
    assert is_list(body["recent"])

    c = dispatch(conn, @endpoint, :get, "/api/compliance/export?format=json", nil)
    assert c.status == 200
    assert Jason.decode!(c.resp_body)["scorecard"]

    c = dispatch(conn, @endpoint, :get, "/api/compliance/export", nil)
    assert c.status == 200
    assert c.resp_body =~ "Compliance & Security Audit Report"
  end

  # -- invites -------------------------------------------------------------------

  test "invite create/claim lifecycle", %{conn: conn} do
    c =
      dispatch(conn, @endpoint, :post, "/api/users/invites", %{
        "email" => "Newbie@Example.com",
        "roles" => ["viewer"],
        "org_id" => @org
      })

    assert c.status == 201
    %{"invite" => invite} = Jason.decode!(c.resp_body)
    assert invite["status"] == "pending"
    assert invite["email"] == "newbie@example.com"

    c = dispatch(conn, @endpoint, :get, "/api/users/invites", nil)
    assert Jason.decode!(c.resp_body)["count"] >= 1

    # Public get + claim (no auth) with username/password.
    c = dispatch(build_conn(), @endpoint, :get, "/api/users/invites/#{invite["token"]}", nil)
    assert c.status == 200

    c =
      dispatch(build_conn(), @endpoint, :post, "/api/users/invites/#{invite["token"]}/claim", %{
        "username" => "newbie",
        "password" => "S3cret-Passw0rd!"
      })

    assert c.status == 200
    body = Jason.decode!(c.resp_body)
    assert body["user"]["username"] == "newbie"
    assert body["invite"]["status"] == "claimed"

    # Claiming again fails (already claimed).
    c =
      dispatch(build_conn(), @endpoint, :post, "/api/users/invites/#{invite["token"]}/claim", %{
        "username" => "other",
        "password" => "x"
      })

    assert c.status == 400

    # Revocation path on a second invite.
    invite2 = RadasAI.UserInviteService.create_user_invite("b@example.com", ["viewer"], "lt-user")

    c = dispatch(conn, @endpoint, :delete, "/api/users/invites/#{invite2["token"]}", nil)
    assert c.status == 200
  end

  # -- test cases ----------------------------------------------------------------

  test "test case CRUD + run engine + score", %{conn: conn, data_dir: data_dir} do
    c = dispatch(conn, @endpoint, :get, "/api/tests/catalog", nil)
    assert length(Jason.decode!(c.resp_body)["templates"]) == 4

    c =
      dispatch(conn, @endpoint, :post, "/api/tests", %{
        "name" => "No public CIDR",
        "kind" => "assertion",
        "assertions" => ["cidr_public", "ports_open"],
        "severity" => "blocker",
        "stack" => "tc-dev",
        "tags" => ["security"]
      })

    assert c.status == 201, c.resp_body
    %{"test" => tc} = Jason.decode!(c.resp_body)

    # Invalid assertion rejected.
    c =
      dispatch(conn, @endpoint, :post, "/api/tests", %{
        "name" => "bad",
        "kind" => "assertion",
        "assertions" => ["nope"]
      })

    assert c.status == 400

    # Stack with a public CIDR in tfvars → the test FAILS.
    RadasAI.CloudStacks.create_stack(@project, "tc-dev", "bytedc", %{"env" => "dev"})
    File.write!(Path.join([data_dir, "projects", @project, "stacks", "envs", "tc-dev", "terraform.tfvars"]), "cidr = \"0.0.0.0/0\"\n")

    c = dispatch(conn, @endpoint, :post, "/api/tests/#{tc["id"]}/run", nil)
    assert c.status == 200
    body = Jason.decode!(c.resp_body)
    assert body["passed"] == false
    assert body["status"] == "failed"
    assert Enum.any?(body["findings"], &(&1["assertion"] == "cidr_public"))

    # History records the run.
    c = dispatch(conn, @endpoint, :get, "/api/tests/#{tc["id"]}/history", nil)
    assert Jason.decode!(c.resp_body)["count"] == 1

    # Score: 1 failed blocker → 100 - 30 = 70 (grade C).
    c = dispatch(conn, @endpoint, :get, "/api/test-cases/score", nil)
    body = Jason.decode!(c.resp_body)
    assert body["score"] == 70
    assert body["grade"] == "C"

    # Update + clone + delete.
    c = dispatch(conn, @endpoint, :patch, "/api/tests/#{tc["id"]}", %{"severity" => "warning"})
    assert c.status == 200

    c = dispatch(conn, @endpoint, :post, "/api/tests/#{tc["id"]}/clone", nil)
    assert c.status == 201
    %{"test" => clone} = Jason.decode!(c.resp_body)
    assert clone["name"] =~ "(copy)"

    c = dispatch(conn, @endpoint, :delete, "/api/tests/#{tc["id"]}", nil)
    assert c.status == 200

    c = dispatch(conn, @endpoint, :get, "/api/tests/#{tc["id"]}", nil)
    assert c.status == 404
  end
end
