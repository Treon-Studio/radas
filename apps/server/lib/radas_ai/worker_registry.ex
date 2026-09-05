defmodule RadasAI.WorkerRegistry do
  @moduledoc """
  Port of `services/worker_registry.py` — worker registration and token
  verification.

  Storage is shared with Flask so worker tokens minted by either runtime are
  verifiable by both:

  - worker profile JSON: `DATA_DIR/workers/<worker_id>.json`
  - token index: PostgreSQL `worker_tokens (token_hash, worker_id, salt)`,
    hash = `sha256(token <> salt)` hex (identical to Python `_hash_token`)
  """

  import RadasAI.DB

  @token_cache_ttl_ms 5_000
  @token_cache :radas_worker_token_cache

  defp data_dir, do: System.get_env("DATA_DIR") || Path.join(File.cwd!(), "data")
  defp workers_dir, do: Path.join(data_dir(), "workers")

  @doc "sha256(token <> salt) hex — identical to Python _hash_token."
  def hash_token(token, salt), do: Base.encode16(:crypto.hash(:sha256, token <> salt), case: :lower)

  defp generate_token, do: :crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false)
  defp generate_salt, do: :crypto.strong_rand_bytes(16) |> Base.url_encode64(padding: false)

  # ---------------------------------------------------------------------------
  # Worker profile persistence
  # ---------------------------------------------------------------------------

  @doc "Load one worker profile; tolerates zero-byte/transient files."
  @spec load_worker(String.t()) :: map() | nil
  def load_worker(worker_id) do
    file = Path.join(workers_dir(), worker_id <> ".json")

    case File.stat(file) do
      {:ok, %{size: 0}} ->
        nil

      {:ok, _} ->
        case File.read(file) do
          {:ok, binary} ->
            case String.trim(binary) do
              "" -> nil
              content ->
                case Jason.decode(content) do
                  {:ok, worker} -> worker
                  _ -> nil
                end
            end

          _ ->
            nil
        end

      _ ->
        nil
    end
  end

  @doc "Persist one worker profile; returns whether the write succeeded."
  @spec save_worker(map()) :: boolean()
  def save_worker(worker_data) do
    case worker_data["id"] do
      id when id in [nil, ""] ->
        false

      id ->
        file = Path.join(workers_dir(), id <> ".json")
        File.mkdir_p!(Path.dirname(file))
        File.write(file, Jason.encode!(worker_data, pretty: true)) == :ok
    end
  end

  @spec load_all_workers() :: map()
  def load_all_workers do
    case File.ls(workers_dir()) do
      {:ok, files} ->
        Enum.reduce(files, %{}, fn f, acc ->
          if String.ends_with?(f, ".json") do
            worker_id = String.trim_trailing(f, ".json")

            case load_worker(worker_id) do
              %{} = worker -> Map.put(acc, worker_id, worker)
              nil -> acc
            end
          else
            acc
          end
        end)

      _ ->
        %{}
    end
  end

  # ---------------------------------------------------------------------------
  # Registration & verification
  # ---------------------------------------------------------------------------

  @doc "Create a worker; returns {worker_id, plaintext_token} (token shown once)."
  @spec create_worker(String.t(), map() | nil, [String.t()] | nil) :: {String.t(), String.t()}
  def create_worker(name, capabilities \\ %{}, tags \\ []) do
    worker_id = Ecto.UUID.generate()
    plaintext_token = generate_token()
    salt = generate_salt()
    token_hash = hash_token(plaintext_token, salt)

    worker_data = %{
      "id" => worker_id,
      "name" => name,
      "tokenHash" => token_hash,
      "tokenSalt" => salt,
      "capabilities" => capabilities || %{},
      "tags" => tags || [],
      "enabled" => true,
      "createdAt" => RadasAI.DB.now(),
      "lastSeenAt" => nil,
      "currentExecutionId" => nil
    }

    if save_worker(worker_data) do
      upsert_worker_token(worker_id, token_hash, salt)
      {worker_id, plaintext_token}
    else
      raise RuntimeError, message: "Failed to save worker"
    end
  end

  @doc """
  Verify a worker token; returns {worker_id, worker_data} or nil.
  Uses the Postgres token index (indexed on token_hash) with a small ETS cache
  for the heartbeat storm, mirroring the Python cache.
  """
  @spec verify_token(String.t()) :: {String.t(), map()} | nil
  def verify_token(token) when token in [nil, ""], do: nil

  def verify_token(token) do
    ensure_cache_table()
    now_ms = System.system_time(:millisecond)

    case :ets.lookup(@token_cache, token) do
      [{_, {worker_id, expires_at}}] when expires_at > now_ms ->
        case load_worker(worker_id) do
          %{} = worker -> {worker_id, worker}
          nil ->
            cache_delete(token)
            nil
        end

      _ ->
        verify_via_index(token)
    end
  end

  defp verify_via_index(token) do
    # Python verifies by iterating index rows and recomputing
    # sha256(token <> salt) per row (the indexed token_hash already embeds
    # its own salt, so there is no salt-free lookup key).
    rows = query_all!("SELECT worker_id, salt, token_hash FROM worker_tokens", [])

    found =
      Enum.find_value(rows, fn row ->
        if hash_token(token, row["salt"]) == row["token_hash"] do
          {row["worker_id"], row["salt"]}
        end
      end)

    case found do
      {worker_id, _salt} ->
        cache_put(token, worker_id)

        case load_worker(worker_id) do
          %{} = worker -> {worker_id, worker}
          nil -> nil
        end

      nil ->
        nil
    end
  end

  @doc "Record a heartbeat; returns the updated worker or nil."
  @spec heartbeat(String.t()) :: map() | nil
  def heartbeat(worker_id) do
    case load_worker(worker_id) do
      nil ->
        nil

      worker ->
        worker = Map.put(worker, "lastSeenAt", RadasAI.DB.now())
        save_worker(worker)
        worker
    end
  end

  @doc "Flag the worker to report system info on its next heartbeat."
  def request_system_info(worker_id) do
    case load_worker(worker_id) do
      nil -> nil
      worker ->
        worker = Map.put(worker, "systemInfoRequested", true)
        save_worker(worker)
        worker
    end
  end

  @doc "Rotate a worker's registration token; returns the plaintext once."
  @spec rotate_worker_token(String.t()) :: String.t() | nil
  def rotate_worker_token(worker_id) do
    case load_worker(worker_id) do
      nil ->
        nil

      worker ->
        plaintext_token = generate_token()
        salt = generate_salt()

        worker =
          worker
          |> Map.put("tokenHash", hash_token(plaintext_token, salt))
          |> Map.put("tokenSalt", salt)
          |> Map.put("lastTokenRotatedAt", RadasAI.DB.now())

        if save_worker(worker) do
          upsert_worker_token(worker_id, worker["tokenHash"], salt)
          plaintext_token
        else
          nil
        end
    end
  end

  @doc "Enable/disable a worker; false when absent."
  @spec set_worker_enabled(String.t(), boolean()) :: boolean()
  def set_worker_enabled(worker_id, enabled) do
    case load_worker(worker_id) do
      nil -> false
      worker -> save_worker(Map.put(worker, "enabled", enabled))
    end
  end

  @doc "Delete a worker record; false when absent."
  @spec delete_worker(String.t()) :: boolean()
  def delete_worker(worker_id) do
    file = Path.join(workers_dir(), worker_id <> ".json")

    if File.exists?(file) do
      File.rm(file)
      true
    else
      false
    end
  end

  @doc "Whether a worker heartbeat is within `ttl_seconds` (Python is_worker_online)."
  @spec is_worker_online(String.t(), number()) :: boolean()
  def is_worker_online(worker_id, ttl_seconds \\ 60) do
    worker = load_worker(worker_id)

    cond do
      worker == nil or Map.get(worker, "enabled", true) != true ->
        false

      true ->
        last_seen = worker["lastSeenAt"]

        cond do
          last_seen in [nil, ""] -> false
          is_number(last_seen) -> RadasAI.DB.now() - last_seen <= ttl_seconds
          true -> false
        end
    end
  end

  # ---------------------------------------------------------------------------
  # Internals
  # ---------------------------------------------------------------------------

  defp upsert_worker_token(worker_id, token_hash, salt) do
    execute!("DELETE FROM worker_tokens WHERE worker_id = $1", [worker_id])

    execute!(
      "INSERT INTO worker_tokens (token_hash, worker_id, salt) VALUES ($1, $2, $3) ON CONFLICT (token_hash) DO NOTHING",
      [token_hash, worker_id, salt]
    )

    :ok
  rescue
    _ -> :ok
  end

  defp ensure_cache_table do
    case :ets.info(@token_cache) do
      :undefined -> :ets.new(@token_cache, [:named_table, :set, :public])
      _ -> @token_cache
    end
  end

  defp cache_put(token, worker_id) do
    ensure_cache_table()
    true = :ets.insert(@token_cache, {token, {worker_id, System.system_time(:millisecond) + @token_cache_ttl_ms}})
    :ok
  rescue
    _ -> :ok
  end

  defp cache_delete(token) do
    ensure_cache_table()
    :ets.delete(@token_cache, token)
    :ok
  rescue
    _ -> :ok
  end
end
