defmodule RadasAI.CloudInventory do
  @moduledoc """
  Port of the provider adapters' `build_inventory` tfstate parsers
  (services/cloud_providers/<id>.py). The **bytedc** parser is ported in
  full (default provider); other providers return the empty shape until
  their parsers are ported (Phase 7-f).
  """

  alias RadasAI.CloudProviders

  @doc "Empty inventory shape (Python fallback when no builder exists)."
  @spec empty(map() | nil) :: map()
  def empty(state_present \\ nil) do
    base = %{"vms" => [], "vpcs" => [], "subnets" => [], "eips" => [], "count" => 0}
    if is_nil(state_present), do: base, else: Map.put(base, "state_present", state_present)
  end

  @doc """
  Build the VM inventory from a parsed terraform.tfstate for the provider.
  """
  @spec build_inventory(String.t(), map()) :: map()
  def build_inventory("bytedc", state) when is_map(state), do: build_bytedc(state)
  def build_inventory(_provider, _state), do: empty()

  defp iter_resources(state) do
    Enum.flat_map(state["resources"] || [], fn r ->
      Enum.map(r["instances"] || [], fn inst ->
        prefix = if r["module"] in [nil, ""], do: "", else: "#{r["module"]}."
        address = prefix <> "#{r["type"]}.#{r["name"]}"

        %{
          "type" => r["type"],
          "name" => r["name"],
          "values" => inst["attributes"] || %{},
          "address" => address
        }
      end)
    end)
  end

  @doc "bytedc tfstate parser (port of bytedc.py build_inventory)."
  @spec build_bytedc(map()) :: map()
  def build_bytedc(state) do
    resources = iter_resources(state)

    {subnets, vpcs, sgs, raw_eips, eips_by_instance} =
      Enum.reduce(resources, {%{}, %{}, %{}, %{}, %{}}, fn r, {subnets, vpcs, sgs, raw_eips, eips_by_instance} ->
        t = r["type"] || ""
        v = r["values"] || %{}
        rid = v["id"]

        cond do
          t == "hcs_vpc_subnet" and rid ->
            {Map.put(subnets, rid, %{"name" => v["name"], "cidr" => v["cidr"], "gateway_ip" => v["gateway_ip"], "vpc_id" => v["vpc_id"]}), vpcs, sgs, raw_eips, eips_by_instance}

          t == "hcs_vpc" and rid ->
            {subnets, Map.put(vpcs, rid, %{"name" => v["name"], "cidr" => v["cidr"]}), sgs, raw_eips, eips_by_instance}

          t == "hcs_networking_secgroup" and rid ->
            {subnets, vpcs, Map.put(sgs, rid, v["name"] || rid), raw_eips, eips_by_instance}

          t == "hcs_vpc_eip" and rid ->
            addr =
              cond do
                v["address"] not in [nil, ""] -> v["address"]
                is_list(v["publicip"]) and v["publicip"] != [] and is_map(hd(v["publicip"])) -> hd(v["publicip"])["ip_address"] || ""
                true -> ""
              end

            {subnets, vpcs, sgs, Map.put(raw_eips, rid, addr), eips_by_instance}

          t == "hcs_ecs_compute_eip_associate" ->
            pip = v["public_ip"]
            iid = v["instance_id"]

            if pip not in [nil, ""] and iid not in [nil, ""] do
              {subnets, vpcs, sgs, raw_eips, Map.put(eips_by_instance, iid, pip)}
            else
              {subnets, vpcs, sgs, raw_eips, eips_by_instance}
            end

          true ->
            {subnets, vpcs, sgs, raw_eips, eips_by_instance}
        end
      end)

    instances =
      resources
      |> Enum.filter(&(&1["type"] == "hcs_ecs_compute_instance"))
      |> Enum.map(fn r ->
        v = r["values"] || %{}
        nics = v["network"] || []
        first = if nics == [], do: %{}, else: hd(nics)
        subnet_id = first["uuid"]
        sn = Map.get(subnets, subnet_id || "", %{})
        vpc = Map.get(vpcs, sn["vpc_id"] || "", %{})
        sg_ids = v["security_group_ids"] || []

        %{
          "address" => r["address"],
          "hostname" => v["name"],
          "instance_id" => v["id"],
          "status" => v["status"],
          "az" => v["availability_zone"],
          "image_id" => v["image_id"],
          "flavor_id" => v["flavor_id"],
          "private_ip" => first["fixed_ip_v4"] || v["access_ip_v4"],
          "mac" => first["mac"],
          "port_id" => first["port"],
          "public_ip" => Map.get(eips_by_instance, v["id"] || "") || nil,
          "subnet_id" => subnet_id,
          "subnet_name" => sn["name"],
          "subnet_cidr" => sn["cidr"],
          "subnet_gateway" => sn["gateway_ip"],
          "vpc_id" => sn["vpc_id"],
          "vpc_name" => vpc["name"],
          "vpc_cidr" => vpc["cidr"],
          "security_groups" => Enum.map(sg_ids, &Map.get(sgs, &1, &1)),
          "system_disk_type" => v["system_disk_type"],
          "system_disk_size" => v["system_disk_size"]
        }
      end)
      |> Enum.sort_by(&(&1["hostname"] || ""))

    %{
      "vms" => instances,
      "vpcs" => Enum.map(vpcs, fn {k, val} -> Map.merge(%{"id" => k}, val) end),
      "subnets" => Enum.map(subnets, fn {k, val} -> Map.merge(%{"id" => k}, val) end),
      "eips" => Enum.map(raw_eips, fn {k, a} -> %{"id" => k, "address" => a} end),
      "count" => length(instances)
    }
  end

  @doc "Whether the provider can build inventory from tfstate."
  @spec builds_inventory?(String.t()) :: boolean()
  def builds_inventory?(provider), do: CloudProviders.builds_inventory?(provider)
end
