defmodule RadasAI.CodeRegistry do
  @moduledoc """
  Port of `services/code_registry.py` — shadcn-style "bring your own code"
  (Fase 6 — UC 382+, UC 661–666). Registry items are plain git-versioned
  files under `apps/server/priv/registry/<type>/<name>` with a
  `radas.json` manifest. Installing COPIES item code into the stack
  workspace; an install manifest at `.cloud-provisioning/<stack>/registry.json`
  tracks exactly what was copied so uninstall removes it.
  """

  alias RadasAI.CloudStacks

  @item_types ["tofu-block", "ansible-role"]

  def item_types, do: @item_types

  defp registry_root do
    case System.get_env("REGISTRY_DIR") do
      nil -> Path.expand(Path.join([File.cwd!(), "priv", "registry"]))
      dir -> Path.expand(dir)
    end
  end

  defp manifest_path(project_id, stack),
    do: Path.join(CloudStacks.stack_data_dir(project_id, stack), "registry.json")

  defp load_manifest(project_id, stack) do
    case File.read(manifest_path(project_id, stack)) do
      {:ok, binary} -> (Jason.decode(binary) |> elem(1)) || %{}
      _ -> %{}
    end
  rescue
    _ -> %{}
  end

  defp save_manifest(project_id, stack, manifest) do
    path = manifest_path(project_id, stack)
    File.mkdir_p!(Path.dirname(path))
    File.write!(path, Jason.encode!(manifest, pretty: true))
  end

  defp read_meta(dir) do
    case File.read(Path.join(dir, "radas.json")) do
      {:ok, binary} -> (Jason.decode(binary) |> elem(1)) || %{}
      _ -> %{}
    end
  end

  defp item_files(dir) do
    dir
    |> list_all_files()
    |> Enum.map(&Path.relative_to(&1, dir))
    |> Enum.reject(&(&1 == "radas.json"))
    |> Enum.sort()
  end

  defp list_all_files(dir) do
    case File.ls(dir) do
      {:ok, entries} ->
        Enum.flat_map(entries, fn entry ->
          path = Path.join(dir, entry)

          if File.dir?(path) do
            list_all_files(path)
          else
            [path]
          end
        end)

      _ ->
        []
    end
  end

  @doc "All registry items with metadata (Python catalog)."
  @spec catalog() :: [map()]
  def catalog do
    root = registry_root()

    Enum.flat_map(@item_types, fn itype ->
      case File.ls(Path.join(root, itype)) do
        {:ok, entries} ->
          entries
          |> Enum.sort()
          |> Enum.filter(&File.dir?(Path.join([root, itype, &1])))
          |> Enum.map(fn name ->
            meta = read_meta(Path.join([root, itype, name]))

            %{
              "name" => name,
              "type" => itype,
              "version" => meta["version"] || "0.0.0",
              "description" => meta["description"] || "",
              "tags" => meta["tags"] || []
            }
          end)

        _ ->
          []
      end
    end)
  end

  @doc "One registry item, optionally typed; nil when absent."
  @spec get_item(String.t(), String.t() | nil) :: map() | nil
  def get_item(name, itype \\ nil) do
    name = String.trim(name || "")
    types = if itype, do: [itype], else: @item_types
    root = registry_root()

    Enum.find_value(types, fn candidate ->
      d = Path.join([root, candidate, name])

      if name != "" and File.dir?(d) do
        meta = read_meta(d)

        %{
          "name" => name,
          "type" => candidate,
          "path" => d,
          "version" => meta["version"] || "0.0.0",
          "description" => meta["description"] || "",
          "tags" => meta["tags"] || [],
          "files" => item_files(d)
        }
      else
        nil
      end
    end)
  end

  defp stack_dir_of!(project_id, stack) do
    sd = CloudStacks.stack_dir(project_id, stack)

    if File.dir?(sd) do
      sd
    else
      raise ArgumentError, message: "Stack '#{stack}' not found"
    end
  end

  @doc "Item version changelog (UC662); raises when absent."
  @spec get_item_changelog(String.t()) :: [map()]
  def get_item_changelog(name) do
    item = get_item(name)

    if item == nil do
      raise ArgumentError, message: "Registry item '#{name}' not found"
    end

    read_meta(item["path"])["changelog"] || []
  end

  @doc "Transitive dependencies in topological install order (UC663)."
  @spec resolve_dependencies(String.t()) :: [String.t()]
  def resolve_dependencies(name) do
    resolved = []
    visited = MapSet.new()
    visiting = MapSet.new()
    dfs(name, name, resolved, visited, visiting) |> elem(0)
  end

  defp dfs(root, current, resolved, visited, visiting) do
    cond do
      MapSet.member?(visiting, current) ->
        raise ArgumentError, message: "Circular dependency detected involving '#{current}'"

      MapSet.member?(visited, current) ->
        {resolved, visited}

      true ->
        item = get_item(current)

        unless item do
          raise ArgumentError, message: "Dependency '#{current}' not found in registry"
        end

        deps = read_meta(item["path"])["dependencies"] || []
        visiting = MapSet.put(visiting, current)

        {resolved, visited} =
          Enum.reduce(deps, {resolved, visited}, fn dep, {res, vis} ->
            dfs(root, dep, res, vis, visiting)
          end)

        visiting = MapSet.delete(visiting, current)
        visited = MapSet.put(visited, current)

        resolved =
          if current != root and current not in resolved, do: resolved ++ [current], else: resolved

        {resolved, visited}
    end
  end

  @doc """
  Copy a registry item's code into the stack workspace (Python install).
  tofu-block → flattened `<name>-<file>.tf`; ansible-role → `roles/<name>/`.
  """
  @spec install(String.t() | nil, String.t(), String.t(), keyword()) :: map()
  def install(project_id, stack, name, opts \\ []) do
    resolve_deps = Keyword.get(opts, :resolve_deps, false)
    version = Keyword.get(opts, :version)

    {deps_installed, _} =
      if resolve_deps do
        deps = resolve_dependencies(name)
        manifest_curr = load_manifest(project_id, stack)

        deps_installed =
          Enum.filter(deps, &not Map.has_key?(manifest_curr, &1))

        Enum.each(deps_installed, &install(project_id, stack, &1, resolve_deps: false))
        {deps_installed, nil}
      else
        {[], nil}
      end

    item = get_item(name)

    if item == nil do
      raise ArgumentError, message: "Registry item '#{name}' not found"
    end

    meta = read_meta(item["path"])
    target_version = item["version"] || "1.0.0"

    target_version =
      if version do
        known = [item["version"] || "1.0.0"]
        known = known ++ (is_map(meta["versions"]) && Map.keys(meta["versions"]) || [])
        known = known ++ changelog_versions(meta["changelog"])

        if version not in known do
          raise ArgumentError, message: "Version '#{version}' not found for '#{name}'"
        end

        version
      else
        target_version
      end

    sd = stack_dir_of!(project_id, stack)
    manifest = load_manifest(project_id, stack)

    if Map.has_key?(manifest, name) do
      raise ArgumentError, message: "'#{name}' already installed on stack '#{stack}'. Uninstall first."
    end

    {copied, manifest} =
      if item["type"] == "tofu-block" do
        copied =
          item["files"]
          |> Enum.filter(&String.ends_with?(&1, ".tf"))
          |> Enum.map(fn f ->
            dst_name = "#{name}-#{Path.basename(f)}"
            File.cp!(Path.join(item["path"], f), Path.join(sd, dst_name))
            dst_name
          end)

        {copied, manifest}
      else
        role_dir = Path.join([sd, "roles", name])

        if File.dir?(role_dir) do
          raise ArgumentError, message: "Role directory already exists: roles/#{name}"
        end

        copied =
          Enum.map(item["files"], fn f ->
            dest = Path.join(role_dir, f)
            File.mkdir_p!(Path.dirname(dest))
            File.cp!(Path.join(item["path"], f), dest)
            "roles/#{name}/#{f}"
          end)

        {copied, manifest}
      end

    manifest =
      Map.put(manifest, name, %{
        "type" => item["type"],
        "version" => target_version,
        "installed_at" => System.system_time(:second),
        "files_copied" => copied
      })

    save_manifest(project_id, stack, manifest)

    res = %{
      "name" => name,
      "type" => item["type"],
      "version" => target_version,
      "stack" => stack,
      "files_copied" => copied
    }

    if deps_installed != [], do: Map.put(res, "dependencies_installed", deps_installed), else: res
  end

  defp changelog_versions(nil), do: []
  defp changelog_versions(cl) when is_list(cl), do: Enum.flat_map(cl, fn c -> if is_map(c) and c["version"], do: [c["version"]], else: [] end)
  defp changelog_versions(_), do: []

  @doc "Remove a registry item's copied files from the stack workspace."
  @spec uninstall(String.t() | nil, String.t(), String.t()) :: map()
  def uninstall(project_id, stack, name) do
    manifest = load_manifest(project_id, stack)
    rec = manifest[name]

    if rec == nil do
      raise ArgumentError, message: "'#{name}' is not installed on stack '#{stack}'"
    end

    sd = stack_dir_of!(project_id, stack)

    removed =
      if rec["type"] == "ansible-role" do
        role_dir = Path.join([sd, "roles", name])

        if File.dir?(role_dir) do
          File.rm_rf!(role_dir)
          ["roles/#{name}/"]
        else
          []
        end
      else
        Enum.flat_map(rec["files_copied"] || [], fn f ->
          dest = Path.join(sd, f)

          if File.exists?(dest) do
            File.rm(dest)
            [f]
          else
            []
          end
        end)
      end

    manifest = Map.delete(manifest, name)
    save_manifest(project_id, stack, manifest)
    %{"name" => name, "stack" => stack, "removed" => removed}
  end

  @doc "Installed items for a stack (Python installed)."
  @spec installed(String.t() | nil, String.t()) :: [map()]
  def installed(project_id, stack) do
    load_manifest(project_id, stack)
    |> Enum.sort_by(fn {n, _} -> n end)
    |> Enum.map(fn {n, v} -> Map.merge(v, %{"name" => n}) end)
  end

  @doc "Portable JSON bundle of one item (UC661); raises when absent."
  @spec export_item_bundle(String.t()) :: map()
  def export_item_bundle(name) do
    item = get_item(name)

    if item == nil do
      raise ArgumentError, message: "Registry item '#{name}' not found"
    end

    meta = read_meta(item["path"])

    files =
      Enum.reduce(item["files"], %{}, fn f, acc ->
        path = Path.join(item["path"], f)

        if File.regular?(path) do
          Map.put(acc, f, File.read!(path))
        else
          acc
        end
      end)

    %{
      "name" => item["name"],
      "type" => item["type"],
      "version" => item["version"] || "1.0.0",
      "description" => item["description"] || "",
      "tags" => item["tags"] || [],
      "dependencies" => meta["dependencies"] || [],
      "changelog" => meta["changelog"] || [],
      "files" => files
    }
  end

  @doc "Import a bundle into the local registry (UC661)."
  @spec import_item_bundle(map()) :: map()
  def import_item_bundle(bundle) when is_map(bundle) do
    name = String.trim(to_string(bundle["name"] || ""))

    if name == "" do
      raise ArgumentError, message: "Item name is required in bundle"
    end

    itype = bundle["type"] || "tofu-block"

    if itype not in @item_types do
      raise ArgumentError, message: "Invalid item type '#{itype}'. Allowed: #{inspect(@item_types)}"
    end

    target_dir = Path.join([registry_root(), itype, name])
    File.mkdir_p!(target_dir)

    meta = %{
      "name" => name,
      "type" => itype,
      "version" => bundle["version"] || "1.0.0",
      "description" => bundle["description"] || "",
      "tags" => bundle["tags"] || [],
      "dependencies" => bundle["dependencies"] || [],
      "changelog" => bundle["changelog"] || []
    }

    File.write!(Path.join(target_dir, "radas.json"), Jason.encode!(meta, pretty: true))

    files = bundle["files"] || %{}

    Enum.each(files, fn {rel, content} ->
      dst = Path.join(target_dir, rel)
      File.mkdir_p!(Path.dirname(dst))
      File.write!(dst, content)
    end)

    %{"success" => true, "name" => name, "type" => itype, "version" => meta["version"], "files_count" => map_size(files)}
  end

  @doc "Publish files from a stack workspace into the registry (UC664)."
  @spec publish_from_stack(String.t() | nil, String.t(), String.t(), String.t(), [String.t()], keyword()) :: map()
  def publish_from_stack(project_id, stack, name, item_type, file_patterns, opts \\ []) do
    name = String.trim(name || "")

    if name == "" do
      raise ArgumentError, message: "Item name is required"
    end

    if item_type not in @item_types do
      raise ArgumentError, message: "Invalid item type '#{item_type}'. Allowed: #{inspect(@item_types)}"
    end

    sd = stack_dir_of!(project_id, stack)
    target_dir = Path.join([registry_root(), item_type, name])
    File.mkdir_p!(target_dir)

    published_files =
      Enum.flat_map(file_patterns, fn pattern ->
        matched =
          if String.contains?(pattern, "*") do
            glob_stack(sd, pattern)
          else
            [Path.join(sd, pattern)]
          end

        Enum.flat_map(matched, fn src_path ->
          if File.regular?(src_path) do
            rel = Path.relative_to(src_path, sd)
            dest = Path.join(target_dir, rel)
            File.mkdir_p!(Path.dirname(dest))
            File.cp!(src_path, dest)
            [rel]
          else
            []
          end
        end)
      end)

    if published_files == [] do
      raise ArgumentError, message: "No files matched patterns #{inspect(file_patterns)} in stack '#{stack}'"
    end

    version = Keyword.get(opts, :version, "1.0.0")

    meta = %{
      "name" => name,
      "type" => item_type,
      "version" => version,
      "description" => Keyword.get(opts, :description, ""),
      "tags" => Keyword.get(opts, :tags) || [],
      "dependencies" => Keyword.get(opts, :dependencies) || [],
      "changelog" => [
        %{
          "version" => version,
          "date" => Date.utc_today() |> Date.to_iso8601(),
          "changes" => ["Published from stack #{stack}"]
        }
      ]
    }

    File.write!(Path.join(target_dir, "radas.json"), Jason.encode!(meta, pretty: true))

    %{
      "success" => true,
      "name" => name,
      "type" => item_type,
      "version" => version,
      "stack" => stack,
      "files_published" => published_files
    }
  end

  # Minimal glob (supports the `*` wildcard patterns used by publish).
  defp glob_stack(dir, pattern) do
    case Path.split(pattern) do
      [single] -> Path.wildcard(Path.join(dir, single))
      segments -> Path.wildcard(Path.join([dir | segments]))
    end
  end

  @doc "Dry-run diff between installed files and the registry target (UC665)."
  @spec diff_installed_item(String.t() | nil, String.t(), String.t(), String.t() | nil) :: map()
  def diff_installed_item(project_id, stack, name, target_version \\ nil) do
    manifest = load_manifest(project_id, stack)
    rec = manifest[name]

    if rec == nil do
      raise ArgumentError, message: "'#{name}' is not installed on stack '#{stack}'"
    end

    item = get_item(name)

    if item == nil do
      raise ArgumentError, message: "Registry item '#{name}' not found"
    end

    sd = stack_dir_of!(project_id, stack)
    target_v = target_version || item["version"] || "1.0.0"

    file_diffs =
      Enum.map(item["files"], fn f ->
        if item["type"] == "tofu-block" and not String.ends_with?(f, ".tf") do
          nil
        else
          {installed_path, label} =
            if item["type"] == "tofu-block" do
              dst_name = "#{name}-#{Path.basename(f)}"
              {Path.join(sd, dst_name), dst_name}
            else
              {Path.join([sd, "roles", name, f]), "roles/#{name}/#{f}"}
            end

          old_lines = read_lines(installed_path)
          new_lines = read_lines(Path.join(item["path"], f))

          from_label =
            "a/#{label} (#{rec["version"] || "installed"})"

          to_label = "b/#{label} (#{target_v})"

          diff_str =
            unified_diff(old_lines, new_lines, from_label, to_label)

          status =
            cond do
              diff_str == "" -> "unchanged"
              old_lines == [] -> "added"
              true -> "modified"
            end

          %{"file" => label, "status" => status, "diff" => diff_str}
        end
      end)
      |> Enum.reject(&is_nil/1)

    has_changes = Enum.any?(file_diffs, &(&1["diff"] != ""))

    %{
      "name" => name,
      "type" => item["type"],
      "installed_version" => rec["version"] || "unknown",
      "target_version" => target_v,
      "has_changes" => has_changes,
      "file_diffs" => file_diffs
    }
  end

  defp read_lines(path) do
    if File.exists?(path) do
      String.split(File.read!(path), ["\r\n", "\n"], trim: false)
      |> then(fn lines ->
        # Keepends parity: re-attach "\n" to every line.
        Enum.map(lines, &(&1 <> "\n"))
      end)
      |> Enum.drop(-1)
    else
      []
    end
  end

  @doc """
  Minimal unified diff (LCS-based) for the registry dry-run view. Not
  byte-identical to Python difflib for exotic edits; line-level hunks and
  headers match the format.
  """
  @spec unified_diff([String.t()], [String.t()], String.t(), String.t()) :: String.t()
  def unified_diff(old_lines, new_lines, from_label, to_label) do
    # Identical content → empty diff (difflib parity: no headers either).
    if old_lines == new_lines do
      ""
    else
      ops = diff_ops(old_lines, new_lines)

      if ops == [] do
        ""
      else
      header =
        "--- #{from_label}\n+++ #{to_label}\n"

        body = render_hunks(ops)
        header <> body
      end
    end
  end

  defp diff_ops(old, new) do
    # LCS table (fine for registry-item-sized files).
    n = length(old)
    m = length(new)
    old_v = Enum.to_list(old)
    new_v = Enum.to_list(new)

    # Build the (n+1)x(m+1) LCS DP table row-by-row.
    dp =
      Enum.reduce(Enum.reverse(0..(n - 1)), List.duplicate(0, m + 1), fn i, row_next ->
        row =
          Enum.reduce(Enum.reverse(0..(m - 1)), List.duplicate(0, m + 1), fn j, acc ->
            oi = Enum.at(old_v, i)
            nj = Enum.at(new_v, j)
            below = Enum.at(row_next, j)
            right = Enum.at(acc, j + 1)
            diag = Enum.at(row_next, j + 1)

            val =
              if oi == nj do
                diag + 1
              else
                max(below, right)
              end

            List.replace_at(acc, j, val)
          end)

        List.replace_at(row, m, Enum.at(row_next, m))
      end)

    walk_ops(dp, old_v, new_v, 0, 0, []) |> Enum.reverse()
  end

  defp walk_ops(dp, old, new, i, j, acc) do
    cond do
      i == length(old) and j == length(new) ->
        acc

      i == length(old) ->
        walk_ops(dp, old, new, i, j + 1, [{:add, nil, Enum.at(new, j)} | acc])

      j == length(new) ->
        walk_ops(dp, old, new, i + 1, j, [{:del, Enum.at(old, i), nil} | acc])

      Enum.at(old, i) == Enum.at(new, j) ->
        walk_ops(dp, old, new, i + 1, j + 1, [{:eq, Enum.at(old, i), Enum.at(new, j)} | acc])

      true ->
        below = Enum.at(dp, i + 1) |> Enum.at(j)
        right = Enum.at(dp, i) |> Enum.at(j + 1)

        if below >= right do
          walk_ops(dp, old, new, i + 1, j, [{:del, Enum.at(old, i), nil} | acc])
        else
          walk_ops(dp, old, new, i, j + 1, [{:add, nil, Enum.at(new, j)} | acc])
        end
    end
  end

  defp render_hunks(ops) do
    {chunks, _} =
      Enum.map_reduce(ops, {1, 1}, fn
        {:eq, o, _n}, {oi, ni} -> {" " <> o, {oi + 1, ni + 1}}
        {:del, o, _n}, {oi, ni} -> {"-" <> o, {oi + 1, ni}}
        {:add, _o, n}, {oi, ni} -> {"+" <> n, {oi, ni + 1}}
      end)

    Enum.join(chunks, "")
  end

  @doc "Uninstall + reinstall an installed item (UC665 update)."
  @spec update_installed_item(String.t() | nil, String.t(), String.t(), String.t() | nil) :: map()
  def update_installed_item(project_id, stack, name, version \\ nil) do
    manifest = load_manifest(project_id, stack)
    rec = manifest[name]

    if rec == nil do
      raise ArgumentError, message: "'#{name}' is not installed on stack '#{stack}'"
    end

    old_version = rec["version"] || "unknown"
    uninstall(project_id, stack, name)
    installed_res = install(project_id, stack, name, version: version, resolve_deps: false)

    %{
      "success" => true,
      "name" => name,
      "previous_version" => old_version,
      "new_version" => installed_res["version"],
      "stack" => stack,
      "files_updated" => installed_res["files_copied"]
    }
  end

  @doc "Sync registry items from a local or remote git repo (UC666)."
  @spec sync_git_registry(String.t(), String.t(), String.t() | nil) :: map()
  def sync_git_registry(git_url, branch \\ "main", dest_subdir \\ nil) do
    git_url = String.trim(git_url || "")

    if git_url == "" do
      raise ArgumentError, message: "git_url is required"
    end

    root = registry_root()
    File.mkdir_p!(root)

    local_path = String.replace(git_url, "file://", "")

    source_dir =
      if File.dir?(local_path) do
        local_path
      else
        tmp = Path.join(System.tmp_dir!(), "radas_reg_git_#{System.unique_integer()}")

        case System.cmd("git", ["clone", "--depth", "1", "--branch", branch, git_url, tmp], stderr_to_stdout: true) do
          {_, 0} -> tmp

          {out, _} ->
            File.rm_rf!(tmp)
            raise ArgumentError, message: "Failed to clone Git repository '#{git_url}': #{String.slice(String.trim(out), 0, 200)}"
        end
      end

    scan_dir = if dest_subdir, do: Path.join(source_dir, dest_subdir), else: source_dir

    synced_items =
      Enum.flat_map(@item_types, fn itype ->
        case File.ls(Path.join(scan_dir, itype)) do
          {:ok, entries} ->
            Enum.filter(entries, fn entry ->
              File.dir?(Path.join([scan_dir, itype, entry])) and
                File.exists?(Path.join([scan_dir, itype, entry, "radas.json"]))
            end)
            |> Enum.map(fn entry ->
              target = Path.join([root, itype, entry])
              File.rm_rf!(target)
              File.cp_r!(Path.join([scan_dir, itype, entry]), target)
              entry
            end)

          _ ->
            []
        end
      end)

    # Only clean up clones we made into the system tmp dir.
    if String.contains?(source_dir, "radas_reg_git_") do
      File.rm_rf!(source_dir)
    end

    %{
      "success" => true,
      "git_url" => git_url,
      "branch" => branch,
      "items_synced" => synced_items,
      "count" => length(synced_items)
    }
  end
end
