defmodule RadasAI.TemplateInstances do
  @moduledoc """
  Port of the Build & Deployment Job instance surface of
  `api/templates_routes.py`: render → save (playbook + sidecars + instance
  config sidecar outside the git repo), list/detail/delete instances and
  legacy git history/version endpoints.

  Instance configs live in `DATA_DIR/projects/<pid>/data/template-instances/`
  so git-sync can never wipe them; legacy `repo/templates/*.config.json`
  files are migrated destructively (Python parity).
  """

  alias RadasAI.ProjectPaths
  alias RadasAI.Templates

  @slug_re ~r/[^a-zA-Z0-9\-_]+/
  @filename_re ~r/[^a-zA-Z0-9\-_.]+/

  # ---------------------------------------------------------------------------
  # Paths + naming helpers
  # ---------------------------------------------------------------------------

  def repo_root(project_id) do
    if project_id in [nil, ""], do: nil, else: Path.join([ProjectPaths.projects_dir(), project_id, "repo"])
  end

  def instances_dir(project_id) do
    d = Path.join([ProjectPaths.projects_dir(), project_id, "data", "template-instances"])
    File.mkdir_p!(d)

    # Destructive migration from legacy repo/templates/*.config.json.
    legacy = Path.join([ProjectPaths.projects_dir(), project_id, "repo", "templates"])

    if File.dir?(legacy) do
      case File.ls(legacy) do
        {:ok, entries} ->
          Enum.each(entries, fn name ->
            if String.ends_with?(name, ".config.json") do
              src = Path.join(legacy, name)
              dst = Path.join(d, name)

              unless File.exists?(dst) do
                File.cp(src, dst)
              end

              File.rm(src)
            end
          end)

        _ ->
          :ok
      end
    end

    d
  end

  def slug(text, fallback \\ "x") do
    s =
      to_string(text || "")
      |> String.trim()
      |> String.downcase()
      |> String.replace(@slug_re, "-")
      |> String.replace(~r/-+/, "-")
      |> String.trim("-")

    if s == "", do: fallback, else: s
  end

  def sanitize_env(env) when env in [nil, "", "default", "none", "-"], do: ""

  def sanitize_env(env) do
    case to_string(env) |> String.trim() |> String.downcase() do
      e when e in ["", "default", "none", "-"] -> ""
      e -> slug(e, "default")
    end
  end

  def sanitize_filename(name) do
    n = String.replace(to_string(name || "") |> String.trim(), @filename_re, "-")

    n =
      if n == "" do
        "template.yml"
      else
        n
      end

    if String.ends_with?(n, [".yml", ".yaml"]), do: n, else: n <> ".yml"
  end

  def playbook_filename(env, base_name) do
    base = sanitize_filename(base_name)
    if env == "", do: base, else: "#{env}-#{base}"
  end

  def config_filename(env, playbook_filename, template_id) do
    stem = playbook_filename |> String.split(".") |> Enum.drop(-1) |> Enum.join(".")
    "#{stem}.#{template_id}.config.json"
  end

  defp safe_repo_path(repo_root, rel) when rel in [nil, ""], do: nil

  defp safe_repo_path(repo_root, rel) do
    safe_rel = to_string(rel) |> String.trim_leading("/") |> String.replace("..", "_")
    path = Path.join(repo_root, safe_rel)
    if String.starts_with?(Path.expand(path), Path.expand(repo_root) <> "/"), do: path, else: nil
  end

  defp stale_rendered_k8s_yaml?(template_id, yaml_text) do
    cond do
      template_id == "k3s-bootstrap" ->
        not String.contains?(yaml_text, "# OpenSible k3s template generation: 2026-07-k3s-hardened-v10")

      template_id != "k8s-cluster" ->
        false

      not String.contains?(yaml_text, "# OpenSible k8s template generation: 2026-07-cgroup-fix-v7") ->
        true

      true ->
        Enum.any?(
          [
            "Wait for first control-plane apiserver to be reachable",
            "Probe first control-plane /healthz",
            "https://{{ first_cp_ip }}:6443/healthz",
            "Generate fresh worker join command",
            "Generate fresh worker join token on first control-plane",
            ~s(delegate_to: "{{ first_cp_ip }}"),
            "--kubeconfig=/etc/kubernetes/admin.conf",
            "Build control-plane join argv (using first control-plane credentials)",
            "Build worker join argv (using first control-plane token)",
            "kubeadm_control_plane_join_argv",
            "kubeadm_worker_join_argv",
            "Reset dirty kubeadm/container runtime state",
            "rm -rf /etc/kubernetes /var/lib/etcd /etc/cni/net.d /var/lib/cni /var/run/calico /root/.kube/config"
          ],
          &String.contains?(yaml_text, &1)
        )
    end
  end

  defp dedupe_instance_filename(repo_root, playbook_filename, template_id) do
    pb_dir = Path.join(repo_root, "playbooks")
    cfg_dir = instances_dir(Path.basename(Path.dirname(Path.dirname(repo_root))))

    {stem, ext} =
      if String.contains?(playbook_filename, ".") do
        [s, e] = String.split(playbook_filename, ".", parts: 2) |> then(fn l -> [hd(l), Enum.at(l, 1)] end)
        {s, "." <> (e || "yml")}
      else
        {playbook_filename, ".yml"}
      end

    find_free(pb_dir, cfg_dir, playbook_filename, stem, ext, template_id, 2)
  end

  defp find_free(pb_dir, cfg_dir, candidate, stem, ext, template_id, idx) do
    cfg_candidate = Path.join(cfg_dir, config_filename("", candidate, template_id))

    if File.exists?(Path.join(pb_dir, candidate)) or File.exists?(cfg_candidate) do
      find_free(pb_dir, cfg_dir, "#{stem}-#{idx}#{ext}", stem, ext, template_id, idx + 1)
    else
      candidate
    end
  end

  # ---------------------------------------------------------------------------
  # Save (Build & Deployment Job)
  # ---------------------------------------------------------------------------

  @doc "Render + persist a template instance (Python save route)."
  @spec save(String.t(), String.t(), map()) :: {:ok, map()} | {:error, String.t()}
  def save(project_id, template_id, body) when is_map(body) do
    values = body["values"] || %{}
    targets = body["targets"] || %{}
    environment = sanitize_env(body["environment"])
    edited_yaml_raw = body["yaml"]
    edited_yaml = if is_binary(edited_yaml_raw), do: String.trim(edited_yaml_raw), else: ""

    repo_root = repo_root(project_id)

    if repo_root == nil do
      {:error, "project_id is required"}
    else
      case Templates.render_template(template_id, values, targets) do
        {:error, msg} ->
          {:error, msg}

        {:ok, result} ->
          requested = body["filename"] || result["filename"]
          pb_filename = playbook_filename(environment, requested)

          cfg_dir = instances_dir(project_id)
          requested_instance_path = safe_repo_path(repo_root, body["instance_path"] || body["path"])
          initial_cfg_name = config_filename(environment, pb_filename, template_id)
          initial_cfg_path = Path.join(cfg_dir, initial_cfg_name)

          basename_path =
            if requested_instance_path == nil and is_binary(body["instance_path"] || body["path"]) and
                 not String.contains?(to_string(body["instance_path"] || body["path"]), "/") do
              Path.join(cfg_dir, to_string(body["instance_path"] || body["path"]))
            else
              nil
            end

          same_instance? =
            (requested_instance_path && File.exists?(requested_instance_path) &&
               Path.expand(requested_instance_path) == Path.expand(initial_cfg_path)) ||
              (basename_path && File.exists?(basename_path) &&
                 Path.expand(basename_path) == Path.expand(initial_cfg_path))

          pb_filename = if same_instance?, do: pb_filename, else: dedupe_instance_filename(repo_root, pb_filename, template_id)
          pb_path = Path.join([repo_root, "playbooks", pb_filename])
          File.mkdir_p!(Path.dirname(pb_path))

          yaml_to_write =
            if edited_yaml != "" and not stale_rendered_k8s_yaml?(template_id, edited_yaml) do
              edited_yaml
            else
              result["yaml"]
            end

          File.write!(pb_path, yaml_to_write)
          written = [Path.join("playbooks", pb_filename)]

          {written, _} =
            Enum.map_reduce(result["sidecars"] || %{}, written, fn {rel_path, content}, acc ->
              safe_rel = to_string(rel_path) |> String.trim_leading("/") |> String.replace("..", "_")
              parts = String.split(safe_rel, "/", parts: 2)

              safe_rel =
                if environment != "" and length(parts) == 2 and hd(parts) in ["inventories", "group_vars", "host_vars"] do
                  "#{hd(parts)}/#{environment}/#{Enum.at(parts, 1)}"
                else
                  safe_rel
                end

              side = Path.join(repo_root, safe_rel)
              File.mkdir_p!(Path.dirname(side))
              File.write!(side, content)
              {safe_rel, [safe_rel | acc]}
            end)

          written = Enum.reverse(written)

          cfg_name = config_filename(environment, pb_filename, template_id)
          cfg_path = Path.join(cfg_dir, cfg_name)

          cfg_payload = %{
            "template_id" => template_id,
            "environment" => environment || "default",
            "filename" => pb_filename,
            "values" => values,
            "targets" => targets,
            "rendered_yaml" => yaml_to_write
          }

          File.write!(cfg_path, Jason.encode!(cfg_payload, pretty: true))
          cfg_dir_rel = String.replace(cfg_dir, ProjectPaths.projects_dir() <> "/", "")

          {:ok,
           %{
             "ok" => true,
             "filename" => pb_filename,
             "path" => pb_path,
             "instance_path" => cfg_name,
             "instance_dir" => cfg_dir_rel,
             "environment" => environment || "default",
             "written" => written ++ [cfg_name],
             "template_id" => template_id,
             "playbook_id" => playbook_uuid(project_id, pb_filename |> String.split(".") |> Enum.drop(-1) |> Enum.join("."))
           }}
      end
    end
  end

  # ---------------------------------------------------------------------------
  # Instance listing / detail / delete
  # ---------------------------------------------------------------------------

  @doc "Newest-first instance summaries (Python list_instances)."
  @spec list_instances(String.t()) :: [map()]
  def list_instances(project_id) do
    dir = instances_dir(project_id)

    case File.ls(dir) do
      {:ok, entries} ->
        entries
        |> Enum.filter(&String.ends_with?(&1, ".config.json"))
        |> Enum.sort()
        |> Enum.map(fn name -> instance_summary(project_id, Path.join(dir, name)) end)
        |> Enum.sort_by(&(&1["updated_at"] || 0), :desc)

      _ ->
        []
    end
  end

  @doc "Stable opaque instance id (uuid5 over the config basename)."
  @spec instance_id(String.t()) :: String.t()
  def instance_id(cfg_basename), do: uuid5("template-instance:#{cfg_basename}")

  @doc "Playbook uuid5 (PlaybookStorage derivation parity)."
  @spec playbook_uuid(String.t(), String.t()) :: String.t()
  def playbook_uuid(project_id, name), do: uuid5("playbook:#{project_id}:#{name}")

  defp instance_summary(project_id, cfg_path) do
    data = read_config(cfg_path) || %{}
    rel = Path.basename(cfg_path)
    pb_name = data["filename"] || ""
    yaml_stem = if pb_name == "", do: "", else: pb_filename_stem(pb_name)

    %{
      "id" => instance_id(rel),
      "path" => rel,
      "filename" => (pb_name != "" && pb_name) || nil,
      "template_id" => data["template_id"],
      "environment" => data["environment"] || "default",
      "updated_at" => data["updated_at"],
      "playbook_id" => (yaml_stem != "" && playbook_uuid(project_id, yaml_stem)) || nil
    }
  end

  defp pb_filename_stem(name), do: name |> String.split(".") |> Enum.drop(-1) |> Enum.join(".")

  defp read_config(path) do
    case File.read(path) do
      {:ok, binary} ->
        case Jason.decode(binary) do
          {:ok, %{} = data} ->
            st = File.stat!(path)

            # Epoch-ms from the filesystem mtime (Erlang gregorian epoch).
            mtime_ms =
              st.mtime
              |> :calendar.datetime_to_gregorian_seconds()
              |> Kernel.-(6_216_721_920_00)
              |> Kernel.*(1000)

            Map.put_new(data, "updated_at", mtime_ms)

          _ ->
            nil
        end

      _ ->
        nil
    end
  end

  @doc """
  Resolve an instance config by opaque id, basename/path, or
  env+filename+template_id (Python _resolve_instance_path).
  """
  @spec resolve_instance(String.t(), map()) :: Path.t() | nil
  def resolve_instance(project_id, params) when is_map(params) do
    cfg_dir = instances_dir(project_id)
    repo_root = repo_root(project_id)

    cond do
      is_binary(params["id"]) and params["id"] != "" ->
        find_by_instance_id(cfg_dir, params["id"])

      is_binary(params["path"]) and params["path"] != "" ->
        rel = params["path"] |> String.trim_leading("/") |> String.replace("..", "_")

        base = Path.join(cfg_dir, Path.basename(rel))

        cond do
          File.exists?(base) and File.regular?(base) -> base
          repo_root && File.exists?(Path.join(repo_root, rel)) -> Path.join(repo_root, rel)
          true -> nil
        end

      true ->
        env = sanitize_env(params["env"] || params["environment"])
        name = params["filename"] || params["name"]
        tid = params["template_id"]

        if name != nil and tid != nil do
          pb_name = playbook_filename(env, name)
          cfg_name = config_filename(env, pb_name, tid)
          cand = Path.join(cfg_dir, cfg_name)

          if File.exists?(cand) do
            cand
          else
            legacy = repo_root && Path.join([repo_root, "templates", cfg_name])
            (legacy && File.exists?(legacy) && legacy) || nil
          end
        else
          nil
        end
    end
  end

  defp find_by_instance_id(cfg_dir, iid) do
    case File.ls(cfg_dir) do
      {:ok, entries} ->
        Enum.find_value(entries, fn name ->
          if String.ends_with?(name, ".config.json") and instance_id(name) == iid do
            Path.join(cfg_dir, name)
          else
            nil
          end
        end)

      _ ->
        nil
    end
  end

  @doc "Full instance detail incl. rendered_yaml fallback from the playbook file."
  @spec instance_detail(String.t(), Path.t()) :: map() | nil
  def instance_detail(project_id, cfg_path) do
    data = read_config(cfg_path)

    if data == nil do
      nil
    else
      rel = Path.basename(cfg_path)
      pb_name = data["filename"] || ""
      yaml_stem = if pb_name == "", do: "", else: pb_filename_stem(pb_name)

      data =
        Map.merge(data, %{
          "path" => rel,
          "id" => instance_id(rel),
          "playbook_id" => (yaml_stem != "" && playbook_uuid(project_id, yaml_stem)) || nil
        })

      if data["rendered_yaml"] in [nil, ""] and pb_name != "" do
        repo_root = repo_root(project_id)
        pb_path = repo_root && Path.join([repo_root, "playbooks", pb_name])

        data =
          if pb_path && File.exists?(pb_path) do
            Map.put(data, "rendered_yaml", File.read!(pb_path))
          else
            data
          end

        data
      else
        data
      end
    end
  end

  @doc "Delete an instance + its playbook (Python delete_instance). Returns removed paths."
  @spec delete_instance(String.t(), Path.t()) :: {:ok, [String.t()]} | {:error, String.t()}
  def delete_instance(project_id, cfg_path) do
    repo_root = repo_root(project_id)
    data = read_config(cfg_path) || %{}
    pb_name = data["filename"]
    removed = []

    cfg_dir = instances_dir(project_id)
    removed = [Path.join(cfg_dir, Path.basename(cfg_path)) | removed]

    removed =
      if repo_root do
        [Path.join([repo_root, "templates", Path.basename(cfg_path)]) | removed]
      else
        removed
      end

    {removed, _} =
      Enum.reduce(removed, {[], MapSet.new()}, fn cfg, {acc, seen} ->
        key = Path.expand(cfg)

        if MapSet.member?(seen, key) do
          {acc, seen}
        else
          if File.exists?(cfg) and File.regular?(cfg) do
            File.rm(cfg)
            {[cfg, acc] |> List.flatten(), MapSet.put(seen, key)}
          else
            {acc, MapSet.put(seen, key)}
          end
        end
      end)

    removed =
      if pb_name != "" and pb_name != nil and repo_root do
        pb = Path.join([repo_root, "playbooks", pb_name])

        if File.exists?(pb) do
          File.rm(pb)
          [Path.join("playbooks", pb_name) | removed]
        else
          removed
        end
      else
        removed
      end

    {:ok, removed}
  end

  # ---------------------------------------------------------------------------
  # Legacy git history / version
  # ---------------------------------------------------------------------------

  def git_run(cwd, args, timeout \\ 15_000) do
    case System.cmd("git", args, cd: cwd, stderr_to_stdout: true, env: %{}, parallelism: 1) do
      {out, 0} -> {:ok, out}
      {out, _} -> {:error, out}
    end
  rescue
    e -> {:error, Exception.message(e)}
  end

  @doc "Git history for a legacy in-repo instance (Python instance_history)."
  @spec instance_history(String.t(), Path.t()) :: {:ok, map()} | {:error, map()}
  def instance_history(project_id, cfg_path) do
    repo_root = repo_root(project_id)

    rel =
      if repo_root && String.starts_with?(Path.expand(cfg_path), Path.expand(repo_root) <> "/") do
        Path.relative_to(cfg_path, repo_root)
      else
        nil
      end

    if rel == nil do
      {:ok, %{"commits" => [], "path" => Path.basename(cfg_path)}}
    else
      case git_run(repo_root, ["log", "--format=%H%x1f%an%x1f%aI%x1f%s", "--follow", "--", rel]) do
        {:ok, out} ->
          commits =
            out
            |> String.split("\n", trim: true)
            |> Enum.flat_map(fn line ->
              case String.split(line, "\u001f") do
                [sha, author, date, message] -> [%{"sha" => sha, "author" => author, "date" => date, "message" => message}]
                _ -> []
              end
            end)

          {:ok, %{"commits" => commits, "path" => rel}}

        {:error, err} ->
          {:error, %{"commits" => [], "error" => err}}
      end
    end
  end

  @doc "Git-show a historical instance config (Python instance_version)."
  @spec instance_version(String.t(), Path.t(), String.t()) :: {:ok, map()} | {:error, map()}
  def instance_version(project_id, cfg_path, sha) do
    repo_root = repo_root(project_id)

    cond do
      sha in [nil, ""] ->
        {:error, %{"error" => "path and sha required"}}

      not Regex.match?(~r/^[0-9a-fA-F]{4,64}$/, sha) ->
        {:error, %{"error" => "invalid sha"}}

      true ->
        rel =
          if repo_root && String.starts_with?(Path.expand(cfg_path), Path.expand(repo_root) <> "/") do
            Path.relative_to(cfg_path, repo_root)
          else
            nil
          end

        if rel == nil do
          {:error, %{"error" => "history not tracked (instance is stored outside git repo)"}}
        else
          case git_run(repo_root, ["show", "#{sha}:#{rel}"]) do
            {:ok, out} ->
              case Jason.decode(out) do
                {:ok, config} -> {:ok, %{"sha" => sha, "path" => rel, "config" => config}}
                _ -> {:error, %{"error" => "content is not valid JSON"}}
              end

            {:error, err} ->
              {:error, %{"error" => err |> String.trim() |> then(&(if &1 == "", do: "git show failed", else: &1))}}
          end
        end
    end
  end

  # ---------------------------------------------------------------------------
  # uuid5 (NAMESPACE_URL) parity
  # ---------------------------------------------------------------------------

  defp uuid5(name) do
    namespace = <<0x6B, 0xA7, 0xB8, 0x11, 0x9D, 0xAD, 0x11, 0xD1, 0x80, 0xB4, 0x00, 0xC0, 0x4F, 0xD4, 0x30, 0xC8>>

    bytes =
      :crypto.hash(:sha, namespace <> name)
      |> binary_part(0, 16)
      |> :binary.bin_to_list()

    bytes =
      bytes
      |> List.replace_at(6, Enum.at(bytes, 6) |> Bitwise.band(0x0F) |> Bitwise.bor(0x50))
      |> List.replace_at(8, Enum.at(bytes, 8) |> Bitwise.band(0x3F) |> Bitwise.bor(0x80))

    hex = Enum.map_join(bytes, "", fn b -> :io_lib.format("~2.16.0b", [b]) end) |> IO.iodata_to_binary()

    String.slice(hex, 0, 8) <> "-" <> String.slice(hex, 8, 4) <> "-" <>
      String.slice(hex, 12, 4) <> "-" <> String.slice(hex, 16, 4) <> "-" <> String.slice(hex, 20, 12)
  end
end
