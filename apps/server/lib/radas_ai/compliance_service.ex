defmodule RadasAI.ComplianceService do
  @moduledoc """
  Port of `services/compliance_service.py` (Fase 2 — UC 44/45/73 + UC608):
  compliance scorecard, report, and printable HTML/JSON export derived from
  the shared audit_log table and stack metadata.

  Checks backed by services without an Elixir port (project quota, project
  budget) keep the Python exception-path default (`ok: false`) instead of
  raising — same runtime behavior when those features are unconfigured.
  """

  import RadasAI.DB

  alias RadasAI.CloudStacks

  @doc "Audit activity summary for the last `days` days (Python audit_summary)."
  @spec audit_summary(integer()) :: map()
  def audit_summary(days \\ 7) do
    cutoff = System.system_time(:second) - days * 86400

    rows =
      try do
        query_all!(
          "SELECT action, COUNT(*) AS c FROM audit_log WHERE created_at >= $1 GROUP BY action",
          [Integer.to_string(cutoff)]
        )
      rescue
        _ -> []
      end

    by_action = Map.new(rows, fn r -> {r["action"] || "", r["c"] || 0} end)

    failed =
      by_action
      |> Enum.filter(fn {a, _c} ->
        String.contains?(String.downcase(a || ""), "fail") or a in ["login.failed", "LOGIN_FAILED"]
      end)
      |> Enum.map(fn {_a, c} -> c end)
      |> Enum.sum()

    %{"total" => Enum.sum(Map.values(by_action)), "by_action" => by_action, "failed_logins" => failed}
  end

  @doc "Newest audit entries (Python recent_audit)."
  @spec recent_audit(integer()) :: [map()]
  def recent_audit(limit \\ 20) do
    rows =
      try do
        query_all!(
          """
          SELECT actor_user_id, action, target_type, target_id, created_at
          FROM audit_log ORDER BY created_at DESC LIMIT #{limit}
          """,
          []
        )
      rescue
        _ -> []
      end

    Enum.map(rows, fn r ->
      %{"actor" => r["actor_user_id"], "action" => r["action"], "target" => r["target_type"], "target_id" => r["target_id"], "at" => r["created_at"]}
    end)
  end

  @doc "Count of users with MFA enabled."
  @spec mfa_users() :: integer()
  def mfa_users do
    case query_one!("SELECT COUNT(*) AS c FROM users WHERE mfa_secret IS NOT NULL AND mfa_secret != ''", []) do
      %{"c" => c} -> c || 0
      nil -> 0
    end
  rescue
    _ -> 0
  end

  @doc "Prod stacks missing approval_required (Python prod_stacks_without_approval)."
  @spec prod_stacks_without_approval(String.t()) :: [String.t()]
  def prod_stacks_without_approval(project_id) do
    CloudStacks.list_stacks(project_id)
    |> Enum.filter(&(&1["env"] == "prod"))
    |> Enum.filter(&(CloudStacks.load_meta(project_id, &1["name"])["approval_required"] != true))
    |> Enum.map(& &1["name"])
  rescue
    _ -> []
  end

  @doc "Weighted compliance checks (Python scorecard)."
  @spec scorecard(String.t()) :: map()
  def scorecard(project_id) do
    audit = audit_summary(7)
    prod_missing = prod_stacks_without_approval(project_id)
    mfa = mfa_users()
    has_notif = webhooks_configured?()

    checks = [
      %{"id" => "quota", "label" => "Project quota configured", "ok" => false, "weight" => 20},
      %{"id" => "approval", "label" => "Prod stacks require approval", "ok" => prod_missing == [], "weight" => 20,
        "detail" => if(prod_missing != [], do: "#{length(prod_missing)} prod stack(s) without approval", else: "")},
      %{"id" => "notify", "label" => "Webhook or budget configured", "ok" => has_notif, "weight" => 10},
      %{"id" => "logins", "label" => "Low failed-login count (7d)", "ok" => audit["failed_logins"] <= 5, "weight" => 20,
        "detail" => "#{audit["failed_logins"]} failed"},
      %{"id" => "mfa", "label" => "MFA enabled on accounts", "ok" => mfa > 0, "weight" => 10,
        "detail" => if(mfa > 0, do: "#{mfa} user(s) with MFA", else: "")},
      %{"id" => "audit", "label" => "Audit activity present", "ok" => audit["total"] > 0, "weight" => 10,
        "detail" => "#{audit["total"]} events (7d)"}
    ]

    score = Enum.sum(Enum.map(checks, fn c -> if c["ok"], do: c["weight"], else: 0 end))
    %{"score" => score, "max" => 100, "checks" => checks, "project_id" => project_id}
  end

  @doc "Full report (Python report)."
  @spec report(String.t()) :: map()
  def report(project_id) do
    %{
      "audit_30d" => audit_summary(30),
      "recent" => recent_audit(20),
      "prod_stacks_without_approval" => prod_stacks_without_approval(project_id),
      "mfa_users" => mfa_users(),
      "scorecard" => scorecard(project_id)
    }
  end

  @doc "JSON or printable HTML compliance report (UC608)."
  @spec export_report(String.t() | nil, String.t()) :: String.t()
  def export_report(project_id \\ nil, format_type \\ "html") do
    pid = project_id || "default"
    data = report(pid)
    sc = data["scorecard"] || %{}

    if String.downcase(format_type) == "json" do
      Jason.encode!(data, pretty: true)
    else
      generated =
        DateTime.utc_now()
        |> Calendar.strftime("%Y-%m-%d %H:%M:%S UTC")

      checks_html =
        Enum.map_join(sc["checks"] || [], "", fn c ->
          badge = if c["ok"], do: "PASS", else: "FAIL"
          color = if c["ok"], do: "green", else: "red"

          """
          <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">#{c["label"]}</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">#{c["weight"]}</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;"><span style="color:#{color};font-weight:bold;">#{badge}</span></td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; color: #666;">#{c["detail"] || ""}</td>
          </tr>
          """
        end)

      """
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <title>Compliance & Security Audit Report - #{pid}</title>
          <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 40px; color: #222; }
              h1 { border-bottom: 2px solid #0052cc; padding-bottom: 10px; color: #0052cc; }
              .score { font-size: 24px; font-weight: bold; margin: 20px 0; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; }
              th { background: #f4f5f7; text-align: left; padding: 10px 8px; border-bottom: 2px solid #ddd; }
          </style>
      </head>
      <body>
          <h1>Compliance & Security Audit Report</h1>
          <p><strong>Project:</strong> #{pid}</p>
          <p><strong>Generated At:</strong> #{generated}</p>

          <h2>Scorecard Overview</h2>
          <div class="score">Compliance Score: #{sc["score"] || 0} / #{sc["max"] || 100}</div>
          <table>
              <thead>
                  <tr>
                      <th>Security Check</th>
                      <th>Weight</th>
                      <th>Status</th>
                      <th>Details</th>
                  </tr>
              </thead>
              <tbody>
                  #{checks_html}
              </tbody>
          </table>
      </body>
      </html>
      """
      |> String.trim_trailing("\n")
    end
  end

  defp webhooks_configured? do
    # WebhookDispatcher.load_webhooks is private; a configured-store check
    # via the KV scope mirrors Python's bool(load_webhooks()).
    case RadasAI.KV.load("webhooks") do
      list when is_list(list) and list != [] -> true
      _ -> false
    end
  end
end
