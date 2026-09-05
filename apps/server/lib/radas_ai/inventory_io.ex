defmodule RadasAI.InventoryIO do
  @moduledoc """
  Port of `utils/inventory_io.py` — Ansible inventory parsing/merging:
  YAML and INI inventories, recursive group extraction into
  `{group => {hosts, children, vars, inventory_file}}`, host collection.
  """

  alias RadasAI.ProjectPaths

  @doc "Whether a file looks like an INI inventory."
  @spec ini_inventory_file?(String.t()) :: boolean()
  def ini_inventory_file?(path) do
    case File.read(path) do
      {:ok, content} ->
        String.match?(content, ~r/^\s*\[[\w._-]+\]/m) and not String.contains?(content, "---")

      _ ->
        false
    end
  end

  @doc "Parse an INI inventory into the YAML-shaped %{\"all\" => %{children => ...}} map."
  @spec parse_ini_inventory(String.t()) :: map()
  def parse_ini_inventory(path) do
    {:ok, content} = File.read(path)

    lines =
      String.split(content, ["\r\n", "\n"])
      |> Enum.map(&String.trim/1)
      |> Enum.reject(&(String.starts_with?(&1, ["#", ";"]) or &1 == ""))

    # Section-aware fold: {groups, current_mode, current_section}
    {groups, _, _} =
      Enum.reduce(lines, {%{}, nil, nil}, fn line, {groups, mode, section} ->
        case Regex.run(~r/^\[([\w.-]+)(?::(vars|children))?\]$/, line) do
          [_, name] ->
            groups = Map.put_new(groups, name, empty_group())
            {groups, :hosts, name}

          [_, name, "vars"] ->
            groups = Map.put_new(groups, name, empty_group())
            {groups, :vars, name}

          [_, name, "children"] ->
            groups = Map.put_new(groups, name, empty_group())
            {groups, :children, name}

          _ ->
            {groups, mode, section}
        end
        |> then(fn {groups, mode, section} ->
          {put_line(groups, mode, section, line), mode, section}
        end)
      end)

    all_children = Map.drop(groups, ["all"])
    all_group = Map.get(groups, "all")

    root =
      if all_group && map_size(all_group["vars"] || %{}) > 0 do
        %{"children" => all_children, "vars" => all_group["vars"]}
      else
        %{"children" => all_children}
      end

    %{"all" => root}
  end

  defp empty_group, do: %{"hosts" => %{}, "children" => %{}, "vars" => %{}}

  # The fold above needs the line stored before the section regex decides the
  # mode; put_line is a no-op for section-header lines and applies content
  # lines to the current section.
  defp put_line(groups, mode, section, line) do
    cond do
      Regex.match?(~r/^\[[\w.-]+(?::(?:vars|children))?\]$/, line) ->
        groups

      mode == :children ->
        child = first_token(line)
        group = Map.get(groups, section, empty_group())
        children = Map.put(group["children"] || %{}, child, nil)
        Map.put(groups, section, Map.put(group, "children", children))

      mode == :vars ->
        group = Map.get(groups, section, empty_group())

        case String.split(line, "=", parts: 2) do
          [k, v] -> Map.put(groups, section, Map.put(group, "vars", Map.put(group["vars"] || %{}, String.trim(k), String.trim(v))))
          _ -> groups
        end

      mode == :hosts ->
        group = Map.get(groups, section, empty_group())
        host = first_token(line)
        hosts = Map.put(group["hosts"] || %{}, host, nil)
        Map.put(groups, section, Map.put(group, "hosts", hosts))

      true ->
        groups
    end
  end

  defp first_token(line) do
    line |> String.split(~r/\s+/) |> hd()
  end

  @doc "Load one inventory file (YAML or INI) into a map."
  @spec load_inventory_file(String.t()) :: map() | nil
  def load_inventory_file(path) do
    if ini_inventory_file?(path) do
      parse_ini_inventory(path)
    else
      case YamlElixir.read_from_file(path) do
        {:ok, data} when is_map(data) -> stringify(data)
        _ -> nil
      end
    end
  rescue
    _ -> nil
  end

  @doc """
  Merge inventories into {group => {hosts, children, inventory_file, vars?}} —
  port of `get_inventory_groups`.
  """
  @spec get_inventory_groups([String.t()]) :: map()
  def get_inventory_groups(inventory_files)

  def get_inventory_groups(files) when files == [] or files == nil, do: %{}

  def get_inventory_groups(inventory_files) do
    Enum.reduce(inventory_files, %{}, fn file_name, groups ->
      if Path.type(file_name) == :absolute or String.contains?(file_name, "/") do
        case load_inventory_file(file_name) do
          nil ->
            groups

          inventory ->
            rel = rel_path_label(file_name)
            inv = inventory["all"] || inventory
            extract_groups(inv, groups, "all", rel)
        end
      else
        groups
      end
    end)
    |> drop_empty_all()
  end

  defp drop_empty_all(groups) do
    # Python parity: drop `all` when it has no hosts and no vars — children
    # alone do not keep it (they are re-exposed at the top level).
    case Map.get(groups, "all") do
      %{"hosts" => [], "vars" => v} when v in [nil, "", %{}] -> Map.delete(groups, "all")
      %{"hosts" => []} = all when not is_map_key(all, "vars") -> Map.delete(groups, "all")
      _ -> groups
    end
  end

  defp rel_path_label(file_name) do
    parts = String.split(file_name, "/")

    case Enum.find_index(parts, &(&1 == "projects")) do
      idx when idx != nil and idx + 1 < length(parts) ->
        repo_prefix = Enum.take(parts, idx + 2) ++ ["repo"]
        repo_len = length(repo_prefix)

        if length(parts) > repo_len and Enum.take(parts, repo_len) == repo_prefix do
          Enum.drop(parts, repo_len) |> Enum.join("/")
        else
          Path.basename(file_name)
        end

      _ ->
        Path.basename(file_name)
    end
  end

  @doc "Recursively collect groups — port of extract_groups_from_inventory."
  @spec extract_groups(map(), map(), String.t(), String.t() | nil) :: map()
  def extract_groups(group_data, groups_dict, parent_path, inventory_file \\ nil) when is_map(group_data) do
    current_group = if parent_path == "", do: "all", else: parent_path
    groups_dict = ensure_group(groups_dict, current_group, inventory_file)

    groups_dict =
      if is_map(group_data["vars"]) and map_size(group_data["vars"]) > 0 do
        put_in(groups_dict, [current_group, "vars"], group_data["vars"])
      else
        groups_dict
      end

    groups_dict =
      case group_data["hosts"] do
        hosts when is_map(hosts) ->
          host_list = Enum.filter(Map.keys(hosts), &(is_binary(&1) and not String.starts_with?(&1, "#")))
          add_hosts(groups_dict, current_group, host_list, inventory_file)

        hosts when is_list(hosts) ->
          host_list = Enum.filter(hosts, &(is_binary(&1) and not String.starts_with?(&1, "#")))
          add_hosts(groups_dict, current_group, host_list, inventory_file)

        _ ->
          groups_dict
      end

    case group_data["children"] do
      children when is_map(children) and map_size(children) > 0 ->
        Enum.reduce(children, groups_dict, fn {child_name, child_data}, acc ->
          if is_binary(child_name) and not String.starts_with?(child_name, "#") do
            acc = ensure_group(acc, child_name, inventory_file)
            acc = add_child(acc, current_group, child_name)
            extract_groups(child_data, acc, child_name, inventory_file)
          else
            acc
          end
        end)

      children when is_list(children) and children != [] ->
        Enum.reduce(children, groups_dict, fn child_name, acc ->
          if is_binary(child_name) and not String.starts_with?(child_name, "#") do
            acc = ensure_group(acc, child_name, inventory_file)
            add_child(acc, current_group, child_name)
          else
            acc
          end
        end)

      _ ->
        groups_dict
    end
  end

  defp ensure_group(groups, name, inventory_file) do
    Map.put_new(groups, name, %{"hosts" => [], "children" => [], "inventory_file" => inventory_file})
  end

  defp add_hosts(groups, group, host_list, inventory_file) do
    if host_list == [] do
      groups
    else
      groups = Map.update!(groups, group, fn g -> Map.update(g, "hosts", [], fn existing -> existing ++ host_list end) end)

      if inventory_file do
        g = groups[group]

        if g["inventory_file"] in [nil, ""] do
          Map.put(groups, group, Map.put(g, "inventory_file", inventory_file))
        else
          groups
        end
      else
        groups
      end
    end
  end

  defp add_child(groups, parent, child) do
    Map.update!(groups, parent, fn g -> Map.update(g, "children", [], fn existing -> existing ++ [child] end) end)
  end

  @doc "Recursively collect hosts — port of extract_hosts_from_group (dedup)."
  @spec extract_hosts(map(), MapSet.t(String.t())) :: {MapSet.t(String.t()), [map()]}
  def extract_hosts(group_data, hosts_set, hosts_list \\ [], parent_path \\ "", inventory_file \\ nil)

  def extract_hosts(group_data, hosts_set, hosts_list, parent_path, inventory_file) when is_map(group_data) do
    hosts_set = MapSet.put(hosts_set, parent_path)

    {hosts_set, hosts_list} =
      case group_data["hosts"] do
        hosts when is_map(hosts) ->
          Enum.reduce(hosts, {hosts_set, hosts_list}, fn {host, config}, {set, list} ->
            if is_binary(host) and not String.starts_with?(host, "#") and not MapSet.member?(set, host) do
              set = MapSet.put(set, host)
              entry = %{"name" => host, "inventory_file" => inventory_file}
              {set, list ++ [entry]}
            else
              {set, list}
            end
          end)

        _ ->
          {hosts_set, hosts_list}
      end

    case group_data["children"] do
      children when is_map(children) and map_size(children) > 0 ->
        Enum.reduce(children, {hosts_set, hosts_list}, fn {child, child_data}, acc ->
          extract_hosts(child_data, elem(acc, 0), elem(acc, 1), child, inventory_file)
        end)

      _ ->
        {hosts_set, hosts_list}
    end
  end

  def extract_hosts(_, set, list, _p, _i), do: {set, list}

  @doc "All hosts for a set of inventory files."
  @spec get_inventory_hosts([String.t()]) :: [map()]
  def get_inventory_hosts(inventory_files) do
    {set, list} =
      Enum.reduce(inventory_files, {MapSet.new(), []}, fn file, {set, list} ->
        case load_inventory_file(file) do
          nil -> {set, list}
          inv -> extract_hosts(inv["all"] || inv, set, list, "all", rel_label(file))
        end
      end)

    _ = set
    list
  end

  defp rel_label(file), do: Path.basename(file)

  # helpers ---------------------------------------------------------------

  @doc "Read a group_vars/<name>.yml or host_vars/<name>.yml file as a map."
  @spec read_vars_file(String.t(), String.t(), String.t()) :: map()
  def read_vars_file(project_id, kind, name) do
    base = Path.join([ProjectPaths.project_dir(project_id), "repo", kind])
    path = Path.join(base, "#{name}.yml")
    alt = Path.join(base, "#{name}.yaml")

    for p <- [path, alt], File.exists?(p) do
      case YamlElixir.read_from_file(p) do
        {:ok, data} -> stringify(data)
        _ -> %{}
      end
    end
    |> List.first()
    |> then(&(&1 || %{}))
  end

  @doc "Write a vars file (YAML)."
  @spec write_vars_file(String.t(), String.t(), String.t(), map()) :: :ok
  def write_vars_file(project_id, kind, name, data) do
    base = Path.join([ProjectPaths.project_dir(project_id), "repo", kind])
    File.mkdir_p!(base)
    path = Path.join(base, "#{name}.yml")
    encoded = encode_yaml(data)
    File.write!(path, encoded)
    :ok
  end

  @doc "Minimal YAML emitter for simple maps/lists/scalars (vars files)."
  def encode_yaml(data), do: encode_value(stringify(data), 0) <> "\n"

  defp encode_value(%{} = map, indent) when map_size(map) == 0, do: "{}"

  defp encode_value(%{} = map, indent) do
    pad = String.duplicate(" ", indent)

    Enum.map_join(map, "\n", fn {k, v} ->
      "#{pad}#{k}: #{encode_inline(v, indent + 2)}"
    end)
  end

  defp encode_value(list, indent) when is_list(list) do
    pad = String.duplicate(" ", indent)

    Enum.map_join(list, "\n", fn v ->
      "#{pad}- #{encode_inline(v, indent + 2)}"
    end)
  end

  defp encode_value(v, _indent), do: to_string(v)

  # YAML is a superset of JSON — nested structures emit as inline JSON.
  defp encode_inline(%{} = map, _indent), do: Jason.encode!(map)
  defp encode_inline(list, _indent) when is_list(list), do: Jason.encode!(list)
  defp encode_inline(v, _indent), do: v

  @doc "Deep-convert atom keys/values from YamlElixir into string-keyed maps."
  @spec stringify(term()) :: term()
  def stringify(data) when is_map(data) do
    Map.new(data, fn {k, v} -> {to_string(k), stringify(v)} end)
  end

  def stringify(data) when is_list(data), do: Enum.map(data, &stringify/1)
  def stringify(data), do: data

  defp parse_int(nil, default), do: default

  defp parse_int(v, _default) when is_integer(v), do: v
  defp parse_int(v, _default) when is_float(v), do: trunc(v)

  defp parse_int(v, default) when is_binary(v) do
    case Integer.parse(v) do
      {n, _} -> n
      :error -> default
    end
  end
end
