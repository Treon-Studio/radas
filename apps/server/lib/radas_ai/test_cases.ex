defmodule RadasAI.TestCases do
  @moduledoc """
  Port of `services/test_cases.py` (Fase 6 — UC 161+): test case registry
  with a built-in assertion library evaluated against stack tfvars / latest
  run output / state. Runs produce history entries (kv_store, capped 500);
  a failed `blocker` test gates apply via the action route.

  Storage: kv scopes `test_cases:<pid>`, `test_case_versions:<pid>`,
  `test_results:<pid>` — shared with Flask.
  """


  alias RadasAI.CloudStacks
  alias RadasAI.KV
  @severities ["blocker", "warning", "info"]
  @kinds ["assertion", "tofu_validate", "tofu_test", "tftest", "ansible_validate", "ansible_idempotency", "iac_scan", "smoke"]

  def severities, do: @severities
  def kinds, do: @kinds

  defp scope(name, project_id), do: "#{name}:#{project_id || "unscoped"}"

  defp load(name, project_id) do
    case KV.load(scope(name, project_id)) do
      v when is_list(v) -> Enum.filter(v, &is_map/1)
      _ -> []
    end
  end

  defp save(name, items, project_id), do: KV.save(scope(name, project_id), items)

  # ---------------------------------------------------------------------------
  # Assertion library (Python ASSERTIONS — deterministic text rules)
  # ---------------------------------------------------------------------------

  @assertions %{
    "cidr_public" => {"Public CIDR 0.0.0.0/0", "Deteksi CIDR publik di security group / ingress.", "blocker", ~r/0\.0\.0\.0\/0/},
    "ports_open" => {"Port 22/3389 terbuka publik", "SSH/RDP ke 0.0.0.0/0 terdeteksi.", "blocker", ~r/(?:22|3389)[^\n]*0\.0\.0\.0\/0|0\.0\.0\.0\/0[^\n]*(?:22|3389)/i},
    "unencrypted_volume" => {"Volume tanpa enkripsi", "encrypted=false atau disabled pada disk/volume.", "warning", ~r/encrypt(?:ed|ion)?\s*=\s*(?:false|disabled)/i},
    "missing_tags" => {"Resource tanpa tag wajib", "tags = {} atau blok tags kosong.", "warning", ~r/tags\s*=\s*\{\s*\}/},
    "iam_wildcard" => {"IAM wildcard Action/Resource", ~s{Tanda ("*") pada policy IAM.}, "warning", ~r/(?:action|resource)\s*[:=]\s*\[?["']\*["']/},
    "secret_in_tfvars" => {"Secret plaintext di tfvars", "password/api_key/secret berisi nilai non-placeholder.", "blocker", ~r/(?:password|api_key|secret|token)\s*=\s*"(?!(<|\$|REPLACE|your|xxx))[^"]+"/i},
    "vm_count_zero" => {"app_vm_count = 0", "Jumlah instance yang direncanakan 0.", "info", ~r/app_vm_count\s*=\s*0\b/},
    "db_no_backup" => {"Database tanpa backup", "backup_enabled=false / disable_backup=true.", "warning", ~r/(?:backup_enabled\s*=\s*false|disable_backup\s*=\s*true)/i},
    "provider_image_outdated" => {"Provider image outdated", "Deteksi image/provider version yang melewati versi minimum.", "warning", ~r/(?:image|provider_version)\s*[=:]\s*["']?(?:0\.|v?1\.[0-9]\b)/i},
    "budget_exceeded" => {"Monthly budget exceeded", "Monthly estimated cost exceeds configured budget.", "blocker", ~r/(?:monthly_cost|estimated_cost)\s*[=:]\s*\$?(?:[1-9][0-9]{3,}|[0-9]{5,})/i},
    "instance_count_exceeded" => {"Instance count threshold exceeded", "Planned instance count exceeds safe threshold.", "warning", ~r/(?:instance_count|app_vm_count)\s*[=:]\s*(?:[1-9][0-9]{1,})\b/i},
    "missing_environment_owner_tags" => {"Missing environment/owner tags", "Resource tags must include environment and owner.", "warning", nil},
    "drift_detected" => {"Configuration drift detected", "Configured values differ from the latest recorded state.", "warning", nil},
    "http_plain" => {"HTTP tanpa TLS", ~s{protocol = "http" / port 80 listener.}, "info", ~r/protocol\s*=\s*"http"|port\s*=\s*80\b/i}
  }

  def assertion_ids, do: @assertions |> Map.keys() |> Enum.sort()

  defp assertion_rule(id), do: @assertions[id]

  @test_templates [
    %{"id" => "tpl-security-baseline", "slug" => "security-baseline", "name" => "Security Baseline",
      "desc" => "Check public CIDR, open SSH/RDP ports, and plaintext secrets", "kind" => "assertion",
      "assertions" => ["cidr_public", "ports_open", "secret_in_tfvars"], "severity" => "blocker",
      "tags" => ["security", "baseline"]},
    %{"id" => "tpl-compliance-storage", "slug" => "compliance-storage", "name" => "Storage & Resource Compliance",
      "desc" => "Check unencrypted volumes and missing required tags", "kind" => "assertion",
      "assertions" => ["unencrypted_volume", "missing_tags"], "severity" => "warning",
      "tags" => ["compliance", "storage"]},
    %{"id" => "tpl-iam-governance", "slug" => "iam-governance", "name" => "IAM Governance",
      "desc" => "Check IAM wildcard permissions", "kind" => "assertion",
      "assertions" => ["iam_wildcard"], "severity" => "warning", "tags" => ["security", "iam", "governance"]},
    %{"id" => "tpl-cost-sanity", "slug" => "cost-sanity", "name" => "Cost Sanity Check",
      "desc" => "Ensure instance counts and budget limits are aligned", "kind" => "assertion",
      "assertions" => ["vm_count_zero", "budget_exceeded"], "severity" => "info", "tags" => ["cost", "sanity"]}
  ]

  def list_templates, do: @test_templates

  # ---------------------------------------------------------------------------
  # CRUD
  # ---------------------------------------------------------------------------

  def list_test_cases(project_id \\ nil, opts \\ []) do
    tag = (opts[:tag] || "") |> String.trim() |> String.downcase()
    environment = (opts[:environment] || "") |> String.trim() |> String.downcase()
    enabled = opts[:enabled]
    kind = (opts[:kind] || "") |> String.trim() |> String.downcase()

    rows = load("test_cases.json", project_id)

    rows =
      if tag != "" do
        Enum.filter(rows, fn row -> tag in Enum.map(List.wrap(row["tags"] || []), &(to_string(&1) |> String.trim() |> String.downcase())) end)
      else
        rows
      end

    rows =
      if environment != "" do
        Enum.filter(rows, fn row ->
          row |> Map.get("parameters") || %{} |> Map.get("env", "") |> to_string() |> String.trim() |> String.downcase() == environment
        end)
      else
        rows
      end

    rows =
      if is_boolean(enabled) do
        Enum.filter(rows, fn row -> !!Map.get(row, "enabled", true) == enabled end)
      else
        rows
      end

    if kind != "" do
      Enum.filter(rows, &(String.trim(String.downcase(to_string(&1["kind"] || ""))) == kind))
    else
      rows
    end
  end

  def get_test_case(test_id, project_id \\ nil) do
    Enum.find(list_test_cases(project_id), &(&1["id"] == test_id))
  end

  def validate_test_definition(data) when is_map(data) do
    name = String.trim(to_string(data["name"] || ""))
    kind = String.trim(to_string(data["kind"] || "assertion"))
    assertions = Enum.map(List.wrap(data["assertions"] || []), &to_string/1)
    tags = Enum.map(List.wrap(data["tags"] || []), &to_string/1)
    parameters = (is_map(data["parameters"]) && data["parameters"]) || %{}

    unknown = assertions -- assertion_ids()

    errors =
      [
        if(name == "", do: "name required"),
        if(kind not in @kinds, do: "kind must be one of #{inspect(@kinds)}"),
        if(unknown != [], do: "unknown assertions: #{Enum.join(unknown, ", ")}"),
        if(kind == "assertion" and assertions == [], do: "assertion kind requires at least one assertion"),
        if(Enum.any?(tags, &(String.trim(&1) == "")), do: "tags must be non-empty strings"),
        if(Enum.any?(Map.keys(parameters), &not is_binary(&1) or String.trim(&1) == ""), do: "parameter keys must be non-empty strings")
      ]
      |> Enum.reject(&is_nil/1)

    %{
      "valid" => errors == [],
      "errors" => errors,
      "assertions" => Enum.filter(assertions, &(&1 in assertion_ids())),
      "kind" => kind,
      "tag_count" => length(tags),
      "parameter_keys" => Map.keys(parameters) |> Enum.map(&to_string/1) |> Enum.sort()
    }
  end

  def create_test_case(data, project_id \\ nil) when is_map(data) do
    name = String.trim(to_string(data["name"] || ""))

    if name == "" do
      raise ArgumentError, message: "name required"
    end

    now = System.system_time(:second)

    tc = %{
      "id" => Ecto.UUID.generate(),
      "project_id" => project_id,
      "description" => String.trim(to_string(data["description"] || "")),
      "parameters" => (is_map(data["parameters"]) && data["parameters"]) || %{},
      "name" => name,
      "stack" => String.trim(to_string(data["stack"] || "")),
      "kind" => String.trim(to_string(data["kind"] || "assertion")),
      "assertions" => Enum.map(List.wrap(data["assertions"] || []), &to_string/1),
      "severity" => String.trim(to_string(data["severity"] || "warning")),
      "enabled" => !!Map.get(data, "enabled", true),
      "tags" => Enum.map(List.wrap(data["tags"] || []), &to_string/1),
      "schedule" => String.trim(to_string(data["schedule"] || "")),
      "created_at" => now,
      "updated_at" => now
    }

    tc = (is_binary(data["command"]) && Map.put(tc, "command", data["command"])) || tc

    if tc["kind"] not in @kinds do
      raise ArgumentError, message: "kind must be one of #{inspect(@kinds)}"
    end

    invalid = tc["assertions"] -- assertion_ids()

    if invalid != [] and tc["kind"] == "assertion" do
      raise ArgumentError, message: "unknown assertions: #{Enum.join(invalid, ", ")}"
    end

    if tc["severity"] not in @severities do
      raise ArgumentError, message: "severity must be one of #{inspect(@severities)}"
    end

    if tc["kind"] == "assertion" and tc["assertions"] == [] do
      raise ArgumentError, message: "assertion kind requires at least one assertion"
    end

    items = list_test_cases(project_id)
    save("test_cases.json", items ++ [tc], project_id)

    save("test_case_versions.json",
      load("test_case_versions.json", project_id) ++
        [%{"version" => 1, "test_id" => tc["id"], "at" => tc["created_at"], "snapshot" => tc}],
      project_id
    )

    tc
  end

  def update_test_case(test_id, patch, project_id \\ nil) when is_map(patch) do
    items = list_test_cases(project_id)
    idx = Enum.find_index(items, &(&1["id"] == test_id))

    if idx == nil do
      nil
    else
      tc = Enum.at(items, idx)

      tc =
        Enum.reduce(["name", "stack", "kind", "severity", "schedule", "description"], tc, fn field, acc ->
          if Map.has_key?(patch, field) do
            v = patch[field]
            Map.put(acc, field, if(is_binary(v), do: String.trim(v), else: v))
          else
            acc
          end
        end)

      tc =
        if Map.has_key?(patch, "parameters") do
          params = patch["parameters"]

          unless is_map(params) do
            raise ArgumentError, message: "parameter keys must be non-empty strings"
          end

          Map.put(tc, "parameters", params)
        else
          tc
        end

      tc =
        if Map.has_key?(patch, "assertions") do
          assertions = Enum.map(List.wrap(patch["assertions"] || []), &to_string/1)
          invalid = assertions -- assertion_ids()

          if invalid != [] do
            raise ArgumentError, message: "unknown assertions: #{Enum.join(invalid, ", ")}"
          end

          Map.put(tc, "assertions", assertions)
        else
          tc
        end

      tc =
        if Map.has_key?(patch, "tags") do
          Map.put(tc, "tags", Enum.map(List.wrap(patch["tags"] || []), &to_string/1))
        else
          tc
        end

      tc =
        if Map.has_key?(patch, "enabled"), do: Map.put(tc, "enabled", !!patch["enabled"]), else: tc

      tc = Map.put(tc, "updated_at", System.system_time(:second))
      items = List.replace_at(items, idx, tc)
      save("test_cases.json", items, project_id)

      versions = load("test_case_versions.json", project_id)
      max_version = Enum.map(versions, &(&1["test_id"] == test_id && (&1["version"] || 0)) || 0) |> Enum.max(fn -> 0 end)
      max_version = max(max_version || 0, 0)

      save(
        "test_case_versions.json",
        versions ++ [%{"version" => max_version + 1, "test_id" => test_id, "at" => tc["updated_at"], "snapshot" => tc}]
        |> Enum.take(-1000),
        project_id
      )

      tc
    end
  end

  def list_test_case_versions(test_id, project_id \\ nil) do
    Enum.filter(load("test_case_versions.json", project_id), &(&1["test_id"] == test_id))
  end

  def rollback_test_case(test_id, version, project_id \\ nil) do
    target = Enum.find(list_test_case_versions(test_id, project_id), &(trunc(&1["version"] || 0) == trunc(version)))

    if target do
      update_test_case(test_id, target["snapshot"] || %{}, project_id)
    else
      nil
    end
  end

  def delete_test_case(test_id, project_id \\ nil) do
    items = list_test_cases(project_id)
    rest = Enum.reject(items, &(&1["id"] == test_id))

    if length(rest) == length(items) do
      false
    else
      save("test_cases.json", rest, project_id)
      true
    end
  end

  def clone_test_case(test_id, project_id \\ nil) do
    source = get_test_case(test_id, project_id)

    if source == nil do
      nil
    else
      now = System.system_time(:second)

      clone =
        source
        |> Map.merge(%{"id" => Ecto.UUID.generate(), "name" => "#{source["name"]} (copy)", "created_at" => now, "updated_at" => now})

      save("test_cases.json", list_test_cases(project_id) ++ [clone], project_id)
      clone
    end
  end

  # ---------------------------------------------------------------------------
  # Run engine
  # ---------------------------------------------------------------------------

  defp stack_texts(project_id, stack) do
    sd = CloudStacks.stack_dir(project_id, stack)

    texts =
      %{}
      |> Map.merge(tfvars_text(sd))
      |> Map.merge(state_text(sd))

    plan =
      CloudStacks.stack_runs(project_id, stack)
      |> Enum.find_value(fn run ->
        case CloudStacks.run_detail(project_id, stack, run["run_id"]) do
          nil -> nil
          detail -> detail["log"] || ""
        end
      end)

    if plan != nil and plan != "" do
      Map.put(texts, "plan", plan)
    else
      texts
    end
  end

  defp tfvars_text(sd) do
    path = Path.join(sd, "terraform.tfvars")
    if File.exists?(path), do: %{"tfvars" => File.read!(path)}, else: %{}
  end

  defp state_text(sd) do
    path = Path.join(sd, "terraform.tfstate")

    if File.exists?(path) do
      case Jason.decode(File.read!(path)) do
        {:ok, st} -> %{"state" => Jason.encode!(st)}
        _ -> %{"state" => ""}
      end
    else
      %{}
    end
  end

  @doc "Run an allowlisted IaC checker with bounded output (Python run_bounded_tool)."
  @spec run_bounded_tool(String.t(), keyword()) :: map()
  def run_bounded_tool(command, opts \\ []) do
    allowed = %{
      "tofu" => ["tofu", "validate"],
      "tflint" => ["tflint"],
      "checkov" => ["checkov", "-d", "."],
      "tfsec" => ["tfsec", "."],
      "ansible-lint" => ["ansible-lint", "."],
      "ansible-syntax" => ["ansible-playbook", "--syntax-check", "site.yml"]
    }

    argv = Map.get(allowed, command)

    if argv == nil do
      raise ArgumentError, message: "unsupported tool"
    end

    if Keyword.get(opts, :mock, false) do
      %{"tool" => command, "status" => "mocked", "returncode" => 0, "output" => "mock provider: no external tool executed"}
    else
      unless System.find_executable(hd(argv)) do
        %{"tool" => command, "status" => "unavailable", "returncode" => nil, "output" => "tool not installed"}
      else
        _timeout = max(1, min(Kernel.trunc(Keyword.get(opts, :timeout_seconds, 30)), 300))
        cwd = Keyword.get(opts, :cwd)

        try do
          {out, code} = System.cmd(hd(argv), tl(argv), cd: cwd, stderr_to_stdout: false, env: %{})

          output =
            (out <> "\n")
            |> String.slice(-10_000, 10_000)

          %{"tool" => command, "status" => if(code == 0, do: "passed", else: "failed"), "returncode" => code, "output" => output}
        catch
          :exit, _ -> %{"tool" => command, "status" => "timeout", "returncode" => nil, "output" => "tool timed out"}
        end
      end
    end
  end

  defp assertion_hit?("missing_environment_owner_tags", text, _params) do
    blocks = Regex.scan(~r/tags\s*=\s*\{([^}]*)\}/i, text, capture: :all_but_first)

    Enum.any?(blocks, fn [block] ->
      keys =
        Regex.scan(~r/["']?([A-Za-z_][\w-]*)["']?\s*=/, block)
        |> Enum.map(&(&1 |> Enum.at(1) |> String.downcase()))

      keys =
        keys ++
          (Regex.scan(~r/["']?([A-Za-z_][\w-]*)["']?\s*:/, block)
           |> Enum.map(&(&1 |> Enum.at(1) |> String.downcase())))

      not MapSet.subset?(MapSet.new(["environment", "owner"]), MapSet.new(keys))
    end)
  end

  defp assertion_hit?("instance_count_exceeded", text, params) do
    threshold = param_number(params, ["max_instances", "instance_count_threshold"], 10)

    values =
      Regex.scan(~r/(?:instance_count|app_vm_count)\s*[=:]\s*['"]?(\d+)/i, text, capture: :all_but_first)
      |> Enum.map(fn [v] -> String.to_integer(v) end)

    Enum.any?(values, &(&1 > threshold))
  end

  defp assertion_hit?("budget_exceeded", text, params) do
    threshold = param_number(params, ["monthly_budget", "budget"], 1000)

    values =
      Regex.scan(~r/(?:monthly_cost|estimated_cost)\s*[=:]\s*["']?[$]?([0-9]+(?:\.[0-9]+)?)/i, text, capture: :all_but_first)
      |> Enum.map(fn [v] -> String.replace(v, ",", "") |> String.to_float() end)

    Enum.any?(values, &(&1 > threshold))
  end

  defp assertion_hit?("provider_image_outdated", text, params) do
    minimum = String.trim(params["minimum_image"] || params["minimum_provider_version"] || "")

    if minimum != "" do
      Regex.match?(~r/(?:image|provider_version)\s*[=:]\s*['"]?([^'"\s,}]+)/i, text) and
        not String.contains?(text, minimum)
    else
      false
    end
  end

  defp assertion_hit?(id, text, _params) do
    case assertion_rule(id) do
      {_name, _desc, _sev, pattern} when pattern != nil -> Regex.match?(pattern, text)
      _ -> false
    end
  end

  defp param_number(params, keys, default) do
    value = Enum.find_value(keys, &params[&1])

    if value in [nil, ""] do
      default
    else
      case Float.parse(to_string(value)) do
        {f, _} -> f
        :error -> default
      end
    end
  end

  defp drift_hit?(texts) do
    config = String.trim(texts["tfvars"] || "")
    state = String.trim(texts["state"] || "")

    if config == "" or state == "" do
      false
    else
      norm = &String.replace(&1, ~r/\s+/, "")
      norm.(config) != norm.(state) and !String.contains?(norm.(state), norm.(config))
    end
  end

  defp run_once(project_id, test_id, timeout_seconds, mock_provider) do
    tc = get_test_case(test_id, project_id)

    cond do
      tc == nil ->
        raise ArgumentError, message: "test case not found"

      Map.get(tc, "enabled", true) != true ->
        raise ArgumentError, message: "test case is disabled"

      tc["stack"] in [nil, ""] ->
        raise ArgumentError, message: "test case has no stack; set stack first"

      true ->
        :ok
    end

    texts = stack_texts(project_id, tc["stack"])
    _ = project_id

    {passed, findings} = evaluate(tc, texts, timeout_seconds, mock_provider, project_id)

    result = %{
      "id" => Ecto.UUID.generate(),
      "run_id" => Ecto.UUID.generate(),
      "execution_id" => nil,
      "execution_log_url" => nil,
      "test_id" => test_id,
      "mock_provider" => mock_provider,
      "timeout_seconds" => timeout_seconds,
      "name" => tc["name"],
      "stack" => tc["stack"],
      "kind" => tc["kind"],
      "severity" => tc["severity"] || "warning",
      "passed" => passed,
      "findings" => findings,
      "ran_at" => System.system_time(:second),
      "project_id" => project_id,
      "status" => if(passed, do: "passed", else: "failed")
    }

    history = load("test_results.json", project_id) ++ [result]
    save("test_results.json", Enum.take(history, -500), project_id)
    result
  end

  defp evaluate(tc, texts, timeout_seconds, mock_provider, project_id) do
    case tc["kind"] do
      "assertion" ->
        {mapped, {passed, _findings}} =
          Enum.map_reduce(List.wrap(tc["assertions"] || []), {true, []}, fn aid, {p, f} ->
            rule = assertion_rule(aid)

            if rule == nil do
              {nil, {p, f}}
            else
              hit =
                cond do
                  aid == "drift_detected" -> if(drift_hit?(texts), do: "state", else: nil)
                  true ->
                    Enum.find_value(["tfvars", "plan", "state"], fn src ->
                      if is_binary(texts[src]) and texts[src] != "" and assertion_hit?(aid, texts[src], tc["parameters"] || %{}) do
                        src
                      else
                        nil
                      end
                    end)
                end

              if hit do
                finding =
                  %{"assertion" => aid, "name" => elem(rule, 0), "severity" => elem(rule, 2), "source" => hit, "detail" => elem(rule, 1)}

                {finding, {false, f ++ [finding]}}
              else
                {nil, {p, f}}
              end
            end
          end)

        {passed, mapped |> Enum.reject(&is_nil/1)}

      kind when kind in ["tofu_validate", "ansible_validate", "iac_scan"] ->
        run_tool_kind(kind, tc, project_id, timeout_seconds, mock_provider)

      "tofu_test" ->
        finding = %{"assertion" => "tofu_test", "name" => "OpenTofu .tftest.hcl", "severity" => "info", "source" => "plan", "detail" => "Jalankan 'tofu test' via worker (dll)."}

        {true, [finding]}

      _ ->
        finding = %{"assertion" => "smoke", "name" => "Smoke check", "severity" => "info", "source" => "state", "detail" => "Cek konektivitas resource hasil apply."}

        {true, [finding]}
    end
  end

  defp run_tool_kind(kind, tc, project_id, timeout_seconds, mock_provider) do
    sd = CloudStacks.stack_dir(project_id, tc["stack"])

    tools =
      case kind do
        "tofu_validate" -> [{"tofu", "tofu validate"}]
        "ansible_validate" -> [{"ansible-lint", "ansible-lint"}, {"ansible-syntax", "ansible-playbook --syntax-check"}]
        "iac_scan" -> [{"checkov", "checkov"}, {"tfsec", "tfsec"}]
      end

    results =
      Enum.map(tools, fn {tool, label} ->
        res = run_bounded_tool(tool, cwd: sd, timeout_seconds: timeout_seconds, mock: mock_provider)
        {tool, label, res}
      end)

    passed = Enum.all?(results, fn {_t, _l, res} -> res["status"] in ["passed", "mocked"] end)

    detail =
      case results do
        [{_t, _l, res}] -> res["output"]
        multiple -> Map.new(multiple, fn {t, _l, res} -> {t, res["output"]} end)
      end

    tool_status =
      case results do
        [{_t, _l, res}] -> res["status"]
        multiple -> Map.new(multiple, fn {t, _l, res} -> {t, res["status"]} end)
      end

    name = Enum.map_join(results, " + ", fn {_t, l, _r} -> l end)

    finding = %{
      "assertion" => kind,
      "name" => name,
      "severity" => if(passed, do: "info", else: "blocker"),
      "source" => "tool",
      "detail" => detail,
      "tool_status" => tool_status
    }

    {passed, [finding]}
  end

  @doc "Run one test case (assertion kinds evaluate locally)."
  @spec run_test_case(String.t() | nil, String.t(), keyword()) :: map()
  def run_test_case(project_id, test_id, opts \\ []) do
    timeout_seconds = Keyword.get(opts, :timeout_seconds, 30)
    run_once(project_id, test_id, timeout_seconds, Keyword.get(opts, :mock_provider, false))
  end

  @doc "Queue a tofu test run via the worker (UC206-adjacent)."
  @spec run_tofu_test(String.t() | nil, String.t()) :: map()
  def run_tofu_test(project_id, test_id) do
    tc = get_test_case(test_id, project_id)

    cond do
      tc == nil ->
        raise ArgumentError, message: "test case not found"

      Map.get(tc, "enabled", true) != true ->
        raise ArgumentError, message: "test case is disabled"

      tc["stack"] in [nil, ""] ->
        raise ArgumentError, message: "test case has no stack; set stack first"

      not File.dir?(CloudStacks.stack_dir(project_id, tc["stack"])) ->
        raise ArgumentError, message: "stack '#{tc["stack"]}' not found; create the stack first"

      true ->
        eid =
          CloudStacks.create_execution(project_id, tc["stack"], "test",
            triggered_by: "test:#{tc["name"] || ""}"
          )

        result = %{
          "id" => Ecto.UUID.generate(),
          "test_id" => test_id,
          "name" => tc["name"],
          "stack" => tc["stack"],
          "kind" => "tofu_test",
          "severity" => tc["severity"] || "warning",
          "passed" => false,
          "queued" => true,
          "status" => "queued",
          "execution_id" => eid,
          "execution_log_url" => "/api/executions/#{eid}/logs",
          "run_id" => eid,
          "findings" => [
            %{"assertion" => "tofu_test", "name" => "OpenTofu .tftest.hcl", "severity" => "info", "source" => "plan", "detail" => "tofu test queued (execution #{eid})."}
          ],
          "ran_at" => System.system_time(:second),
          "project_id" => project_id
        }

        history = load("test_results.json", project_id) ++ [result]
        save("test_results.json", Enum.take(history, -500), project_id)
        result
    end
  end

  @doc "Run all enabled cases (optionally for one stack) — UC191."
  @spec run_all_tests(String.t() | nil, String.t()) :: map()
  def run_all_tests(project_id, stack \\ "") do
    selected =
      Enum.filter(list_test_cases(project_id), fn tc ->
        Map.get(tc, "enabled", true) and (stack == "" or tc["stack"] == stack)
      end)

    {results, errors} =
      Enum.map_reduce(selected, [], fn tc, errors ->
        try do
          {[run_test_case(project_id, tc["id"])], errors}
        rescue
          e -> {[], errors ++ [%{"test_id" => tc["id"], "error" => String.slice(Exception.message(e), 0, 500)}]}
        end
      end)

    results = List.flatten(results)
    %{"results" => results, "errors" => errors, "count" => length(results), "concurrency" => 1}
  end

  @doc "Latest-first run results (Python list_test_results)."
  @spec list_test_results(integer(), String.t() | nil, String.t() | nil) :: [map()]
  def list_test_results(limit \\ 100, project_id \\ nil, test_id \\ nil) do
    rows = load("test_results.json", project_id)
    rows = if test_id, do: Enum.filter(rows, &(&1["test_id"] == test_id)), else: rows
    rows |> Enum.take(-limit) |> Enum.reverse()
  end

  @doc """
  Compliance score: latest result per test id, blocker −30 / warning −10 /
  info −2, clamped 0–100 with A–F grading (UC202).
  """
  @spec score(String.t(), String.t()) :: map()
  def score(project_id, stack \\ "") do
    cases =
      if stack == "" do
        list_test_cases(project_id)
      else
        Enum.filter(list_test_cases(project_id), &(&1["stack"] == stack))
      end

    target_map = Map.new(cases, &{&1["id"], &1})

    latest_by_test =
      list_test_results(5000, project_id)
      |> Enum.reverse()
      |> Enum.reverse()
      |> Enum.reduce(%{}, fn res, acc ->
        Map.put_new(acc, res["test_id"], res)
      end)

    {passed_count, b_count, w_count, i_count} =
      latest_by_test
      |> Enum.reduce({0, 0, 0, 0}, fn {tid, res}, {p, b, w, i} ->
        if res["passed"] do
          {p + 1, b, w, i}
        else
          severity =
            String.downcase(to_string(res["severity"] || (target_map[tid] || %{})["severity"] || "warning"))

          case severity do
            "blocker" -> {p, b + 1, w, i}
            "info" -> {p, b, w, i + 1}
            _ -> {p, b, w + 1, i}
          end
        end
      end)

    total = passed_count + b_count + w_count + i_count
    deductions = b_count * 30 + w_count * 10 + i_count * 2
    raw = 100 - deductions
    score = max(0, min(100, raw))

    grade =
      cond do
        score >= 90 -> "A"
        score >= 80 -> "B"
        score >= 70 -> "C"
        score >= 60 -> "D"
        true -> "F"
      end

    %{
      "project_id" => project_id,
      "stack" => stack,
      "score" => score,
      "grade" => grade,
      "total_tests" => total,
      "passed_tests" => passed_count,
      "failed_tests" => b_count + w_count + i_count,
      "deductions" => %{"blocker" => b_count * 30, "warning" => w_count * 10, "info" => i_count * 2},
      "timestamp" => System.system_time(:second)
    }
  end
end
