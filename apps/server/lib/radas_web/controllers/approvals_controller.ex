defmodule RadasWeb.ApprovalsController do
  @moduledoc """
  Port of `api/approval_routes.py` (Fase 2 — UC 50/68/72): list/create/
  approve/reject approval records. Auth via the legacy pipeline; creation
  rejects duplicates for the same pending (stack, action).
  """

  use RadasWeb, :controller

  import Plug.Conn

  alias RadasAI.ApprovalService

  defp who(conn) do
    user = conn.assigns[:current_user] || %{}
    user["username"] || user["email"] || user["user_id"] || ""
  end

  def list(conn, _params) do
    status = conn.query_params["status"]
    approvals = ApprovalService.list_approvals(conn.query_params["project_id"], status)
    json(conn, %{"approvals" => approvals})
  end

  def create(conn, _params) do
    data = conn.body_params || %{}
    stack = String.trim(to_string(data["stack"] || ""))
    action = data["action"] |> to_string() |> String.trim() |> String.downcase()
    pid = data["project_id"] || get_req_header(conn, "x-project-id") |> List.first()

    cond do
      stack == "" or pid in [nil, ""] ->
        conn |> put_status(400) |> json(%{"error" => "stack and project_id required"})

      action not in ApprovalService.actions() ->
        conn |> put_status(400) |> json(%{"error" => "action must be one of #{inspect(ApprovalService.actions())}"})

      ApprovalService.latest_pending(stack, pid, action) != nil ->
        conn |> put_status(409) |> json(%{"error" => "A pending approval already exists for this action"})

      true ->
        rec = ApprovalService.create_approval(stack, pid, action, requested_by: who(conn), note: to_string(data["note"] || ""))
        conn |> put_status(201) |> json(%{"success" => true, "approval" => rec})
    end
  end

  def approve(conn, %{"approval_id" => approval_id}) do
    case ApprovalService.decide(approval_id, "approved", decided_by: who(conn)) do
      nil -> conn |> put_status(404) |> json(%{"error" => "not found"})
      rec -> json(conn, %{"success" => true, "approval" => rec})
    end
  end

  def reject(conn, %{"approval_id" => approval_id}) do
    data = conn.body_params || %{}

    try do
      case ApprovalService.decide(approval_id, "rejected", decided_by: who(conn), reason: to_string(data["reason"] || "")) do
        nil -> conn |> put_status(404) |> json(%{"error" => "not found"})
        rec -> json(conn, %{"success" => true, "approval" => rec})
      end
    rescue
      e in ArgumentError -> conn |> put_status(400) |> json(%{"error" => e.message})
    end
  end
end
