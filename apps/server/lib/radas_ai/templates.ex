defmodule RadasAI.Templates do
  @moduledoc """
  Port of the `templates/` catalog core (`templates/__init__.py` +
  `templates/generic.py`) — deployment template catalog and renderer.

  The full Python catalog ships 29 template modules with bespoke renderers.
  This port ships the catalog surface and the `generic` template renderer
  (hosts + vars + raw tasks); the remaining templates stay rendered by Flask
  until individually ported (each has a bespoke YAML generator).
  """

  defp registry do
    %{
      "generic" => %{
        "id" => "generic",
        "name" => "Generic / General-purpose",
        "category" => "General",
        "icon" => "wand-2",
        "description" =>
          "Fully general-purpose runner. Paste any complete Ansible playbook into the Raw playbook field to save & run it verbatim, or leave it empty and use the structured sections (packages, services, files, shell steps, raw tasks) to compose a play.",
        "tags" => ["generic", "raw", "custom", "install", "deploy", "config", "shell"]
      }
    }
  end

  @doc "Catalog cards (no variable schemas) — sorted by category then name."
  @spec list_templates() :: [map()]
  def list_templates do
    registry()
    |> Enum.map(fn {_id, t} ->
      %{
        "id" => t["id"],
        "name" => t["name"],
        "category" => t["category"],
        "description" => t["description"],
        "icon" => t["icon"],
        "tags" => t["tags"]
      }
    end)
    |> Enum.sort_by(&{&1["category"], &1["name"]})
  end

  @doc "Template detail (variables schema placeholder for generic)."
  @spec get_template(String.t()) :: map() | nil
  def get_template(template_id) do
    case Map.get(registry(), template_id) do
      nil -> nil
      t -> Map.put(t, "variables", generic_variables())
    end
  end

  @doc "Render a template to Ansible playbook YAML."
  @spec render_template(String.t(), map(), map() | nil) :: {:ok, map()} | {:error, String.t()}
  def render_template(template_id, values, targets \\ %{}) do
    case Map.get(registry(), template_id) do
      nil ->
        {:error, "Unknown template: #{template_id}"}

      _template ->
        values = stringify(values || %{})
        targets = stringify(targets || %{})

        yaml =
          case values["raw_playbook"] do
            raw when is_binary(raw) and raw != "" ->
              String.trim_trailing(raw, "\n")

            _ ->
              render_generic(values, targets)
          end

        filename = "#{template_id}-#{System.system_time(:second)}.yml"

        {:ok,
         %{
           "yaml" => yaml,
           "filename" => filename,
           "template_id" => template_id,
           "template_name" => registry()[template_id]["name"],
           "sidecars" => %{}
         }}
    end
  end

  # Generic renderer: hosts + become + vars + tasks (raw passthrough parity).
  defp render_generic(values, targets) do
    hosts = render_hosts(values, targets)
    lines = ["- name: #{values["name"] || "Rendered play"}", "  hosts: #{hosts}"]

    lines = if truthy(values["become"]), do: List.insert_at(lines, 2, "  become: true"), else: lines
    lines = if values["gather_facts"] == false, do: List.insert_at(lines, 3, "  gather_facts: false"), else: lines

    vars_block = values["vars"]

    lines =
      if is_map(vars_block) and map_size(vars_block) > 0 do
        lines ++ ["  vars:"] ++ indent_lines(yaml_lines(vars_block), 4)
      else
        lines
      end

    case values["raw_tasks"] do
      raw when is_binary(raw) and raw != "" ->
        lines ++ ["  tasks:"] ++ indent_lines(String.split(String.trim_trailing(raw, "\n"), "\n"), 4)

      _ ->
        lines ++ ["  tasks:", "    - debug:", "        msg: \"Rendered by RADAS generic template\""]
    end
    |> Enum.join("\n")
  end

  defp render_hosts(values, targets) do
    case values do
      %{"hosts" => hosts} when is_binary(hosts) and hosts != "" -> hosts
      _ -> if map_size(targets) > 0, do: "all", else: "all"
    end
  end

  defp generic_variables do
    [
      %{"name" => "name", "label" => "Play name", "type" => "text", "default" => "Rendered play"},
      %{"name" => "hosts", "label" => "Hosts pattern", "type" => "text", "default" => "all"},
      %{"name" => "become", "label" => "Become (sudo)", "type" => "checkbox", "default" => false},
      %{"name" => "vars", "label" => "Vars", "type" => "code", "language" => "yaml", "rows" => 8},
      %{"name" => "raw_tasks", "label" => "Raw tasks YAML", "type" => "code", "language" => "yaml", "rows" => 16},
      %{"name" => "raw_playbook", "label" => "Raw playbook YAML (overrides all fields)", "type" => "code", "language" => "yaml", "rows" => 16}
    ]
  end

  defp yaml_lines(%{} = map) do
    Enum.flat_map(map, fn
      {k, v} when is_map(v) ->
        nested = yaml_lines(v)
        ["  #{k}:" | Enum.map(nested, &("  " <> &1))]

      {k, v} ->
        ["  #{k}: #{format_scalar(v)}"]
    end)
  end

  defp yaml_lines(v), do: ["#{format_scalar(v)}"]

  defp format_scalar(v) when is_binary(v), do: v
  defp format_scalar(v), do: Jason.encode!(v)

  defp indent_lines(lines, n), do: Enum.map(lines, &(String.duplicate(" ", n) <> &1))

  defp truthy(v) when v in [true, 1, "1", "true", "yes"], do: true
  defp truthy(_), do: false

  defp stringify(data) when is_map(data) do
    Map.new(data, fn {k, v} -> {to_string(k), stringify(v)} end)
  end

  defp stringify(data) when is_list(data), do: Enum.map(data, &stringify/1)
  defp stringify(data), do: data
end
