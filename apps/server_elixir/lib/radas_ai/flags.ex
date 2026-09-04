defmodule RadasAI.Flags do
  @moduledoc """
  Port of `services/feature_flags.py` (legacy engine) + the core of
  `services/feature_flag_registry.py` — flag store with scope hierarchy
  (project → organization → global), audit trail, expiry, export/import,
  and the deterministic percentage-rollout evaluation.

  Storage mirrors Python kv scopes exactly:
  - registry: `flags:<scope_type>:<scope_id>` (global default
    `flags:global:default`)
  - legacy global store: `flags` (merged on global reads; registry wins)
  - audit: `flag_audit:<scope_type>:<scope_id>`
  """

  import RadasAI.DB

  alias RadasAI.KV

  @default_envs ["dev", "staging", "prod", "preview"]
  @default_flags ["block_apply", "block_destroy", "preview", "auto_scale"]

  def default_envs, do: @default_envs

  defp scope("global", _id), do: "flags:global:default"
  defp scope("organization", org_id), do: "flags:organization:#{org_id}"
  defp scope("project", project_id), do: "flags:project:#{project_id}"
  defp scope(type, id), do: "flags:#{type}:#{id || "default"}"

  # ---------------------------------------------------------------------------
  # Store access
  # ---------------------------------------------------------------------------

  defp load_registry(scope_type, scope_id) do
    case KV.load(scope(scope_type, scope_id)) do
      list when is_list(list) -> list
      _ -> []
    end
  end

  defp save_registry(flags, scope_type, scope_id), do: KV.save(scope(scope_type, scope_id), flags)

  @doc "Load a visible scope; global reads merge the legacy `flags` store with registry precedence."
  @spec load(String.t(), String.t() | nil) :: [map()]
  def load("global", nil) do
    legacy = load_legacy() |> Map.new(&{&1["key"], &1})

    merged =
      Enum.reduce(load_registry("global", nil), legacy, fn flag, acc ->
        key = to_string(flag["key"] || "")

        if flag["_deleted"] == true do
          Map.delete(acc, key)
        else
          Map.put(acc, key, flag)
        end
      end)

    Map.values(merged)
  end

  def load(scope_type, scope_id), do: load_registry(scope_type, scope_id)

  defp load_legacy do
    case KV.load("flags") do
      list when is_list(list) -> Enum.filter(list, &is_map/1)
      _ -> []
    end
  end

  defp save_legacy(items), do: KV.save("flags", items)

  # ---------------------------------------------------------------------------
  # Flag CRUD
  # ---------------------------------------------------------------------------

  @doc "Get one flag visible in a scope (registry precedence over legacy global)."
  @spec get_flag(String.t(), keyword()) :: map() | nil
  def get_flag(key, opts \\ []) do
    scope_type = Keyword.get(opts, :scope_type, "global")
    scope_id = Keyword.get(opts, :scope_id)
    Enum.find(load(scope_type, scope_id), &(&1["key"] == key))
  end

  @doc "Create a flag in the given scope."
  @spec create_flag(map(), keyword()) :: {:ok, map()} | {:error, String.t()}
  def create_flag(data, opts \\ []) do
    scope_type = Keyword.get(opts, :scope_type, "global")
    scope_id = Keyword.get(opts, :scope_id)
    key = to_string(data["key"] || "") |> String.trim() |> String.downcase() |> String.replace(" ", "-")

    cond do
      String.length(key) < 2 ->
        {:error, "Flag key must be at least 2 chars"}

      get_flag(key, scope_type: scope_type, scope_id: scope_id) != nil ->
        {:error, "Flag '#{key}' already exists"}

      true ->
        now = System.system_time(:second)
        envs = data["environments"] || %{}

        flag = %{
          "id" => Ecto.UUID.generate(),
          "key" => key,
          "name" => String.trim(to_string(data["name"] || key)),
          "description" => String.trim(to_string(data["description"] || "")),
          "enabled" => truthy(Map.get(data, "enabled", true)),
          "environments" => Map.new(@default_envs, fn e -> {e, truthy(Map.get(envs, e, true))} end),
          "rollout_percent" => clamp_rollout(data["rollout_percent"], 100),
          "users_whitelist" => str_list(data["users_whitelist"]),
          "users_blacklist" => str_list(data["users_blacklist"]),
          "tags" => str_list(data["tags"]),
          "kill_switch" => truthy(data["kill_switch"]),
          "parent_key" => data["parent_key"],
          "created_at" => now,
          "updated_at" => now
        }

        flag =
          for field <- ["ttl_seconds", "scheduled_expire_at"], data[field] != nil, into: flag do
            {field, parse_int(data[field], 0)}
          end

        items = load_registry(scope_type, scope_id) ++ [flag]
        save_registry(items, scope_type, scope_id)
        append_history(%{"operation" => "create", "key" => key, "actor" => Keyword.get(opts, :actor, "system"), "changes" => %{"enabled" => flag["enabled"]}}, scope_type, scope_id)
        {:ok, flag}
    end
  end

  @doc "Patch a flag; records changes in the audit trail."
  @spec update_flag(String.t(), map(), keyword()) :: {:ok, map()} | nil
  def update_flag(key, patch, opts \\ []) do
    scope_type = Keyword.get(opts, :scope_type, "global")
    scope_id = Keyword.get(opts, :scope_id)
    items = load_registry(scope_type, scope_id)

    index = Enum.find_index(items, &(&1["key"] == key))

    if index == nil do
      nil
    else
      flag = Enum.at(items, index)
      patch = Map.new(patch || %{})

      flag =
        flag
        |> apply_str_fields(patch, ["name", "description", "tags"])
        |> apply_bool_fields(patch, ["enabled", "kill_switch"])
        |> apply_rollout(patch)
        |> apply_environments(patch)
        |> apply_str_lists(patch, ["users_whitelist", "users_blacklist"])
        |> Map.put("updated_at", System.system_time(:second))

      items = List.replace_at(items, index, flag)
      save_registry(items, scope_type, scope_id)

      changes = Map.take(patch, ["enabled", "kill_switch", "rollout_percent", "environments"])
      append_history(%{"operation" => "change", "key" => key, "actor" => Keyword.get(opts, :actor, "system"), "changes" => changes}, scope_type, scope_id)

      {:ok, flag}
    end
  end

  @doc "Delete (tombstone in global registry) a flag."
  @spec delete_flag(String.t(), keyword()) :: boolean()
  def delete_flag(key, opts \\ []) do
    scope_type = Keyword.get(opts, :scope_type, "global")
    scope_id = Keyword.get(opts, :scope_id)

    if scope_type == "global" do
      items = load_registry("global", nil)

      if Enum.any?(items, &(&1["key"] == key)) do
        items =
          Enum.map(items, fn flag ->
            if flag["key"] == key, do: Map.merge(flag, %{"_deleted" => true}), else: flag
          end)

        save_registry(items, "global", nil)
        true
      else
        # Legacy store: delete directly.
        legacy = load_legacy()

        next = Enum.reject(legacy, &(&1["key"] == key))

        if length(next) < length(legacy) do
          save_legacy(next)
          true
        else
          false
        end
      end
    else
      items = load_registry(scope_type, scope_id)
      next = Enum.reject(items, &(&1["key"] == key))

      if length(next) < length(items) do
        save_registry(next, scope_type, scope_id)
        true
      else
        false
      end
    end
  end

  @doc "Disable flags whose scheduled/TTL expiry passed; returns count disabled."
  @spec expire_due_flags(integer() | nil) :: integer()
  def expire_due_flags(now_ts \\ nil) do
    now_ts = now_ts || System.system_time(:second)

    items = load("global", nil)

    {changed_items, changed} =
      Enum.map_reduce(items, 0, fn flag, acc ->
        if truthy(flag["enabled"]) do
          ttl = if is_integer(flag["ttl_seconds"]), do: flag["ttl_seconds"], else: 0
          expire_at = flag["scheduled_expire_at"] || (if ttl > 0, do: (flag["created_at"] || 0) + ttl)

          if expire_at && now_ts >= expire_at do
            flag = Map.put(flag, "enabled", false) |> Map.put("expired_at", now_ts)
            {flag, acc + 1}
          else
            {flag, acc}
          end
        else
          {flag, acc}
        end
      end)

    if changed > 0 do
      save_registry(changed_items, "global", nil)
    end

    changed
  end

  @doc "Export flags as a plain list."
  @spec export_flags() :: [map()]
  def export_flags, do: load("global", nil)

  @doc "Import flags (create or update); returns count."
  @spec import_flags([map()], keyword()) :: {:ok, integer()} | {:error, String.t()}
  def import_flags(items, opts \\ []) do
    unless is_list(items), do: throw({:error, "flags must be a list"})

    Enum.each(items, fn item ->
      unless is_map(item) and item["key"] not in [nil, ""], do: throw({:error, "each flag must have a key"})
    end)

    Enum.each(items, fn item ->
      key = to_string(item["key"])

      if get_flag(key, opts) do
        update_flag(key, item, opts)
      else
        create_flag(item, opts)
      end
    end)

    {:ok, length(items)}
  catch
    {:error, msg} -> {:error, msg}
  end

  # ---------------------------------------------------------------------------
  # Evaluation
  # ---------------------------------------------------------------------------

  @doc """
  Deterministic 0..999 bucket for percentage rollout — same sha256 digest as
  Python `_bucket`.
  """
  @spec bucket(String.t(), String.t()) :: integer()
  def bucket(key, entity) do
    digest = :crypto.hash(:sha256, "#{key}:#{entity}") |> Base.encode16(case: :lower)
    String.slice(digest, 0, 6) |> String.to_integer(16) |> rem(1000)
  end

  @doc "Evaluate a flag for (env, user): {key, enabled, reason}."
  @spec evaluate(String.t(), keyword()) :: map()
  def evaluate(key, opts \\ []) do
    env = Keyword.get(opts, :env, "prod")
    user = Keyword.get(opts, :user, "")
    scope_type = Keyword.get(opts, :scope_type, "global")
    scope_id = Keyword.get(opts, :scope_id)

    flag = get_flag(key, scope_type: scope_type, scope_id: scope_id)

    cond do
      flag == nil ->
        result(key, false, "unknown_flag")

      truthy(flag["kill_switch"]) ->
        result(key, false, "kill_switch")

      not truthy(flag["enabled"]) ->
        result(key, false, "globally_disabled")

      true ->
        env_map = flag["environments"] || %{}
        env_disabled = is_map(env_map) and Map.get(env_map, env) == false

        if env_disabled do
          result(key, false, "disabled_in_#{env}")
        else
          evaluate_user(key, flag, env, user)
        end
    end
  end

  @doc """
  Evaluate a flag across the scope hierarchy with Python registry override
  precedence: project → organization → global (first existing definition
  wins). Returns {enabled, reason} like evaluate/2.
  """
  @spec evaluate_scoped(String.t(), keyword()) :: map()
  def evaluate_scoped(key, opts \\ []) do
    scopes =
      [
        {"project", Keyword.get(opts, :project_id)},
        {"organization", Keyword.get(opts, :org_id)},
        {"global", nil}
      ]
      |> Enum.reject(fn {_type, id} -> id in [nil, ""] end)

    scopes
    |> Enum.find_value(result(key, false, "unknown_flag"), fn {type, id} ->
      if get_flag(key, scope_type: type, scope_id: id) do
        evaluate(key, env: Keyword.get(opts, :env, "prod"), user: Keyword.get(opts, :user, ""), scope_type: type, scope_id: id)
      else
        nil
      end
    end)
  end

  defp evaluate_user(key, flag, env, user) do
    blacklist = flag["users_blacklist"] || []
    whitelist = flag["users_whitelist"] || []

    cond do
      user != "" and user in blacklist ->
        result(key, false, "blacklisted")

      user != "" and user in whitelist ->
        result(key, true, "whitelisted")

      true ->
        percent = clamp_rollout(flag["rollout_percent"], 100)

        cond do
          percent >= 100 ->
            result(key, true, "full_rollout")

          percent <= 0 ->
            result(key, false, "zero_rollout")

          true ->
            entity = if user == "", do: env, else: user

            if bucket(key, entity) < percent * 10 do
              result(key, true, "rollout")
            else
              result(key, false, "rollout")
            end
        end
    end
  end

  @doc "Fail-closed evaluation (safe_evaluate port)."
  @spec safe_evaluate(String.t(), keyword()) :: map()
  def safe_evaluate(key, opts \\ []) do
    evaluate(key, opts)
  rescue
    e ->
      result(key, false, "evaluation_error")
      |> Map.merge(%{"source" => "safe-default", "error" => String.slice(Exception.message(e) || "", 0, 200)})
  end

  @doc "Enforcement: error message when the flag blocks an operation, else nil."
  @spec enforcement(String.t(), String.t(), String.t()) :: String.t() | nil
  def enforcement(flag_key, env, user \\ "") do
    res = safe_evaluate(flag_key, env: env, user: user)

    if res["enabled"] do
      "Operation blocked by feature flag '#{flag_key}' (#{res["reason"]})."
    end
  end

  @doc "Filter flags by tag/env/enabled (filter_flags port)."
  @spec filter_flags([map()], String.t(), String.t(), boolean() | nil) :: [map()]
  def filter_flags(flags, tag, env, enabled) do
    tag = String.downcase(String.trim(tag || ""))
    env = String.downcase(String.trim(env || ""))

    Enum.filter(flags, fn flag ->
      tags = MapSet.new(Enum.map(flag["tags"] || [], &(String.downcase(String.trim(to_string(&1))))))

      tag_ok = tag == "" or MapSet.member?(tags, tag)
      env_ok = env == "" or (is_map(flag["environments"]) and Map.get(flag["environments"], env) == true)
      enabled_ok = is_nil(enabled) or truthy(flag["enabled"]) == enabled

      tag_ok and env_ok and enabled_ok
    end)
  end

  # ---------------------------------------------------------------------------
  # Audit trail
  # ---------------------------------------------------------------------------

  @doc "Append one audit entry (flag_audit:<scope>)."
  @spec append_history(map(), String.t(), String.t() | nil) :: map()
  def append_history(entry, scope_type, scope_id) do
    key = "flag_audit:#{scope_type}:#{scope_id || "default"}"
    history = KV.load(key)
    history = if is_list(history), do: history, else: []

    entry =
      Map.merge(
        %{"id" => Ecto.UUID.generate(), "actor" => "system", "at" => System.system_time(:second)},
        Map.new(entry)
      )

    history = Enum.take(history ++ [entry], -500)
    KV.save(key, history)
    entry
  end

  @doc "Audit entries for a scope, newest first, optional key filter."
  @spec audit(String.t(), String.t() | nil, String.t() | nil, integer()) :: [map()]
  def audit(scope_type \\ "global", scope_id \\ nil, flag_key \\ nil, limit \\ 100) do
    key = "flag_audit:#{scope_type}:#{scope_id || "default"}"
    history = KV.load(key)
    history = if is_list(history), do: history, else: []

    history
    |> Enum.reverse()
    |> Enum.filter(&(flag_key in [nil, ""] or Map.get(&1, "key") == flag_key))
    |> Enum.take(limit)
  end

  @doc "Seed default flags (idempotent); returns created count."
  @spec seed_default_flags() :: integer()
  def seed_default_flags do
    created =
      Enum.count(@default_flags, fn key ->
        get_flag(key) == nil and
          match?({:ok, _}, create_flag(%{"key" => key, "name" => key |> String.replace("_", " ") |> String.capitalize(), "rollout_percent" => 100, "enabled" => false}))
      end)

    created
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp result(key, enabled, reason), do: %{"key" => key, "enabled" => enabled, "reason" => reason}

  defp truthy(v) when v in [true, 1, "1", "true", "yes"], do: true
  defp truthy(_), do: false

  defp str_list(nil), do: []
  defp str_list(items) when is_list(items), do: Enum.map(items, &to_string/1)
  defp str_list(_), do: []

  defp clamp_rollout(nil, default), do: default
  defp clamp_rollout(v, _default), do: v |> parse_int(100) |> max(0) |> min(100)

  defp apply_str_fields(flag, patch, fields),
    do: Enum.reduce(fields, flag, fn f, acc -> if patch[f] != nil, do: Map.put(acc, f, patch[f]), else: acc end)

  defp apply_bool_fields(flag, patch, fields),
    do: Enum.reduce(fields, flag, fn f, acc -> if patch[f] != nil, do: Map.put(acc, f, truthy(patch[f])), else: acc end)

  defp apply_rollout(flag, patch) do
    if patch["rollout_percent"] != nil,
      do: Map.put(flag, "rollout_percent", clamp_rollout(patch["rollout_percent"], 100)),
      else: flag
  end

  defp apply_environments(flag, patch) do
    envs = patch["environments"]

    if is_map(envs) do
      Enum.reduce(envs, flag, fn {e, v}, acc ->
        if e in @default_envs, do: put_in(acc, ["environments", e], truthy(v)), else: acc
      end)
    else
      flag
    end
  end

  defp apply_str_lists(flag, patch, fields),
    do: Enum.reduce(fields, flag, fn f, acc -> if patch[f] != nil, do: Map.put(acc, f, str_list(patch[f])), else: acc end)

  defp parse_int(nil, default), do: default

  defp parse_int(v, _default) when is_integer(v), do: v
  defp parse_int(v, _default) when is_float(v), do: trunc(v)

  defp parse_int(v, default) when is_binary(v) do
    case Integer.parse(v) do
      {n, _} -> n
      :error -> default
    end
  end

  defp parse_int(_, default), do: default
end
