defmodule RadasWeb.AuditLogController do
  @moduledoc """
  Port of `api/audit_log_routes.py` — audit log list/search/export/prune
  over the shared `audit_log` Postgres table (UC620/UC621). Scope: the
  resolved project must exist and the caller needs owner/admin
  (`_project_scope` port; internal callers bypass).
  """

  use RadasWeb, :controller

  import Plug.Conn

  import RadasAI.DB

  alias RadasWeb.Plugs.OrgAccess

  defp project_id(conn),
    do: get_req_header(conn, "x-project-id") |> List.first() || conn.query_params["project_id"]

  defp project_scope(conn) do
    pid = project_id(conn)

    if pid in [nil, ""] do
      {:error, conn |> put_status(422) |> json(%{"success" => false, "error" => "X-Project-Id is required"})}
    else
      case query_one!("SELECT org_id FROM projects WHERE id = $1", [pid]) do
        %{"org_id" => org} when org not in [nil, ""] ->
          user = conn.assigns[:current_user] || %{}
          user_id = user["user_id"]
          role = OrgAccess.member_role(org, user_id)

          cond do
            role == nil and user_id != "__internal__" ->
              {:error, conn |> put_status(403) |> json(%{"success" => false, "error" => "Project access denied"})}

            role not in ["owner", "admin"] and user_id != "__internal__" ->
              {:error, conn |> put_status(403) |> json(%{"success" => false, "error" => "Audit access denied"})}

            true ->
              {:ok, pid}
          end

        _ ->
          {:error, conn |> put_status(404) |> json(%{"success" => false, "error" => "Project not found"})}
      end
    end
  end

  defp build_query(conn, opts) do
    wheres = []
    args = []

    {wheres, args} =
      case conn.query_params["target_type"] do
        v when v in [nil, ""] -> {wheres, args}
        v -> {wheres ++ ["target_type = $#{length(args) + 1}"], args ++ [v]}
      end

    {wheres, args} =
      case conn.query_params["target_id"] do
        v when v in [nil, ""] -> {wheres, args}
        v -> {wheres ++ ["target_id = $#{length(args) + 1}"], args ++ [v]}
      end

    {wheres, args} =
      case conn.query_params["actor_user_id"] do
        v when v in [nil, ""] -> {wheres, args}
        v -> {wheres ++ ["actor_user_id = $#{length(args) + 1}"], args ++ [v]}
      end

    {wheres, args} =
      case opts[:project_id] do
        nil -> {wheres, args}
        pid -> {wheres ++ ["meta_json::jsonb ->> 'project_id' = $#{length(args) + 1}"], args ++ [pid]}
      end

    {wheres, args} =
      case opts[:action] do
        nil -> {wheres, args}
        a -> {wheres ++ ["action = $#{length(args) + 1}"], args ++ [a]}
      end

    {wheres, args} =
      case opts[:start_time] do
        nil -> {wheres, args}
        t -> {wheres ++ ["created_at >= $#{length(args) + 1}"], args ++ [t]}
      end

    {wheres, args} =
      case opts[:end_time] do
        nil -> {wheres, args}
        t -> {wheres ++ ["created_at <= $#{length(args) + 1}"], args ++ [t]}
      end

    {wheres, args}
  end

  defp entries(conn, opts) do
    {wheres, args} = build_query(conn, opts)
    where = if wheres == [], do: "", else: " WHERE " <> Enum.join(wheres, " AND ")
    limit = clamp_int(opts[:limit] || query_int(conn, "limit", 100), 1, 1000)

    rows =
      query_all!(
        """
        SELECT id, actor_user_id, action, target_type, target_id, meta_json, created_at
        FROM audit_log#{where} ORDER BY id DESC LIMIT #{limit}
        """,
        args
      )

    Enum.map(rows, fn row ->
      meta = row["meta_json"]

      meta =
        cond do
          meta in [nil, ""] -> nil
          is_map(meta) -> meta
          true ->
            case Jason.decode(meta) do
              {:ok, m} -> m
              _ -> meta
            end
        end

      Map.put(row, "meta", meta) |> Map.delete("meta_json")
    end)
  end

  def list(conn, _params) do
    case project_scope(conn) do
      {:error, conn} ->
        conn

      {:ok, pid} ->
        entries = entries(conn, %{project_id: pid})

        if String.downcase(conn.query_params["format"] || "") == "csv" do
          header = ["id", "actor_user_id", "action", "target_type", "target_id", "created_at", "meta"]

          rows =
            Enum.map(entries, fn e ->
              [e["id"], e["actor_user_id"], e["action"], e["target_type"], e["target_id"], e["created_at"], Jason.encode!(e["meta"])]
            end)

          csv =
            Enum.map_join([header | rows], "\r\n", fn row ->
              Enum.map_join(row, ",", fn cell ->
                s = to_string(cell || "")
                if String.contains?(s, [",", "\"", "\n"]), do: "\"" <> String.replace(s, "\"", "\"\"") <> "\"", else: s
              end)
            end) <> "\r\n"

          conn
          |> put_resp_content_type("text/csv")
          |> put_resp_header("content-disposition", "attachment; filename=audit-log.csv")
          |> send_resp(200, csv)
        else
          json(conn, %{"success" => true, "entries" => entries, "count" => length(entries)})
        end
    end
  end

  def export(conn, _params) do
    case project_scope(conn) do
      {:error, conn} ->
        conn

      {:ok, pid} ->
        fmt = String.downcase(conn.query_params["format"] || "jsonl")

        entries =
          entries(conn, %{
            project_id: pid,
            action: conn.query_params["action"],
            start_time: conn.query_params["start_time"],
            end_time: conn.query_params["end_time"],
            limit: query_int(conn, "limit", 1000)
          })

        {mime, filename, body} =
          if fmt == "csv" do
            header = ["id", "actor_user_id", "action", "target_type", "target_id", "created_at", "meta"]

            rows =
              Enum.map(entries, fn e ->
                [e["id"], e["actor_user_id"], e["action"], e["target_type"], e["target_id"], e["created_at"], Jason.encode!(e["meta"])]
              end)

            csv =
              Enum.map_join([header | rows], "\r\n", fn row ->
                Enum.map_join(row, ",", fn cell ->
                  s = to_string(cell || "")
                  if String.contains?(s, [",", "\"", "\n"]), do: "\"" <> String.replace(s, "\"", "\"\"") <> "\"", else: s
                end)
              end) <> "\r\n"

            {"text/csv", "audit-export.csv", csv}
          else
            body = Enum.map_join(entries, "\n", &Jason.encode!/1)
            {"application/x-ndjson", "audit-export.jsonl", body}
          end

        conn
        |> put_resp_content_type(mime)
        |> put_resp_header("content-disposition", "attachment; filename=#{filename}")
        |> send_resp(200, body)
    end
  end

  def search(conn, _params) do
    scope =
      if project_id(conn) in [nil, ""] do
        {:ok, nil}
      else
        project_scope(conn)
      end

    case scope do
      {:error, conn} ->
        conn

      {:ok, pid} ->
        query = conn.query_params["query"]
        limit = clamp_int(query_int(conn, "limit", 100), 1, 1000)
        offset = max(0, query_int(conn, "offset", 0))

        wheres = []
        args = []

        {wheres, args} =
          if query not in [nil, ""] do
            {wheres ++
               ["(action ILIKE $#{length(args) + 1} OR target_type ILIKE $#{length(args) + 1} OR target_id ILIKE $#{length(args) + 1} OR meta_json ILIKE $#{length(args) + 1})"],
             args ++ ["%#{query}%"]}
          else
            {wheres, args}
          end

        {wheres, args} =
          case pid do
            nil -> {wheres, args}
            p -> {wheres ++ ["meta_json::jsonb ->> 'project_id' = $#{length(args) + 1}"], args ++ [p]}
          end

        where = if wheres == [], do: "", else: " WHERE " <> Enum.join(wheres, " AND ")

        rows =
          query_all!(
            """
            SELECT id, actor_user_id, action, target_type, target_id, meta_json, created_at
            FROM audit_log#{where} ORDER BY id DESC LIMIT #{limit} OFFSET #{offset}
            """,
            args
          )

        entries =
          Enum.map(rows, fn row ->
            meta = row["meta_json"]

            meta =
              cond do
                meta in [nil, ""] -> nil
                is_map(meta) -> meta
                true -> (Jason.decode(meta) |> elem(1)) || meta
              end

            Map.put(row, "meta", meta) |> Map.delete("meta_json")
          end)

        json(conn, %{"success" => true, "entries" => entries, "count" => length(entries), "limit" => limit, "offset" => offset})
    end
  end

  def prune(conn, _params) do
    case project_scope(conn) do
      {:error, conn} ->
        conn

      {:ok, pid} ->
        data = conn.body_params || %{}
        retention_days = parse_body_int(data["retention_days"], 90)
        cutoff = retention_days_end(retention_days)

        scope_where =
          if pid do
            " AND meta_json::jsonb ->> 'project_id' = '#{String.replace(pid, "'", "''")}'"
          else
            ""
          end

        deleted =
          execute!(
            "DELETE FROM audit_log WHERE created_at < $1#{scope_where}",
            [cutoff]
          ) || 0

        json(conn, %{"success" => true, "deleted_count" => deleted, "retention_days" => retention_days})
    end
  end

  defp retention_days_end(days) do
    DateTime.utc_now()
    |> DateTime.add(-days * 86400, :second)
    |> DateTime.to_iso8601()
  end

  defp parse_body_int(v, _default) when is_integer(v), do: v

  defp parse_body_int(v, default) when is_binary(v) do
    case Integer.parse(v) do
      {n, _} -> n
      :error -> default
    end
  end

  defp parse_body_int(_, default), do: default

  defp query_int(conn, key, default) when is_map(conn) do
    case Integer.parse(conn.query_params[key] || "") do
      {n, _} -> n
      :error -> default
    end
  end

  defp clamp_int(v, min, max), do: min(max(v, min), max)
end
