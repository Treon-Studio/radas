defmodule RadasAI.KV do
  @moduledoc """
  Port of `storage/kv.py` — JSON-config store over the shared
  `kv_store(scope, key, value jsonb)` table.
  """

  import RadasAI.DB

  @spec get(String.t(), String.t()) :: term() | nil
  def get(scope, key \\ "default") do
    case query_one!("SELECT value FROM kv_store WHERE scope = $1 AND key = $2", [scope, key]) do
      nil -> nil
      row -> row["value"]
    end
  end

  @spec set(String.t(), String.t(), term(), float() | nil) :: :ok
  def set(scope, key, value, updated_at \\ nil) do
    execute!(
      """
      INSERT INTO kv_store (scope, key, value, updated_at) VALUES ($1, $2, $3, $4)
      ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
      """,
      [scope, key, value, updated_at || now()]
    )

    :ok
  end

  @spec delete(String.t(), String.t()) :: boolean()
  def delete(scope, key \\ "default") do
    execute!("DELETE FROM kv_store WHERE scope = $1 AND key = $2", [scope, key]) > 0
  end

  @doc "All rows for a scope as [{\"key\" => k, \"value\" => v}], ordered by key."
  @spec list(String.t()) :: [map()]
  def list(scope) do
    query_all!("SELECT key, value FROM kv_store WHERE scope = $1 ORDER BY key", [scope])
  end

  @doc """
  Load a whole scope: returns a list if it was saved as a list under key
  "default", else a map keyed by entry key (mirrors Python kv_load).
  """
  @spec load(String.t()) :: [term()] | map()
  def load(scope) do
    case list(scope) do
      [] ->
        []

      [%{"key" => "default", "value" => value} = _only] when is_list(value) ->
        value

      rows ->
        Map.new(rows, fn row -> {row["key"], row["value"]} end)
    end
  end

  @doc "Save a whole scope under key \"default\"."
  @spec save(String.t(), term()) :: :ok
  def save(scope, value), do: set(scope, "default", value)
end
