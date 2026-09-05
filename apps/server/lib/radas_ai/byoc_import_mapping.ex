defmodule RadasAI.ByocImportMapping do
  @moduledoc """
  Port of `services/byoc_import_mapping.py` — project-scoped, deterministic
  BYOC resource import mappings persisted on stack_meta
  (`byoc_import_mapping`), with adopt-import-only (UC307) and clash checks
  (UC308).
  """

  import RadasAI.DB

  alias RadasAI.Byoc
  alias RadasAI.CloudStacks
  alias RadasWeb.Plugs.OrgAccess

  @address_re ~r{^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\[(?:"[A-Za-z0-9_-]+"|[0-9]+)\])*$}

  @doc "Validate a resource address; raises ArgumentError when invalid."
  @spec validate_resource_address(String.t()) :: String.t()
  def validate_resource_address(address) do
    value = String.trim(to_string(address || ""))

    forbidden = ["..", "/", "\\", ";", "&", "|", "$", "`", "'", "\"", " "]

    if value == "" or not Regex.match?(@address_re, value) or
         Enum.any?(forbidden, &String.contains?(value, &1)) do
      raise ArgumentError, message: "invalid resource address"
    end

    value
  end

  defp project_org(project_id) do
    case query_one!("SELECT org_id FROM projects WHERE id = $1", [project_id]) do
      %{"org_id" => org_id} when org_id not in [nil, ""] -> org_id
      _ -> raise ArgumentError, message: "project access denied"
    end
  end

  defp authorize(account, project_id, actor_id) do
    project_org = project_org(project_id)
    account_org = to_string(account["org_id"] || "")
    account_project = to_string(account["project_id"] || "")

    cond do
      account_org == "" or account_project == "" ->
        raise ArgumentError, message: "account ownership is required"

      account_org != project_org ->
        raise ArgumentError, message: "tenant access denied"

      account_project != project_id ->
        raise ArgumentError, message: "project access denied"

      actor_id != "__internal__" and not OrgAccess.is_member?(project_org, actor_id) ->
        raise ArgumentError, message: "project access denied"

      true ->
        :ok
    end
  end

  defp stack_exists!(project_id, stack) do
    row =
      query_one!("SELECT 1 AS present FROM stack_meta WHERE project_id = $1 AND stack = $2", [
        project_id,
        stack
      ])

    if row == nil do
      raise ArgumentError, message: "stack not found"
    end
  end

  defp persist_mapping(project_id, stack, mapping) do
    CloudStacks.save_meta(project_id, stack, %{"byoc_import_mapping" => mapping})
  end

  @doc """
  Build + persist the import mapping for selected inventory resources
  (Python prepare_import_mapping).
  """
  @spec prepare_import_mapping(String.t(), keyword()) :: map()
  def prepare_import_mapping(account_id, opts) do
    project_id = String.trim(to_string(Keyword.get(opts, :project_id) || ""))
    stack = String.trim(to_string(Keyword.get(opts, :stack) || ""))

    if project_id == "" or stack == "" do
      raise ArgumentError, message: "project_id and stack are required"
    end

    stack_exists!(project_id, stack)

    account = Byoc.get_account(account_id)

    if account == nil do
      raise ArgumentError, message: "account not found"
    end

    authorize(account, project_id, Keyword.get(opts, :actor_id))

    inventory = Byoc.get_inventory(account_id)
    available = Map.new(List.wrap(inventory["resources"]), &{to_string(&1["id"]), &1})

    ids =
      (Keyword.get(opts, :resource_ids) || [])
      |> Enum.map(&String.trim(to_string(&1)))

    if ids == [] or length(ids) != length(Enum.uniq(ids)) do
      raise ArgumentError, message: "resource_ids must be non-empty and unique"
    end

    if Enum.any?(ids, &not Map.has_key?(available, &1)) do
      raise ArgumentError, message: "resource ids are not in the latest inventory"
    end

    overrides = Map.new(Keyword.get(opts, :address_overrides) || %{}, fn {k, v} -> {to_string(k), v} end)
    now = System.system_time(:second)

    {mappings, _} =
      Enum.map_reduce(Enum.sort(ids), MapSet.new(), fn resource_id, seen ->
        item = available[resource_id]

        raw_address =
          overrides[resource_id] || item["address"] ||
            "resource.#{item["type"]}.#{resource_id}"

        address = validate_resource_address(to_string(raw_address))

        if MapSet.member?(seen, address) do
          raise ArgumentError, message: "duplicate address"
        end

        mapping = %{
          "resource_id" => resource_id,
          "type" => to_string(item["type"] || "resource"),
          "address" => address,
          "source" => if(Map.has_key?(overrides, resource_id), do: "override", else: "inventory"),
          "mapped_at" => now
        }

        {mapping, MapSet.put(seen, address)}
      end)

    persist_mapping(project_id, stack, %{
      "account_id" => to_string(account_id),
      "project_id" => project_id,
      "stack" => stack,
      "mappings" => mappings,
      "updated_at" => now
    })

    import_block =
      Enum.map_join(mappings, "\n\n", fn m ->
        "import {\n  to = #{m["address"]}\n  id = \"#{m["resource_id"]}\"\n}"
      end)

    %{
      "account_id" => to_string(account_id),
      "project_id" => project_id,
      "stack" => stack,
      "provider" => to_string(account["provider"] || ""),
      "resource_count" => length(mappings),
      "mappings" => mappings,
      "import_block" => import_block
    }
  end

  @doc "Adopt resources import-only: mapping + managed marking (UC307)."
  @spec adopt_resources_import_only(String.t(), keyword()) :: map()
  def adopt_resources_import_only(account_id, opts) do
    mapping_res = prepare_import_mapping(account_id, opts)
    Byoc.set_resource_management(account_id, Keyword.get(opts, :resource_ids) || [], true)

    count = mapping_res["resource_count"]

    %{
      "ok" => true,
      "mode" => "import_only",
      "adopted_count" => count,
      "account_id" => account_id,
      "project_id" => Keyword.get(opts, :project_id),
      "stack" => Keyword.get(opts, :stack),
      "mappings" => mapping_res["mappings"],
      "import_block" => mapping_res["import_block"],
      "message" => "Successfully adopted #{count} resources into stack '#{Keyword.get(opts, :stack)}' in import-only mode"
    }
  end

  @doc "Check whether a resource is already adopted elsewhere (UC308)."
  @spec check_resource_clash(keyword()) :: map()
  def check_resource_clash(opts) do
    r_id = String.trim(to_string(Keyword.get(opts, :resource_id) || ""))
    r_type = String.trim(to_string(Keyword.get(opts, :resource_type) || ""))
    t_stack = String.trim(to_string(Keyword.get(opts, :target_stack) || Keyword.get(opts, :stack) || ""))
    project_id = Keyword.get(opts, :project_id)

    if r_id == "" do
      raise ArgumentError, message: "resource_id required"
    end

    clashes =
      query_all!("SELECT project_id, stack, data FROM stack_meta", [])
      |> Enum.flat_map(fn row ->
        pid = row["project_id"]
        stk = row["stack"]

        if stk == t_stack and (project_id in [nil, ""] or pid == project_id) do
          []
        else
          mapping = (row["data"] || %{})["byoc_import_mapping"] || %{}

          Enum.flat_map(List.wrap(mapping["mappings"]), fn m ->
            if to_string(m["resource_id"]) == r_id do
              [
                %{
                  "stack" => stk,
                  "project_id" => pid,
                  "address" => m["address"],
                  "mapped_at" => m["mapped_at"],
                  "source" => "import_mapping"
                }
              ]
            else
              []
            end
          end)
        end
      end)

    acct = Byoc.get_account(Keyword.get(opts, :account_id) || "") || %{}

    clashes =
      Enum.reduce(List.wrap(acct["managed_resources"]), clashes, fn m, acc ->
        if to_string(m["resource_id"] || m["id"]) == r_id and m["stack"] not in [nil, ""] and
             m["stack"] != t_stack do
          [
            %{
              "stack" => m["stack"],
              "project_id" => acct["project_id"],
              "address" => m["address"],
              "source" => "account_managed"
            }
            | acc
          ]
        else
          acc
        end
      end)

    has_clash = clashes != []

    %{
      "clash" => has_clash,
      "resource_id" => r_id,
      "resource_type" => r_type,
      "target_stack" => t_stack,
      "clashing_stacks" => clashes,
      "message" =>
        if has_clash do
          "Resource '#{r_id}' is already managed in #{length(clashes)} other stack(s)"
        else
          "Resource '#{r_id}' is free to be adopted into '#{t_stack}'"
        end
    }
  end
end
