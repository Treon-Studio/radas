defmodule RadasAI.DB do
  @moduledoc "Raw-SQL helpers over the shared PostgreSQL schema (pg.py port)."

  import Ecto.Adapters.SQL, only: [query!: 3]

  alias Radas.Repo

  @doc "Current epoch seconds as float (mirrors Python time.time())."
  @spec now() :: float()
  def now, do: System.os_time(:millisecond) / 1000.0

  @spec query_all!(String.t(), [term()]) :: [map()]
  def query_all!(sql, params \\ []) do
    query!(Repo, sql, params) |> rows_to_maps()
  end

  @spec query_one!(String.t(), [term()]) :: map() | nil
  def query_one!(sql, params \\ []) do
    case query_all!(sql, params) do
      [row | _] -> row
      [] -> nil
    end
  end

  @spec execute!(String.t(), [term()]) :: integer() | nil
  def execute!(sql, params \\ []) do
    query!(Repo, sql, params).num_rows
  end

  @doc "Convert a Postgrex result into string-keyed maps with decoded columns."
  @spec rows_to_maps( Postgrex.Result.t()) :: [map()]
  def rows_to_maps(%Postgrex.Result{columns: nil, rows: _}), do: []

  def rows_to_maps(%Postgrex.Result{columns: columns, rows: rows}) do
    Enum.map(rows, fn row ->
      columns |> Enum.zip(row) |> Map.new(fn {k, v} -> {k, decode(v)} end)
    end)
  end

  # JSONB columns arrive as pre-decoded maps/lists via Postgrex; JSON strings
  # stay strings for the Python-shaped callers that decode lazily.
  defp decode(value), do: value
end
