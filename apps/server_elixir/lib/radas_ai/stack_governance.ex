defmodule RadasAI.StackGovernance do
  @moduledoc """
  Port of the stack governance surface of `services/cloud_provisioning.py`:
  resource delete protection (UC323), run comments (UC333), dependencies
  DAG (UC348), TTL/auto-destroy (UC357), circuit breaker (UC409), secret
  scanning (UC420/630), config import/export (UC430), timeouts (UC481),
  worker pinning (UC533), bulk tags (UC609), archive/restore (UC611/612).

  All state rides on the stack_meta jsonb table (shared with Flask); run
  comments live in the kv_store `execution_comments:<id>` scope.
  """

  import RadasAI.DB

  alias RadasAI.CloudStacks

  @default_action_timeouts %{
    "plan" => 600,
    "apply" => 1800,
    "destroy" => 1800,
    "test" => 300,
    "remediate" => 600
  }

  def default_action_timeouts, do: @default_action_timeouts

  # ---------------------------------------------------------------------------
  # Resource delete protection (UC323)
  # ---------------------------------------------------------------------------

  def get_resource_protection(project_id, stack) do
    protected = List.wrap(CloudStacks.load_meta(project_id, stack)["protected_resources"])

    %{
      "stack" => stack,
      "project_id" => project_id,
      "protected_count" => length(protected),
      "protected_resources" => protected
    }
  end

  def set_resource_protection(project_id, stack, protected_resources) do
    clean =
      (protected_resources || [])
      |> Enum.map(&String.trim(to_string(&1)))
      |> Enum.reject(&(&1 == ""))
      |> Enum.uniq()
      |> Enum.sort()

    CloudStacks.save_meta(project_id, stack, %{"protected_resources" => clean})

    %{
      "ok" => true,
      "stack" => stack,
      "project_id" => project_id,
      "protected_count" => length(clean),
      "protected_resources" => clean
    }
  end

  # ---------------------------------------------------------------------------
  # Run comments (UC333) — kv_store scope execution_comments:<eid>
  # ---------------------------------------------------------------------------

  def add_execution_comment(project_id, execution_id, comment, author \\ "system") do
    eid = String.trim(execution_id || "")
    text = String.trim(comment || "")

    if eid == "" or text == "" do
      raise ArgumentError, message: "execution_id and comment text required"
    end

    payload = %{
      "id" => Ecto.UUID.generate(),
      "execution_id" => eid,
      "project_id" => project_id || "default",
      "comment" => text,
      "author" => author || "system",
      "created_at" => System.system_time(:second)
    }

    execute!(
      """
      INSERT INTO kv_store (scope, key, value) VALUES ($1, $2, $3::text::jsonb)
      ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value
      """,
      ["execution_comments:#{eid}", payload["id"], Jason.encode!(payload)]
    )

    payload
  end

  def list_execution_comments(execution_id) do
    eid = String.trim(execution_id || "")

    if eid == "" do
      raise ArgumentError, message: "execution_id required"
    end

    query_all!("SELECT value FROM kv_store WHERE scope = $1", ["execution_comments:#{eid}"])
    |> Enum.map(& &1["value"])
    |> Enum.filter(&is_map/1)
    |> Enum.sort_by(&(&1["created_at"] || 0))
  rescue
    _ -> []
  end

  # ---------------------------------------------------------------------------
  # Dependencies DAG (UC348)
  # ---------------------------------------------------------------------------

  def get_stack_dependencies(project_id, name) do
    deps = List.wrap(CloudStacks.load_meta(project_id, name)["depends_on"])
    %{"stack" => name, "project_id" => project_id, "depends_on" => deps}
  end

  def set_stack_dependencies(project_id, stack, depends_on) do
    stack_name = String.trim(stack || "")

    if stack_name == "" do
      raise ArgumentError, message: "stack name required"
    end

    clean_deps =
      (depends_on || [])
      |> Enum.map(&String.trim(to_string(&1)))
      |> Enum.reject(&(&1 == "" or &1 == stack_name))
      |> Enum.uniq()
      |> Enum.sort()

    graph =
      get_stack_dependency_graph(project_id)["graph"]
      |> Map.put(stack_name, clean_deps)

    case detect_cycle(graph) do
      nil ->
        CloudStacks.save_meta(project_id, stack_name, %{"depends_on" => clean_deps})

        %{
          "ok" => true,
          "stack" => stack_name,
          "project_id" => project_id,
          "depends_on" => clean_deps,
          "dependency_count" => length(clean_deps)
        }

      cycle ->
        raise ArgumentError, message: "Circular dependency detected: #{Enum.join(cycle, " -> ")}"
    end
  end

  def get_stack_dependency_graph(project_id) do
    # Deps are read straight from meta for every listed stack (Python
    # re-loads meta per stack); postgres-only stacks (no working dir) are
    # appended, never overriding existing entries.
    {graph_pairs, providers} =
      CloudStacks.list_stacks(project_id)
      |> Enum.map_reduce(%{}, fn s, prov ->
        deps = List.wrap(CloudStacks.load_meta(project_id, s["name"])["depends_on"])
        prov = Map.put(prov, s["name"], s["provider"])
        {{s["name"], deps}, prov}
      end)

    graph = Map.new(graph_pairs)

    graph =
      meta_depends_by_stack(project_id)
      |> Map.drop(Map.keys(graph))
      |> Map.merge(graph)

    nodes =
      Enum.map(graph, fn {name, deps} ->
        %{"name" => name, "provider" => providers[name] || "bytedc", "status" => "active", "depends_on" => deps}
      end)

    %{"project_id" => project_id, "total_stacks" => length(nodes), "nodes" => nodes, "graph" => graph}
  end

  defp meta_depends_by_stack(project_id) do
    rows =
      query_all!("SELECT stack, data FROM stack_meta WHERE project_id = $1", [project_id || "default"])

    Map.new(rows, fn row ->
      deps = List.wrap((row["data"] || %{})["depends_on"])
      {row["stack"], deps}
    end)
  rescue
    _ -> %{}
  end

  @doc "DFS cycle detection over a {node => deps} graph (Python _detect_cycle)."
  @spec detect_cycle(map()) :: [String.t()] | nil
  def detect_cycle(graph) do
    Enum.find_value(Map.keys(graph), fn n ->
      dfs_cycle(graph, n, %{}, [n])
    end)
  end

  defp dfs_cycle(graph, node, visited, path) do
    visited = Map.put(visited, node, 1)

    Enum.find_value(graph[node] || [], fn neighbor ->
      cond do
        visited[neighbor] == 1 -> path ++ [neighbor]
        Map.get(visited, neighbor, 0) == 0 -> dfs_cycle(graph, neighbor, visited, path ++ [neighbor])
        true -> nil
      end
    end)
    |> then(fn res ->
      if res do
        res
      else
        visited = Map.put(visited, node, 2)
        nil
      end
    end)
  end

  # ---------------------------------------------------------------------------
  # TTL / auto-destroy (UC357)
  # ---------------------------------------------------------------------------

  def set_stack_ttl(project_id, stack, ttl_seconds, auto_destroy \\ true) do
    stack_name = String.trim(stack || "")

    if stack_name == "" do
      raise ArgumentError, message: "stack name required"
    end

    sec = trunc(ttl_seconds)

    if sec <= 0 do
      raise ArgumentError, message: "ttl_seconds must be positive integer"
    end

    now = System.system_time(:second)

    CloudStacks.save_meta(project_id, stack_name, %{
      "ttl" => %{
        "ttl_seconds" => sec,
        "set_at" => now,
        "expires_at" => now + sec,
        "auto_destroy" => !!auto_destroy,
        "status" => "active"
      }
    })

    %{
      "ok" => true,
      "stack" => stack_name,
      "project_id" => project_id,
      "ttl_seconds" => sec,
      "set_at" => now,
      "expires_at" => now + sec,
      "auto_destroy" => !!auto_destroy,
      "remaining_seconds" => sec
    }
  end

  def get_stack_ttl(project_id, stack) do
    stack_name = String.trim(stack || "")
    ttl = CloudStacks.load_meta(project_id, stack_name)["ttl"] || %{}
    expires_at = ttl["expires_at"] || 0
    now = System.system_time(:second)
    remaining = max(0, expires_at - now)

    %{
      "stack" => stack_name,
      "project_id" => project_id,
      "ttl_seconds" => ttl["ttl_seconds"],
      "set_at" => ttl["set_at"],
      "expires_at" => expires_at,
      "auto_destroy" => !!ttl["auto_destroy"],
      "remaining_seconds" => remaining,
      "expired" => expires_at > 0 and now >= expires_at
    }
  end

  def check_expired_ttl_stacks(project_id) do
    now = System.system_time(:second)

    CloudStacks.list_stacks(project_id)
    |> Enum.flat_map(fn s ->
      ttl = CloudStacks.load_meta(project_id, s["name"])["ttl"]

      case ttl do
        %{"expires_at" => exp} when is_number(exp) and exp > 0 ->
          if now >= exp and Map.get(ttl, "auto_destroy", true) do
            [
              %{
                "stack" => s["name"],
                "project_id" => project_id,
                "expires_at" => trunc(exp),
                "expired_seconds_ago" => now - trunc(exp),
                "action_required" => "auto_destroy"
              }
            ]
          else
            []
          end

        _ ->
          []
      end
    end)
  end

  # ---------------------------------------------------------------------------
  # Circuit breaker (UC409)
  # ---------------------------------------------------------------------------

  def record_apply_result(project_id, stack, success, failure_threshold \\ 3) do
    meta = CloudStacks.load_meta(project_id, stack)
    cb = meta["circuit_breaker"] || %{}
    failures = (cb["consecutive_failures"] || 0) |> trunc()
    now = System.system_time(:second)

    {state, failures, tripped_at} =
      if success do
        {"closed", 0, nil}
      else
        failures = failures + 1

        if failures >= max(1, failure_threshold) do
          {"open", failures, now}
        else
          {"closed", failures, cb["tripped_at"]}
        end
      end

    cb_state = %{
      "state" => state,
      "consecutive_failures" => failures,
      "failure_threshold" => failure_threshold,
      "last_updated" => now,
      "tripped_at" => tripped_at
    }

    CloudStacks.save_meta(project_id, stack, %{"circuit_breaker" => cb_state})

    %{
      "stack" => stack,
      "project_id" => project_id,
      "circuit_breaker" => cb_state,
      "is_open" => state == "open"
    }
  end

  def circuit_open?(project_id, stack) do
    (CloudStacks.load_meta(project_id, stack)["circuit_breaker"] || %{})["state"] == "open"
  end

  def reset_circuit_breaker(project_id, stack) do
    stack_name = String.trim(stack || "")

    if stack_name == "" do
      raise ArgumentError, message: "stack name required"
    end

    now = System.system_time(:second)

    cb = %{
      "state" => "closed",
      "consecutive_failures" => 0,
      "failure_threshold" => 3,
      "last_updated" => now,
      "tripped_at" => nil,
      "reset_at" => now
    }

    CloudStacks.save_meta(project_id, stack_name, %{"circuit_breaker" => cb})

    %{"ok" => true, "stack" => stack_name, "project_id" => project_id, "circuit_breaker" => cb, "is_open" => false}
  end

  # ---------------------------------------------------------------------------
  # Secret scanning (UC420 / UC630)
  # ---------------------------------------------------------------------------

  @doc "Scan and mask exposed secrets in plan output or logs (Python scan_and_mask_secrets)."
  @spec scan_and_mask_secrets(String.t()) :: map()
  def scan_and_mask_secrets(text)

  def scan_and_mask_secrets(text) when text in [nil, ""] do
    %{"clean" => true, "findings_count" => 0, "findings" => [], "masked_text" => ""}
  end

  def scan_and_mask_secrets(text) do
    masked = to_string(text)
    findings = []

    # 1. AWS Access Key
    {masked, findings} =
      scan_pattern(masked, findings, ~r/\b(AKIA[0-9A-Z]{16})\b/, "AWS Access Key", "[REDACTED_AWS_KEY]", 6)

    # 2. GitHub Token
    {masked, findings} =
      scan_pattern(masked, findings, ~r/\b(ghp_[a-zA-Z0-9]{36,40}|github_pat_[a-zA-Z0-9_]{60,82})\b/, "GitHub Token", "[REDACTED_GITHUB_TOKEN]", 8)

    # 3. Private Key Block
    {masked, findings} =
      scan_private_key(masked, findings)

    # 4. Explicit password/secret strings
    {masked, findings} = scan_keyword_secrets(masked, findings)

    %{
      "clean" => findings == [],
      "findings_count" => length(findings),
      "findings" => Enum.reverse(findings),
      "masked_text" => masked
    }
  end

  defp scan_pattern(text, findings, re, type, replacement, prefix_len) do
    matches = Regex.scan(re, text) |> Enum.map(fn [_, val] -> val end)

    findings =
      Enum.map(matches, fn val ->
        %{"type" => type, "match_prefix" => String.slice(val, 0, prefix_len) <> "..."}
      end) ++ findings

    masked = Enum.reduce(matches, text, &String.replace(&2, &1, replacement))
    {masked, findings}
  end

  defp scan_private_key(text, findings) do
    re = ~r/-----BEGIN [A-Z0-9_-]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9_-]+ PRIVATE KEY-----/
    matches = Regex.scan(re, text) |> Enum.map(&hd/1)

    findings =
      Enum.map(matches, fn _ -> %{"type" => "Private Key", "match_prefix" => "-----BEGIN..."} end) ++ findings

    masked = Enum.reduce(matches, text, &String.replace(&2, &1, "[REDACTED_PRIVATE_KEY]"))
    {masked, findings}
  end

  @keyword_secret_re ~r/\b([a-zA-Z0-9_-]*(?:password|secret|token|api_key|client_secret)[a-zA-Z0-9_-]*\s*[:=]\s*)(\\?["'])([^"'\\\n]{3,})(\\?["'])/i

  defp scan_keyword_secrets(text, findings) do
    # Scan the ORIGINAL text first (Regex.replace callbacks can't thread
    # state), then mask.
    extra =
      Regex.scan(@keyword_secret_re, text)
      |> Enum.flat_map(fn [_, prefix, _quote, val, _closing] ->
        if String.length(val) >= 4 and not String.starts_with?(val, "[REDACTED") do
          [%{"type" => "Secret Value (#{String.trim(prefix)})", "match_prefix" => "#{String.trim(prefix)}=..."}]
        else
          []
        end
      end)

    masked =
      Regex.replace(@keyword_secret_re, text, fn whole, prefix, quote, secret_val, _closing ->
        if String.length(secret_val) >= 4 and not String.starts_with?(secret_val, "[REDACTED") do
          "#{prefix}#{quote}[REDACTED_SECRET]#{quote}"
        else
          whole
        end
      end)

    {masked, extra ++ findings}
  end

  @doc "Scan key-value variables for plaintext secrets (UC630)."
  @spec scan_variables_for_secrets(map()) :: [map()]
  def scan_variables_for_secrets(variables) when is_map(variables) do
    Enum.flat_map(variables, fn {k, v} ->
      val_str = if v in [nil, ""], do: "", else: to_string(v)
      key_lower = String.downcase(to_string(k))

      sensitive_key? =
        Enum.any?(
          ["password", "secret", "api_key", "token", "private_key", "auth"],
          &String.contains?(key_lower, &1)
        )

      cond do
        sensitive_key? and val_str != "" and
            not String.starts_with?(val_str, ["[REDACTED", "ENC(", "${"]) ->
          [
            %{
              "key" => to_string(k),
              "type" => "Sensitive Variable Key",
              "severity" => "high",
              "message" => "Variable '#{k}' appears to contain an unencrypted secret"
            }
          ]

        true ->
          scan = scan_and_mask_secrets("#{k} = \"#{val_str}\"")

          Enum.map(scan["findings"], fn f ->
            %{
              "key" => to_string(k),
              "type" => f["type"] || "Secret Pattern Match",
              "severity" => "high",
              "message" => "Variable '#{k}' matched pattern: #{f["type"]}"
            }
          end)
      end
    end)
  end

  def scan_variables_for_secrets(_), do: []

  # ---------------------------------------------------------------------------
  # Config import/export (UC430)
  # ---------------------------------------------------------------------------

  def export_stack_config_bundle(project_id, stack) do
    stack_name = String.trim(stack || "")

    if stack_name == "" do
      raise ArgumentError, message: "stack name required"
    end

    meta = CloudStacks.load_meta(project_id, stack_name)
    secrets_map = CloudStacks.load_secrets(project_id, stack_name)

    tfvars =
      case Path.join(stack_sd(project_id, stack_name), "values.auto.tfvars.json") do
        f ->
          if File.exists?(f) do
            case Jason.decode(File.read!(f)) do
              {:ok, v} when is_map(v) -> v
              _ -> %{}
            end
          else
            %{}
          end

        _ ->
          %{}
      end

    %{
      "version" => "1.0",
      "stack" => stack_name,
      "project_id" => project_id,
      "exported_at" => System.system_time(:second),
      "meta" => meta,
      "tfvars" => tfvars,
      "secret_keys" => Map.keys(secrets_map),
      "dependencies" => List.wrap(meta["depends_on"]),
      "protected_resources" => List.wrap(meta["protected_resources"]),
      "ttl" => meta["ttl"]
    }
  end

  def import_stack_config_bundle(project_id, stack, bundle, _overwrite \\ true) do
    stack_name = String.trim(stack || bundle["stack"] || "")

    if stack_name == "" do
      raise ArgumentError, message: "stack name required"
    end

    if not is_map(bundle) do
      raise ArgumentError, message: "Invalid bundle format: dict required"
    end

    imported_meta = bundle["meta"] || %{}
    imported_meta = if bundle["dependencies"], do: Map.put(imported_meta, "depends_on", List.wrap(bundle["dependencies"])), else: imported_meta
    imported_meta = if bundle["protected_resources"], do: Map.put(imported_meta, "protected_resources", List.wrap(bundle["protected_resources"])), else: imported_meta
    imported_meta = if bundle["ttl"], do: Map.put(imported_meta, "ttl", bundle["ttl"]), else: imported_meta

    CloudStacks.save_meta(project_id, stack_name, imported_meta)

    tfvars = bundle["tfvars"]

    if is_map(tfvars) and tfvars != %{} do
      sd = CloudStacks.stack_dir(project_id, stack_name)
      File.mkdir_p!(sd)
      File.write!(Path.join(sd, "values.auto.tfvars.json"), Jason.encode!(tfvars, pretty: true))
    end

    %{
      "ok" => true,
      "stack" => stack_name,
      "project_id" => project_id,
      "imported_at" => System.system_time(:second),
      "meta" => CloudStacks.load_meta(project_id, stack_name)
    }
  end

  # ---------------------------------------------------------------------------
  # Execution timeouts (UC481)
  # ---------------------------------------------------------------------------

  def get_execution_timeout(project_id, stack, action \\ "apply") do
    act = String.trim(String.downcase(action || "apply"))
    timeouts = (CloudStacks.load_meta(project_id, stack)["timeouts"] || %{})[act]

    if is_integer(timeouts) do
      timeouts
    else
      Map.get(@default_action_timeouts, act, 1800)
    end
  end

  def set_execution_timeout(project_id, stack, action, timeout_seconds) do
    stack_name = String.trim(stack || "")

    if stack_name == "" do
      raise ArgumentError, message: "stack name required"
    end

    act = String.trim(String.downcase(action || "apply"))

    if timeout_seconds < 10 or timeout_seconds > 86400 do
      raise ArgumentError, message: "timeout_seconds must be between 10 and 86400"
    end

    meta = CloudStacks.load_meta(project_id, stack_name)
    timeouts = Map.merge(meta["timeouts"] || %{}, %{act => trunc(timeout_seconds)})
    CloudStacks.save_meta(project_id, stack_name, %{"timeouts" => timeouts})

    %{
      "stack" => stack_name,
      "project_id" => project_id,
      "action" => act,
      "timeout_seconds" => trunc(timeout_seconds),
      "all_timeouts" => timeouts
    }
  end

  # ---------------------------------------------------------------------------
  # Worker pinning (UC533)
  # ---------------------------------------------------------------------------

  def set_stack_worker_pin(project_id, stack, worker_id \\ nil, tags \\ [], strict \\ true) do
    stack_name = String.trim(stack || "")

    if stack_name == "" do
      raise ArgumentError, message: "stack name required"
    end

    pin_data = %{
      "worker_id" => (worker_id && String.trim(worker_id)) || nil,
      "required_tags" => List.wrap(tags || []),
      "strict" => !!strict,
      "updated_at" => System.system_time(:second)
    }

    CloudStacks.save_meta(project_id, stack_name, %{"worker_pin" => pin_data})
    %{"ok" => true, "stack" => stack_name, "project_id" => project_id, "worker_pin" => pin_data}
  end

  def get_stack_worker_pin(project_id, stack) do
    CloudStacks.load_meta(project_id, stack)["worker_pin"] || %{
      "worker_id" => nil,
      "required_tags" => [],
      "strict" => false
    }
  end

  # ---------------------------------------------------------------------------
  # Bulk tags (UC609)
  # ---------------------------------------------------------------------------

  def bulk_update_stack_tags(project_id, stacks, tags, overwrite \\ false) do
    if stacks in [nil, []] do
      raise ArgumentError, message: "stacks list cannot be empty"
    end

    if not is_map(tags) do
      raise ArgumentError, message: "tags must be a dictionary"
    end

    updated =
      Enum.flat_map(stacks, fn s ->
        sname = String.trim(to_string(s))

        if sname == "" do
          []
        else
          meta = CloudStacks.load_meta(project_id, sname)
          current = if overwrite, do: tags, else: Map.merge(meta["tags"] || %{}, tags)
          CloudStacks.save_meta(project_id, sname, %{"tags" => current})
          [%{"stack" => sname, "tags" => current}]
        end
      end)

    %{"ok" => true, "project_id" => project_id, "updated_count" => length(updated), "stacks" => updated}
  end

  # ---------------------------------------------------------------------------
  # Archive / restore (UC611/612)
  # ---------------------------------------------------------------------------

  def archive_stack(project_id, stack, actor \\ "", reason \\ "") do
    stack_name = String.trim(stack || "")

    if stack_name == "" do
      raise ArgumentError, message: "stack name required"
    end

    now = System.system_time(:second)

    CloudStacks.save_meta(project_id, stack_name, %{
      "archived" => true,
      "archived_at" => now,
      "archived_by" => actor || "system",
      "archive_reason" => reason || ""
    })

    %{
      "ok" => true,
      "stack" => stack_name,
      "project_id" => project_id,
      "archived" => true,
      "archived_at" => now,
      "archived_by" => actor || "system"
    }
  end

  def restore_archived_stack(project_id, stack, actor \\ "") do
    stack_name = String.trim(stack || "")

    if stack_name == "" do
      raise ArgumentError, message: "stack name required"
    end

    now = System.system_time(:second)

    CloudStacks.save_meta(project_id, stack_name, %{
      "archived" => false,
      "restored_at" => now,
      "restored_by" => actor || "system"
    })

    %{
      "ok" => true,
      "stack" => stack_name,
      "project_id" => project_id,
      "archived" => false,
      "restored_at" => now,
      "restored_by" => actor || "system"
    }
  end

  def list_archived_stacks(project_id) do
    CloudStacks.list_stacks(project_id)
    |> Enum.flat_map(fn s ->
      meta = CloudStacks.load_meta(project_id, s["name"])

      if meta["archived"] == true do
        [
          %{
            "stack" => s["name"],
            "project_id" => project_id,
            "archived_at" => meta["archived_at"],
            "archived_by" => meta["archived_by"],
            "archive_reason" => meta["archive_reason"]
          }
        ]
      else
        []
      end
    end)
  end

  # ---------------------------------------------------------------------------
  # Cooldown (UC536)
  # ---------------------------------------------------------------------------

  def get_stack_cooldown_remaining(project_id, stack) do
    cooldown = CloudStacks.load_meta(project_id, stack)["cooldown"] || %{}
    until = cooldown["cooldown_until"] || 0
    now = System.system_time(:second)
    if until > now, do: trunc(until - now), else: 0
  end

  defp stack_sd(project_id, stack_name), do: CloudStacks.stack_dir(project_id, stack_name)
end
