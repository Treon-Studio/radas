defmodule RadasAI.Metrics do
  @moduledoc """
  Port of `storage/metrics_counters.py` — durable counters (kv-backed) that
  survive restarts and render as Prometheus series via services/metrics.py.
  """

  alias RadasAI.KV

  @scope "metrics_counters"

  @doc "Increment a named counter by n and return the new value."
  @spec incr(String.t(), integer()) :: integer()
  def incr(name, n \\ 1) when n >= 0 do
    current = KV.get(@scope, name)
    value = if is_number(current), do: trunc(current) + n, else: n
    KV.set(@scope, name, value)
    value
  end

  @doc "Read one counter."
  @spec get(String.t()) :: integer()
  def get(name) do
    current = KV.get(@scope, name)
    if is_number(current), do: trunc(current), else: 0
  end

  @doc "All counters as a plain map."
  @spec snapshot() :: %{String.t() => integer()}
  def snapshot do
    KV.list(@scope)
    |> Enum.reduce(%{}, fn row, acc ->
      case row["value"] do
        v when is_number(v) -> Map.put(acc, row["key"], trunc(v))
        _ -> acc
      end
    end)
  end
end
