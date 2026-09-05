defmodule RadasWeb.InventoryController do
  @moduledoc """
  Port of the inventory groups/hosts slice of
  `api/inventory_groups_hosts_routes.py`: inventory group listing/creation/
  deletion, host group membership, and group_vars/host_vars read/write.
  Auth via `RadasWeb.Plugs.Auth`; project scoping via X-Project-Id.
  """

  use RadasWeb, :controller

  import Plug.Conn

  alias RadasAI.{InventoryIO, ProjectPaths}

  # -- inventory groups ----------------------------------------------------------

  def groups_show(conn, _params) do
    project_id = project_id_from(conn)

    if project_id in [nil, ""] do
      conn |> put_status(400) |> json(%{"success" => false, "error" => "Project ID is required"})
    else
      selected = conn.query_params["inventory_files"]
      files = inventory_files_for(project_id, selected)
      groups = InventoryIO.get_inventory_groups(files)
      json(conn, %{"success" => true, "groups" => groups})
    end
  end

  defp inventory_files_for(project_id, nil), do: ProjectPaths.find_inventory_files(project_id)

  defp inventory_files_for(project_id, "") do
    ProjectPaths.find_inventory_files(project_id)
  end

  defp inventory_files_for(project_id, selected) when is_binary(selected) do
    inventory_files_for(project_id, [selected])
  end

  defp inventory_files_for(project_id, selected) when is_list(selected) do
    inventories = ProjectPaths.project_inventories_dir(project_id)

    Enum.flat_map(selected, fn param ->
      param = to_string(param)
      candidates = [
        Path.join(inventories, param),
        Path.join(ProjectPaths.project_repo_dir(project_id), param),
        Path.join(inventories, Path.basename(param))
      ]

      Enum.filter(candidates, &File.exists?/1) |> Enum.uniq()
    end)
  end

  def groups_add(conn, _params) do
    project_id = project_id_from(conn)
    data = conn.body_params || %{}
    group_name = String.trim(to_string(data["name"] || data["group_name"] || ""))

    if project_id in [nil, ""] do
      conn |> put_status(400) |> json(%{"success" => false, "error" => "Project ID is required"})
    else
      if group_name == "" or not Regex.match?(~r/^[A-Za-z0-9_-]+$/, group_name) do
        conn |> put_status(400) |> json(%{"success" => false, "error" => "Valid group name is required"})
      else
        # Add the group to the primary inventory file (create if missing).
        file = primary_inventory(project_id)
        inv = InventoryIO.load_inventory_file(file) || %{"all" => %{"children" => %{}}}

        all = inv["all"] || %{}
        children = all["children"] || %{}

        if Map.has_key?(children, group_name) do
          conn |> put_status(409) |> json(%{"success" => false, "error" => "Group already exists"})
        else
          children = Map.put(children, group_name, %{"hosts" => %{}})
          all = Map.put(all, "children", children)
          inv = Map.put(inv, "all", all)
          File.mkdir_p!(Path.dirname(file))
          File.write!(file, InventoryIO.encode_yaml(inv))
          json(conn, %{"success" => true, "group" => group_name})
        end
      end
    end
  end

  def groups_delete(conn, %{"group_name" => group_name}) do
    project_id = project_id_from(conn)

    if project_id in [nil, ""] do
      conn |> put_status(400) |> json(%{"success" => false, "error" => "Project ID is required"})
    else
      file = primary_inventory(project_id)
      inv = InventoryIO.load_inventory_file(file)

      if inv == nil do
        conn |> put_status(404) |> json(%{"success" => false, "error" => "Inventory not found"})
      else
        all = inv["all"] || %{}
        children = all["children"] || %{}

        if not Map.has_key?(children, group_name) do
          conn |> put_status(404) |> json(%{"success" => false, "error" => "Group not found"})
        else
          children = Map.delete(children, group_name)
          all = Map.put(all, "children", children)
          inv = Map.put(inv, "all", all)
          File.write!(file, InventoryIO.encode_yaml(inv))
          json(conn, %{"success" => true})
        end
      end
    end
  end

  # -- hosts -------------------------------------------------------------------------

  def hosts_show(conn, _params) do
    project_id = project_id_from(conn)

    if project_id in [nil, ""] do
      conn |> put_status(400) |> json(%{"success" => false, "error" => "Project ID is required"})
    else
      files = ProjectPaths.find_inventory_files(project_id)
      hosts = InventoryIO.get_inventory_hosts(files)
      json(conn, %{"success" => true, "hosts" => hosts})
    end
  end

  # -- vars -----------------------------------------------------------------------------

  def group_vars_show(conn, %{"group_name" => group_name}) do
    project_id = project_id_from(conn)

    if project_id in [nil, ""] do
      conn |> put_status(400) |> json(%{"success" => false, "error" => "Project ID is required"})
    else
      json(conn, %{"success" => true, "vars" => InventoryIO.read_vars_file(project_id, "group_vars", group_name)})
    end
  end

  def group_vars_put(conn, %{"group_name" => group_name}) do
    project_id = project_id_from(conn)

    if project_id in [nil, ""] do
      conn |> put_status(400) |> json(%{"success" => false, "error" => "Project ID is required"})
    else
      InventoryIO.write_vars_file(project_id, "group_vars", group_name, stringify(conn.body_params || %{}))
      json(conn, %{"success" => true})
    end
  end

  def host_vars_show(conn, %{"host_name" => host_name}) do
    project_id = project_id_from(conn)

    if project_id in [nil, ""] do
      conn |> put_status(400) |> json(%{"success" => false, "error" => "Project ID is required"})
    else
      json(conn, %{"success" => true, "vars" => InventoryIO.read_vars_file(project_id, "host_vars", host_name)})
    end
  end

  def host_vars_put(conn, %{"host_name" => host_name}) do
    project_id = project_id_from(conn)

    if project_id in [nil, ""] do
      conn |> put_status(400) |> json(%{"success" => false, "error" => "Project ID is required"})
    else
      InventoryIO.write_vars_file(project_id, "host_vars", host_name, stringify(conn.body_params || %{}))
      json(conn, %{"success" => true})
    end
  end

  # -- helpers ---------------------------------------------------------------------------

  defp project_id_from(conn),
    do: get_req_header(conn, "x-project-id") |> List.first() || conn.query_params["project_id"]

  defp primary_inventory(project_id) do
    file = ProjectPaths.project_inventory_file(project_id)

    if File.exists?(file) do
      file
    else
      File.mkdir_p!(Path.dirname(file))
      File.write!(file, InventoryIO.encode_yaml(%{"all" => %{"children" => %{}}}))
      file
    end
  end

  defp stringify(data) when is_map(data) do
    Map.new(data, fn {k, v} -> {to_string(k), stringify(v)} end)
  end

  defp stringify(data) when is_list(data), do: Enum.map(data, &stringify/1)
  defp stringify(data), do: data
end
