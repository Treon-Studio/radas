defmodule RadasWeb.ComplianceController do
  @moduledoc """
  Port of `api/compliance_routes.py` (Fase 2 — UC 44/45/73 + UC608):
  compliance scorecard, report, and printable export.
  """

  use RadasWeb, :controller

  import Plug.Conn

  alias RadasAI.ComplianceService
  alias RadasWeb.Plugs.OrgAccess

  defp project_id(conn),
    do: conn.query_params["project_id"] || get_req_header(conn, "x-project-id") |> List.first()

  defp with_access(conn, fun) do
    pid = project_id(conn)

    if pid in [nil, ""] do
      conn |> put_status(400) |> json(%{"error" => "Project required"})
    else
      case OrgAccess.ensure_project_access(conn, pid) do
        :ok -> fun.(pid)
        {:error, status, body} -> conn |> put_status(status) |> json(body)
      end
    end
  end

  def scorecard(conn, _params), do: with_access(conn, &json(conn, ComplianceService.scorecard(&1)))
  def report(conn, _params), do: with_access(conn, &json(conn, ComplianceService.report(&1)))

  def export(conn, _params) do
    with_access(conn, fn pid ->
      format = conn.query_params["format"] || "html"
      output = ComplianceService.export_report(pid, format)

      if String.downcase(format) == "json" do
        conn |> put_resp_content_type("application/json") |> send_resp(200, output)
      else
        conn |> put_resp_content_type("text/html; charset=utf-8") |> send_resp(200, output)
      end
    end)
  end
end
