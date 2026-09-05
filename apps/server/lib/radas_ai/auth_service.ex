defmodule RadasAI.AuthService do
  @moduledoc """
  Port of `auth/service.py` + the auth half of `services/user_service.py`.

  Token minting/verification (Python-compatible HS256 via `RadasAI.AuthToken`),
  file-based token blacklist shared with Flask via DATA_DIR, user
  authentication (bcrypt), and role/org lookups for the login flow.
  """

  import RadasAI.DB

  alias RadasAI.AuthToken

  defp access_ttl_seconds, do: env_int(System.get_env("JWT_ACCESS_TOKEN_EXPIRE_MINUTES"), 1440) * 60
  defp refresh_ttl_days, do: env_int(System.get_env("JWT_REFRESH_TOKEN_EXPIRE_DAYS"), 7)

  defp env_int(nil, default), do: default

  defp env_int(value, default) when is_binary(value) do
    case Integer.parse(value) do
      {n, _} -> n
      :error -> default
    end
  end

  # ---------------------------------------------------------------------------
  # Token generation / verification
  # ---------------------------------------------------------------------------

  @doc "Sign one token with Python-identical claims."
  @spec generate_token(keyword()) :: String.t()
  def generate_token(opts) do
    user_id = Keyword.fetch!(opts, :user_id)
    username = Keyword.fetch!(opts, :username)
    roles = Keyword.get(opts, :roles, [])
    token_type = Keyword.get(opts, :token_type, "access")
    org_id = Keyword.get(opts, :org_id)
    extra_claims = Keyword.get(opts, :extra_claims) || %{}

    ttl_seconds =
      case token_type do
        "refresh" -> refresh_ttl_days() * 86_400
        _ -> access_ttl_seconds()
      end

    now = System.system_time(:second)

    claims =
      %{
        "user_id" => user_id,
        "username" => username,
        "roles" => roles,
        "token_type" => token_type,
        "exp" => now + ttl_seconds,
        "iat" => now,
        # Unique token id: guarantees minted tokens differ even when minted in
        # the same second (Python accepts extra claims via jwt.decode).
        "jti" => uuid()
      }
      |> then(&if(org_id in [nil, ""], do: &1, else: Map.put(&1, "org_id", org_id)))
      |> Map.merge(Map.new(extra_claims, fn {k, v} -> {to_string(k), v} end))

    AuthToken.encode(claims, secret!())
  end

  @doc """
  Verify signature, expiry, blacklist, token_type, and the session-revocation
  cutoff; returns claims or nil.
  """
  @spec verify_token(String.t(), String.t(), String.t()) :: map() | nil
  def verify_token(token, data_dir, token_type \\ "access") do
    if blacklisted?(data_dir, token) do
      nil
    else
      case AuthToken.verify(token, secret!(), token_type: token_type) do
        {:ok, claims} ->
          if are_user_sessions_revoked(claims["user_id"], claims["iat"], data_dir) do
            nil
          else
            claims
          end

        :error ->
          nil
      end
    end
  end

  # ---------------------------------------------------------------------------
  # Session revocation (auth/service.py port)
  #
  # The file-based cutoff is the authoritative revocation store: token
  # verification checks the token's `iat` against it. Writes are atomic
  # (tmp + rename) and FAIL CLOSED — persistence errors raise
  # SessionRevocationError so callers return 500 instead of claiming success.
  # ---------------------------------------------------------------------------

  defmodule SessionRevocationError do
    @moduledoc false
    defexception [:message]

    def exception(message) when is_binary(message), do: %__MODULE__{message: message}

    def exception(opts) when is_list(opts),
      do: %__MODULE__{message: Keyword.get(opts, :message, "session revocation failed")}
  end

  @doc "Revocation file: DATA_DIR/auth/session_revocations.json (same file as Python)."
  def session_revocations_path(data_dir), do: Path.join([data_dir, "auth", "session_revocations.json"])

  @doc "Load {user_id => cutoff_ts}; malformed files degrade to an empty map."
  @spec load_user_session_revocations(String.t()) :: map()
  def load_user_session_revocations(data_dir) do
    case File.read(session_revocations_path(data_dir)) do
      {:ok, binary} ->
        case Jason.decode(binary) do
          {:ok, map} when is_map(map) -> map
          _ -> %{}
        end

      _ ->
        %{}
    end
  end

  @doc "Persist {user_id => cutoff_ts} atomically; raises on failure (fail closed)."
  @spec save_user_session_revocations(String.t(), map()) :: :ok
  def save_user_session_revocations(data_dir, revocations) do
    path = session_revocations_path(data_dir)
    File.mkdir_p!(Path.dirname(path))
    tmp = path <> ".tmp"
    File.write!(tmp, Jason.encode!(revocations, pretty: true))
    File.rename!(tmp, path)
    :ok
  end

  @doc """
  Revoke all current sessions for a user by recording a cutoff timestamp.
  Returns the cutoff. Raises `SessionRevocationError` when the authoritative
  file write fails; the PostgreSQL `sessions.revoked_at` enrichment is
  best-effort and never fails the revocation.
  """
  @spec revoke_all_user_sessions(String.t(), String.t()) :: integer()
  def revoke_all_user_sessions(user_id, data_dir) do
    cutoff = System.system_time(:second)

    :global.set_lock({__MODULE__, user_id})

    try do
      revocations = load_user_session_revocations(data_dir) |> Map.put(user_id, cutoff)
      save_user_session_revocations(data_dir, revocations)
      cutoff
    rescue
      e in SessionRevocationError ->
        :global.del_lock({__MODULE__, user_id})
        reraise e, __STACKTRACE__

      e ->
        :global.del_lock({__MODULE__, user_id})
        raise SessionRevocationError,
          message: "Failed to persist session revocation cutoff for user #{user_id}"
    end
  end

  @doc """
  Whether a token's `iat` is at or before the user's revocation cutoff
  (tokens issued before the revocation are invalid). Unparseable `iat`
  returns false, mirroring Python.
  """
  @spec are_user_sessions_revoked(String.t() | nil, term(), String.t()) :: boolean()
  def are_user_sessions_revoked(user_id, iat, data_dir)

  def are_user_sessions_revoked(user_id, iat, data_dir) when is_binary(user_id) and user_id != "" do
    case Map.get(load_user_session_revocations(data_dir), user_id) do
      nil ->
        false

      cutoff ->
        case to_ts(iat) do
          nil -> false
          iat_ts -> trunc(iat_ts) <= trunc(cutoff)
        end
    end
  end

  def are_user_sessions_revoked(_user_id, _iat, _data_dir), do: false

  defp to_ts(iat) when is_integer(iat), do: iat * 1.0
  defp to_ts(iat) when is_float(iat), do: iat

  defp to_ts(iat) when is_binary(iat) do
    case Float.parse(iat) do
      {f, _} -> f
      :error -> nil
    end
  end

  defp to_ts(_), do: nil

  defp secret! do
    case System.get_env("JWT_SECRET_KEY") do
      nil -> raise ArgumentError, message: "JWT_SECRET_KEY is not set"
      "" -> raise ArgumentError, message: "JWT_SECRET_KEY is not set"
      secret -> secret
    end
  end

  # ---------------------------------------------------------------------------
  # Token blacklist (file-based, shared with Flask through DATA_DIR)
  # ---------------------------------------------------------------------------

  @doc "Blacklist file: DATA_DIR/auth/token_blacklist.json (same file as Python)."
  def blacklist_path(data_dir), do: Path.join([data_dir, "auth", "token_blacklist.json"])

  @spec add_to_blacklist(String.t(), String.t()) :: :ok
  def add_to_blacklist(data_dir, token) do
    path = blacklist_path(data_dir)
    File.mkdir_p!(Path.dirname(path))
    blacklist = load_blacklist(path)

    exp =
      case AuthToken.verify(token, secret!()) do
        {:ok, %{"exp" => exp}} when is_number(exp) -> exp * 1.0
        _ -> now() + refresh_ttl_days() * 86_400
      end

    blacklist = Map.put(blacklist, token, exp) |> prune(now())
    File.write!(path, Jason.encode!(blacklist))
    :ok
  end

  @spec blacklisted?(String.t(), String.t()) :: boolean()
  def blacklisted?(data_dir, token) do
    blacklist = load_blacklist(blacklist_path(data_dir))

    case Map.get(blacklist, token) do
      nil -> false
      exp -> now() <= exp
    end
  end

  defp load_blacklist(path) do
    case File.read(path) do
      {:ok, binary} ->
        case Jason.decode(binary) do
          {:ok, map} when is_map(map) -> map
          _ -> %{}
        end

      _ ->
        %{}
    end
  end

  defp prune(blacklist, ts), do: Map.filter(blacklist, fn {_token, exp} -> ts <= exp end)

  # ---------------------------------------------------------------------------
  # Users / roles / orgs
  # ---------------------------------------------------------------------------

  @doc "Authenticate a user; returns the user row or nil (audit trail lands with Phase 2 full port)."
  @spec authenticate(String.t(), String.t()) :: map() | nil
  def authenticate(username, password) do
    user =
      query_one!(
        "SELECT id, username, email, password_hash, is_active FROM users WHERE username = $1",
        [username]
      )

    cond do
      user == nil -> nil
      # SQLite-compat schema stores is_active as INTEGER 0/1.
      user["is_active"] in [0, false, nil] -> nil
      not verify_password(password, user["password_hash"] || "") -> nil
      true ->
        # users.* timestamps are sqlite-compat TEXT columns; Python writes
        # `datetime.utcnow().isoformat()` strings — mirror that exactly.
        execute!("UPDATE users SET last_login = $1 WHERE id = $2",
          [DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601(), user["id"]])

        user
    end
  end

  @doc "bcrypt verify — compatible with Python bcrypt `$2b$` hashes."
  def verify_password(password, hash) do
    Bcrypt.verify_pass(password, hash)
  rescue
    # Python bcrypt raises on malformed hashes; treat as a failed login.
    _ -> false
  end

  @doc "Hash a password the way Python does (bcrypt, $2b$)."
  def hash_password(password), do: Bcrypt.hash_pwd_salt(password)

  @doc "Role NAMES for one user (user_roles ⋈ roles)."
  @spec role_names_for(String.t()) :: [String.t()]
  def role_names_for(user_id) do
    query_all!(
      "SELECT roles.name FROM user_roles JOIN roles ON roles.id = user_roles.role_id WHERE user_roles.user_id = $1",
      [user_id]
    )
    |> Enum.map(& &1["name"])
  end

  @doc "Org summaries for one user (mirrors org_service.list_orgs_for_user)."
  @spec orgs_for_user(String.t()) :: [map()]
  def orgs_for_user(user_id) do
    query_all!(
      "SELECT o.id, o.name, om.role FROM orgs o JOIN org_members om ON om.org_id = o.id WHERE om.user_id = $1 ORDER BY o.created_at ASC",
      [user_id]
    )
  end

  defp uuid do
    Ecto.UUID.generate()
  end
end
