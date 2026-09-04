defmodule RadasAI.CloudProviders do
  @moduledoc """
  Port of `services/cloud_providers/__init__.py` + `base.py` — the provider
  adapter registry contract. The **bytedc** adapter is fully ported (default
  provider); the other 11 adapters expose catalog entries with a generic
  tfvars fallback until individually ported (each has a bespoke schema).

  `sanitize_values/2` drops stale/foreign keys from platform_overrides so a
  stack edited under a different provider schema can't produce invalid HCL.
  """

  @namespace_url <<0x6B, 0xA7, 0xB8, 0x11, 0x9D, 0xAD, 0x11, 0xD1, 0x80, 0xB4, 0x00, 0xC0, 0x4F, 0xD4, 0x30, 0xC8>>

  @catalog [
    {"aws", "AWS", "cloud"},
    {"eks", "Amazon EKS", "cloud"},
    {"gcp", "Google Cloud", "cloud"},
    {"gke", "Google Kubernetes Engine", "kubernetes"},
    {"azure", "Azure (coming soon)", "coming-soon"},
    {"hetzner", "Hetzner Cloud", "cloud"},
    {"cloudflare", "Cloudflare", "dns-cdn"},
    {"bytedc", "ByteDC (HCS)", "cloud"},
    {"kubernetes", "Kubernetes", "kubernetes"},
    {"biznet", "Biznet Gio", "cloud"},
    {"idcloudhost", "IDCloudHost", "cloud"},
    {"bytedc-eks", "ByteDC Managed EKS", "kubernetes"}
  ]

  # bytedc TFVARS_ORDER (full port) — other providers use a sorted-keys
  # fallback until their adapters are ported.
  @bytedc_tfvars_order [
    "env", "region", "project_name", "name_prefix",
    "vpc_name", "vpc_cidr",
    "public_subnet_cidr", "public_subnet_gw",
    "app_subnet_cidr", "app_subnet_gw",
    "data_subnet_cidr", "data_subnet_gw",
    "admin_cidr", "web_cidr", "enable_web_ingress",
    "existing_vpc_id",
    "existing_public_subnet_id", "existing_app_subnet_id", "existing_data_subnet_id",
    "existing_public_ipv4_subnet_id", "existing_app_ipv4_subnet_id", "existing_data_ipv4_subnet_id",
    "existing_app_sg_id", "existing_data_sg_id",
    "az", "image_id", "flavor_id", "vm_count",
    "enable_elb", "enable_nat", "enable_dns", "domain_base",
    "enable_platform", "platform_roles", "platform_subnets",
    "platform_overrides", "platform_eip_roles",
    "platform_eip_pool_type", "nat_eip_pool_type",
    "existing_nat_gateway_id", "create_nat_in_existing_vpc", "manage_existing_nat_snat_rules", "nat_floating_ip_id",
    "ssh_port", "extra_users", "ingress_rules",
    "extra_vms"
  ]

  @bytedc_secret_keys ["access_key", "secret_key", "ecs_admin_pass"]
  @bytedc_platform_override_keys MapSet.new(["flavor_id", "image_id", "az", "az_zone", "eip_pool_type"])

  defp adapter(provider) do
    if provider == "bytedc" do
      %{
        "id" => "bytedc",
        "label" => "ByteDC (HCS)",
        "tfvars_order" => @bytedc_tfvars_order,
        "secret_keys" => @bytedc_secret_keys,
        "platform_override_keys" => @bytedc_platform_override_keys,
        "full" => true
      }
    else
      %{
        "id" => provider,
        "label" => provider_label(provider),
        "tfvars_order" => [],
        "secret_keys" => [],
        "platform_override_keys" => MapSet.new([]),
        "full" => false
      }
    end
  end

  defp provider_label(provider) do
    case Enum.find(@catalog, fn {id, _, _} -> id == provider end) do
      {_, label, _cat} -> label
      nil -> provider
    end
  end

  @doc "Catalog entries for the wizard picker."
  @spec catalog() :: [map()]
  def catalog do
    Enum.map(@catalog, fn {id, label, category} ->
      %{"id" => id, "label" => label, "enabled" => id == "bytedc", "category" => category}
    end)
  end

  @doc "Whether a provider has a fully ported adapter (bytedc only, for now)."
  @spec full_adapter?(String.t()) :: boolean()
  def full_adapter?("bytedc"), do: true
  def full_adapter?(_), do: false

  @doc "Whether a provider id is known to the catalog."
  @spec known?(String.t()) :: boolean()
  def known?(provider), do: Enum.any?(@catalog, fn {id, _, _} -> id == provider end)

  @doc "Union of every provider's secret keys (Python _all_secret_keys)."
  @spec all_secret_keys() :: [String.t()]
  def all_secret_keys do
    @catalog
    |> Enum.map(fn {id, _, _} -> id end)
    |> Enum.flat_map(&secret_keys_for/1)
    |> Enum.uniq()
  end

  @doc "Provider's secret keys (never rendered into terraform.tfvars)."
  @spec secret_keys_for(String.t()) :: [String.t()]
  def secret_keys_for(provider), do: adapter(provider)["secret_keys"]

  @doc "Sanitize values for a provider (platform_overrides key filtering)."
  @spec sanitize_values(String.t(), map()) :: map()
  def sanitize_values(provider, values) when is_map(values) do
    adapter = adapter(provider)
    po = values["platform_overrides"]
    allowed = adapter["platform_override_keys"]

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
              nat_check(values)
            end
          else
            nat_check(values)
          end
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
  # HCL rendering (Python _render_tfvars / _render_value / _hcl_quote)
  # ---------------------------------------------------------------------------

  @doc """
  Render terraform.tfvars content for a provider — values filtered to the
  provider's tfvars order, empty values skipped, HCL-escaped.
  """
  @spec render_tfvars(String.t(), map()) :: String.t()
  def render_tfvars(provider, values) do
    adapter = adapter(provider)
    values = sanitize_values(provider, values)
    order = adapter["tfvars_order"]

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
