defmodule RadasAI.ExecutionClaim do
  @moduledoc """
  Port of `app.py::server_claim_next_execution` (Postgres-backed variant) and
  `_check_execution_requirements` (`services/execution_dispatcher.py`).

  Claim order: worker concurrency check (with stale-running self-heal) →
  QUEUED candidates from the `queued_executions` index (falling back to a
  jsonb scan) → requirement filtering (target worker_id / required tags /
  capabilities) → priority + queuedAt ordering → admission lease under the
  project advisory lock → transition QUEUED → RUNNING with worker assignment.
  """

  import RadasAI.DB

  alias RadasAI.{Admission, Executions}

  @default_lease_seconds 3600

  @doc "Port of _check_execution_requirements."
  @spec check_requirements(map(), map(), [String.t()], String.t() | nil) :: boolean()
  def check_requirements(execution, worker_capabilities, worker_tags, worker_id \\ nil) do
    run_params = execution["runParams"] || %{}
    requirements = run_params["requirements"] || %{}

    required_worker_id = requirements["worker_id"] || run_params["target_worker_id"]

    if required_worker_id && worker_id && to_string(required_worker_id) != to_string(worker_id) do
      false
    else
      required_tags = requirements["tags"] || []

      tags_ok =
        required_tags == [] or
          MapSet.subset?(MapSet.new(required_tags), MapSet.new(worker_tags || []))

      if tags_ok do
        required_caps = requirements["capabilities"] || %{}

        Enum.all?(required_caps, fn {cap_key, cap_value} ->
          Map.get(worker_capabilities || %{}, cap_key) == cap_value
        end)
      else
        false
      end
    end
  end

  @doc "Count RUNNING leases for a worker (active runs)."
  @spec active_runs_count(String.t()) :: integer()
  def active_runs_count(worker_id) do
    case query_one!(
           "SELECT COUNT(*) AS n FROM project_admission_leases WHERE worker_id = $1 AND status IN ('reserved','active')",
           [worker_id]
         ) do
      %{"n" => n} -> n
    end
  end

  @doc """
  Claim the next QUEUED execution for a worker.

  Returns {:ok, execution_id, execution, project_id} or :no_work. Concurrency
  is enforced via project admission leases taken under the project advisory
  lock inside a single transaction.
  """
  @spec claim_next(String.t(), map(), keyword()) ::
          {:ok, String.t(), map(), String.t()} | :no_work
  def claim_next(worker_id, worker_data, opts \\ []) do
    max_concurrency = Keyword.get(opts, :max_concurrency, 1)
    project_filter = Keyword.get(opts, :project_id)
    tags_override = Keyword.get(opts, :tags)
    recovering = Keyword.get(opts, :recovering, false)

    active = active_runs_count(worker_id)

    if active >= max_concurrency do
      # Self-heal: prune RUNNING leases whose executions already finished
      # (worker crashed before finish), then re-check.
      pruned = prune_stale_running_for_worker(worker_id)
      active = if pruned > 0, do: active_runs_count(worker_id), else: active

      if active >= max_concurrency do
        :no_work
      else
        do_claim(worker_id, worker_data, project_filter, tags_override, recovering)
      end
    else
      do_claim(worker_id, worker_data, project_filter, tags_override, recovering)
    end
  end

  defp do_claim(worker_id, worker_data, project_filter, tags_override, _recovering) do
    capabilities = worker_data["capabilities"] || %{}
    tags = tags_override || worker_data["tags"] || []

    candidates =
      queued_candidates(project_filter)
      |> Enum.filter(&check_requirements(&1.execution, capabilities, tags, worker_id))
      |> Enum.sort_by(&{-priority_of(&1.execution), queued_at_of(&1.execution)})

    Enum.find_value(candidates, fn candidate ->
      try_admit(worker_id, candidate)
    end) || :no_work
  end

  defp try_admit(worker_id, %{execution_id: execution_id, project_id: project_id}) do
    result =
      repo_transaction(fn ->
        lease =
          Admission.admit(project_id,
            limit: quota_limit(project_id),
            kind: "legacy_execution",
            reference_id: execution_id,
            worker_id: worker_id,
            lease_until: now() + @default_lease_seconds
          )

        if lease == nil do
          {:denied, nil}
        else
          updates = %{
            "status" => "RUNNING",
            "workerId" => worker_id,
            "statusUpdatedAt" => now()
          }

          Executions.update_execution_record(execution_id, updates, project_id)

          with %{} = execution <- Executions.get_execution(execution_id, project_id) do
            {:claimed, execution}
          else
            _ -> {:denied, nil}
          end
        end
      end)

    case result do
      {:claimed, execution} -> {:ok, execution_id, execution, project_id}
      _ -> :no_work
    end
  end

  defp repo_transaction(fun) do
    Radas.Repo.transaction(fn ->
      fun.()
    end)
    |> case do
      {:ok, value} -> value
      {:error, reason} -> raise reason
    end
  end

  defp queued_candidates(project_filter) do
    {sql, params} =
      if project_filter in [nil, ""] do
        {"SELECT execution_id, project_id FROM queued_executions ORDER BY queued_at ASC LIMIT 50", []}
      else
        {"SELECT execution_id, project_id FROM queued_executions WHERE project_id = $1 ORDER BY queued_at ASC LIMIT 50", [project_filter]}
      end

    indexed = query_all!(sql, params)

    candidates =
      Enum.flat_map(indexed, fn row ->
        case Executions.get_execution(row["execution_id"], row["project_id"]) do
          %{"status" => "QUEUED"} = execution ->
            [%{execution_id: row["execution_id"], project_id: row["project_id"], execution: execution}]

          _ ->
            # Stale index row → self-heal.
            execute!("DELETE FROM queued_executions WHERE execution_id = $1", [row["execution_id"]])
            []
        end
      end)

    if candidates != [] do
      candidates
    else
      # Fallback jsonb scan (self-healing at startup).
      {scan_sql, scan_params} =
        if project_filter in [nil, ""] do
          {"SELECT id, project_id, data FROM executions WHERE data->>'status' = 'QUEUED' ORDER BY created_at ASC LIMIT 50", []}
        else
          {"SELECT id, project_id, data FROM executions WHERE data->>'status' = 'QUEUED' AND project_id = $1 ORDER BY created_at ASC LIMIT 50", [project_filter]}
        end

      Enum.flat_map(query_all!(scan_sql, scan_params), fn row ->
        case decode(row["data"]) do
          %{} = execution ->
            [%{execution_id: row["execution_id"], project_id: row["project_id"], execution: execution}]

          nil ->
            []
        end
      end)
    end
  end

  defp prune_stale_running_for_worker(worker_id) do
    rows =
      query_all!(
        "SELECT execution_id FROM running_executions WHERE worker_id = $1",
        [worker_id]
      )

    Enum.count(rows, fn row ->
      case Executions.get_execution(row["execution_id"], row["project_id"]) do
        nil ->
          execute!("DELETE FROM running_executions WHERE execution_id = $1", [row["execution_id"]])
          true

        execution ->
          if RadasAI.Executions.is_final_status(execution["status"]) do
            execute!("DELETE FROM running_executions WHERE execution_id = $1", [row["execution_id"]])
            true
          else
            false
          end
      end
    end)
  end

  @doc "Project concurrency limit; 0 = unlimited (quota service port placeholder)."
  def quota_limit(_project_id), do: 0

  defp priority_of(execution), do: int_or(execution["priority"], 0)

  defp queued_at_of(execution), do: int_or(execution["queuedAt"] || execution["createdAt"], 0)

  defp int_or(nil, default), do: default
  defp int_or(v, _d) when is_integer(v), do: v
  defp int_or(v, _d) when is_float(v), do: trunc(v)

  defp int_or(v, default) when is_binary(v) do
    case Float.parse(v) do
      {f, _} -> trunc(f)
      :error -> default
    end
  end

  defp int_or(_, default), do: default

  defp decode(data) when is_map(data), do: data

  defp decode(data) when is_binary(data) do
    case Jason.decode(data) do
      {:ok, map} -> map
      _ -> nil
    end
  end

  defp decode(_), do: nil
end
