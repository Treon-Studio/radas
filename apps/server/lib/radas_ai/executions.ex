defmodule RadasAI.Executions do
  @moduledoc """
  Port of `storage/executions_store.py` — the execution record store.

  Postgres-backed (Fase 7 of the Python refactor): records live in
  `executions (id, project_id, data jsonb, created_at)`; log bytes append to
  `execution_logs (execution_id, chunk, data bytea)` with concat-on-conflict.
  The `execution_locations` / `queued_executions` index tables (index_db) are
  kept in sync so worker claim stays O(1).
  """

  import RadasAI.DB

  @final_statuses MapSet.new(["CANCELED", "SUCCESS", "FAILED"])

  @allowed_transitions %{
    "QUEUED" => MapSet.new(["RUNNING", "CANCELED"]),
    "RUNNING" => MapSet.new(["SUCCESS", "FAILED", "CANCELING"]),
    "CANCELING" => MapSet.new(["CANCELED", "FAILED"]),
    "CANCELED" => MapSet.new([]),
    "SUCCESS" => MapSet.new([]),
    "FAILED" => MapSet.new([])
  }

  def final_statuses, do: @final_statuses

  @doc "Validate a status transition; raises ArgumentError on invalid moves."
  @spec validate_status_transition(String.t() | nil, String.t() | nil) :: :ok
  def validate_status_transition(from_status, to_status) do
    from_status = up(from_status)
    to_status = up(to_status)

    if from_status in [nil, ""] or to_status in [nil, ""] do
      raise ArgumentError, message: "Status cannot be None or empty (from: #{from_status}, to: #{to_status})"
    end

    if from_status == to_status do
      :ok
    else
      allowed = Map.get(@allowed_transitions, from_status, MapSet.new())

      if MapSet.member?(allowed, to_status) do
        :ok
      else
        msg =
          cond do
            MapSet.member?(@final_statuses, from_status) ->
              "Cannot change status from final status '#{from_status}' to '#{to_status}'. " <>
                "Final statuses (#{Enum.join(MapSet.to_list(@final_statuses), ", ")}) cannot be changed."

            to_status == "CANCELED" and from_status == "RUNNING" ->
              "Cannot transition from '#{from_status}' to '#{to_status}' directly. " <>
                "Must go through CANCELING first: #{from_status} → CANCELING → #{to_status}"

            true ->
              allowed_str = if MapSet.size(allowed) > 0, do: Enum.join(Enum.sort(MapSet.to_list(allowed)), ", "), else: "none (final status)"
              "Invalid status transition: '#{from_status}' → '#{to_status}'. Allowed transitions from '#{from_status}': #{allowed_str}"
          end

        raise ArgumentError, message: msg
      end
    end
  end

  @doc "Whether a status is terminal."
  @spec is_final_status(String.t() | nil) :: boolean()
  def is_final_status(status) when is_binary(status), do: MapSet.member?(@final_statuses, up(status))
  def is_final_status(_), do: false

  @doc "Non-raising transition check."
  @spec can_transition(String.t() | nil, String.t() | nil) :: boolean()
  def can_transition(from_status, to_status) do
    validate_status_transition(from_status, to_status)
    true
  rescue
    ArgumentError -> false
  end

  # ---------------------------------------------------------------------------
  # Record access
  # ---------------------------------------------------------------------------

  @doc "Fetch one execution record (jsonb-decoded) by id, optionally project-scoped."
  @spec get_execution(String.t(), String.t() | nil) :: map() | nil
  def get_execution(execution_id, project_id \\ nil) do
    import Ecto.Query

    query =
      if project_id in [nil, ""] do
        from(r in RadasAI.ExecutionRow, where: r.id == ^execution_id, select: r)
      else
        from(r in RadasAI.ExecutionRow, where: r.id == ^execution_id and r.project_id == ^project_id, select: r)
      end

    case Radas.Repo.one(query) do
      nil -> nil
      row -> row.data
    end
  end

  @doc """
  Merge `updates` into an execution record with status-machine enforcement,
  derived timestamps (statusUpdatedAt/startedAt/queuedAt/cancelRequestedAt/
  canceledAt/cancelReason/finishedAt/duration), a Postgres upsert, and index
  sync. Returns true when the record was updated.
  """
  @spec update_execution_record(String.t(), map(), String.t() | nil) :: boolean()
  def update_execution_record(execution_id, updates, project_id \\ nil)

  def update_execution_record(execution_id, updates, nil) do
    project_id = updates["project_id"] || find_execution_project(execution_id)

    if project_id in [nil, ""] do
      raise ArgumentError, message: "project_id is required for update_execution_record (execution_id: #{execution_id})"
    end

    update_execution_record(execution_id, updates, project_id)
  end

  def update_execution_record(execution_id, updates, project_id) do
    case get_execution(execution_id, project_id) do
      nil ->
        false

      execution ->
        old_status = execution["status"] || "QUEUED"
        new_status = updates["status"]
        updates = Map.new(updates)

        if new_status not in [nil, ""] and new_status != old_status do
          validate_status_transition(old_status, new_status)
        end

        ts = now()
        updates = if new_status not in [nil, ""] and new_status != old_status, do: Map.put(updates, "statusUpdatedAt", ts), else: updates

        updates =
          cond do
            new_status == "RUNNING" ->
              updates = if Map.has_key?(updates, "startedAt"), do: updates, else: Map.put(updates, "startedAt", ts)
              updates = if not Map.has_key?(execution, "queuedAt") and old_status == "QUEUED", do: Map.put_new(updates, "queuedAt", execution["createdAt"] || ts), else: updates
              updates

            new_status == "CANCELING" ->
              if Map.has_key?(updates, "cancelRequestedAt"), do: updates, else: Map.put(updates, "cancelRequestedAt", ts)

            new_status == "CANCELED" ->
              updates = if Map.has_key?(updates, "canceledAt"), do: updates, else: Map.put(updates, "canceledAt", ts)
              updates = if Map.has_key?(updates, "cancelReason"), do: updates, else: Map.put(updates, "cancelReason", "user")
              updates

            new_status in ["SUCCESS", "FAILED"] ->
              if Map.has_key?(updates, "finishedAt"), do: updates, else: Map.put(updates, "finishedAt", ts)

            true ->
              updates
          end

        updates =
          if Map.has_key?(updates, "finishedAt") and not Map.has_key?(updates, "duration") do
            started_at = execution["startedAt"] || updates["startedAt"] || execution["createdAt"]
            finished_at = updates["finishedAt"]

            if started_at && finished_at,
              do: Map.put(updates, "duration", trunc(finished_at - started_at)),
              else: updates
          else
            updates
          end

        execution = Map.merge(execution, updates)
        effective_status = new_status || execution["status"]

        # jsonb goes through Ecto to avoid Postgrex double-encoding.
        changeset =
          Ecto.Changeset.cast(%RadasAI.ExecutionRow{id: execution_id}, %{data: execution, project_id: project_id}, [:data, :project_id])

        Radas.Repo.insert!(changeset,
          on_conflict: {:replace, [:data, :project_id]},
          conflict_target: :id,
          stale_error_field: false
        )

        sync_index(execution_id, project_id, effective_status, execution)
        true
    end
  end

  @doc "Sync the index tables after an execution write (index_db port, fail-open)."
  @spec sync_index(String.t(), String.t(), String.t(), map()) :: :ok
  def sync_index(execution_id, project_id, effective_status, execution) do
    execute!(
      """
      INSERT INTO execution_locations (execution_id, project_id, status, worker_id, updated_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (execution_id) DO UPDATE SET
        project_id = EXCLUDED.project_id, status = EXCLUDED.status,
        worker_id = EXCLUDED.worker_id, updated_at = EXCLUDED.updated_at
      """,
      [execution_id, project_id, effective_status, execution["workerId"], execution["statusUpdatedAt"] || now()]
    )

    cond do
      effective_status == "QUEUED" ->
        execute!("DELETE FROM queued_executions WHERE execution_id = $1", [execution_id])

        execute!(
          "INSERT INTO queued_executions (execution_id, project_id, queued_at) VALUES ($1, $2, $3) ON CONFLICT (execution_id) DO NOTHING",
          [execution_id, project_id, execution["queuedAt"] || execution["createdAt"] || now()]
        )

        execute!("DELETE FROM running_executions WHERE execution_id = $1", [execution_id])

      effective_status == "RUNNING" and execution["workerId"] not in [nil, ""] ->
        execute!("DELETE FROM queued_executions WHERE execution_id = $1", [execution_id])

        execute!(
          """
          INSERT INTO running_executions (execution_id, project_id, worker_id, started_at)
          VALUES ($1, $2, $3::jsonb, $4) ON CONFLICT (execution_id) DO UPDATE SET
            project_id = EXCLUDED.project_id, worker_id = EXCLUDED.worker_id, started_at = EXCLUDED.started_at
          """,
          [execution_id, project_id, execution["workerId"], execution["startedAt"] || execution["createdAt"] || now()]
        )

      true ->
        execute!("DELETE FROM queued_executions WHERE execution_id = $1", [execution_id])
        execute!("DELETE FROM running_executions WHERE execution_id = $1", [execution_id])
    end

    :ok
  rescue
    _ -> :ok
  end

  @doc "Find the project id that owns an execution via the index."
  @spec find_execution_project(String.t()) :: String.t() | nil
  def find_execution_project(execution_id) do
    case query_one!("SELECT project_id FROM execution_locations WHERE execution_id = $1", [execution_id]) do
      %{"project_id" => pid} -> pid
      nil ->
        case get_execution(execution_id, nil) do
          %{"projectId" => pid} -> pid
          _ -> nil
        end
    end
  end

  # ---------------------------------------------------------------------------
  # Logs (bytea concat chunks)
  # ---------------------------------------------------------------------------

  @doc "Append text to an execution log (concatenates onto chunk 0)."
  @spec append_execution_log(String.t(), String.t(), String.t()) :: boolean()
  def append_execution_log(execution_id, text, project_id) do
    if project_id in [nil, ""] do
      raise ArgumentError, message: "project_id is required for append_execution_log (execution_id: #{execution_id})"
    end

    payload = if String.ends_with?(text, "\n"), do: text, else: text <> "\n"

    execute!(
      """
      INSERT INTO execution_logs (execution_id, chunk, data) VALUES ($1, 0, $2)
      ON CONFLICT (execution_id, chunk) DO UPDATE SET data = execution_logs.data || EXCLUDED.data
      """,
      [execution_id, payload]
    )

    true
  rescue
    _ -> false
  end

  @doc "Read one log chunk: {text, next_offset, file_size, is_complete}."
  @spec read_log_chunk(String.t(), integer(), integer(), String.t()) :: {String.t(), integer(), integer(), boolean()}
  def read_log_chunk(execution_id, offset \\ 0, limit \\ 1024 * 1024, project_id \\ nil) do
    if project_id in [nil, ""] do
      raise ArgumentError, message: "project_id is required for read_log_chunk (execution_id: #{execution_id})"
    end

    case query_one!("SELECT data FROM execution_logs WHERE execution_id = $1 AND chunk = 0", [execution_id]) do
      nil ->
        {"", offset, 0, false}

      row ->
        data = row["data"] || ""
        data = if is_binary(data), do: data, else: IO.iodata_to_binary(data)
        file_size = byte_size(data)

        if offset >= file_size do
          execution = get_execution(execution_id, project_id)
          complete = execution != nil and is_final_status(execution["status"])
          {"", offset, file_size, complete}
        else
          length = min(limit, file_size - offset)
          chunk = binary_part(data, offset, length)
          text = chunk |> IO.iodata_to_binary() |> to_utf8_lossy()
          {text, offset + length, file_size, is_complete?(execution_id, project_id)}
        end
    end
  rescue
    _ -> {"", offset, 0, false}
  end

  defp is_complete?(execution_id, project_id) do
    case get_execution(execution_id, project_id) do
      nil -> false
      execution -> is_final_status(execution["status"])
    end
  end

  # Multi-byte UTF-8 safety: trim a trailing partial character.
  defp to_utf8_lossy(binary) do
    len = byte_size(binary)
    trimmed = if len > 3 and not String.valid?(binary), do: trim_partial(binary, len), else: binary
    trimmed
  end

  defp trim_partial(binary, len) do
    Enum.find_value(min(len, 4)..1//1, binary, fn back ->
      candidate = binary_part(binary, 0, len - back)

      if String.valid?(candidate), do: candidate
    end)
  end

  defp up(nil), do: nil
  defp up(s) when is_binary(s), do: String.upcase(s)
  defp up(_), do: nil

  @doc "Create one execution row via Ecto (single-encoded jsonb)."
  @spec upsert_row(String.t(), String.t(), map()) :: :ok
  def upsert_row(execution_id, project_id, execution) do
    # insert_all with explicit values avoids Changeset/RETURNING pitfalls;
    # Ecto encodes the :map field as a single-encoded jsonb value.
    Radas.Repo.insert_all(
      RadasAI.ExecutionRow,
      [%{id: execution_id, project_id: project_id, data: execution, created_at: execution["createdAt"] || now()}],
      on_conflict: {:replace, [:data, :project_id]},
      conflict_target: :id
    )

    :ok
  end
end
