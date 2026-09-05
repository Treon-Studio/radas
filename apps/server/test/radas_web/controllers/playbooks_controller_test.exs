defmodule RadasWeb.PlaybooksControllerTest do
  use Radas.DataCase, async: false

  # Contract tests for the playbook dual-store: ui JSON records + repo YAML
  # files under DATA_DIR/projects/<id>, with Flask-compatible listing.
  import Phoenix.ConnTest
  import Plug.Conn

  @endpoint RadasWeb.Endpoint
  @jwt_secret "pb-e2e-jwt-000000"
  @project "proj-pb-e2e"

  setup do
    System.put_env("JWT_SECRET_KEY", @jwt_secret)
    data_dir = Path.join(System.tmp_dir!(), "radas-pb-#{System.unique_integer()}")
    System.put_env("DATA_DIR", data_dir)

    on_exit(fn ->
      System.delete_env("JWT_SECRET_KEY")
      System.delete_env("DATA_DIR")
      File.rm_rf!(data_dir)
    end)

    token =
      RadasAI.AuthToken.encode(
        %{"user_id" => "pb-user", "username" => "pb", "roles" => [], "token_type" => "access", "exp" => System.system_time(:second) + 600, "iat" => System.system_time(:second)},
        @jwt_secret
      )

    {:ok, conn: build_conn() |> put_req_header("authorization", "Bearer " <> token) |> put_req_header("x-project-id", @project), token: token}
  end

  defp create_via_http(token, name, extra \\ %{}) do
    dispatch(
      build_conn()
      |> put_req_header("authorization", "Bearer " <> token)
      |> put_req_header("x-project-id", @project),
      @endpoint,
      :post,
      "/api/projects/#{@project}/playbooks",
      Map.merge(%{"name" => name, "description" => "desc"}, extra)
    )
  end

  defp get_via_http(token, path) do
    dispatch(
      build_conn()
      |> put_req_header("authorization", "Bearer " <> token)
      |> put_req_header("x-project-id", @project),
      @endpoint,
      :get,
      path,
      nil
    )
  end

  test "create returns 201 and the record lands in ui/playbooks/<id>.json", %{conn: conn, token: token} do
    conn = create_via_http(token, "deploy-web")
    assert conn.status == 201
    %{"playbook" => %{"id" => id}} = Jason.decode!(conn.resp_body)

    files = File.ls!(Path.join([System.get_env("DATA_DIR"), "projects", @project, "ui", "playbooks"]))
    assert "#{id}.json" in files
  end

  test "duplicate name → 409; empty name → 400", %{conn: conn, token: token} do
    create_via_http(token, "dup")
    conn = create_via_http(token, "dup")
    assert conn.status == 409

    conn = create_via_http(token, "")
    assert conn.status == 400
  end

  test "list merges JSON and repo YAML stores with summary shape", %{conn: conn, token: token} do
    create_via_http(token, "json-pb")

    repo_dir = Path.join([System.get_env("DATA_DIR"), "projects", @project, "repo", "playbooks"])
    File.mkdir_p!(repo_dir)

    File.write!(Path.join(repo_dir, "legacy.yml"), """
    - name: Legacy Playbook
      hosts: all
      tasks:
        - debug: msg=hi
    """)

    conn = get_via_http(token, "/api/projects/#{@project}/playbooks")
    assert conn.status == 200

    playbooks = Jason.decode!(conn.resp_body)["playbooks"]
    names = Enum.map(playbooks, & &1["name"])
    assert "json-pb" in names
    assert "Legacy Playbook" in names

    yaml_entry = Enum.find(playbooks, &(&1["name"] == "Legacy Playbook"))
    assert yaml_entry["plays_count"] == 1
    # uuid5-style deterministic id (Python parity: uuid5(NAMESPACE_URL, ...))
    assert String.length(yaml_entry["id"]) == 36
  end

  test "update patches fields and bumps version; missing → 404", %{conn: conn, token: token} do
    conn = create_via_http(token, "upd-pb")
    %{"playbook" => %{"id" => id, "version" => v1}} = Jason.decode!(conn.resp_body)
    assert v1 == 1

    conn =
      dispatch(
        build_conn()
        |> put_req_header("authorization", "Bearer " <> token)
        |> put_req_header("x-project-id", @project),
        @endpoint,
        :put,
        "/api/projects/#{@project}/playbooks/#{id}",
        %{"description" => "updated", "plays" => [%{"name" => "play 1", "hosts" => "all"}]}
      )

    assert conn.status == 200
    %{"playbook" => updated} = Jason.decode!(conn.resp_body)
    assert updated["description"] == "updated"
    assert updated["metadata"]["version"] == 2
    assert length(updated["plays"]) == 1

    conn =
      dispatch(
        build_conn() |> put_req_header("authorization", "Bearer " <> token) |> put_req_header("x-project-id", @project),
        @endpoint,
        :put,
        "/api/projects/#{@project}/playbooks/pb-missing",
        %{"description" => "x"}
      )
    assert conn.status == 404
  end

  test "delete removes the JSON file", %{conn: conn, token: token} do
    conn = create_via_http(token, "del-pb")
    %{"playbook" => %{"id" => id}} = Jason.decode!(conn.resp_body)

    conn =
      dispatch(
        build_conn() |> put_req_header("authorization", "Bearer " <> token) |> put_req_header("x-project-id", @project),
        @endpoint,
        :delete,
        "/api/projects/#{@project}/playbooks/#{id}",
        nil
      )
    assert Jason.decode!(conn.resp_body)["success"] == true

    conn = get_via_http(token, "/api/projects/#{@project}/playbooks/#{id}")
    assert conn.status == 404
  end
end
