defmodule RadasAI.ExecutionHistory do
  @moduledoc """
  Port of `services/execution_history.py` — record creation, listing with
  search/pagination, stats, retention, and execution settings (kv-backed).
  """

  import RadasAI.DB

  alias RadasAI.{Executions, KV}

  @settings_scope "execution_settings"

  # ---------------------------------------------------------------------------
  # Record creation
  # ---------------------------------------------------------------------------

  @doc "Create one execution record; returns the execution id."
  @spec create_execution_record(map(), String.t(), String.t() | nil) :: String.t()
  def create_execution_record(data, project_id, execution_id \\ nil)

  def create_execution_record(data, nil, execution_id) do
    case Map.get(data, "project_id") do
      nil -> raise ArgumentError, message: "project_id is required for create_execution_record"
      pid -> create_execution_record(data, pid, execution_id)
    end
  end

  def create_execution_record(data, project_id, execution_id) do
    execution_id = execution_id || Ecto.UUID.generate()
    now_ts = now()

    status =
      data["status"]
      |> to_string()
      |> String.upcase()

    status = if status in ["QUEUED", "RUNNING"], do: status, else: "QUEUED"

    execution =
      Map.merge(
        %{
          "id" => execution_id,
          "projectId" => project_id,
          "createdAt" => now_ts,
          "status" => status,
          "statusUpdatedAt" => now_ts,
          "playbookName" => data["playbookName"] || "dynamic_playbook",
          "mode" => data["mode"] || "PER_GROUP",
          "inventorySnapshot" => data["inventorySnapshot"] || %{},
          "selectionSnapshot" => data["selectionSnapshot"] || %{},
          "stats" => data["stats"] || %{},
          "warnings" => data["warnings"] || [],
          "runParams" => data["runParams"] || %{}
        },
        Map.drop(Map.new(data), ["id", "projectId", "createdAt", "status", "statusUpdatedAt"])
      )

    RadasAI.Executions.upsert_row(execution_id, project_id, execution)

    if status == "QUEUED" do
      execute!(
        "INSERT INTO queued_executions (execution_id, project_id, queued_at) VALUES ($1, $2, $3) ON CONFLICT (execution_id) DO NOTHING",
        [execution_id, project_id, execution["queuedAt"] || now_ts]
      )

      execute!(
        """
        INSERT INTO execution_locations (execution_id, project_id, status, worker_id, updated_at)
        VALUES ($1, $2, $3, NULL, $4)
        ON CONFLICT (execution_id) DO UPDATE SET status = EXCLUDED.status, updated_at = EXCLUDED.updated_at
        """,
        [execution_id, project_id, status, now_ts]
      )
    end

    execution_id
  end

  # ---------------------------------------------------------------------------
  # Listing
  # ---------------------------------------------------------------------------

  @doc "List executions with optional search, playbook filter, and pagination."
  @spec list_executions(keyword()) :: [map()]
  def list_executions(opts \\ []) do
    limit = Keyword.get(opts, :limit)
    offset = Keyword.get(opts, :offset, 0)
    search = Keyword.get(opts, :search_query)
    playbook_id = Keyword.get(opts, :playbook_id)
    project_id = Keyword.get(opts, :project_id)

    {clauses, params} =
      [
        {"data->>'projectId' = $", project_id},
        {"data->>'status' ILIKE $", search && "%" <> search <> "%"},
        {"data->'selectionSnapshot'->>'playbookId' = $", playbook_id}
      ]
      |> Enum.reject(fn {_c, v} -> v in [nil, ""] end)
      |> Enum.reduce({[], []}, fn {clause, value}, {cs, ps} ->
        {cs ++ ["(#{clause}#{length(ps) + 1})"], ps ++ [value]}
      end)
      |> then(fn {cs, ps} -> {Enum.join(cs, " AND "), ps} end)

    {limit_sql, params} =
      if limit do
        {" LIMIT $#{length(params) + 1} OFFSET $#{length(params) + 2}", params ++ [limit, offset]}
      else
        {"", params}
      end

    ids =
      query_all!(
        "SELECT id FROM executions WHERE #{clauses} ORDER BY data->>'createdAt' DESC" <> limit_sql,
        params
      )
      |> Enum.map(& &1["id"])

    ids
    |> Enum.map(&RadasAI.Executions.get_execution(&1, nil))
    |> Enum.reject(&is_nil/1)
  end

  # ---------------------------------------------------------------------------
  # Logs / stats / settings / retention
  # ---------------------------------------------------------------------------

  @doc "Full log text for one execution."
  @spec get_execution_log(String.t(), String.t()) :: String.t() | nil
  def get_execution_log(execution_id, _project_id) do
    case query_one!("SELECT data FROM execution_logs WHERE execution_id = $1 AND chunk = 0", [execution_id]) do
      nil -> nil
      row -> row["data"] |> to_string()
    end
  end

  @doc "Aggregate stats for one project's executions."
  @spec get_execution_stats(String.t() | nil) :: map()
  def get_execution_stats(project_id \\ nil) do
    {sql, params} =
      if project_id in [nil, ""] do
        {"SELECT data->>'status' AS status, COUNT(*) AS n FROM executions GROUP BY data->>'status'", []}
      else
        {"SELECT data->>'status' AS status, COUNT(*) AS n FROM executions WHERE project_id = $1 GROUP BY data->>'status'", [project_id]}
      end

    counts = Map.new(query_all!(sql, params), &{&1["status"] || "UNKNOWN", &1["n"]})

    %{
      "total" => counts |> Map.values() |> Enum.sum(),
      "queued" => Map.get(counts, "QUEUED", 0),
      "running" => Map.get(counts, "RUNNING", 0),
      "success" => Map.get(counts, "SUCCESS", 0),
      "failed" => Map.get(counts, "FAILED", 0),
      "canceled" => Map.get(counts, "CANCELED", 0) + Map.get(counts, "CANCELING", 0)
    }
  end

  @doc "Delete every execution (and logs) for a project; returns rows deleted."
  @spec clear_all_executions(String.t() | nil) :: integer()
  def clear_all_executions(project_id \\ nil) do
    {sql, params} =
      if project_id in [nil, ""] do
        {"SELECT id FROM executions", []}
      else
        {"SELECT id FROM executions WHERE project_id = $1", [project_id]}
      end

    ids = query_all!(sql, params) |> Enum.map(& &1["id"])

    Enum.each(ids, fn id ->
      execute!("DELETE FROM execution_logs WHERE execution_id = $1", [id])
      execute!("DELETE FROM queued_executions WHERE execution_id = $1", [id])
      execute!("DELETE FROM running_executions WHERE execution_id = $1", [id])
      execute!("DELETE FROM execution_locations WHERE execution_id = $1", [id])
    end)

    delete_sql =
      if project_id in [nil, ""],
        do: "DELETE FROM executions",
        else: "DELETE FROM executions WHERE project_id = $1"

    execute!(delete_sql, if(project_id in [nil, ""], do: [], else: [project_id]))
  end

  @doc "Execution settings: kv-backed (scope execution_settings, key default)."
  @spec load_execution_settings() :: map()
  def load_execution_settings do
    KV.get(@settings_scope) || %{"save_history" => true}
  end

  @doc "Merge settings into the stored map."
  @spec save_execution_settings(map()) :: map()
  def save_execution_settings(data) do
    settings = Map.merge(load_execution_settings(), Map.new(data || %{}))
    KV.set(@settings_scope, "default", settings)
    settings
  end

  @doc "Log retention: delete non-final executions older than `days`."
  @spec apply_retention_policy(integer()) :: integer()
  def apply_retention_policy(days \\ 30) do
    cutoff = now() - days * 86_400

    stale = query_all!("SELECT id FROM executions WHERE data->>'createdAt' < $1", [cutoff])

    Enum.count(stale, fn row ->
      execution = Executions.get_execution(row["id"], nil)

      unless Executions.is_final_status(execution["status"]) do
        execute!("DELETE FROM executions WHERE id = $1", [row["id"]])
        execute!("DELETE FROM execution_logs WHERE execution_id = $1", [row["id"]])
        true
      else
        false
      end
    end)
  end

end
