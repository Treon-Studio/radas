defmodule RadasAI.CostStore do
  @moduledoc """
  Port of `storage/cost_store.py` — cost analysis storage: pricing catalogs
  and estimate history.

  Pricing catalogs are global per provider, persisted as JSON files under
  `DATA_DIR/cost/pricing/` (same files Flask reads/writes). Estimates and
  reports live in the shared `kv_store` table, scoped per project.
  """

  import RadasAI.DB

  alias RadasAI.KV

  @supported_providers ["aws", "eks", "gcp", "gke", "azure", "hetzner", "cloudflare", "bytedc", "kubernetes"]
  @hpm 730.0

  def supported_providers, do: @supported_providers

  defp data_dir, do: System.get_env("DATA_DIR") || Path.join(File.cwd!(), "data")
  defp pricing_dir, do: Path.join([data_dir(), "cost", "pricing"])
  defp pricing_file(provider), do: Path.join(pricing_dir(), "#{provider}.json")
  defp history_file(provider), do: Path.join(pricing_dir(), "#{provider}.history.json")

  defp safe_scope_part(project_id) do
    kept = project_id |> String.graphemes() |> Enum.filter(&(Regex.match?(~r/[a-zA-Z0-9\-_]/, &1)))
    case kept do
      [] -> "default"
      chars -> Enum.join(chars)
    end
  end

  # ---------------------------------------------------------------------------
  # Default pricing seeds (USD)
  # ---------------------------------------------------------------------------

  defp default_catalog(provider) do
    base = %{
      "provider" => provider,
      "currency" => "USD",
      "version" => 1,
      "effective_date" => effective_today(),
      "updated_at" => now(),
      "compute" => %{
        "vcpu_hour" => 0.025,
        "ram_gb_hour" => 0.005,
        "gpu_hour" => 1.20,
        "instance_templates" => [
          %{"name" => "small", "vcpu" => 2, "ram_gb" => 4, "monthly" => 25},
          %{"name" => "medium", "vcpu" => 4, "ram_gb" => 8, "monthly" => 50},
          %{"name" => "large", "vcpu" => 8, "ram_gb" => 16, "monthly" => 110}
        ]
      },
      "storage" => %{
        "ssd_gb_month" => 0.10,
        "hdd_gb_month" => 0.04,
        "object_gb_month" => 0.023,
        "snapshot_gb_month" => 0.05
      },
      "network" => %{
        "public_ip_month" => 3.50,
        "bandwidth_gb" => 0.09,
        "nat_gateway_hour" => 0.045,
        "load_balancer_hour" => 0.025,
        "vpn_gateway_month" => 36.00
      },
      "managed" => %{
        "kubernetes_cluster_month" => 73.00,
        "database_instance_month" => 60.00,
        "dns_zone_month" => 0.50,
        "cdn_gb" => 0.085,
        "waf_month" => 20.00
      }
    }

    overrides = %{
      "bytedc" => %{"compute" => %{"vcpu_hour" => 0.018, "ram_gb_hour" => 0.004}},
      "hetzner" => %{"compute" => %{"vcpu_hour" => 0.016, "ram_gb_hour" => 0.005}, "network" => %{"public_ip_month" => 1.19, "bandwidth_gb" => 0.00}},
      "aws" => %{"network" => %{"public_ip_month" => 3.65}},
      "eks" => %{"managed" => %{"kubernetes_cluster_month" => 73.0}, "network" => %{"public_ip_month" => 3.65}},
      "gcp" => %{"compute" => %{"vcpu_hour" => 0.031, "ram_gb_hour" => 0.004}, "network" => %{"public_ip_month" => 2.92}},
      "gke" => %{"managed" => %{"kubernetes_cluster_month" => 73.0}, "compute" => %{"vcpu_hour" => 0.031, "ram_gb_hour" => 0.004}},
      "azure" => %{"managed" => %{"kubernetes_cluster_month" => 75.0}},
      "cloudflare" => %{"network" => %{"bandwidth_gb" => 0.00}, "managed" => %{"waf_month" => 25.0}},
      "kubernetes" => %{"compute" => %{"vcpu_hour" => 0.010, "ram_gb_hour" => 0.002}, "managed" => %{"kubernetes_cluster_month" => 0.0}}
    }

    case Map.get(overrides, provider) do
      nil ->
        base

      o ->
        Enum.reduce(o, base, fn {cat, vals}, acc ->
          Map.update!(acc, cat, &Map.merge(&1, vals))
        end)
    end
  end

  defp effective_today do
    Date.utc_today() |> Date.to_iso8601()
  end

  # ---------------------------------------------------------------------------
  # Pricing CRUD
  # ---------------------------------------------------------------------------

  @doc "Read one provider catalog, seeding defaults on first access."
  @spec get_pricing(String.t()) :: {:ok, map()} | {:error, String.t()}
  def get_pricing(provider) do
    provider = String.downcase(provider)

    if provider not in @supported_providers do
      {:error, "Unsupported provider: #{provider}"}
    else
      file = pricing_file(provider)

      if File.exists?(file) do
        case File.read(file) do
          {:ok, binary} ->
            case Jason.decode(binary) do
              {:ok, catalog} -> {:ok, catalog}
              _ -> {:ok, default_catalog(provider)}
            end

          _ ->
            {:ok, default_catalog(provider)}
        end
      else
        cat = default_catalog(provider)
        {:ok, _} = save_pricing(provider, cat, record_history: false)
        {:ok, cat}
      end
    end
  end

  @spec list_pricing() :: [map()]
  def list_pricing do
    Enum.map(@supported_providers, fn p ->
      {:ok, cat} = get_pricing(p)
      cat
    end)
  end

  @doc "Persist a catalog; bumps version and appends history when record_history."
  @spec save_pricing(String.t(), map(), keyword()) :: {:ok, map()} | {:error, String.t()}
  def save_pricing(provider, catalog, opts \\ []) do
    provider = String.downcase(provider)

    if provider not in @supported_providers do
      {:error, "Unsupported provider: #{provider}"}
    else
      record_history = Keyword.get(opts, :record_history, true)
      file = pricing_file(provider)
      prev = read_json(file)

      catalog =
        catalog
        |> Map.put("provider", provider)
        |> Map.put_new("currency", "USD")
        |> Map.put(
          "version",
          if(record_history,
            do: (get_in(prev || %{}, ["version"]) || 0) + 1,
            else: catalog["version"] || 1
          )
        )
        |> Map.put("updated_at", now())
        |> Map.put_new("effective_date", effective_today())

      File.mkdir_p!(Path.dirname(file))
      File.write!(file, Jason.encode!(catalog, pretty: true))

      if record_history and prev do
        history = read_json(history_file(provider)) || []
        entry = %{"version" => prev["version"] || 1, "saved_at" => prev["updated_at"], "catalog" => prev}
        history = Enum.take(history ++ [entry], -50)
        File.mkdir_p!(Path.dirname(history_file(provider)))
        File.write!(history_file(provider), Jason.encode!(history, pretty: true))
      end

      {:ok, catalog}
    end
  end

  @spec get_pricing_history(String.t()) :: [map()]
  def get_pricing_history(provider) do
    read_json(history_file(String.downcase(provider))) || []
  end

  defp read_json(path) do
    case File.read(path) do
      {:ok, binary} ->
        case Jason.decode(binary) do
          {:ok, decoded} -> decoded
          _ -> nil
        end

      _ ->
        nil
    end
  end

  # ---------------------------------------------------------------------------
  # Estimate engine
  # ---------------------------------------------------------------------------

  @doc "Compute monthly/yearly cost for a flat resource list (port of estimate_cost)."
  @spec estimate_cost(String.t(), [map()]) :: {:ok, map()} | {:error, String.t()}
  def estimate_cost(provider, resources) do
    case get_pricing(provider) do
      {:error, msg} ->
        {:error, msg}

      {:ok, cat} ->
        {line_items_rev, warnings, total} =
          Enum.reduce(resources || [], {[], [], 0.0}, fn r, {items, warns, total} ->
            price_one(r, cat, items, warns, total)
          end)

        line_items = Enum.reverse(line_items_rev)
        insights = build_insights(line_items)

        {:ok,
         %{
           "provider" => provider,
           "currency" => cat["currency"] || "USD",
           "monthly_total" => round2(total),
           "yearly_total" => round2(total * 12),
           "one_time_total" => 0.0,
           "line_items" => line_items,
           "warnings" => Enum.reverse(warnings),
           "insights" => insights,
           "computed_at" => now()
         }}
    end
  end

  defp price_one(r, cat, items, warns, total) do
    kind = String.trim(String.downcase(to_string(Map.get(r, "kind") || "")))
    qty = to_float(Map.get(r, "quantity"), 1.0)
    hours = to_float(Map.get(r, "hours_per_month"), @hpm)
    name = Map.get(r, "name") || kind

    compute = cat["compute"] || %{}
    storage = cat["storage"] || %{}
    network = cat["network"] || %{}
    managed = cat["managed"] || %{}

    case kind do
      "instance" ->
        vcpu = to_float(Map.get(r, "vcpu"), 0.0)
        ram = to_float(Map.get(r, "ram_gb"), 0.0)
        unit_price = vcpu * to_float(compute["vcpu_hour"], 0.0) + ram * to_float(compute["ram_gb_hour"], 0.0)
        monthly = unit_price * hours * qty

        warns =
          if vcpu >= 16 or ram >= 64 do
            ["Resource '#{name}' looks overprovisioned (vCPU=#{vcpu}, RAM=#{ram}GB)" | warns]
          else
            warns
          end

        emit(items, warns, total, kind, name, qty, "hour", unit_price, monthly)

      "gpu" ->
        monthly = to_float(compute["gpu_hour"], 0.0) * hours * qty
        emit(items, warns, total, kind, name, qty, "hour", to_float(compute["gpu_hour"], 0.0), monthly)

      _size_kind when kind in ["ssd", "hdd", "object_storage", "snapshot"] ->
        size = to_float(Map.get(r, "size_gb"), 0.0)
        key = %{ssd: "ssd_gb_month", hdd: "hdd_gb_month", object_storage: "object_gb_month", snapshot: "snapshot_gb_month"}[String.to_existing_atom(kind)]
        unit_price = to_float(storage[key], 0.0)
        monthly = size * unit_price * qty
        emit(items, warns, total, kind, name, qty, "GB-month", unit_price, monthly)

      "public_ip" ->
        unit_price = to_float(network["public_ip_month"], 0.0)
        emit(items, warns, total, kind, name, qty, "month", unit_price, unit_price * qty)

      "bandwidth" ->
        gb = to_float(Map.get(r, "bandwidth_gb") || Map.get(r, "size_gb"), 0.0)
        unit_price = to_float(network["bandwidth_gb"], 0.0)
        emit(items, warns, total, kind, name, qty, "GB", unit_price, gb * unit_price * qty)

      "nat_gateway" ->
        unit_price = to_float(network["nat_gateway_hour"], 0.0)
        emit(items, warns, total, kind, name, qty, "hour", unit_price, unit_price * hours * qty)

      "load_balancer" ->
        unit_price = to_float(network["load_balancer_hour"], 0.0)
        emit(items, warns, total, kind, name, qty, "hour", unit_price, unit_price * hours * qty)

      "vpn_gateway" ->
        unit_price = to_float(network["vpn_gateway_month"], 0.0)
        emit(items, warns, total, kind, name, qty, "month", unit_price, unit_price * qty)

      "kubernetes_cluster" ->
        unit_price = to_float(managed["kubernetes_cluster_month"], 0.0)
        emit(items, warns, total, kind, name, qty, "month", unit_price, unit_price * qty)

      "database" ->
        unit_price = to_float(managed["database_instance_month"], 0.0)
        emit(items, warns, total, kind, name, qty, "month", unit_price, unit_price * qty)

      "dns_zone" ->
        unit_price = to_float(managed["dns_zone_month"], 0.0)
        emit(items, warns, total, kind, name, qty, "month", unit_price, unit_price * qty)

      "cdn" ->
        gb = to_float(Map.get(r, "bandwidth_gb") || Map.get(r, "size_gb"), 0.0)
        unit_price = to_float(managed["cdn_gb"], 0.0)
        emit(items, warns, total, kind, name, qty, "GB", unit_price, gb * unit_price * qty)

      "waf" ->
        unit_price = to_float(managed["waf_month"], 0.0)
        emit(items, warns, total, kind, name, qty, "month", unit_price, unit_price * qty)

      _ ->
        {items, ["Unknown resource kind '#{kind}' — skipped" | warns], total}
    end
  rescue
    ArgumentError -> {items, ["Unknown resource kind — skipped" | warns], total}
  end

  defp emit(items, warns, total, kind, name, qty, unit, unit_price, monthly) do
    item = %{
      "kind" => kind,
      "name" => name,
      "quantity" => qty,
      "unit" => unit,
      "unit_price" => round6(unit_price),
      "monthly" => round2(monthly),
      "yearly" => round2(monthly * 12)
    }

    {[item | items], warns, total + monthly}
  end

  defp build_insights(line_items) do
    lb_count = Enum.count(line_items, &(&1["kind"] == "load_balancer"))

    instance_count =
      line_items |> Enum.filter(&(&1["kind"] == "instance")) |> Enum.map(& &1["quantity"]) |> Enum.sum()

    insights = []

    insights =
      if instance_count >= 2 and lb_count == 0,
        do: ["Multiple compute instances without a load balancer — consider HA." | insights],
        else: insights

    insights =
      if instance_count == 1,
        do: ["Single compute instance is a potential single point of failure." | insights],
        else: insights

    has_ip = Enum.any?(line_items, &(&1["kind"] == "public_ip"))
    has_nat = Enum.any?(line_items, &(&1["kind"] == "nat_gateway"))

    insights =
      if has_ip and not has_nat,
        do: ["Public IPs detected without NAT gateway — verify egress topology." | insights],
        else: insights

    Enum.reverse(insights)
  end

  # ---------------------------------------------------------------------------
  # Estimate persistence (kv-scoped per project)
  # ---------------------------------------------------------------------------

  defp est_scope(project_id), do: "cost_estimates:#{safe_scope_part(project_id)}"

  @doc "list_estimates that propagates storage failures (budget checks use this)."
  @spec list_estimates_strict(String.t()) :: [map()] | map()
  def list_estimates_strict(project_id), do: KV.load(est_scope(project_id))

  @doc "Read-side variant that falls back to [] on storage failure."
  @spec list_estimates(String.t()) :: [map()]
  def list_estimates(project_id) do
    list_estimates_strict(project_id)
  rescue
    _ -> []
  end

  @doc "Insert one estimate (newest first, capped at 100)."
  @spec save_estimate(String.t(), map()) :: map()
  def save_estimate(project_id, payload) do
    items = list_estimates(project_id)

    record =
      Map.merge(Map.new(payload || %{}), %{
        "id" => Ecto.UUID.generate(),
        "created_at" => now()
      })

    KV.save(est_scope(project_id), Enum.take([record | items], 100))
    record
  end

  @doc "Delete one estimate by id; returns whether a row was removed."
  @spec delete_estimate(String.t(), String.t()) :: boolean()
  def delete_estimate(project_id, estimate_id) do
    items = list_estimates(project_id)
    new_items = Enum.reject(items, &(Map.get(&1, "id") == estimate_id))

    if length(new_items) == length(items) do
      false
    else
      KV.save(est_scope(project_id), new_items)
      true
    end
  end

  # ---------------------------------------------------------------------------
  # Flavor → vCPU/RAM map
  # ---------------------------------------------------------------------------

  @flavor_map %{
    "s3.small.1" => {"1", "1"}, "s3.medium.1" => {"1", "4"}, "s3.large.1" => {"2", "2"},
    "s3.large.2" => {"2", "4"}, "s3.large.4" => {"2", "8"}, "s3.xlarge.2" => {"4", "8"},
    "s3.xlarge.4" => {"4", "16"}, "s3.2xlarge.2" => {"8", "16"}, "s3.2xlarge.4" => {"8", "32"},
    "s6.medium.2" => {"1", "2"}, "s6.large.2" => {"2", "4"}, "s6.xlarge.2" => {"4", "8"},
    "s6.2xlarge.2" => {"8", "16"}, "c6.large.2" => {"2", "4"}, "c6.xlarge.2" => {"4", "8"},
    "m6.large.8" => {"2", "16"}
  }

  @doc "Look up vCPU/RAM for a known flavor; defaults to 2/4."
  @spec flavor_specs(String.t() | nil) :: map()
  def flavor_specs(nil), do: %{"vcpu" => 2, "ram_gb" => 4}

  def flavor_specs(flavor_id) do
    f = String.downcase(String.trim(flavor_id))

    case Map.get(@flavor_map, f) do
      {vcpu, ram} ->
        %{"vcpu" => to_float(vcpu, 2.0), "ram_gb" => to_float(ram, 4.0)}

      nil ->
        parts = String.split(f, ".")

        if length(parts) >= 3 do
          size = Enum.at(parts, length(parts) - 2)
          {ratio, _} = Float.parse(Enum.at(parts, length(parts) - 1))

          base_vcpu = %{"small" => 1, "medium" => 1, "large" => 2, "xlarge" => 4, "2xlarge" => 8, "4xlarge" => 16}[size] || 2
          %{"vcpu" => base_vcpu * 1.0, "ram_gb" => base_vcpu * ratio}
        else
          %{"vcpu" => 2, "ram_gb" => 4}
        end
    end
  end

  # ---------------------------------------------------------------------------
  # Inventory → resources
  # ---------------------------------------------------------------------------

  @doc "Convert the VM-inventory shape (vms / eips) into estimate resources."
  @spec resources_from_inventory(map()) :: [map()]
  def resources_from_inventory(inv) do
    vms_out =
      for vm <- inv["vms"] || [] do
        specs = flavor_specs(vm["flavor_id"])

        base = [
          %{
            "kind" => "instance",
            "name" => vm["hostname"] || vm["instance_id"] || "vm",
            "quantity" => 1,
            "vcpu" => specs["vcpu"],
            "ram_gb" => specs["ram_gb"]
          }
        ]

        disk_size = to_float(vm["system_disk_size"], 0.0)

        disks =
          if disk_size > 0 do
            disk_kind =
              if String.starts_with?(String.downcase(to_string(vm["system_disk_type"] || "")), "sata"),
                do: "hdd",
                else: "ssd"

            [
              %{
                "kind" => disk_kind,
                "name" => "#{vm["hostname"] || "vm"}-root",
                "quantity" => 1,
                "size_gb" => disk_size
              }
            ]
          else
            []
          end

        base ++ disks
      end

    out = Enum.concat(vms_out)
    eips = inv["eips"] || []

    if eips != [] do
      out ++ [%{"kind" => "public_ip", "name" => "public-ips", "quantity" => length(eips)}]
    else
      out
    end
  end

  # ---------------------------------------------------------------------------
  # Cost reports (kv-scoped per project, timestamped)
  # ---------------------------------------------------------------------------

  defp reports_scope(project_id), do: "cost_reports:#{safe_scope_part(project_id)}"

  @doc "Persist a timestamped cost report under cost_reports:<project_id>."
  @spec save_report(keyword()) :: map()
  def save_report(opts) do
    project_id = Keyword.fetch!(opts, :project_id)
    provider = Keyword.get(opts, :provider)
    stack = Keyword.get(opts, :stack)
    resources = Keyword.get(opts, :resources) || []
    result = Keyword.get(opts, :result) || %{}

    ts = System.system_time(:second)
    rid = Ecto.UUID.generate()
    safe_stack = safe_scope_part(stack || "stack") |> String.replace("_", "") |> then(fn s -> if s == "", do: "stack", else: s end)
    fname = "#{ts}_#{safe_stack}_#{String.slice(rid, 0, 8)}.json"

    rec = %{
      "id" => rid,
      "filename" => fname,
      "created_at" => ts,
      "provider" => provider,
      "stack" => stack,
      "env" => Keyword.get(opts, :env),
      "cloud_project" => Keyword.get(opts, :cloud_project),
      "source" => Keyword.get(opts, :source, "apply"),
      "run_id" => Keyword.get(opts, :run_id),
      "resources" => resources,
      "result" => result,
      "monthly_total" => result["monthly_total"] || 0,
      "yearly_total" => result["yearly_total"] || 0,
      "currency" => result["currency"] || "USD",
      "resource_count" => length(resources)
    }

    KV.set(reports_scope(project_id), rid, rec)
    rec
  end

  @doc "Slim report list, newest first, optional stack filter, capped at limit."
  @spec list_reports(String.t(), keyword()) :: [map()]
  def list_reports(project_id, opts \\ []) do
    stack = Keyword.get(opts, :stack)
    limit = Keyword.get(opts, :limit, 500)

    recs =
      KV.list(reports_scope(project_id))
      |> Enum.map(& &1["value"])
      |> Enum.sort_by(&(&1["created_at"] || 0), :desc)

    recs
    |> Enum.take(limit)
    |> Enum.filter(&(stack in [nil, ""] or Map.get(&1, "stack") == stack))
    |> Enum.map(fn rec ->
      %{
        "id" => rec["id"],
        "filename" => rec["filename"],
        "created_at" => rec["created_at"],
        "provider" => rec["provider"],
        "stack" => rec["stack"],
        "env" => rec["env"],
        "cloud_project" => rec["cloud_project"],
        "source" => rec["source"],
        "run_id" => rec["run_id"],
        "monthly_total" => rec["monthly_total"],
        "yearly_total" => rec["yearly_total"],
        "currency" => rec["currency"] || "USD",
        "resource_count" => rec["resource_count"] || length(rec["resources"] || [])
      }
    end)
  end

  @spec get_report(String.t(), String.t()) :: map() | nil
  def get_report(project_id, report_id), do: KV.get(reports_scope(project_id), report_id)

  @spec delete_report(String.t(), String.t()) :: boolean()
  def delete_report(project_id, report_id) do
    if KV.get(reports_scope(project_id), report_id) == nil, do: false, else: KV.delete(reports_scope(project_id), report_id)
  end

  # ---------------------------------------------------------------------------
  # OpenTofu/Terraform plan → resource list (extract_from_plan port)
  # ---------------------------------------------------------------------------

  @doc "Parse an OpenTofu/Terraform plan JSON into a normalized resource list."
  @spec extract_from_plan(map()) :: {:ok, [map()]} | {:error, String.t()}
  def extract_from_plan(plan) when is_map(plan) do
    changes =
      plan["resource_changes"] ||
        if is_map(plan["planned_values"]) do
          root = plan["planned_values"]["root_module"] || %{}

          Enum.map(root["resources"] || [], fn r ->
            %{"type" => r["type"], "name" => r["name"], "change" => %{"after" => r["values"] || %{}}}
          end)
        else
          []
        end

    resources =
      Enum.flat_map(changes || [], fn ch ->
        ttype = String.downcase(to_string(ch["type"] || ""))
        name = ch["name"] || ttype
        after_vals = (ch["change"] || %{})["after"] || %{}
        map_after = if is_map(after_vals), do: after_vals, else: %{}

        classify_plan_resource(ttype, name, map_after)
      end)

    {:ok, resources}
  end

  def extract_from_plan(_), do: {:error, "plan is required"}

  defp classify_plan_resource(ttype, name, after_vals) do
    add = fn kind, extra -> [%{"kind" => kind, "name" => name, "quantity" => 1} |> Map.merge(extra || %{})] end

    cond do
      String.contains?(ttype, "instance") or String.ends_with?(ttype, "_vm") or String.ends_with?(ttype, "_server") ->
        vcpu = map_after(after_vals, ["vcpus", "cpu", "cores"], 2)
        ram = after_vals["memory_gb"] || (if is_number(after_vals["memory"]), do: after_vals["memory"] / 1024, else: 4)
        add.("instance", %{"vcpu" => vcpu, "ram_gb" => ram})

      String.contains?(ttype, "kubernetes") or String.ends_with?(ttype, "_cluster") ->
        add.("kubernetes_cluster", nil)

      String.contains?(ttype, "load_balancer") or String.ends_with?(ttype, "_lb") ->
        add.("load_balancer", nil)

      String.contains?(ttype, "nat") ->
        add.("nat_gateway", nil)

      String.contains?(ttype, "vpn") ->
        add.("vpn_gateway", nil)

      String.contains?(ttype, "public_ip") or String.ends_with?(ttype, "_eip") ->
        add.("public_ip", nil)

      String.contains?(ttype, "object") or String.contains?(ttype, "_bucket") or String.contains?(ttype, "_s3_bucket") ->
        add.("object_storage", %{"size_gb" => map_after(after_vals, ["size_gb"], 100)})

      String.contains?(ttype, "volume") or String.contains?(ttype, "disk") ->
        size = after_vals["size"] || after_vals["size_gb"] || 50
        add.("ssd", %{"size_gb" => size})

      String.contains?(ttype, "snapshot") ->
        add.("snapshot", %{"size_gb" => map_after(after_vals, ["size_gb"], 20)})

      String.contains?(ttype, "database") or String.ends_with?(ttype, "_rds_instance") or String.ends_with?(ttype, "_db_instance") ->
        add.("database", nil)

      String.contains?(ttype, "dns_zone") or String.ends_with?(ttype, "_zone") ->
        add.("dns_zone", nil)

      String.contains?(ttype, "cdn") or String.contains?(ttype, "cloudfront") ->
        add.("cdn", %{"bandwidth_gb" => map_after(after_vals, ["bandwidth_gb"], 100)})

      String.contains?(ttype, "waf") ->
        add.("waf", nil)

      true ->
        []
    end
  end

  defp map_after(after_vals, keys, default) do
    Enum.find_value(keys, default, fn k ->
      v = after_vals[k]
      if v in [nil, ""], do: nil, else: v
    end)
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp to_float(nil, default), do: default
  defp to_float(v, _default) when is_float(v), do: v
  defp to_float(v, _default) when is_integer(v), do: v * 1.0

  defp to_float(v, default) when is_binary(v) do
    case Float.parse(v) do
      {f, _} -> f
      :error -> default
    end
  end

  defp to_float(_, default), do: default

  defp round2(v), do: Float.round(v * 1.0, 2)
  defp round6(v), do: Float.round(v * 1.0, 6)
end
