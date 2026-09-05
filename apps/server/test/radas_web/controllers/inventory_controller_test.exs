defmodule RadasWeb.InventoryControllerTest do
  use Radas.DataCase, async: false

  # Contract tests for the inventory surface: YAML/INI parsing, group
  # extraction, HTTP CRUD over the project repo layout, group_vars.
  import Phoenix.ConnTest
  import Plug.Conn

  @endpoint RadasWeb.Endpoint
  @jwt_secret "inv-e2e-jwt-000000"
  @project "proj-inv-e2e"

  setup do
    System.put_env("JWT_SECRET_KEY", @jwt_secret)
    data_dir = Path.join(System.tmp_dir!(), "radas-inv-#{System.unique_integer()}")
    System.put_env("DATA_DIR", data_dir)

    on_exit(fn ->
      System.delete_env("JWT_SECRET_KEY")
      System.delete_env("DATA_DIR")
      File.rm_rf!(data_dir)
    end)

    token =
      RadasAI.AuthToken.encode(
        %{"user_id" => "inv-user", "username" => "inv", "roles" => [], "token_type" => "access", "exp" => System.system_time(:second) + 600, "iat" => System.system_time(:second)},
        @jwt_secret
      )

    # Repo layout with a YAML inventory.
    repo = Path.join([data_dir, "projects", @project, "repo"])
    File.mkdir_p!(repo)

    File.write!(Path.join(repo, "inventory.yml"), """
    all:
      children:
        web:
          hosts:
            web-1:
              ansible_host: 10.0.0.1
            web-2:
              ansible_host: 10.0.0.2
          vars:
            http_port: 80
        db:
          hosts:
            db-1:
    """)

    File.mkdir_p!(Path.join(repo, "group_vars"))
    File.write!(Path.join([repo, "group_vars", "web.yml"]), "http_port: 8080\nserver_name: web")

    conn = build_conn() |> put_req_header("authorization", "Bearer " <> token) |> put_req_header("x-project-id", @project)
    {:ok, conn: conn, token: token}
  end

  defp fresh_conn(token, project_id) do
    build_conn()
    |> put_req_header("authorization", "Bearer " <> token)
    |> put_req_header("x-project-id", project_id)
  end

  test "GET inventory groups extracts nested groups from YAML", %{conn: conn, token: token} do
    conn = dispatch(fresh_conn(token, @project), @endpoint, :get, "/api/inventory/groups", nil)
    assert conn.status == 200
    groups = Jason.decode!(conn.resp_body)["groups"]

    assert %{"hosts" => hosts, "children" => children, "vars" => vars} = groups["web"]
    assert MapSet.new(hosts) == MapSet.new(["web-1", "web-2"])
    assert vars == %{"http_port" => 80}
    assert groups["db"]["hosts"] == ["db-1"]
    # `all` is dropped when it carries no hosts/vars of its own.
    refute Map.has_key?(groups, "all")
  end

  test "INI inventories parse into the same shape", %{conn: conn, token: token} do
    repo = Path.join([System.get_env("DATA_DIR"), "projects", @project, "repo"])
    File.write!(Path.join(repo, "hosts.ini"), """
    [web]
    web-1 ansible_host=10.0.0.1

    [web:vars]
    http_port=80

    [db]
    db-1
    """)

    inv = RadasAI.InventoryIO.parse_ini_inventory(Path.join(repo, "hosts.ini"))
    children = inv["all"]["children"]
    assert children["web"]["hosts"] == %{"web-1" => nil}
    assert children["web"]["vars"]["http_port"] == "80"
    assert children["db"]["hosts"] == %{"db-1" => nil}
  end

  test "POST adds a group to the primary inventory file", %{conn: conn, token: token} do
    conn = dispatch(fresh_conn(token, @project), @endpoint, :post, "/api/inventory/groups", %{"name" => "cache"})
    assert conn.status == 200

    groups =
      Jason.decode!(dispatch(fresh_conn(token, @project), @endpoint, :get, "/api/inventory/groups", nil).resp_body)["groups"]

    assert Map.has_key?(groups, "cache")
  end

  test "DELETE removes a group; missing group → 404", %{conn: conn, token: token} do
    conn = dispatch(fresh_conn(token, @project), @endpoint, :delete, "/api/inventory/groups/web", nil)
    assert conn.status == 200

    groups =
      Jason.decode!(dispatch(fresh_conn(token, @project), @endpoint, :get, "/api/inventory/groups", nil).resp_body)["groups"]

    refute Map.has_key?(groups, "web")

    conn2 = dispatch(fresh_conn(token, @project), @endpoint, :delete, "/api/inventory/groups/ghost", nil)
    assert conn2.status == 404
  end

  test "group_vars GET reads the yaml file; PUT writes it", %{conn: conn, token: token} do
    conn = dispatch(fresh_conn(token, @project), @endpoint, :get, "/api/inventory/group-vars/web", nil)
    assert Jason.decode!(conn.resp_body)["vars"] == %{"http_port" => 8080, "server_name" => "web"}

    conn =
      dispatch(fresh_conn(token, @project), @endpoint, :put, "/api/inventory/group-vars/web", %{"http_port" => 9090, "worker" => 4})

    assert conn.status == 200
    vars = RadasAI.InventoryIO.read_vars_file(@project, "group_vars", "web")
    assert vars == %{"http_port" => 9090, "worker" => 4}
  end

  test "host_vars PUT writes a yaml file readable back", %{conn: conn, token: token} do
    conn = dispatch(fresh_conn(token, @project), @endpoint, :put, "/api/inventory/host-vars/web-1", %{"ansible_user" => "deploy"})
    assert conn.status == 200

    vars = RadasAI.InventoryIO.read_vars_file(@project, "host_vars", "web-1")
    assert vars == %{"ansible_user" => "deploy"}
  end

  test "missing project id is rejected" do
    conn = dispatch(build_conn(), @endpoint, :get, "/api/inventory/groups", nil)
    assert conn.status == 401 or conn.status == 400
  end
end
