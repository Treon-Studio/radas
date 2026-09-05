defmodule RadasAI.CloudStacks do
  @moduledoc """
  Port of the stack registry core of `services/cloud_provisioning.py` —
  stacks live under `DATA_DIR/projects/<id>/stacks/envs/<name>` (OpenTofu
  layout with `_template`), metadata in the `stack_meta` Postgres jsonb table
  (shared with Flask), secrets encrypted in the `stack_secrets` table and
  materialized to `credentials.auto.tfvars` (0600) before runs.
  """

  import RadasAI.DB

  alias RadasAI.CloudProviders
  alias RadasAI.ExecutionHistory
  alias RadasAI.ProjectPaths
  alias RadasAI.SecretEncryption
  alias RadasAI.StackSnapshots

  @name_re ~r/^[a-z0-9][a-z0-9_-]{2,49}$/

  # Template files refreshed from the workspace `_template` on every write
  # (Python _TEMPLATE_OWNED_FILES). Per-stack files are preserved.
  @template_owned_files MapSet.new([
                          "main.tf",
                          "variables.tf",
                          "providers.tf",
                          "versions.tf",
                          "backend.tf",
                          "README.md",
                          "credentials.auto.tfvars.example"
                        ])

  def valid_name?(name) when is_binary(name), do: Regex.match?(@name_re, name)
  def valid_name?(_), do: false

  def stacks_root(project_id \\ nil)

  def stacks_root(nil), do: Path.join([ProjectPaths.data_dir(), "cloud-provisioning", "default"])

  def stacks_root(project_id), do: Path.join([ProjectPaths.data_dir(), "projects", project_id, "stacks"])

  def envs_dir(project_id) do
    dir = Path.join(stacks_root(project_id), "envs")
    File.mkdir_p!(dir)
    dir
  end

  def stack_dir(project_id, name), do: Path.join(envs_dir(project_id), name)

  def data_base(project_id) do
    base =
      if project_id do
        Path.join([ProjectPaths.data_dir(), "projects", project_id, ".cloud-provisioning"])
      else
        Path.join([ProjectPaths.data_dir(), "cloud-provisioning"])
      end

    File.mkdir_p!(base)
    base
  end

  def stack_data_dir(project_id, name), do: Path.join(data_base(project_id), name)

  # ---------------------------------------------------------------------------
  # Meta (stack_meta jsonb — shared with Flask)
  # ---------------------------------------------------------------------------

  @doc "Load a stack's meta dict (stack_meta jsonb, shared with Flask)."
  @spec load_meta(String.t() | nil, String.t()) :: map()
  def load_meta(project_id, name) do
    case query_one!(
           "SELECT data FROM stack_meta WHERE project_id = $1 AND stack = $2",
           [project_id || "default", name]
         ) do
      nil -> %{}
      row -> row["data"] || %{}
    end
  rescue
    _ -> %{}
  end

  @doc "Merge a patch into a stack's meta dict (Python _save_meta)."
  @spec save_meta(String.t() | nil, String.t(), map()) :: map()
  def save_meta(project_id, name, patch) do
    meta =
      Map.merge(load_meta(project_id, name), Map.new(patch || %{}, fn {k, v} -> {to_string(k), v} end))

    meta =
      meta
      |> Map.put_new("created_at", now_sec())
      |> Map.put("updated_at", now_sec())

    execute!(
      """
      INSERT INTO stack_meta (project_id, stack, data) VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (project_id, stack) DO UPDATE SET data = EXCLUDED.data
      """,
      [project_id || "default", name, meta]
    )

    meta
  end

  # ---------------------------------------------------------------------------
  # Secrets (stack_secrets table — AES-GCM encrypted, shared with Flask)
  # ---------------------------------------------------------------------------

  @doc "Split secret keys (provider-scoped) out of user-supplied values."
  @spec separate_secrets(map()) :: {map(), map()}
  def separate_secrets(values) when is_map(values) do
    secret_keys = MapSet.new(CloudProviders.all_secret_keys())

    Enum.split_with(values, fn {k, _} -> MapSet.member?(secret_keys, to_string(k)) end)
    |> then(fn {secrets, plain} -> {Map.new(plain), Map.new(secrets)} end)
  end

  @doc "Encrypt + upsert a stack's secrets (Python _save_secrets)."
  @spec save_secrets(String.t() | nil, String.t(), map()) :: :ok
  def save_secrets(project_id, name, secrets_map) when is_map(secrets_map) do
    payload =
      secrets_map
      |> Enum.filter(fn {_, v} -> v not in [nil, ""] end)
      |> Map.new(fn {k, v} -> {to_string(k), SecretEncryption.encrypt(to_string(v))} end)

    raw = Jason.encode!(payload)

    execute!(
      """
      INSERT INTO stack_secrets (project_id, stack, data) VALUES ($1, $2, $3)
      ON CONFLICT (project_id, stack) DO UPDATE SET data = EXCLUDED.data
      """,
      [project_id || "default", name, raw]
    )

    :ok
  end

  @doc "Load + decrypt a stack's secrets (Python _load_secrets)."
  @spec load_secrets(String.t() | nil, String.t()) :: map()
  def load_secrets(project_id, name) do
    case query_one!(
           "SELECT data FROM stack_secrets WHERE project_id = $1 AND stack = $2",
           [project_id || "default", name]
         ) do
      nil ->
        %{}

      row ->
        data = row["data"] || ""
        data = if is_binary(data), do: data, else: IO.iodata_to_binary(data)

        data
        |> Jason.decode!()
        |> Map.new(fn {k, v} -> {k, SecretEncryption.decrypt(v)} end)
    end
  rescue
    _ -> %{}
  end

  @doc """
  Materialize `credentials.auto.tfvars` from the stack's decrypted secrets
  (Python _materialise_credentials). Kubernetes kubeconfig is written as
  `kubeconfig.yaml` instead. Returns the path or nil when no secrets exist.
  """
  @spec materialise_credentials(String.t() | nil, String.t(), String.t() | nil) :: String.t() | nil
  def materialise_credentials(project_id, name, provider \\ nil) do
    secrets_map = load_secrets(project_id, name)

    if secrets_map == %{} do
      nil
    else
      provider = provider || load_meta(project_id, name)["provider"] || "bytedc"
      sd = stack_dir(project_id, name)
      File.mkdir_p!(sd)
      creds_path = Path.join(sd, "credentials.auto.tfvars")

      body =
        CloudProviders.secret_keys_for(provider)
        |> Enum.flat_map(fn k ->
          cond do
            not Map.has_key?(secrets_map, k) ->
              []

            provider == "kubernetes" and k == "kubeconfig" ->
              kc = Path.join(sd, "kubeconfig.yaml")
              File.write!(kc, secrets_map[k])
              File.chmod!(kc, 0o600)
              []

            true ->
              val =
                case secrets_map[k] do
                  v when is_binary(v) -> String.trim(v)
                  v -> to_string(v)
                end

              if val == "", do: [], else: ["#{k} = #{CloudProviders.render_value(val)}"]
          end
        end)

      File.write!(creds_path, Enum.join(body, "\n") <> "\n")
      File.chmod!(creds_path, 0o600)
      creds_path
    end
  end

  # ---------------------------------------------------------------------------
  # Listing
  # ---------------------------------------------------------------------------

  @doc "List stacks for a project (envs dir scan + meta + tfvars probe)."
  @spec list_stacks(String.t() | nil) :: [map()]
  def list_stacks(project_id) do
    envs = envs_dir(project_id)

    case File.ls(envs) do
      {:ok, entries} ->
        entries
        |> Enum.sort()
        |> Enum.reject(&(String.starts_with?(&1, ".") or &1 == "_template"))
        |> Enum.filter(&File.dir?(Path.join(envs, &1)))
        |> Enum.map(fn name -> stack_info(project_id, name) end)

      _ ->
        []
    end
  end

  @doc "Stack info summary (mirrors Python _list_stacks fields)."
  @spec stack_info(String.t() | nil, String.t()) :: map()
  def stack_info(project_id, name) do
    meta = load_meta(project_id, name)
    sd = stack_dir(project_id, name)
    tfvars = Path.join(sd, "terraform.tfvars")
    run = latest_run(project_id, name)

    {cloud_project, region} =
      if File.exists?(tfvars) do
        text = File.read!(tfvars)
        cp = regex_first(text, ~r/project_name\s*=\s*"([^"]*)"/)
        region = regex_first(text, ~r/region\s*=\s*"([^"]*)"/)
        {cp, region}
      else
        {nil, nil}
      end

    %{
      "name" => name,
      "provider" => meta["provider"] || "bytedc",
      "env" => meta["env"],
      "cloud_project" => cloud_project || meta["project_name"],
      "region" => region,
      "created_at" => meta["created_at"],
      "updated_at" => meta["updated_at"],
      "last_action" => run["action"] || meta["last_action"],
      "last_status" => run["status"] || meta["last_status"],
      "last_run_id" => run["run_id"] || meta["last_run_id"],
      "last_run_finished_at" => run["finished_at"],
      "has_tfvars" => File.exists?(tfvars),
      "drift_enabled" => meta["drift_enabled"] == true,
      "drift_status" => if(meta["drift_enabled"] == true, do: drift_status(project_id, name)["status"], else: "disabled"),
      "policy_enabled" => meta["policy_enabled"] == true
    }
  end

  @doc "Latest TOFU_RUN execution for a stack (Python _latest_run_by_stack)."
  @spec latest_run(String.t() | nil, String.t()) :: map()
  def latest_run(project_id, name) do
    case query_all!(
           """
           SELECT data FROM executions
           WHERE project_id = $1 AND data->'runParams'->>'execution_type' = 'TOFU_RUN'
             AND data->'runParams'->>'stack_name' = $2
           ORDER BY created_at DESC LIMIT 1
           """,
           [project_id || "default", name]
         ) do
      [row] ->
        rp = row["data"]["runParams"] || %{}

        %{
          "action" => rp["tofu_action"],
          "status" => row["data"]["status"],
          "run_id" => row["data"]["id"],
          "finished_at" => row["data"]["finishedAt"]
        }

      _ ->
        %{}
    end
  rescue
    _ -> %{}
  end

  @doc "All TOFU_RUNs for a project, newest first (Python all_runs_list, cap 200)."
  @spec all_tofu_runs(String.t() | nil) :: [map()]
  def all_tofu_runs(project_id) do
    rows =
      query_all!(
        """
        SELECT data FROM executions
        WHERE project_id = $1 AND data->'runParams'->>'execution_type' = 'TOFU_RUN'
        ORDER BY created_at DESC LIMIT 200
        """,
        [project_id || "default"]
      )

    Enum.map(rows, fn row ->
      exec_to_run(row["data"]) |> Map.put("mtime", trunc(row["data"]["createdAt"] || 0))
    end)
  rescue
    _ -> []
  end

  @doc "Map an execution record onto the console run shape (Python _exec_to_run)."
  @spec exec_to_run(map()) :: map()
  def exec_to_run(exe) do
    rp = exe["runParams"] || %{}
    finished = trunc(exe["finishedAt"] || 0)

    %{
      "run_id" => exe["id"],
      "execution_id" => exe["id"],
      "stack" => rp["stack_name"],
      "action" => rp["tofu_action"],
      "status" => ui_status(exe["status"] || ""),
      "returncode" => exe["returnCode"],
      "worker_id" => exe["workerId"],
      "started_at" => trunc(exe["startedAt"] || exe["createdAt"] || 0),
      "finished_at" => if(finished == 0, do: nil, else: finished),
      "triggered_by" => exe["triggeredBy"] || "",
      "triggered_by_user_id" => exe["triggeredByUserId"] || ""
    }
  end

  @doc "Latest-first TOFU_RUN runs for a stack (Python runs_list, cap 50)."
  @spec stack_runs(String.t() | nil, String.t()) :: [map()]
  def stack_runs(project_id, name) do
    rows =
      query_all!(
        """
        SELECT data FROM executions
        WHERE project_id = $1 AND data->'runParams'->>'execution_type' = 'TOFU_RUN'
          AND data->'runParams'->>'stack_name' = $2
        ORDER BY created_at DESC LIMIT 50
        """,
        [project_id || "default", name]
      )

    Enum.map(rows, fn row ->
      exe = row["data"]
      exec_to_run(exe) |> Map.put("mtime", trunc(exe["createdAt"] || 0))
    end)
  rescue
    _ -> []
  end

  @doc "One run detail with its log text (Python run_get)."
  @spec run_detail(String.t() | nil, String.t(), String.t()) :: map() | nil
  def run_detail(project_id, name, run_id) do
    exe = RadasAI.Executions.get_execution(run_id, project_id || "default")
    rp = (exe && exe["runParams"]) || nil

    if exe == nil or rp == nil or rp["execution_type"] != "TOFU_RUN" or rp["stack_name"] != name do
      nil
    else
      {log_text, _offset} =
        case RadasAI.Executions.read_log_chunk(run_id, 0, 4 * 1024 * 1024, project_id || "default") do
          {text, _, _, _} -> {text, nil}
          _ -> {"", nil}
        end

      log_text =
        if String.trim(to_string(exe["status"] || "")) |> String.downcase() == "queued" and log_text == "" do
          "[waiting for a worker to claim this run…]\n"
        else
          log_text
        end

      exec_to_run(exe) |> Map.put("log", log_text || "")
    end
  end

  @doc "UI status token (Python _status_to_ui)."
  @spec ui_status(String.t()) :: String.t()
  def ui_status(s) do
    case to_string(s) do
      "PENDING" -> "queued"
      "RUNNING" -> "running"
      "SUCCESS" -> "success"
      "FAILED" -> "failed"
      "CANCELED" -> "canceled"
      other -> String.downcase(other)
    end
  end

  @doc "Full detail payload for GET one stack (Python stacks_get)."
  @spec stack_detail(String.t() | nil, String.t()) :: map()
  def stack_detail(project_id, name) do
    sd = stack_dir(project_id, name)
    meta = load_meta(project_id, name)

    read = fn file ->
      path = Path.join(sd, file)
      if File.exists?(path), do: File.read!(path), else: ""
    end

    files =
      case File.ls(sd) do
        {:ok, entries} -> entries |> Enum.filter(&File.regular?(Path.join(sd, &1))) |> Enum.sort()
        _ -> []
      end

    rel = Path.relative_to(sd, File.cwd!())

    %{
      "name" => name,
      "path" => rel,
      "files" => files,
      "terraform_tfvars" => read.("terraform.tfvars"),
      "backend_hcl" => read.("backend.hcl"),
      "has_secrets" => File.exists?(Path.join(stack_data_dir(project_id, name), "secrets.json")),
      "meta" => meta,
      "provider" => meta["provider"] || "bytedc",
      "drift" => drift_status(project_id, name),
      "locked" => is_map(meta["locked"]),
      "lock_reason" => (meta["locked"] || %{})["reason"] || "",
      "outputs" => state_outputs(sd)
    }
  end

  defp state_outputs(sd) do
    state_file = Path.join(sd, "terraform.tfstate")

    if File.exists?(state_file) do
      case File.read!(state_file) |> Jason.decode() do
        {:ok, st} ->
          Map.new(st["outputs"] || %{}, fn {k, v} -> {k, (is_map(v) && v["value"]) || nil} end)

        _ ->
          %{}
      end
    else
      %{}
    end
  end

  @doc "Drift status derived from the latest TOFU drift run (Python _drift_status)."
  @spec drift_status(String.t() | nil, String.t()) :: map()
  def drift_status(project_id, name) do
    meta = load_meta(project_id, name)

    out = %{
      "enabled" => meta["drift_enabled"] == true,
      "status" => "unknown",
      "last_run_id" => nil,
      "last_checked_at" => nil,
      "returncode" => nil,
      "run_status" => nil
    }

    exe = latest_drift_run(project_id, name)

    case exe do
      nil ->
        out

      exe ->
        rc = exe["returnCode"]
        run_status = ui_status(exe["status"] || "")

        status =
          cond do
            run_status in ["queued", "running"] -> "checking"
            run_status == "canceled" -> "unknown"
            rc == 0 -> "in_sync"
            rc == 2 -> "drifted"
            is_nil(rc) -> "unknown"
            true -> "error"
          end

        ts =
          [exe["finishedAt"], exe["startedAt"], exe["createdAt"]]
          |> Enum.find(&(is_integer(&1) and &1 > 0))

        Map.merge(out, %{
          "last_run_id" => exe["id"],
          "last_checked_at" => ts,
          "returncode" => rc,
          "run_status" => run_status,
          "status" => status
        })
    end
  end

  defp latest_drift_run(project_id, name) do
    rows =
      query_all!(
        """
        SELECT data FROM executions
        WHERE project_id = $1 AND data->'runParams'->>'execution_type' = 'TOFU_RUN'
          AND data->'runParams'->>'stack_name' = $2
          AND data->'runParams'->>'tofu_action' = 'drift'
        ORDER BY created_at DESC LIMIT 1
        """,
        [project_id || "default", name]
      )

    case rows do
      [row] -> row["data"]
      _ -> nil
    end
  rescue
    _ -> nil
  end

  defp regex_first(text, re) do
    case Regex.run(re, text) do
      [_, v] -> v
      _ -> nil
    end
  end

  # ---------------------------------------------------------------------------
  # Write path (create / update / delete)
  # ---------------------------------------------------------------------------

  @doc """
  Create a stack: validate name/provider/dup, apply bytedc reuse toggles,
  separate + persist secrets, write tfvars/backend.hcl, save meta. Returns
  {:ok, name} | {:error, status, msg}.
  """
  @spec create_stack(String.t() | nil, String.t(), String.t(), map()) ::
          {:ok, String.t()} | {:error, integer(), String.t()}
  def create_stack(project_id, name, provider, values) do
    name = String.trim(String.downcase(name || ""))
    provider = String.downcase(String.trim(provider || "bytedc"))
    values = values || %{}

    cond do
      not valid_name?(name) ->
        {:error, 400, "Invalid stack name. Use lowercase letters, digits, '-' or '_' (3-50 chars)."}

      not CloudProviders.known?(provider) ->
        {:error, 400, "Provider '#{provider}' is not yet supported."}

      File.dir?(stack_dir(project_id, name)) ->
        {:error, 409, "Stack '#{name}' already exists."}

      true ->
        values = CloudProviders.apply_reuse_toggles(provider, values)

        case CloudProviders.validate_network_reuse(provider, values) do
          err when is_binary(err) ->
            {:error, 400, err}

          nil ->
            {plain, secrets} = separate_secrets(values)
            write_stack_files(project_id, name, plain, provider)
            if secrets != %{}, do: save_secrets(project_id, name, secrets)

            save_meta(project_id, name, %{
              "provider" => provider,
              "env" => values["env"],
              "project_name" => values["project_name"]
            })

            {:ok, name}
        end
    end
  end

  @doc """
  Update a stack's values: re-render tfvars, merge secrets, save meta.
  Python stacks_update: invalid name or missing dir → {:error, 404}.
  """
  @spec update_stack_values(String.t() | nil, String.t(), map()) ::
          {:ok, String.t()} | {:error, integer(), String.t()}
  def update_stack_values(project_id, name, values) do
    values = values || %{}
    sd = stack_dir(project_id, name)

    if not valid_name?(name || "") or not File.dir?(sd) do
      {:error, 404, "Not found"}
    else
      meta = load_meta(project_id, name)
      provider = meta["provider"] || "bytedc"
      values = CloudProviders.apply_reuse_toggles(provider, values)

      case CloudProviders.validate_network_reuse(provider, values) do
        err when is_binary(err) ->
          {:error, 400, err}

        nil ->
          {plain, secrets} = separate_secrets(values)
          write_stack_files(project_id, name, plain, provider)

          if secrets != %{} do
            existing = load_secrets(project_id, name)
            save_secrets(project_id, name, Map.merge(existing, secrets))
          end

          save_meta(project_id, name, %{"env" => values["env"], "project_name" => values["project_name"]})
          {:ok, name}
      end
    end
  end

  @doc """
  Delete a stack: refuses while local state exists without force (Python
  stacks_delete), then removes the working dir and the .cloud-provisioning
  data dir. Meta is intentionally left (Python parity).
  """
  @spec delete_stack(String.t() | nil, String.t(), boolean()) ::
          {:ok, true} | {:error, integer(), String.t()}
  def delete_stack(project_id, name, force \\ false) do
    sd = stack_dir(project_id, name)

    if not valid_name?(name || "") or not File.dir?(sd) do
      {:error, 404, "Not found"}
    else
      state_file = Path.join(sd, "terraform.tfstate")

      if File.exists?(state_file) and not force do
        {:error, 409, "Local state present. Pass ?force=true to delete anyway."}
      else
        File.rm_rf!(sd)
        File.rm_rf!(stack_data_dir(project_id, name))
        {:ok, true}
      end
    end
  end

  @doc """
  Write the stack's OpenTofu files: refresh modules + `_template` from the
  in-repo IaC when available, seed platform-owned files, then render
  terraform.tfvars and seed backend.hcl if missing (Python _write_stack_files).
  """
  @spec write_stack_files(String.t() | nil, String.t(), map(), String.t()) :: :ok
  def write_stack_files(project_id, name, values, provider \\ "bytedc") do
    sync_iac_assets(project_id, provider)
    sd = stack_dir(project_id, name)
    File.mkdir_p!(sd)

    tpl = template_dir(project_id, provider)

    if File.dir?(tpl) do
      case File.ls(tpl) do
        {:ok, entries} ->
          Enum.each(entries, fn item ->
            skip? = item in ["terraform.tfvars", "backend.hcl", "credentials.auto.tfvars",
                             "credentials.auto.tfvars.example", ".terraform", ".terraform.lock.hcl"]
            src = Path.join(tpl, item)
            dest = Path.join(sd, item)

            cond do
              skip? -> :ok
              File.exists?(dest) and File.regular?(src) and MapSet.member?(@template_owned_files, item) ->
                File.cp!(src, dest)
              File.exists?(dest) ->
                :ok
              File.dir?(src) ->
                File.cp_r!(src, dest)
              true ->
                File.cp!(src, dest)
            end
          end)

        _ ->
          :ok
      end
    end

    File.write!(Path.join(sd, "terraform.tfvars"), CloudProviders.render_tfvars(provider, values || %{}))
    backend = Path.join(sd, "backend.hcl")
    unless File.exists?(backend), do: File.write!(backend, backend_hcl_placeholder(name))
    :ok
  end

  defp iac_source_dir(provider) do
    # Coexistence: the Elixir server reads the same in-repo IaC tree the
    # Flask server stages (apps/server/IaC/<provider>).
    repo_root = Path.expand(Path.join([File.cwd!(), "..", ".."]))
    Path.join([repo_root, "apps", "server", "IaC", "opentofu-" <> (provider || "bytedc")])
  end

  defp template_dir(project_id, "bytedc") do
    per = Path.join(envs_dir(project_id), "_template")
    if File.dir?(per), do: per, else: global_template_dir()
  end

  defp template_dir(project_id, _provider), do: Path.join(envs_dir(project_id), "_template")

  defp global_template_dir, do: Path.join([iac_source_dir("bytedc"), "envs", "_template"])

  @doc "Refresh modules/ + envs/_template from the in-repo IaC (best-effort)."
  @spec sync_iac_assets(String.t() | nil, String.t()) :: :ok
  def sync_iac_assets(project_id, provider \\ "bytedc") do
    root = stacks_root(project_id)
    File.mkdir_p!(root)
    src = iac_source_dir(provider)

    if File.dir?(src) do
      src_mods = Path.join(src, "modules")

      if File.dir?(src_mods) do
        dst_mods = Path.join(root, "modules")
        File.rm_rf!(dst_mods)
        File.cp_r!(src_mods, dst_mods)
      end

      if provider == "bytedc" do
        src_tpl = Path.join([src, "envs", "_template"])

        if File.dir?(src_tpl) do
          dst_tpl = Path.join([root, "envs", "_template"])
          File.rm_rf!(dst_tpl)
          File.cp_r!(src_tpl, dst_tpl)
        end
      end
    end

    :ok
  rescue
    _ -> :ok
  end

  @doc "Rendered backend.hcl placeholder (Python _render_backend_hcl parity)."
  @spec backend_hcl_placeholder(String.t()) :: String.t()
  def backend_hcl_placeholder(stack) do
    "# OpenTofu backend config — edit before `tofu init` to point at a remote state bucket.\n" <>
      "bucket = \"REPLACE_ME_TFSTATE_BUCKET\"\n" <>
      "key    = \"cloud-provisioning/#{stack}.tfstate\"\n" <>
      "region = \"\"\n"
  end

  # ---------------------------------------------------------------------------
  # TOFU execution enqueue (Python _create_execution — dispatched to workers)
  # ---------------------------------------------------------------------------

  @doc """
  Enqueue a TOFU_RUN execution that any online worker can claim (Python
  _create_execution): refresh IaC assets, load decrypted secrets into
  runParams, autoselect an online local/default worker when none is
  targeted, snapshot pre-apply state, and create the execution record.
  Returns the execution id.
  """
  @spec create_execution(String.t() | nil, String.t(), String.t(), keyword()) :: String.t()
  def create_execution(project_id, stack, action, opts \\ []) do
    worker_id = Keyword.get(opts, :worker_id)
    triggered_by = Keyword.get(opts, :triggered_by)
    triggered_by_user_id = Keyword.get(opts, :triggered_by_user_id)
    priority = Keyword.get(opts, :priority, 0)
    extra_run_params = Keyword.get(opts, :extra_run_params)

    provider = load_meta(project_id, stack)["provider"] || "bytedc"
    sync_iac_assets(project_id, provider)
    sd = stack_dir(project_id, stack)
    secrets_map = load_secrets(project_id, stack)

    run_params =
      %{
        "execution_type" => "TOFU_RUN",
        "tofu_action" => action,
        "stack_name" => stack,
        "stack_dir" => sd,
        "project_id" => project_id,
        "provider" => provider,
        "secrets" => secrets_map,
        "secret_keys" => CloudProviders.secret_keys_for(provider),
        "env" => %{"TF_IN_AUTOMATION" => "1"}
      }
      |> merge_run_params(extra_run_params)

    # Policy config rides on runParams when the stack opted in
    # (Python _create_execution; cloud_policy engine runs worker-side).
    run_params =
      if RadasAI.CloudPolicy.policy_enabled_from_meta(load_meta(project_id, stack)) and
           action in ["plan", "apply", "destroy"] do
        meta = load_meta(project_id, stack)
        Map.put(run_params, "policy", RadasAI.CloudPolicy.policy_config_from_meta(meta))
      else
        run_params
      end

    worker_id = worker_id || autoselect_local_worker()

    run_params =
      if worker_id do
        run_params
        |> Map.put("target_worker_id", worker_id)
        |> Map.put("requirements", %{"worker_id" => worker_id})
      else
        run_params
      end

    data =
      %{
        "status" => "QUEUED",
        "playbookName" => "tofu #{action} · #{stack}",
        "mode" => "TOFU",
        "runName" => "#{stack}/#{action}",
        "tag" => "tofu",
        "priority" => priority || 0,
        "runParams" => run_params
      }
      |> maybe_put("triggeredBy", triggered_by)
      |> maybe_put("triggeredByUserId", triggered_by_user_id)

    eid = ExecutionHistory.create_execution_record(data, project_id || "default")

    if action == "apply" do
      StackSnapshots.snapshot(project_id || "default", stack, "pre-apply")
    end

    eid
  end

  defp merge_run_params(params, nil), do: params
  defp merge_run_params(params, extra) when is_map(extra), do: Map.merge(params, extra)
  defp merge_run_params(params, _), do: params

  defp maybe_put(map, _k, nil), do: map
  defp maybe_put(map, k, v), do: Map.put(map, k, v)

  @doc "First online worker tagged local/default (Python autoselect fallback)."
  @spec autoselect_local_worker() :: String.t() | nil
  def autoselect_local_worker do
    RadasAI.WorkerRegistry.load_all_workers()
    |> Enum.find_value(fn {wid, w} ->
      tags = (w["tags"] || []) |> Enum.map(&String.downcase(to_string(&1)))

      if ("local" in tags or "default" in tags) and RadasAI.WorkerRegistry.is_worker_online(wid, 60) do
        wid
      else
        nil
      end
    end)
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp now_sec, do: System.system_time(:second)
end
