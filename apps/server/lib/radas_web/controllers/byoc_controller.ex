defmodule RadasWeb.ByocController do
  @moduledoc """
  Port of `api/byoc_routes.py` (Fase 6 — UC 271+): BYOC provider registry,
  project-scoped account management, validation probes, inventory
  discovery, import mappings, budgets, quotas, backups.

  Every route requires auth (`:v2_auth` pipeline). Account routes
  additionally resolve project-scoped access (Python `_account_access`):
  the account's org/project must match the request's project; mutations
  need owner/admin.
  """

  use RadasWeb, :controller

  import Plug.Conn

  alias RadasAI.AuditEvents
  alias RadasAI.Byoc
  alias RadasAI.ByocImportMapping
  alias RadasWeb.Plugs.OrgAccess

  defp project_id(conn, body \\ %{}),
    do: body["project_id"] || get_req_header(conn, "x-project-id") |> List.first() ||
          conn.query_params["project_id"]

  defp current_user(conn), do: conn.assigns[:current_user] || %{}

  # -- _account_access port -----------------------------------------------------

  defp account_access(conn, account_id, opts) do
    write = Keyword.get(opts, :write, false)
    user = current_user(conn)
    user_id = user["user_id"]

    with :ok <- require_project_scope(conn),
         {:ok, project_org} <- project_org(conn),
         :ok <- require_member(project_org, user_id),
         {:ok, account} <- require_account(account_id),
         :ok <- require_ownership(account, project_org, project_id(conn)),
         :ok <- require_writer(write, user_id, project_org) do
      {:ok, account}
    else
      {:error, conn} -> {:error, conn}
    end
  end

  defp require_project_scope(conn) do
    if project_id(conn) in [nil, ""] do
      {:error, conn |> put_status(400) |> json(%{"error" => "project_id is required"})}
    else
      :ok
    end
  end

  defp project_org(conn) do
    case OrgAccess.ensure_project_access(conn, project_id(conn)) do
      :ok ->
        case RadasAI.DB.query_one!("SELECT org_id FROM projects WHERE id = $1", [project_id(conn)]) do
          %{"org_id" => org} when org not in [nil, ""] -> {:ok, org}
          _ -> {:error, conn |> put_status(403) |> json(%{"error" => "project access denied"})}
        end

      {:error, _status, _body} ->
        {:error, conn |> put_status(403) |> json(%{"error" => "project access denied"})}
    end
  end

  defp require_member(org_id, user_id) do
    if user_id != "__internal__" and not OrgAccess.is_member?(org_id, user_id) do
      # The member check needs a conn to fail on; the caller handles nil.
      {:error, :no_member}
    else
      :ok
    end
  end

  defp require_account(account_id) do
    case Byoc.get_account(account_id) do
      nil -> {:error, :no_account}
      account -> {:ok, account}
    end
  end

  defp require_ownership(account, project_org, project_id) do
    cond do
      account["org_id"] in [nil, ""] or account["project_id"] in [nil, ""] ->
        {:error, :no_ownership}

      account["org_id"] != project_org or account["project_id"] != project_id ->
        {:error, :access_denied}

      true ->
        :ok
    end
  end

  defp require_writer(false, _user_id, _org), do: :ok
  defp require_writer(true, "__internal__", _org), do: :ok

  defp require_writer(true, user_id, org) do
    if OrgAccess.member_role(org, user_id) in ["owner", "admin"] do
      :ok
    else
      {:error, :mutation_denied}
    end
  end

  # Translate the sentinel errors into conn responses.
  defp resolve_access(conn, result) do
    case result do
      {:ok, account} ->
        {:ok, account, conn}

      {:error, conn} when is_struct(conn) ->
        {:error, conn}

      {:error, :no_member} ->
        {:error, conn |> put_status(403) |> json(%{"error" => "project access denied"})}

      {:error, :no_account} ->
        {:error, conn |> put_status(409) |> json(%{"error" => "account requires ownership migration"})}

      {:error, :no_ownership} ->
        {:error, conn |> put_status(409) |> json(%{"error" => "account requires ownership migration"})}

      {:error, :access_denied} ->
        {:error, conn |> put_status(403) |> json(%{"error" => "account access denied"})}

      {:error, :mutation_denied} ->
        {:error, conn |> put_status(403) |> json(%{"error" => "account mutation denied"})}
    end
  end

  defp audit_account(account, action, endpoint, actor_id, mutation \\ nil) do
    meta =
      %{
        "project_id" => account["project_id"],
        "org_id" => account["org_id"],
        "accessed_endpoint" => endpoint
      }
      |> then(&(if mutation, do: Map.put(&1, "mutation", mutation), else: &1))

    AuditEvents.record_audit_event(action,
      actor_user_id: actor_id,
      target_type: "byoc_account",
      target_id: account["id"],
      meta: meta
    )
  end

  defp audit_access(account, endpoint, actor_id) do
    audit_account(account, "byoc.account.accessed", endpoint, actor_id)
  end

  defp guarded(conn, account_id, opts, fun) do
    case resolve_access(conn, account_access(conn, account_id, opts)) do
      {:ok, account, conn} ->
        fun.(account, conn)

      {:error, conn} ->
        conn
    end
  end

  # -- providers ------------------------------------------------------------------

  def providers_detect(conn, _params) do
    json(conn, Byoc.detect_provider(conn.body_params || %{}))
  end

  def providers_list(conn, _params) do
    json(conn, %{"providers" => Byoc.providers()})
  end

  # -- accounts ---------------------------------------------------------------------

  def accounts_list(conn, _params) do
    case project_org(conn) do
      {:error, conn} ->
        conn

      {:ok, org} ->
        user_id = current_user(conn)["user_id"]

        if user_id != "__internal__" and not OrgAccess.is_member?(org, user_id) do
          conn |> put_status(403) |> json(%{"error" => "project access denied"})
        else
          accounts =
            Enum.filter(Byoc.list_accounts(), &(&1["org_id"] == org and &1["project_id"] == project_id(conn)))

          json(conn, %{"accounts" => accounts})
        end
    end
  end

  def accounts_create(conn, _params) do
    data = conn.body_params || %{}

    case project_org(conn) do
      {:error, conn} ->
        conn

      {:ok, org} ->
        user_id = current_user(conn)["user_id"]

        if user_id != "__internal__" and not OrgAccess.is_member?(org, user_id) do
          conn |> put_status(403) |> json(%{"error" => "project access denied"})
        else
          data = Map.merge(data, %{"project_id" => project_id(conn, data), "org_id" => org})

          try do
            acct = Byoc.create_account(data)
            audit_account(acct, "byoc.account.created", "byoc.create", user_id)
            conn |> put_status(201) |> json(%{"success" => true, "account" => acct})
          rescue
            e in ArgumentError -> conn |> put_status(400) |> json(%{"error" => e.message})
          end
        end
    end
  end

  def accounts_delete(conn, %{"account_id" => account_id}) do
    case resolve_access(conn, account_access(conn, account_id, write: true)) do
      {:error, conn} ->
        conn

      {:ok, _account, conn} ->
        deleted = Byoc.delete_account(account_id)

        if deleted do
          json(conn, %{"success" => true})
        else
          put_status(conn, 404) |> json(%{"error" => "not found"})
        end
    end
  end

  def accounts_validate(conn, %{"account_id" => account_id}) do
    guarded(conn, account_id, [write: true], fn _account, conn ->
      try do
        json(conn, Byoc.validate_account(account_id))
      rescue
        e in ArgumentError -> conn |> put_status(404) |> json(%{"error" => e.message})
      end
    end)
  end

  def check_due(conn, _params) do
    json(conn, %{"checked" => Byoc.check_due_accounts()})
  end

  def accounts_rotate(conn, %{"account_id" => account_id}) do
    guarded(conn, account_id, [write: true], fn account, conn ->
      data = conn.body_params || %{}
      user_id = current_user(conn)["user_id"]

      try do
        out = Byoc.rotate_credentials(account_id, data["credentials"] || %{})
        audit_account(Byoc.get_account(account_id) || account, "byoc.account.mutated", "byoc.rotate", user_id, "rotate_credentials")
        json(conn, out)
      rescue
        e in ArgumentError -> conn |> put_status(404) |> json(%{"error" => e.message})
      end
    end)
  end

  # -- inventory ---------------------------------------------------------------------

  def inventory(conn, %{"account_id" => account_id}) do
    guarded(conn, account_id, [], fn account, conn ->
      limit = clamp_int(conn.query_params["limit"], 1, 500, 100)
      offset = max(0, parse_int(conn.query_params["offset"], 0))

      try do
        out = Byoc.get_inventory_page(account_id, limit, offset)
        audit_access(account, "byoc.inventory", current_user(conn)["user_id"])
        json(conn, out)
      rescue
        e in ArgumentError -> conn |> put_status(400) |> json(%{"error" => e.message})
      end
    end)
  end

  def inventory_drift(conn, %{"account_id" => account_id}) do
    guarded(conn, account_id, [], fn account, conn ->
      try do
        result = Byoc.inventory_drift(account_id)
        audit_access(account, "byoc.inventory_drift", current_user(conn)["user_id"])
        json(conn, result)
      rescue
        e in ArgumentError -> conn |> put_status(404) |> json(%{"error" => e.message})
      end
    end)
  end

  def inventory_snapshots(conn, %{"account_id" => account_id}) do
    guarded(conn, account_id, [], fn account, conn ->
      limit = clamp_int(conn.query_params["limit"], 1, 20, 20)

      try do
        result = %{"snapshots" => Byoc.list_inventory_snapshots(account_id, limit)}
        audit_access(account, "byoc.inventory_snapshots", current_user(conn)["user_id"])
        json(conn, result)
      rescue
        e in ArgumentError -> conn |> put_status(400) |> json(%{"error" => e.message})
      end
    end)
  end

  def managed_resources_get(conn, %{"account_id" => account_id}) do
    guarded(conn, account_id, [], fn account, conn ->
      try do
        result = %{"resources" => Byoc.list_managed_resources(account_id)}
        audit_access(account, "byoc.managed_resources", current_user(conn)["user_id"])
        json(conn, result)
      rescue
        e in ArgumentError -> conn |> put_status(404) |> json(%{"error" => e.message})
      end
    end)
  end

  def managed_resources_put(conn, %{"account_id" => account_id}) do
    guarded(conn, account_id, [write: true], fn _account, conn ->
      data = conn.body_params || %{}

      try do
        json(
          conn,
          Byoc.set_resource_management(account_id, data["resource_ids"] || [], !!Map.get(data, "managed", true))
        )
      rescue
        e in ArgumentError -> conn |> put_status(400) |> json(%{"error" => e.message})
      end
    end)
  end

  # -- budget / cost -----------------------------------------------------------------

  def budget_set(conn, %{"account_id" => account_id}) do
    guarded(conn, account_id, [write: true], fn _account, conn ->
      data = conn.body_params || %{}

      try do
        amount = to_number(data["amount"])

        json(
          conn,
          Byoc.set_account_budget(
            account_id,
            amount,
            data["currency"] || "USD",
            to_number(Map.get(data, "alert_at_pct", 80))
          )
        )
      rescue
        e in ArgumentError -> conn |> put_status(400) |> json(%{"error" => e.message})
      end
    end)
  end

  def budget_check(conn, %{"account_id" => account_id}) do
    guarded(conn, account_id, [], fn account, conn ->
      try do
        result = Byoc.check_account_budget(account_id)
        audit_access(account, "byoc.budget_check", current_user(conn)["user_id"])
        json(conn, result)
      rescue
        e in ArgumentError -> conn |> put_status(404) |> json(%{"error" => e.message})
      end
    end)
  end

  def cost(conn, %{"account_id" => account_id}) do
    guarded(conn, account_id, [], fn account, conn ->
      try do
        result = Byoc.estimate_account_cost(account_id)
        audit_access(account, "byoc.cost", current_user(conn)["user_id"])
        json(conn, result)
      rescue
        e in ArgumentError -> conn |> put_status(404) |> json(%{"error" => e.message})
      end
    end)
  end

  # -- state sync / import -----------------------------------------------------------

  def state_sync(conn, %{"account_id" => account_id}) do
    guarded(conn, account_id, [write: true], fn _account, conn ->
      try do
        json(conn, Byoc.sync_state_resources(account_id, conn.body_params || %{}))
      rescue
        e in ArgumentError -> conn |> put_status(400) |> json(%{"error" => e.message})
      end
    end)
  end

  def import_mapping(conn, %{"account_id" => account_id}) do
    data = conn.body_params || %{}
    user_id = current_user(conn)["user_id"]
    project_scope = data["project_id"] || get_req_header(conn, "x-project-id") |> List.first()

    try do
      result =
        ByocImportMapping.prepare_import_mapping(account_id,
          project_id: project_scope,
          stack: data["stack"],
          resource_ids: data["resource_ids"] || [],
          address_overrides: data["address_overrides"] || {},
          actor_id: user_id
        )

      audit_account(Byoc.get_account(account_id) || %{}, "byoc.account.imported", "byoc.import", user_id, "import_mapping")
      json(conn, result)
    rescue
      e in ArgumentError ->
        message = e.message

        status =
          cond do
            String.contains?(message, "access") or String.contains?(message, "tenant") -> 403
            String.contains?(message, "not found") or String.contains?(message, "latest inventory") -> 404
            true -> 400
          end

        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  def stack_backend_type(conn, %{"stack" => stack}) do
    try do
      json(conn, Byoc.detect_stack_backend_type(project_id(conn), stack))
    rescue
      e in ArgumentError -> conn |> put_status(400) |> json(%{"error" => e.message})
    end
  end

  def inventory_csv(conn, _params) do
    csv =
      Byoc.export_inventory_csv(
        conn.query_params["account_id"],
        project_id(conn)
      )

    conn
    |> put_resp_content_type("text/csv")
    |> put_resp_header("content-disposition", "attachment; filename=byoc-inventory.csv")
    |> send_resp(200, csv)
  end

  def adopt_only(conn, _params) do
    data = conn.body_params || %{}
    user_id = current_user(conn)["user_id"]

    if data["account_id"] in [nil, ""] or data["stack"] in [nil, ""] do
      conn |> put_status(400) |> json(%{"error" => "account_id and stack required"})
    else
      try do
        res =
          ByocImportMapping.adopt_resources_import_only(
            data["account_id"],
            project_id: data["project_id"] || project_id(conn),
            stack: data["stack"],
            resource_ids: data["resource_ids"] || [],
            address_overrides: data["address_overrides"] || {},
            actor_id: user_id
          )

        json(conn, res)
      rescue
        e in ArgumentError -> conn |> put_status(400) |> json(%{"error" => e.message})
      end
    end
  end

  def clash_check(conn, _params) do
    data = conn.body_params || %{}

    if data["resource_id"] in [nil, ""] or data["target_stack"] in ["", nil] do
      conn |> put_status(400) |> json(%{"error" => "resource_id and target_stack required"})
    else
      try do
        res =
          ByocImportMapping.check_resource_clash(
            account_id: data["account_id"] || "",
            resource_type: data["resource_type"] || "",
            resource_id: data["resource_id"] || "",
            target_stack: data["target_stack"] || data["stack"] || "",
            project_id: data["project_id"] || project_id(conn)
          )

        json(conn, res)
      rescue
        e in ArgumentError -> conn |> put_status(400) |> json(%{"error" => e.message})
      end
    end
  end

  # -- quota --------------------------------------------------------------------------

  def quota_get(conn, %{"account_id" => account_id}) do
    try do
      json(conn, Byoc.get_account_quota(account_id))
    rescue
      e in ArgumentError -> conn |> put_status(404) |> json(%{"error" => e.message})
    end
  end

  def quota_set(conn, %{"account_id" => account_id}) do
    data = conn.body_params || %{}
    limits = data["quota_limits"] || data["limits"] || data

    try do
      json(conn, Byoc.set_account_quota(account_id, limits))
    rescue
      e in ArgumentError -> conn |> put_status(404) |> json(%{"error" => e.message})
    end
  end

  # -- backup --------------------------------------------------------------------------

  def backup_export(conn, _params) do
    json(
      conn,
      Byoc.backup_accounts_encrypted(project_id(conn), get_req_header(conn, "x-org-id") |> List.first())
    )
  end

  def backup_restore(conn, _params) do
    data = conn.body_params || %{}
    project = data["project_id"] || project_id(conn)
    overwrite = !!Map.get(data, "overwrite", false)

    try do
      json(conn, Byoc.restore_accounts_encrypted(data, project, overwrite))
    rescue
      e in ArgumentError -> conn |> put_status(400) |> json(%{"error" => e.message})
    end
  end

  def unmanaged(conn, %{"account_id" => account_id}) do
    try do
      json(conn, Byoc.diff_inventory_unmanaged_resources(account_id))
    rescue
      e in ArgumentError -> conn |> put_status(404) |> json(%{"error" => e.message})
    end
  end

  # -- helpers ---------------------------------------------------------------------------

  defp parse_int(v, default) when is_binary(v) do
    case Integer.parse(v) do
      {n, _} -> n
      :error -> default
    end
  end

  defp parse_int(v, _default) when is_integer(v), do: v
  defp parse_int(v, _default) when is_float(v), do: trunc(v)
  defp parse_int(_, default), do: default

  defp clamp_int(v, min, max, default), do: min(max(parse_int(v, default), min), max)

  defp to_number(v) when is_integer(v), do: v * 1.0
  defp to_number(v) when is_float(v), do: v

  defp to_number(v) when is_binary(v) do
    case Float.parse(v) do
      {f, _} -> f
      :error -> raise ArgumentError, message: "number required"
    end
  end

  defp to_number(_), do: raise(ArgumentError, message: "number required")
end
