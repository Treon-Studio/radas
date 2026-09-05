defmodule RadasAI.CloudPolicy do
  @moduledoc """
  Port of `services/cloud_policy.py` — policy-as-code gate for cloud
  stacks (opt-in per stack): built-in + custom rule sanitizing, meta
  storage, latest worker verdict lookup, permanent violation store
  (kv_store `policy_violations:<pid>`), exemptions with TTL (UC547).
  The plan-evaluation engine itself runs worker-side; the server stores
  config and verdicts.
  """

  import RadasAI.DB

  alias RadasAI.CloudStacks

  @policy_rule_types ["deny_destroy", "denied_resource_types", "require_tags", "deny_public_ingress", "max_created"]
  @severities ["warn", "deny"]
  @custom_severities ["info", "warn", "deny"]
  @enforcements ["inherit", "block", "report"]
  @custom_operators ["matches", "not_matches", "equals", "not_equals", "exists", "not_exists", "gt", "lt"]
  @custom_actions ["create", "update", "delete", "read", "no-op"]
  @max_custom_rules 100

  def policy_rule_types, do: @policy_rule_types

  defp slugify(value, fallback) do
    s =
      to_string(value || "")
      |> String.trim()
      |> String.downcase()
      |> String.graphemes()
      |> Enum.map(fn c -> if c in String.graphemes("abcdefghijklmnopqrstuvwxyz0123456789-_"), do: c, else: "-" end)
      |> Enum.join()

    s =
      s
      |> String.split("-")
      |> Enum.reject(&(&1 == ""))
      |> Enum.join("-")

    out = String.slice(s, 0, 64)
    if out == "", do: fallback, else: out
  end

  @doc "Conservative default policy (Python default_policy)."
  @spec default_policy() :: map()
  def default_policy do
    %{
      "mode" => "warn",
      "rules" => %{
        "deny_destroy" => %{"enabled" => false, "severity" => "deny", "enforcement" => "inherit", "max_destroy" => 0},
        "denied_resource_types" => %{"enabled" => false, "severity" => "deny", "enforcement" => "inherit", "types" => []},
        "require_tags" => %{"enabled" => false, "severity" => "warn", "enforcement" => "inherit", "keys" => ["environment", "owner"]},
        "deny_public_ingress" => %{"enabled" => true, "severity" => "deny", "enforcement" => "inherit", "ports" => [22, 3389]},
        "max_created" => %{"enabled" => false, "severity" => "warn", "enforcement" => "inherit", "limit" => 50}
      },
      "custom_rules" => []
    }
  end

  def policy_enabled_from_meta(meta), do: is_map(meta) and meta["policy_enabled"] == true

  def policy_config_from_meta(meta) do
    cfg = default_policy()
    stored = (meta || %{})["policy_rules"]

    if is_map(stored) do
      cfg =
        if stored["mode"] in ["warn", "enforce"], do: Map.put(cfg, "mode", stored["mode"]), else: cfg

      rules =
        Map.new(cfg["rules"], fn {rid, rule} ->
          incoming = (stored["rules"] || %{})[rid]

          if is_map(incoming) do
            {rid, Map.merge(rule, Map.drop(incoming, ["id"]))}
          else
            {rid, rule}
          end
        end)

      cfg = Map.put(cfg, "rules", rules)

      custom = stored["custom_rules"]
      custom = if is_list(custom), do: sanitize_custom_rules(custom), else: []
      Map.put(cfg, "custom_rules", custom)
    else
      cfg
    end
  end

  @doc "Validate user-defined rules; malformed entries are dropped (Python sanitize_custom_rules)."
  @spec sanitize_custom_rules(term()) :: [map()]
  def sanitize_custom_rules(items), do: sanitize_custom_rules_with_ids(items)

  @doc "Internal: assign unique ids while sanitizing (Python loop semantics)."
  def sanitize_custom_rules_with_ids(items) when is_list(items) do
    {out, _} =
      items
      |> Enum.take(@max_custom_rules)
      |> Enum.with_index()
      |> Enum.map_reduce(MapSet.new(), fn {raw, idx}, seen ->
        unless is_map(raw) do
          {nil, seen}
        else
          name = String.slice(String.trim(to_string(raw["name"] || raw["id"] || "")), 0, 120)
          base = slugify(raw["id"] || name, "rule-#{idx + 1}")

          {rid, seen} =
            if MapSet.member?(seen, base) do
              find_free(base, 2, seen)
            else
              {base, seen}
            end

          seen = MapSet.put(seen, rid)
          {sanitize_one(raw, rid, name), seen}
        end
      end)

    Enum.reject(out, &is_nil/1)
  end

  defp find_free(base, n, seen) do
    candidate = "#{base}-#{n}"

    if MapSet.member?(seen, candidate) do
      find_free(base, n + 1, seen)
    else
      {candidate, seen}
    end
  end

  defp sanitize_one(raw, rid, name) do
    op = String.trim(String.downcase(to_string(raw["operator"] || "matches")))
    op = if op in @custom_operators, do: op, else: "matches"

    sev = String.trim(String.downcase(to_string(raw["severity"] || "warn")))
    sev = if sev in @custom_severities, do: sev, else: "warn"

    enf = String.trim(String.downcase(to_string(raw["enforcement"] || "inherit")))
    enf = if enf in @enforcements, do: enf, else: "inherit"

    actions =
      (raw["actions"] || [])
      |> List.wrap()
      |> Enum.map(&String.trim(String.downcase(to_string(&1))))
      |> Enum.filter(&(&1 in @custom_actions))

    value = raw["value"] || raw["pattern"]
    value = if is_map(value) or is_list(value), do: "", else: String.slice(to_string(value || ""), 0, 400)

    valid_value? =
      if op in ["matches", "not_matches"] and value != "" do
        match?({:ok, _}, Regex.compile(value))
      else
        true
      end

    attribute = String.slice(String.trim(to_string(raw["attribute"] || "")), 0, 200)

    needs_something? =
      op in ["exists", "not_exists"] or attribute != "" or value != "" or
        List.wrap(raw["resource_types"] || []) != []

    if valid_value? and needs_something? do
      %{
        "id" => rid,
        "name" => if(name == "", do: rid, else: name),
        "description" => String.slice(String.trim(to_string(raw["description"] || "")), 0, 400),
        "enabled" => !!raw["enabled"],
        "severity" => sev,
        "enforcement" => enf,
        "resource_types" => regex_list(raw["resource_types"]),
        "addresses" => regex_list(raw["addresses"]),
        "actions" => actions,
        "attribute" => attribute,
        "operator" => op,
        "value" => value,
        "message" => String.slice(String.trim(to_string(raw["message"] || "")), 0, 400)
      }
    else
      nil
    end
  end

  defp regex_list(value) when is_binary(value), do: regex_list([value])

  defp regex_list(value) when is_list(value) do
    value
    |> Enum.take(50)
    |> Enum.flat_map(fn v ->
      s = String.trim(to_string(v || ""))

      cond do
        s == "" -> []
        match?({:ok, _}, Regex.compile(s)) -> [String.slice(s, 0, 400)]
        true -> []
      end
    end)
  end

  defp regex_list(_), do: []

  @doc "Merge a PUT body into the default policy (Python sanitize_policy)."
  @spec sanitize_policy(map()) :: map()
  def sanitize_policy(body) when is_map(body) do
    cfg = default_policy()
    mode = String.trim(String.downcase(to_string(body["mode"] || "")))
    cfg = if mode in ["warn", "enforce"], do: Map.put(cfg, "mode", mode), else: cfg

    custom =
      case body["custom_rules"] do
        items when is_list(items) -> sanitize_custom_rules_with_ids(items)
        _ -> []
      end

    cfg = Map.put(cfg, "custom_rules", custom)

    rules = body["rules"]

    rules =
      if is_map(rules) do
        Map.new(cfg["rules"], fn {rid, target} ->
          incoming = rules[rid]

          if rid in @policy_rule_types and is_map(incoming) do
            target = Map.put(target, "enabled", !!incoming["enabled"])

            sev = String.trim(String.downcase(to_string(incoming["severity"] || "")))
            target = if sev in @severities, do: Map.put(target, "severity", sev), else: target

            enf = String.trim(String.downcase(to_string(incoming["enforcement"] || "")))
            target = if enf in @enforcements, do: Map.put(target, "enforcement", enf), else: target

            target =
              case rid do
                "deny_destroy" ->
                  n = parse_int(incoming["max_destroy"], 0)
                  Map.put(target, "max_destroy", max(0, n))

                "denied_resource_types" ->
                  types = List.wrap(incoming["types"] || [])

                  Map.put(
                    target,
                    "types",
                    types |> Enum.map(&String.trim(to_string(&1))) |> Enum.reject(&(&1 == "")) |> Enum.take(100)
                  )

                "require_tags" ->
                  keys = List.wrap(incoming["keys"] || [])

                  Map.put(
                    target,
                    "keys",
                    keys |> Enum.map(&String.trim(to_string(&1))) |> Enum.reject(&(&1 == "")) |> Enum.take(50)
                  )

                "deny_public_ingress" ->
                  ports =
                    (incoming["ports"] || [])
                    |> Enum.take(100)
                    |> Enum.flat_map(fn p ->
                      case parse_int(p, nil) do
                        nil -> []
                        n when n > 0 and n < 65536 -> [n]
                        _ -> []
                      end
                    end)

                  Map.put(target, "ports", ports)

                "max_created" ->
                  n = parse_int(incoming["limit"], 50)
                  Map.put(target, "limit", max(1, n))

                _ ->
                  target
              end

            {rid, target}
          else
            {rid, target}
          end
        end)
      else
        cfg["rules"]
      end

    Map.put(cfg, "rules", rules)
  end

  def sanitize_policy(_), do: default_policy()

  defp parse_int(v, _default) when is_integer(v), do: v

  defp parse_int(v, default) when is_binary(v) do
    case Integer.parse(v) do
      {n, _} -> n
      :error -> default
    end
  end

  defp parse_int(v, _default) when is_float(v), do: trunc(v)
  defp parse_int(_, default), do: default

  @doc """
  Most recent policy verdict recorded by a worker for this stack
  (Python latest_policy_result — Postgres-backed here).
  """
  @spec latest_policy_result(String.t() | nil, String.t()) :: map() | nil
  def latest_policy_result(project_id, name) do
    rows =
      query_all!(
        """
        SELECT data FROM executions
        WHERE project_id = $1 AND data->'runParams'->>'execution_type' = 'TOFU_RUN'
          AND data->'runParams'->>'stack_name' = $2
        ORDER BY created_at DESC LIMIT 300
        """,
        [project_id || "default", name]
      )

    Enum.find_value(rows, fn row ->
      exe = row["data"]
      rp = exe["runParams"] || %{}
      res = exe["result"] || exe["stats"] || %{}
      pol = if is_map(res), do: res["policy"], else: nil

      if is_map(pol) do
        ts = [exe["finishedAt"], exe["startedAt"]] |> Enum.find(&(is_number(&1) and trunc(&1) > 0))

        %{
          "run_id" => exe["id"],
          "action" => rp["tofu_action"],
          "checked_at" => (ts && trunc(ts)) || nil,
          "verdict" => pol["verdict"],
          "denies" => pol["denies"],
          "warns" => pol["warns"],
          "infos" => pol["infos"],
          "blocked" => !!pol["blocked"],
          "blocked_by" => pol["blocked_by"] || [],
          "violations" => pol["violations"] || []
        }
      else
        nil
      end
    end)
  rescue
    _ -> nil
  end

  @doc "Record worker policy findings persistently (UC547)."
  @spec record_policy_violations(String.t() | nil, String.t(), String.t(), [map()]) :: [map()]
  def record_policy_violations(project_id, stack, run_id, findings) when findings != [] do
    pid = project_id || "default"
    stack_name = String.trim(stack || "")
    now = System.system_time(:second)

    recorded =
      Enum.map(findings, fn f ->
        %{
          "id" => "pv-" <> (:crypto.strong_rand_bytes(6) |> Base.encode16(case: :lower)),
          "project_id" => pid,
          "stack" => stack_name,
          "run_id" => run_id,
          "rule_id" => f["rule"] || f["rule_id"] || "general",
          "severity" => f["severity"] || "deny",
          "message" => f["message"] || "",
          "resource" => f["resource"] || "",
          "created_at" => now
        }
      end)

    Enum.each(recorded, fn rec ->
      execute!(
        "INSERT INTO kv_store (scope, key, value) VALUES ($1, $2, $3::text::jsonb)
         ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value",
        ["policy_violations:#{pid}", rec["id"], Jason.encode!(rec)]
      )
    end)

    recorded
  end

  def record_policy_violations(_pid, _stack, _run_id, _findings), do: []

  @doc "Query recorded violations with filters (UC547)."
  @spec query_policy_violations(String.t() | nil, keyword()) :: [map()]
  def query_policy_violations(project_id, opts \\ []) do
    stack = Keyword.get(opts, :stack)
    severity = Keyword.get(opts, :severity)
    limit = Keyword.get(opts, :limit, 100)
    pid = project_id || "default"

    query_all!(
      "SELECT value FROM kv_store WHERE scope = $1 ORDER BY key DESC LIMIT $2",
      ["policy_violations:#{pid}", min(max(1, limit * 2), 500)]
    )
    |> Enum.map(& &1["value"])
    |> Enum.filter(&is_map/1)
    |> Enum.filter(&(stack in [nil, ""] or &1["stack"] == stack))
    |> Enum.filter(&(severity in [nil, ""] or &1["severity"] == severity))
    |> Enum.take(limit)
  rescue
    _ -> []
  end

  # ---------------------------------------------------------------------------
  # Exemptions (UC547)
  # ---------------------------------------------------------------------------

  @doc "Grant a TTL exemption for a rule on a stack."
  @spec create_policy_exemption(String.t() | nil, String.t(), String.t(), String.t(), keyword()) :: map()
  def create_policy_exemption(project_id, stack, rule_id, reason, opts \\ []) do
    pid = project_id || "default"
    stack_name = String.trim(stack || "")
    rid = String.trim(rule_id || "")

    if stack_name == "" do
      raise ArgumentError, message: "stack name required"
    end

    if rid == "" do
      raise ArgumentError, message: "rule_id required"
    end

    now = System.system_time(:second)
    ttl = Keyword.get(opts, :ttl_seconds, 86400 * 7)
    expires_at = now + max(60, trunc(ttl || 86400 * 7))
    requested_by = Keyword.get(opts, :requested_by, "")

    exemption = %{
      "id" => "pe-" <> (:crypto.strong_rand_bytes(6) |> Base.encode16(case: :lower)),
      "project_id" => pid,
      "stack" => stack_name,
      "rule_id" => rid,
      "reason" => String.trim(reason || ""),
      "requested_by" => requested_by || "unknown",
      "approved_by" => Keyword.get(opts, :approved_by) || requested_by || "admin",
      "status" => "active",
      "created_at" => now,
      "expires_at" => expires_at
    }

    execute!(
      "INSERT INTO kv_store (scope, key, value) VALUES ($1, $2, $3::text::jsonb)
       ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value",
      ["policy_exemptions:#{pid}", "#{stack_name}:#{rid}", Jason.encode!(exemption)]
    )

    exemption
  end

  @doc "Active, non-expired exemption for a rule on a stack?"
  @spec rule_exempted?(String.t() | nil, String.t(), String.t()) :: boolean()
  def rule_exempted?(project_id, stack, rule_id) do
    pid = project_id || "default"

    case query_one!("SELECT value FROM kv_store WHERE scope = $1 AND key = $2", [
           "policy_exemptions:#{pid}",
           "#{String.trim(stack || "")}:#{String.trim(rule_id || "")}"
         ]) do
      nil ->
        false

      row ->
        val = row["value"]
        is_map(val) and val["status"] == "active" and (val["expires_at"] || 0) > System.system_time(:second)
    end
  rescue
    _ -> false
  end

  @doc "Active exemptions for a project/stack (UC547)."
  @spec list_policy_exemptions(String.t() | nil, String.t() | nil) :: [map()]
  def list_policy_exemptions(project_id, stack \\ nil) do
    pid = project_id || "default"
    now = System.system_time(:second)

    query_all!("SELECT value FROM kv_store WHERE scope = $1", ["policy_exemptions:#{pid}"])
    |> Enum.map(& &1["value"])
    |> Enum.filter(&is_map/1)
    |> Enum.filter(&(stack in [nil, ""] or &1["stack"] == stack))
    |> Enum.filter(&((&1["expires_at"] || 0) > now))
  rescue
    _ -> []
  end

  @doc "Combined GET /stacks/:name/policy payload."
  @spec policy_payload(String.t() | nil, String.t()) :: map()
  def policy_payload(project_id, name) do
    meta = CloudStacks.load_meta(project_id, name)

    %{
      "enabled" => policy_enabled_from_meta(meta),
      "policy" => policy_config_from_meta(meta),
      "last_result" => latest_policy_result(project_id, name)
    }
  end
end
