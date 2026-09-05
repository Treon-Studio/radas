defmodule RadasAI.ProjectLock do
  @moduledoc """
  Port of `services/project_lock.py` — project-level advisory lock
  (UC373) preventing concurrent mutating operations across stacks.
  Postgres advisory lock + `project_locks` lease table, 1h expiry.
  """

  import RadasAI.DB

  alias Radas.Repo

  @lock_prefix "radas.project_lock:"

  defp lock_key(project_id), do: @lock_prefix <> (project_id || "default")

  @doc "Acquire the project lease: %{\"ok\" => bool, \"lock\" => lease} (Python acquire)."
  @spec acquire(String.t(), keyword()) :: map()
  def acquire(project_id, opts \\ []) do
    actor = Keyword.get(opts, :actor, "")
    operation = Keyword.get(opts, :operation, "")
    run_id = Keyword.get(opts, :run_id)
    now = now()
    lease_id = Ecto.UUID.generate()

    {:ok, result} =
      Repo.transaction(fn ->
        Repo.query!("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [lock_key(project_id)])

        existing =
          query_one!(
            "SELECT * FROM project_locks WHERE project_id = $1 AND expires_at > $2 FOR UPDATE",
            [project_id, now]
          )

        if existing do
          %{"ok" => false, "lock" => existing}
        else
          expires_at = now + 3600

          execute!(
            """
            INSERT INTO project_locks (id, project_id, actor, operation, run_id, acquired_at, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            """,
            [lease_id, project_id, actor, operation, run_id, now, expires_at]
          )

          %{
            "ok" => true,
            "lock" => %{
              "id" => lease_id,
              "project_id" => project_id,
              "actor" => actor,
              "operation" => operation,
              "run_id" => run_id,
              "acquired_at" => now,
              "expires_at" => expires_at
            }
          }
        end
      end)

    result
  end

  @doc "Release the project lease (Python release): %{\"ok\", \"released\"?, \"error\"?}."
  @spec release(String.t(), keyword()) :: map()
  def release(project_id, opts \\ []) do
    lock_id = Keyword.get(opts, :lock_id)
    force = Keyword.get(opts, :force, false)

    {:ok, result} =
      Repo.transaction(fn ->
        Repo.query!("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [lock_key(project_id)])

        {sql, params} =
          if lock_id do
            {"DELETE FROM project_locks WHERE project_id = $1 AND id = $2 RETURNING *", [project_id, lock_id]}
          else
            {"DELETE FROM project_locks WHERE project_id = $1 RETURNING *", [project_id]}
          end

        rows = query_all!(sql, params)

        if rows == [] and not force do
          %{"ok" => false, "error" => "No active lock found"}
        else
          %{"ok" => true, "released" => rows != [], "previous" => List.first(rows)}
        end
      end)

    result
  end

  @doc "Active lock for a project, if any (Python get_lock)."
  @spec get_lock(String.t()) :: map() | nil
  def get_lock(project_id) do
    query_one!("SELECT * FROM project_locks WHERE project_id = $1 AND expires_at > $2", [
      project_id,
      now()
    ])
  end

  @doc "Remove expired leases; returns the number of rows removed."
  @spec cleanup_expired() :: integer()
  def cleanup_expired do
    execute!("DELETE FROM project_locks WHERE expires_at <= $1", [now()]) || 0
  end
end
