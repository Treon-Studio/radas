defmodule Radas.LegacyDefaultWorkspaceGuardTest do
  @moduledoc """
  Tenant-escape guard: requests must not resolve the legacy default
  workspace (DATA_DIR/cloud-provisioning/default). ExUnit port of
  `tests/test_legacy_default_workspace_guard.py` (removed with the Flask
  tree). The fallback remains available only for non-request callers
  (background jobs) and every use is counted so the legacy path can be
  retired.
  """

  use ExUnit.Case, async: false

  alias RadasAI.CloudStacks

  setup do
    tmp = Path.join(System.tmp_dir!(), "legacy-ws-guard-#{System.unique_integer([:positive])}")
    File.mkdir_p!(tmp)
    prev = System.get_env("DATA_DIR")
    System.put_env("DATA_DIR", tmp)
    CloudStacks.reset_legacy_default_workspace_uses()

    on_exit(fn ->
      if prev, do: System.put_env("DATA_DIR", prev), else: System.delete_env("DATA_DIR")
      File.rm_rf!(tmp)
    end)

    %{tmp: tmp}
  end

  defp in_request_context(fun) do
    # A real request process carries the conn in the process dictionary
    # (same signal the guard checks — see CloudStacks.request_context?/0).
    Task.async(fn ->
      Process.put(:plug_conn, %Plug.Conn{})
      fun.()
    end)
    |> Task.await()
  end

  test "project id resolves per-project root" do
    root = CloudStacks.stacks_root("proj-1")
    assert root == Path.join([RadasAI.ProjectPaths.data_dir(), "projects", "proj-1", "stacks"])
    assert CloudStacks.legacy_default_workspace_uses() == 0
  end

  test "background caller falls back with metric" do
    root = CloudStacks.stacks_root(nil)

    assert root ==
             Path.join([RadasAI.ProjectPaths.data_dir(), "cloud-provisioning", "default"])

    assert CloudStacks.legacy_default_workspace_uses() == 1
  end

  test "request context without project id is rejected" do
    result =
      in_request_context(fn ->
        try do
          CloudStacks.stacks_root(nil)
          :no_raise
        rescue
          e in CloudStacks.LegacyDefaultWorkspaceError -> {:raised, e.message, e.plug_status}
        end
      end)

    assert {:raised, "Project context required", 403} = result
    assert CloudStacks.legacy_default_workspace_uses() == 0
  end

  test "request context with project uses project root" do
    root =
      in_request_context(fn ->
        CloudStacks.stacks_root("proj-2")
      end)

    assert root == Path.join([RadasAI.ProjectPaths.data_dir(), "projects", "proj-2", "stacks"])
    assert CloudStacks.legacy_default_workspace_uses() == 0
  end

  test "metric is concurrency-safe" do
    tasks =
      Enum.map(1..4, fn _ ->
        Task.async(fn ->
          for _ <- 1..100, do: CloudStacks.record_legacy_default_workspace_use()
        end)
      end)

    Enum.each(tasks, &Task.await/1)
    assert CloudStacks.legacy_default_workspace_uses() == 400
  end
end
