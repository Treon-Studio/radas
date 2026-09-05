defmodule RadasWeb.CodeRegistryController do
  @moduledoc """
  Port of `api/code_registry_routes.py` (Fase 6 — UC 382+, UC 661–666):
  registry catalog, item detail/changelog/export/import/publish, install/
  uninstall/installed, diff/update, git sync. Auth via :v2_auth;
  project access is enforced where Python used @require_project_access.
  """

  use RadasWeb, :controller

  import Plug.Conn

  alias RadasAI.CodeRegistry
  alias RadasWeb.Plugs.OrgAccess

  defp project_id(conn, body \\ %{}),
    do: body["project_id"] || get_req_header(conn, "x-project-id") |> List.first() ||
          conn.query_params["project_id"]

  # Python used @require_project_access on registry routes; with no project
  # context the gate allows (non-project endpoints), so only enforce when a
  # project id is present.
  defp with_access(conn, fun) do
    case OrgAccess.ensure_project_access(conn, project_id(conn)) do
      :ok -> fun.(conn)
      {:error, status, body} -> conn |> put_status(status) |> json(body)
    end
  end

  def catalog(conn, _params), do: with_access(conn, &json(&1, %{"items" => CodeRegistry.catalog()}))

  def item_show(conn, %{"name" => name}) do
    case CodeRegistry.get_item(name) do
      nil -> conn |> put_status(404) |> json(%{"error" => "not found"})
      item -> json(conn, item)
    end
  end

  def item_changelog(conn, %{"name" => name}) do
    try do
      json(conn, %{"success" => true, "changelog" => CodeRegistry.get_item_changelog(name)})
    rescue
      e in ArgumentError -> conn |> put_status(404) |> json(%{"error" => e.message})
    end
  end

  def install(conn, %{"name" => name}) do
    with_access(conn, fn conn ->
      data = conn.body_params || %{}
      stack = String.trim(to_string(data["stack"] || ""))

      if stack == "" do
        conn |> put_status(400) |> json(%{"error" => "stack required"})
      else
        try do
          out =
            CodeRegistry.install(project_id(conn, data), stack, name,
              version: present(data["version"]),
              resolve_deps: true
            )

          conn |> put_status(201) |> json(%{"success" => true, "installed" => out})
        rescue
          e in ArgumentError -> conn |> put_status(400) |> json(%{"error" => e.message})
        end
      end
    end)
  end

  def uninstall(conn, %{"name" => name}) do
    with_access(conn, fn conn ->
      data = conn.body_params || %{}
      stack = String.trim(to_string(data["stack"] || ""))

      if stack == "" do
        conn |> put_status(400) |> json(%{"error" => "stack required"})
      else
        try do
          out = CodeRegistry.uninstall(project_id(conn, data), stack, name)
          json(conn, %{"success" => true, "uninstalled" => out})
        rescue
          e in ArgumentError -> conn |> put_status(400) |> json(%{"error" => e.message})
        end
      end
    end)
  end

  def installed(conn, _params) do
    with_access(conn, fn conn ->
      stack = String.trim(conn.query_params["stack"] || "")

      if stack == "" do
        conn |> put_status(400) |> json(%{"error" => "stack query param required"})
      else
        json(conn, %{"installed" => CodeRegistry.installed(project_id(conn), stack)})
      end
    end)
  end

  def item_export(conn, %{"name" => name}) do
    with_access(conn, fn conn ->
      try do
        json(conn, %{"success" => true, "bundle" => CodeRegistry.export_item_bundle(name)})
      rescue
        e in ArgumentError -> conn |> put_status(404) |> json(%{"error" => e.message})
      end
    end)
  end

  def item_import(conn, _params) do
    with_access(conn, fn conn ->
      data = conn.body_params || %{}
      bundle = data["bundle"] || data

      try do
        conn |> put_status(201) |> json(CodeRegistry.import_item_bundle(bundle))
      rescue
        e in ArgumentError -> conn |> put_status(400) |> json(%{"error" => e.message})
      end
    end)
  end

  def publish(conn, _params) do
    with_access(conn, fn conn ->
      data = conn.body_params || %{}
      stack = String.trim(to_string(data["stack"] || ""))
      name = String.trim(to_string(data["name"] || ""))
      item_type = String.trim(to_string(data["type"] || "tofu-block"))
      file_patterns = data["file_patterns"] || []

      if stack == "" or name == "" or file_patterns == [] do
        conn |> put_status(400) |> json(%{"error" => "stack, name, and file_patterns are required"})
      else
        try do
          res =
            CodeRegistry.publish_from_stack(project_id(conn, data), stack, name, item_type, file_patterns,
              version: data["version"] || "1.0.0",
              description: to_string(data["description"] || ""),
              tags: data["tags"],
              dependencies: data["dependencies"]
            )

          conn |> put_status(201) |> json(res)
        rescue
          e in ArgumentError -> conn |> put_status(400) |> json(%{"error" => e.message})
        end
      end
    end)
  end

  def diff(conn, %{"stack" => stack, "name" => name}) do
    with_access(conn, fn conn ->
      try do
        res =
          CodeRegistry.diff_installed_item(project_id(conn), stack, name, conn.query_params["version"])

        json(conn, %{"success" => true, "diff" => res})
      rescue
        e in ArgumentError -> conn |> put_status(400) |> json(%{"error" => e.message})
      end
    end)
  end

  def update(conn, %{"stack" => stack, "name" => name}) do
    with_access(conn, fn conn ->
      data = conn.body_params || %{}

      try do
        json(conn, CodeRegistry.update_installed_item(project_id(conn, data), stack, name, data["version"]))
      rescue
        e in ArgumentError -> conn |> put_status(400) |> json(%{"error" => e.message})
      end
    end)
  end

  def sync_git(conn, _params) do
    with_access(conn, fn conn ->
      data = conn.body_params || %{}
      git_url = String.trim(to_string(data["git_url"] || ""))

      if git_url == "" do
        conn |> put_status(400) |> json(%{"error" => "git_url is required"})
      else
        try do
          res =
            CodeRegistry.sync_git_registry(git_url, to_string(data["branch"] || "main"), data["dest_subdir"])

          json(conn, res)
        rescue
          e in ArgumentError -> conn |> put_status(400) |> json(%{"error" => e.message})
        end
      end
    end)
  end

  defp present(v) when v in [nil, ""], do: nil
  defp present(v), do: to_string(v)
end
