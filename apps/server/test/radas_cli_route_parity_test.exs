defmodule RadasCliRouteParityTest do
  use ExUnit.Case, async: false

  # Port of apps/server/scripts/check_route_parity.py: every remote command in
  # contracts/cli-route-manifest.json must map to a served Phoenix route.
  # `%s` placeholders in the manifest map to single-segment `:param` routes.

  @manifest (Path.expand(Path.join([File.cwd!(), "..", "..", "contracts", "cli-route-manifest.json"]))
               |> File.read!()
               |> Jason.decode!())

  defp served_routes do
    {out, 0} = System.cmd("mix", ["phx.routes"], cd: File.cwd!(), stderr_to_stdout: true)
    String.split(out, "\n", trim: true)
  end

  test "manifest is well-formed" do
    assert @manifest["$schema"] == "https://radas.dev/schemas/cli-route-manifest-v1.json"
    assert is_list(@manifest["commands"]) and @manifest["commands"] != []
  end

  test "every remote CLI command maps to a served route" do
    served =
      served_routes()
      |> Enum.flat_map(fn line ->
        case String.split(line) do
          [method, path | _] -> [{method, path}]
          _ -> []
        end
      end)
      |> MapSet.new()

    assert served != [], "mix phx.routes produced no routes"

    # CLI-consumed routes whose Flask-era services have no Elixir port yet.
    # Every entry: {path prefix, source file} — each must be removed in the
    # commit that ports its service (Phase 8 long-tail ledger, see
    # docs/architecture/elixir-phase8-notes.md).
    deferred = [
    ]

    is_deferred = fn cmd ->
      Enum.any?(deferred, fn {prefix, _src} -> String.starts_with?(cmd["path"], prefix) end)
    end

    unmet =
      @manifest["commands"]
      |> Enum.filter(&(&1["kind"] == "remote"))
      |> Enum.reject(fn cmd -> is_deferred.(cmd) end)
      |> Enum.reject(fn cmd ->
        method = String.upcase(cmd["method"] || "GET")
        pattern = phx_pattern(cmd["path"])
        served?(served, method, pattern)
      end)

    assert unmet == [],
           "remote CLI commands without a served Phoenix route: " <>
             Enum.map_join(unmet, ", ", &"#{&1["command"]} #{&1["method"]} #{&1["path"]}")
  end

  # "/api/cloud/stacks/%s/actions" -> "/api/cloud/stacks/:param/actions"
  defp phx_pattern(path), do: String.replace(to_string(path), "%s", ":param")

  defp served?(served, method, pattern) do
    MapSet.member?(served, {method, pattern}) or wildcard_match?(served, method, pattern)
  end

  # A manifest path matches when some served route has the same shape
  # (literal segments equal, :params in the same positions).
  defp wildcard_match?(served, method, pattern) do
    want = String.split(pattern, "/", trim: true)

    Enum.any?(served, fn {m, p} ->
      m == method and matching_shape?(String.split(p, "/", trim: true), want)
    end)
  end

  defp matching_shape?(served, want) when length(served) == length(want) do
    Enum.zip(served, want)
    |> Enum.all?(fn
      {":" <> _name, _w} -> true
      {s, ":" <> _w} -> true
      {s, w} -> s == w
    end)
  end

  defp matching_shape?(_, _), do: false
end
