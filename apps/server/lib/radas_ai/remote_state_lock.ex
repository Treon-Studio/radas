defmodule RadasAI.RemoteStateLock do
  @moduledoc """
  Port of `services/remote_state_lock.py` (UC331) — advisory lock for
  stacks on remote backends, keyed (stack, backend_type, backend_key),
  stored in the `remote_state_locks` table with 1h expiry.
  """

  import RadasAI.DB

  alias Radas.Repo

  @lock_prefix "radas.remote_state_lock:"

  defp lock_key(stack, backend_type, backend_key),
    do: "#{@lock_prefix}#{stack}:#{backend_type}:#{backend_key}"

  @doc "Acquire the remote-state lease: %{\"ok\" => bool, \"lock\" => lease}."
  @spec acquire(String.t(), String.t(), String.t(), keyword()) :: map()
  def acquire(stack, backend_type, backend_key, opts \\ []) do
    actor = Keyword.get(opts, :actor, "")
    operation = Keyword.get(opts, :operation, "")
    run_id = Keyword.get(opts, :run_id)
    now = now()
    lease_id = Ecto.UUID.generate()

    {:ok, result} =
      Repo.transaction(fn ->
        Repo.query!("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
          lock_key(stack, backend_type, backend_key)
        ])

        existing =
          query_one!(
            """
            SELECT * FROM remote_state_locks
            WHERE stack = $1 AND backend_type = $2 AND backend_key = $3 AND expires_at > $4
            FOR UPDATE
            """,
            [stack, backend_type, backend_key, now]
          )

        if existing do
          %{"ok" => false, "lock" => existing}
        else
          expires_at = now + 3600

          execute!(
            """
            INSERT INTO remote_state_locks
              (id, stack, backend_type, backend_key, actor, operation, run_id, acquired_at, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            """,
            [lease_id, stack, backend_type, backend_key, actor, operation, run_id, now, expires_at]
          )

          %{
            "ok" => true,
            "lock" => %{
              "id" => lease_id,
              "stack" => stack,
              "backend_type" => backend_type,
              "backend_key" => backend_key,
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

  @doc "Release the remote-state lease: %{\"ok\", \"released\"?, \"error\"?}."
  @spec release(String.t(), String.t(), String.t(), keyword()) :: map()
  def release(stack, backend_type, backend_key, opts \\ []) do
    lock_id = Keyword.get(opts, :lock_id)
    force = Keyword.get(opts, :force, false)

    {:ok, result} =
      Repo.transaction(fn ->
        Repo.query!("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
          lock_key(stack, backend_type, backend_key)
        ])

        {sql, params} =
          if lock_id do
            {
              """
              DELETE FROM remote_state_locks
              WHERE stack = $1 AND backend_type = $2 AND backend_key = $3 AND id = $4 RETURNING *
              """,
              [stack, backend_type, backend_key, lock_id]
            }
          else
            {
              "DELETE FROM remote_state_locks WHERE stack = $1 AND backend_type = $2 AND backend_key = $3 RETURNING *",
              [stack, backend_type, backend_key]
            }
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

  @doc "Active lock for a backend identity, if any (Python get_lock)."
  @spec get_lock(String.t(), String.t(), String.t()) :: map() | nil
  def get_lock(stack, backend_type, backend_key) do
    query_one!(
      """
      SELECT * FROM remote_state_locks
      WHERE stack = $1 AND backend_type = $2 AND backend_key = $3 AND expires_at > $4
      """,
      [stack, backend_type, backend_key, now()]
    )
  end

  @doc "Remove expired leases; returns the number of rows removed."
  @spec cleanup_expired() :: integer()
  def cleanup_expired do
    execute!("DELETE FROM remote_state_locks WHERE expires_at <= $1", [now()]) || 0
  end
end
