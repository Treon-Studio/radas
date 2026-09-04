defmodule RadasAI.CloudProviders do
  @moduledoc """
  Port of `services/cloud_providers/` — the provider adapter registry.

  The adapter definitions (catalog entries, per-provider tfvars order,
  secret keys, platform_override whitelists and the wizard field schemas)
  are exported verbatim from the Python adapters into
  `priv/provider_schemas/providers.json` (same source tree, so the wizard
  and rendering stay byte-compatible during the Strangler Fig cutover).
  Rendering behavior ports `base.py::sanitize_values` +
  `cloud_provisioning.py::_render_tfvars/_render_value/_hcl_quote`.
  """

  # ---------------------------------------------------------------------------
  # Registry (loaded from the exported adapter definitions)
  # ---------------------------------------------------------------------------

  path = Path.join(:code.priv_dir(:radas), "provider_schemas/providers.json")

  @raw (case File.read(path) do
          {:ok, binary} -> Jason.decode!(binary)
          _ -> %{"adapters" => %{}, "catalog" => [], "all_secret_keys" => [], "default_provider" => "bytedc"}
        end)

  @adapters @raw["adapters"]
  @catalog @raw["catalog"]
  @all_secret_keys @raw["all_secret_keys"]
  @default_provider @raw["default_provider"]

  defp adapter(provider), do: Map.get(@adapters, provider)

  @doc "Default provider id (Python default_provider)."
  @spec default_provider() :: String.t()
  def default_provider, do: @default_provider

  @doc "Catalog entries for the wizard picker (Python catalog())."
  @spec catalog() :: [map()]
  def catalog, do: @catalog

  @doc "Per-provider wizard field schemas (Python schemas())."
  @spec schemas() :: %{String.t() => map()}
  def schemas do
    Map.new(@adapters, fn {id, a} -> {id, a["schema"]} end)
  end

  @doc "One provider's wizard schema (Python adapter.schema)."
  @spec schema(String.t()) :: map() | nil
  def schema(provider), do: (adapter(provider) || %{})["schema"]

  @doc "Union of every provider's secret keys (Python all_secret_keys)."
  @spec all_secret_keys() :: [String.t()]
  def all_secret_keys, do: @all_secret_keys

  @doc "Provider's secret keys (never rendered into terraform.tfvars)."
  @spec secret_keys_for(String.t()) :: [String.t()]
  def secret_keys_for(provider), do: (adapter(provider) || %{})["secret_keys"] || []

  @doc "Whether a provider id has a full adapter (IaC + schema + rendering)."
  @spec known?(String.t()) :: boolean()
  def known?(provider), do: Map.has_key?(@adapters, provider)

  @doc "Whether the provider can build inventory from tfstate."
  @spec builds_inventory?(String.t()) :: boolean()
  def builds_inventory?(provider), do: (adapter(provider) || %{})["full_inventory"] == true

  # ---------------------------------------------------------------------------
  # bytedc reuse toggles (Python _NET_REUSE_KEYS / _apply_reuse_toggles /
  # _validate_network_reuse) — applied on every create/update write.
  # ---------------------------------------------------------------------------

  @net_reuse_keys ~w(
    existing_vpc_id
    existing_public_subnet_id existing_app_subnet_id existing_data_subnet_id
    existing_public_ipv4_subnet_id existing_app_ipv4_subnet_id existing_data_ipv4_subnet_id
    existing_app_sg_id existing_data_sg_id
  )

  @nat_reuse_keys ~w(
    existing_nat_gateway_id create_nat_in_existing_vpc
    manage_existing_nat_snat_rules nat_floating_ip_id
  )

  @doc "Clear reuse fields when their master toggle is off (bytedc only)."
  @spec apply_reuse_toggles(String.t(), map()) :: map()
  def apply_reuse_toggles(provider, values) when provider == "bytedc" and is_map(values) do
    values =
      if values["use_existing_network"] do
        values
      else
        Enum.reduce(@net_reuse_keys, values, &Map.put(&2, &1, ""))
      end

    if values["use_existing_nat"] do
      values
    else
      Enum.reduce(@nat_reuse_keys, values, fn
        k, acc when k in ["create_nat_in_existing_vpc", "manage_existing_nat_snat_rules"] -> Map.put(acc, k, false)
        k, acc -> Map.put(acc, k, "")
      end)
    end
  end

  def apply_reuse_toggles(_, values), do: values

  @doc "Validate network-reuse consistency (bytedc only). Returns error text or nil."
  @spec validate_network_reuse(String.t(), map()) :: String.t() | nil
  def validate_network_reuse(provider, values) when provider == "bytedc" and is_map(values) do
    unless values["use_existing_network"] do
      nil
    else
      vpc = String.trim(values["existing_vpc_id"] || "")

      if vpc == "" do
        "Reuse existing VPC is enabled — please provide 'Existing VPC ID' (or turn the toggle off)."
      else
        missing =
          Enum.filter(
            ~w(existing_public_subnet_id existing_app_subnet_id existing_data_subnet_id),
            &(String.trim(values[&1] || "") == "")
          )

        if missing != [] do
          "When reusing an existing VPC, you must also provide: " <>
            Enum.join(missing, ", ") <>
            ". Otherwise new subnets will be created inside the existing VPC and may collide with your CIDRs."
        else
          elb_check =
            if values["enable_elb"] do
              missing_v4 =
                Enum.filter(
                  ~w(existing_public_ipv4_subnet_id existing_app_ipv4_subnet_id),
                  &(String.trim(values[&1] || "") == "")
                )

              if missing_v4 != [] do
                "ELB is enabled while reusing an existing VPC — also fill: " <>
                  Enum.join(missing_v4, ", ") <>
                  " (neutron IPv4 subnet IDs from the ByteDC console)."
              else
                nil
              end
            else
              nil
            end

          elb_check || nat_check(values)
        end
      end
    end
  end

  def validate_network_reuse(_, _), do: nil

  defp nat_check(values) do
    if values["use_existing_nat"] and values["enable_nat"] and
         String.trim(values["existing_nat_gateway_id"] || "") != "" and
         values["manage_existing_nat_snat_rules"] and
         String.trim(values["nat_floating_ip_id"] || "") == "" do
      "To manage SNAT rules on an existing NAT gateway, provide NAT EIP ID as well."
    else
      nil
    end
  end

  # ---------------------------------------------------------------------------
  # Values sanitizing + HCL rendering (base.py + cloud_provisioning.py ports)
  # ---------------------------------------------------------------------------

  @doc "Sanitize values for a provider (platform_overrides key filtering)."
  @spec sanitize_values(String.t(), map()) :: map()
  def sanitize_values(provider, values) when is_map(values) do
    allowed = MapSet.new((adapter(provider) || %{})["platform_override_keys"] || [])
    po = values["platform_overrides"]

    if is_map(po) do
      clean =
        Enum.reduce(po, %{}, fn {role, override}, acc ->
          if is_map(override) do
            clean_override =
              Enum.filter(override, fn {k, v} ->
                MapSet.member?(allowed, to_string(k)) and v not in [nil, ""]
              end)
              |> Map.new()

            Map.put(acc, role, clean_override)
          else
            acc
          end
        end)

      Map.put(values, "platform_overrides", clean)
    else
      values
    end
  end

  def sanitize_values(_, values), do: values

  @doc """
  Render terraform.tfvars content for a provider — values filtered to the
  provider's tfvars order, empty values skipped, HCL-escaped.
  """
  @spec render_tfvars(String.t(), map()) :: String.t()
  def render_tfvars(provider, values) do
    order = (adapter(provider) || %{})["tfvars_order"] || []
    values = sanitize_values(provider, values)

    ordered_keys =
      if order != [] do
        Enum.filter(order, &Map.has_key?(values, &1))
      else
        Enum.sort(Map.keys(values))
      end

    lines =
      ["# Cloud Provisioning UI — edit via the web UI.", ""] ++
        for key <- ordered_keys do
          v = values[key]

          if v in [nil, "", %{}, []] do
            nil
          else
            "#{key} = #{render_value(v)}"
          end
        end
        |> Enum.reject(&is_nil/1)

    Enum.join(lines, "\n") <> "\n"
  end

  @doc "HCL value rendering (port of _render_value)."
  @spec render_value(term()) :: String.t()
  def render_value(v) when is_boolean(v), do: if(v, do: "true", else: "false")
  def render_value(v) when is_integer(v) or is_float(v), do: to_string(v)

  def render_value(v) when is_list(v) do
    "[" <> Enum.map_join(v, ", ", &render_value/1) <> "]"
  end

  def render_value(v) when is_map(v) do
    parts = Enum.map(v, fn {k, val} -> "  #{hcl_quote(to_string(k))} = #{render_value(val)}" end)
    "{\n" <> Enum.join(parts, "\n") <> "\n}"
  end

  def render_value(v), do: hcl_quote(v)

  defp hcl_quote(s) do
    escaped =
      to_string(s)
      |> String.replace("\\", "\\\\")
      |> String.replace("\"", "\\\"")

    "\"" <> escaped <> "\""
  end
end
