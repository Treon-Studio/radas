defmodule RadasAI.CloudState do
  @moduledoc """
  Port of `services/cloud_state.py` — state management for cloud
  provisioning stacks: audit trail (JSONL), state locks with auto-release,
  state version snapshots/rollback (cap 50), and backend.hcl config.

  All file paths mirror Flask: stack data dir `DATA_DIR/projects/<id>/<env>/
  tofu-state/` (created by the caller via `data_dir`), audit JSONL at
  `state-audit.jsonl`, lock at `state-lock.json`, versions at
  `state-versions/`.
  """

  @final_statuses MapSet.new(["SUCCESS", "FAILED", "CANCELED", "ERROR", "TIMEOUT", "STALLED"])
  @max_versions 50
  @backend_fields ["bucket", "key", "region", "endpoint", "profile", "prefix"]

  def final_statuses, do: MapSet.to_list(@final_statuses)
  def backend_fields, do: @backend_fields

  defp now_iso, do: DateTime.utc_now() |> DateTime.to_iso8601()
  defp now_ts, do: System.os_time(:millisecond) / 1000.0

  # ---------------------------------------------------------------------------
  # JSON file helpers (atomic write)
  # ---------------------------------------------------------------------------

  defp read_json(path, default) do
    case File.read(path) do
      {:ok, binary} ->
        case Jason.decode(binary) do
          {:ok, decoded} -> decoded
          _ -> default
        end

      _ ->
        default
    end
  end

  defp write_json(path, data) do
    File.mkdir_p!(Path.dirname(path))
    tmp = path <> ".tmp"
    File.write!(tmp, Jason.encode!(data, pretty: true))
    File.rename!(tmp, path)
    :ok
  end

  defp state_source(stack_dir) do
    Enum.find(
      [Path.join(stack_dir, "terraform.tfstate"), Path.join(stack_dir, "terraform.tfstate.json")],
      &File.exists?/1
    )
  end

  @doc "Summarize a terraform state blob: serial/lineage/resource_count/tofu_version."
  @spec summarize_state(String.t()) :: map()
  def summarize_state(raw) do
    case Jason.decode(raw) do
      {:ok, state} when is_map(state) ->
        count =
          (state["resources"] || [])
          |> Enum.reduce(0, fn res, acc -> acc + length(res["instances"] || []) end)

        %{
          "serial" => state["serial"],
          "lineage" => state["lineage"],
          "resource_count" => count,
          "tofu_version" => state["terraform_version"]
        }

      _ ->
        %{"serial" => nil, "lineage" => nil, "resource_count" => 0, "tofu_version" => nil}
    end
  end

  # ---------------------------------------------------------------------------
  # Audit trail (JSONL)
  # ---------------------------------------------------------------------------

  defp audit_file(data_dir), do: Path.join(data_dir, "state-audit.jsonl")

  @doc "Append one audit entry (fail-open)."
  @spec append_audit(String.t(), String.t(), String.t(), map()) :: :ok
  def append_audit(data_dir, event, actor, fields \\ %{}) do
    entry = Map.merge(%{"at" => now_iso(), "event" => event, "actor" => actor || "unknown"}, Map.new(fields))
    File.mkdir_p!(Path.dirname(audit_file(data_dir)))
    File.write!(audit_file(data_dir), Jason.encode!(entry) <> "\n", [:append])
    :ok
  rescue
    _ -> :ok
  end

  @doc "Read the last `limit` audit entries, newest first."
  @spec read_audit(String.t(), integer()) :: [map()]
  def read_audit(data_dir, limit \\ 100) do
    case File.read(audit_file(data_dir)) do
      {:ok, binary} ->
        binary
        |> String.trim_trailing("\n")
        |> String.split("\n")
        |> Enum.reverse()
        |> Enum.take(limit)
        |> Enum.flat_map(fn line ->
          case Jason.decode(line) do
            {:ok, map} -> [map]
            _ -> []
          end
        end)

      _ ->
        []
    end
  end

  # ---------------------------------------------------------------------------
  # Locks
  # ---------------------------------------------------------------------------

  defp lock_file(data_dir), do: Path.join(data_dir, "state-lock.json")

  @doc """
  Read the active lock, auto-releasing it when the owning execution reached a
  terminal status (`get_execution` is the injected checker).
  """
  @spec read_lock(String.t(), (String.t(), String.t() -> map() | nil) | nil, String.t() | nil) :: map() | nil
  def read_lock(data_dir, get_execution \\ nil, project_id \\ nil) do
    path = lock_file(data_dir)

    if not File.exists?(path) do
      nil
    else
      lock = read_json(path, nil)

      if not is_map(lock) do
        nil
      else
        lock = auto_release_if_finished(lock, data_dir, get_execution, project_id)

        if lock == nil do
          nil
        else
          held =
            try do
              max(0, trunc(now_ts() - (lock["created_ts"] || 0)))
            rescue
              _ -> 0
            end

          Map.put(lock, "held_seconds", held)
        end
      end
    end
  end

  defp auto_release_if_finished(lock, data_dir, get_execution, project_id) do
    run_id = lock["run_id"]

    if run_id && get_execution do
      try do
        execution = get_execution.(run_id, project_id) || %{}

        if MapSet.member?(@final_statuses, String.upcase(to_string(execution["status"] || ""))) do
          release_lock(data_dir, actor: "system", reason: "run finished")
          nil
        else
          lock
        end
      rescue
        _ -> lock
      end
    else
      lock
    end
  end

  @doc "Take the lock: {:ok, lock} or {:denied, existing_lock}."
  @spec acquire_lock(String.t(), keyword()) :: {:ok, map()} | {:denied, map()}
  def acquire_lock(data_dir, opts) do
    :global.set_lock({__MODULE__, data_dir})

    try do
      existing = read_lock(data_dir, Keyword.get(opts, :get_execution), Keyword.get(opts, :project_id))

      if existing do
        {:denied, existing}
      else
        lock = %{
          "id" => :crypto.strong_rand_bytes(8) |> Base.encode16(case: :lower),
          "who" => Keyword.get(opts, :actor) || "unknown",
          "operation" => Keyword.get(opts, :operation) || "manual",
          "run_id" => Keyword.get(opts, :run_id),
          "note" => Keyword.get(opts, :note) || "",
          "created_at" => now_iso(),
          "created_ts" => now_ts()
        }

        write_json(lock_file(data_dir), lock)
        append_audit(data_dir, "lock.acquired", Keyword.get(opts, :actor) || "unknown", %{"operation" => lock["operation"], "run_id" => lock["run_id"], "lock_id" => lock["id"], "note" => lock["note"]})
        {:ok, lock}
      end
    after
      :global.del_lock({__MODULE__, data_dir})
    end
  end

  @doc "Release the lock; refuses on id mismatch unless force: true."
  @spec release_lock(String.t(), keyword()) :: {:ok, boolean()} | {:error, String.t()}
  def release_lock(data_dir, opts \\ []) do
    path = lock_file(data_dir)

    if not File.exists?(path) do
      {:ok, false}
    else
      lock = read_json(path, %{}) || %{}
      requested_id = Keyword.get(opts, :lock_id)
      force = Keyword.get(opts, :force, false)

      if requested_id && lock["id"] && requested_id != lock["id"] && not force do
        {:error, "Lock id mismatch - pass force to break the lock."}
      else
        File.rm(path)

        append_audit(
          data_dir,
          if(force, do: "lock.forced", else: "lock.released"),
          Keyword.get(opts, :actor) || "unknown",
          %{
            "lock_id" => lock["id"],
            "previous_owner" => lock["who"],
            "operation" => lock["operation"],
            "reason" => Keyword.get(opts, :reason, "")
          }
        )

        {:ok, true}
      end
    end
  end

  # ---------------------------------------------------------------------------
  # State versions
  # ---------------------------------------------------------------------------

  defp versions_dir(data_dir), do: Path.join(data_dir, "state-versions")
  defp index_file(data_dir), do: Path.join(versions_dir(data_dir), "index.json")

  @doc "List state version index entries."
  @spec list_versions(String.t()) :: [map()]
  def list_versions(data_dir) do
    case read_json(index_file(data_dir), []) do
      list when is_list(list) -> list
      _ -> []
    end
  end

  defp save_index(data_dir, versions), do: write_json(index_file(data_dir), versions)

  @doc """
  Snapshot the current state file as a new version. Returns nil when there is
  no state on disk or the content matches the newest version.
  """
  @spec snapshot_state(String.t(), String.t(), keyword()) :: map() | nil
  def snapshot_state(stack_dir, data_dir, opts \\ []) do
    src = state_source(stack_dir) || nil

    if src == nil do
      nil
    else
      case File.read(src) do
        {:ok, raw} ->
          digest = Base.encode16(:crypto.hash(:sha256, raw), case: :lower)
          versions = list_versions(data_dir)

          newest = Enum.at(versions, 0)

          if newest && newest["sha256"] == digest do
            nil
          else
            vid = "v" <> (:crypto.strong_rand_bytes(6) |> Base.encode16(case: :lower))
            File.mkdir_p!(versions_dir(data_dir))
            File.write!(Path.join([versions_dir(data_dir), "#{vid}.json"]), raw)

            entry =
              %{
                "id" => vid,
                "created_at" => now_iso(),
                "actor" => Keyword.get(opts, :actor) || "unknown",
                "reason" => Keyword.get(opts, :reason) || "",
                "run_id" => Keyword.get(opts, :run_id),
                "sha256" => digest,
                "source" => Path.basename(src)
              }
              |> Map.merge(summarize_state(raw))

            versions = Enum.take([entry | versions], @max_versions)

            for old <- Enum.drop(versions, @max_versions) do
              File.rm(Path.join([versions_dir(data_dir), "#{old["id"]}.json"]))
            end

            save_index(data_dir, versions)
            append_audit(data_dir, "state.snapshot", Keyword.get(opts, :actor) || "unknown", %{"version_id" => vid, "reason" => Keyword.get(opts, :reason) || "", "run_id" => Keyword.get(opts, :run_id), "serial" => entry["serial"], "resource_count" => entry["resource_count"]})
            entry
          end

        _ ->
          nil
      end
    end
  end

  @doc "Roll back the state file to a version; snapshots current state first."
  @spec rollback_state(String.t(), String.t(), String.t(), keyword()) :: {:ok, map()} | {:error, String.t()}
  def rollback_state(stack_dir, data_dir, version_id, opts \\ []) do
    unless Regex.match?(~r/^[A-Za-z0-9._-]+$/, version_id || "") do
      {:error, "Invalid version id"}
    else
      vfile = Path.join([versions_dir(data_dir), "#{version_id}.json"])

      unless File.exists?(vfile) do
        {:error, "Version not found"}
      else
        snapshot_state(stack_dir, data_dir, actor: Keyword.get(opts, :actor) || "system", reason: "pre-rollback")
        target = Path.join(stack_dir, "terraform.tfstate")

        case File.read(vfile) do
          {:ok, raw} ->
            if File.exists?(target), do: File.copy(target, Path.join(stack_dir, "terraform.tfstate.rollback-backup"))
            File.write!(target, raw)
            summary = summarize_state(raw)
            append_audit(data_dir, "state.rollback", Keyword.get(opts, :actor) || "unknown", Map.merge(%{"version_id" => version_id}, summary))
            {:ok, Map.merge(%{"version_id" => version_id}, summary)}

          _ ->
            {:error, "Restore failed: version unreadable"}
        end
      end
    end
  end

  # ---------------------------------------------------------------------------
  # Backend config (backend.hcl)
  # ---------------------------------------------------------------------------

  @doc "Read backend.hcl + backend.tf summary."
  @spec read_backend_config(String.t()) :: map()
  def read_backend_config(stack_dir) do
    f = Path.join(stack_dir, "backend.hcl")
    values = read_hcl_values(f)
    placeholder = Enum.any?(Map.values(values), &String.starts_with?(to_string(&1), "REPLACE_ME"))

    raw_hcl =
      case File.read(f) do
        {:ok, text} -> text
        _ -> ""
      end

    btf = Path.join(stack_dir, "backend.tf")
    backend_type =
      case File.read(btf) do
        {:ok, text} ->
          case Regex.run(~r/backend\s+"([a-z0-9]+)"/, text) do
            [_, t] -> t
            _ -> "local"
          end

        _ ->
          "local"
      end

    filtered = Map.take(values, @backend_fields)

    %{
      "backend_type" => backend_type,
      "configured" => map_size(values) > 0 and not placeholder,
      "placeholder" => placeholder,
      "values" => if(filtered != %{}, do: filtered, else: values),
      "raw" => raw_hcl
    }
  end

  defp read_hcl_values(f) do
    case File.read(f) do
      {:ok, text} ->
        text
        |> String.split("\n")
        |> Enum.reject(&(String.starts_with?(String.trim(&1), "#")))
        |> Enum.flat_map(fn line ->
          case Regex.run(~r/^\s*([A-Za-z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/, line) do
            [_, k, v] -> [{k, v}]
            _ -> []
          end
        end)
        |> Map.new()

      _ ->
        %{}
    end
  end

  @doc "Write backend.hcl from validated values; audit the change."
  @spec write_backend_config(String.t(), String.t(), map(), keyword()) :: {:ok, map()} | {:error, String.t()}
  def write_backend_config(stack_dir, data_dir, values, opts \\ []) do
    # Validation may throw {:error, msg}; normalize to the {:error, msg} return.
    clean =
      try do
        validate_values(values)
      catch
        {:error, msg} -> {:error, msg}
      end

    cond do
      match?({:error, _}, clean) -> elem(clean, 1) |> then(fn msg -> {:error, msg} end)
      clean == %{} -> {:error, "Provide at least one backend field (bucket, key, region, ...)."}
      true ->
        write_backend_file(stack_dir, data_dir, clean, Keyword.get(opts, :actor) || "unknown")
    end
  end

  defp validate_values(values) do
    Enum.reduce(@backend_fields, %{}, fn k, acc ->
      v = Map.get(values || %{}, k)

      if v == nil do
        acc
      else
        v = String.trim(to_string(v))

        cond do
          v == "" -> acc
          String.contains?(v, "\n") or String.contains?(v, "\"") -> throw({:error, "Invalid value for #{k}"})
          true -> Map.put(acc, k, v)
        end
      end
    end)
  end

  defp write_backend_file(stack_dir, data_dir, clean, actor) do
    lines = ["# OpenTofu backend config — managed from the OpenSible console.", ""] ++ Enum.map(clean, fn {k, v} -> "#{k} = \"#{v}\"" end)

    File.write!(Path.join(stack_dir, "backend.hcl"), Enum.join(lines, "\n") <> "\n")
    append_audit(data_dir, "backend.updated", actor, %{"fields" => Enum.sort(Map.keys(clean))})
    {:ok, read_backend_config(stack_dir)}
  end

  defp parse_int(nil, default), do: default

  defp parse_int(v, _default) when is_integer(v), do: v
  defp parse_int(v, _default) when is_float(v), do: trunc(v)

  defp parse_int(v, default) when is_binary(v) do
    case Integer.parse(v) do
      {n, _} -> n
      :error -> default
    end
  end

  defp parse_int(_, default), do: default
end
