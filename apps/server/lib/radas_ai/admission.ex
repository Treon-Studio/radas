defmodule RadasAI.Admission do
  @moduledoc """
  Port of `storage/project_admission.py` — atomic project-wide admission
  leases (service and legacy executions) over `project_admission_leases`.
  """

  import RadasAI.DB

  @lock_prefix "radas.project_admission:"

  def lock_prefix, do: @lock_prefix

  defp lock_sql(project_id), do: "SELECT pg_advisory_xact_lock(hashtextextended('#{@lock_prefix}#{project_id}', 0))"

  @doc "Reclaim expired leases; returns rows deleted. Call inside a transaction."
  @spec reclaim_expired(String.t() | nil, float() | nil) :: integer()
  def reclaim_expired(project_id \\ nil, now_ts \\ nil) do
    now_ts = now_ts || now()

    {sql, params} =
      if project_id do
        execute!(lock_sql(project_id), [])
        {"DELETE FROM project_admission_leases WHERE project_id=$1 AND lease_until IS NOT NULL AND lease_until < $2", [project_id, now_ts]}
      else
        {"DELETE FROM project_admission_leases WHERE lease_until IS NOT NULL AND lease_until < $1", [now_ts]}
      end

    execute!(sql, params)
  end

  @doc "Active (reserved/active, unexpired) lease count for a project."
  @spec active_count(String.t()) :: integer()
  def active_count(project_id) do
    case query_one!(
           "SELECT COUNT(*) AS n FROM project_admission_leases WHERE project_id=$1 AND status IN ('reserved','active') AND (lease_until IS NULL OR lease_until >= $2)",
           [project_id, now()]
         ) do
      %{"n" => n} -> n
    end
  end

  @doc """
  Admit one lease under the project advisory lock. Returns the lease map, or
  nil when the concurrency limit is reached (lock contention denials are
  counted, mirroring Python).
  """
  @spec admit(String.t(), keyword()) :: map() | nil
  def admit(project_id, opts) do
    limit = Keyword.fetch!(opts, :limit)
    kind = Keyword.fetch!(opts, :kind)
    reference_id = Keyword.fetch!(opts, :reference_id)
    worker_id = Keyword.get(opts, :worker_id)
    lease_until = Keyword.get(opts, :lease_until)

    execute!(lock_sql(project_id), [])
    reclaim_expired(project_id)

    existing =
      query_one!("SELECT * FROM project_admission_leases WHERE kind=$1 AND reference_id=$2 LIMIT 1", [kind, reference_id])

    if existing do
      existing
    else
      if limit > 0 and active_count(project_id) >= limit do
        try do
          RadasAI.Metrics.incr("lock_contention_denials_total")
        rescue
          _ -> :ok
        end

        nil
      else
        ts = now()
        lease = %{
          "id" => Ecto.UUID.generate(),
          "project_id" => project_id,
          "kind" => kind,
          "reference_id" => reference_id,
          "worker_id" => worker_id,
          "status" => "active",
          "lease_until" => lease_until,
          "created_at" => ts,
          "updated_at" => ts
        }

        execute!(
          """
          INSERT INTO project_admission_leases
            (id, project_id, kind, reference_id, worker_id, status, lease_until, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          """,
          [lease["id"], lease["project_id"], lease["kind"], lease["reference_id"], lease["worker_id"], lease["status"], lease["lease_until"], lease["created_at"], lease["updated_at"]]
        )

        lease
      end
    end
  end

  @doc "Release a lease by id or reference_id."
  @spec release(keyword()) :: boolean()
  def release(opts) do
    {sql, params} =
      if lease_id = Keyword.get(opts, :lease_id) do
        {"DELETE FROM project_admission_leases WHERE id=$1", [lease_id]}
      else
        {"DELETE FROM project_admission_leases WHERE reference_id=$1", [Keyword.fetch!(opts, :reference_id)]}
      end

    execute!(sql, params) > 0
  end
end
