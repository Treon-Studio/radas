defmodule RadasAI.RateLimit do
  @moduledoc """
  Port of `services/ai_router/rate_limit.py`.

  Sliding-window rate limiter per {org_id, provider}. In-process (GenServer +
  ETS): a single node serves a burst consistently and the limiter fails open
  across restarts rather than blocking legitimate traffic. Durable per-org
  quotas belong in PostgreSQL and are a later phase (see 9router-parity.md).
  """

  use GenServer

  @window_seconds 60.0
  @table :radas_ai_rate_limit

  defmodule Window do
    @moduledoc false
    defstruct [:times]
  end

  # -- Public API ------------------------------------------------------------

  @doc "Start the limiter. Called from the application supervision tree."
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Return {allowed, retry_after_seconds} for one request.

  `limit_per_min <= 0` means unlimited (always allowed), mirroring Python.
  """
  @spec allow(String.t(), String.t(), integer()) :: {boolean(), integer()}
  def allow(_org_id, _provider_name, limit_per_min) when limit_per_min <= 0, do: {true, 0}

  def allow(org_id, provider_name, limit_per_min) do
    key = {org_id, provider_name}
    now = System.os_time(:millisecond) / 1000.0

    GenServer.call(__MODULE__, {:allow, key, limit_per_min, now})
  end

  @doc "Clear all windows (tests)."
  def reset do
    GenServer.call(__MODULE__, :reset)
  end

  # -- Server ----------------------------------------------------------------

  @impl true
  def init(_opts) do
    table =
      case :ets.info(@table) do
        :undefined -> :ets.new(@table, [:named_table, :set, :public, read_concurrency: true])
        _ -> @table
      end

    {:ok, %{table: table}}
  end

  @impl true
  def handle_call({:allow, key, limit, now}, _from, state) do
    window = :ets.lookup(state.table, key)

    times =
      case window do
        [{_, %Window{times: times}}] -> Enum.reject(times, &(now - &1 >= @window_seconds))
        _ -> []
      end

    if length(times) >= limit do
      retry_after = max(1, trunc(@window_seconds - (now - hd(times))) + 1)
      {:reply, {false, retry_after}, state}
    else
      true = :ets.insert(state.table, {key, %Window{times: times ++ [now]}})
      {:reply, {true, 0}, state}
    end
  end

  @impl true
  def handle_call(:reset, _from, state) do
    :ets.delete_all_objects(state.table)
    {:reply, :ok, state}
  end
end
