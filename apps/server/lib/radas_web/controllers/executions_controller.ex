defmodule RadasWeb.ExecutionsController do
  @moduledoc """
  Port of `api/executions_routes.py` — the 15 `/api/executions/*` routes with
  identical response shapes. Auth: `RadasWeb.Plugs.Auth` (JWT or
  internal-call); worker log/finish live in `RadasWeb.WorkerController`.

  The SSE log stream uses chunked responses and `read_log_chunk` polling with
  the same {type, text, nextOffset, fileSize, isComplete, status} events.
  """

  use RadasWeb, :controller

  import Plug.Conn

  alias RadasAI.{ExecutionHistory, Executions}

  defp project_id_from(conn) do
    get_req_header(conn, "x-project-id") |> List.first() || conn.query_params["project_id"]
  end

  # -- list / create / get / patch ---------------------------------------------

  def list(conn, _params) do
    project_id = project_id_from(conn)

    if project_id in [nil, ""] do
      conn |> put_status(400) |> json(%{"success" => false, "error" => "Project ID is required"})
    else
      q = conn.query_params["q"] || ""
      playbook_id = String.trim(conn.query_params["playbook_id"] || "")
      playbook_id = if playbook_id == "", do: nil, else: playbook_id

      executions =
        ExecutionHistory.list_executions(
          limit: parse_int(conn.query_params["limit"]),
          offset: parse_int(conn.query_params["offset"]) || 0,
          search_query: if(q == "", do: nil, else: q),
          playbook_id: playbook_id,
          project_id: project_id
        )

      json(conn, %{"success" => true, "executions" => executions})
    end
  end

  def create(conn, _params) do
    project_id = project_id_from(conn)

    if project_id in [nil, ""] do
      conn |> put_status(400) |> json(%{"success" => false, "error" => "Project ID is required"})
    else
      settings = ExecutionHistory.load_execution_settings()

      if settings["save_history"] in [false, 0, "0"] do
        conn |> put_status(400) |> json(%{"success" => false, "error" => "Execution history is disabled"})
      else
        execution_id = ExecutionHistory.create_execution_record(conn.body_params || %{}, project_id)
        json(conn, %{"success" => true, "executionId" => execution_id})
      end
    end
  end

  def show(conn, %{"execution_id" => execution_id}) do
    project_id = project_id_from(conn)

    if project_id in [nil, ""] do
      conn |> put_status(400) |> json(%{"success" => false, "error" => "Project ID is required"})
    else
      case Executions.get_execution(execution_id, project_id) do
        nil -> conn |> put_status(404) |> json(%{"success" => false, "error" => "Execution not found"})
        execution -> json(conn, %{"success" => true, "execution" => execution})
      end
    end
  end

  def update(conn, %{"execution_id" => execution_id}) do
    project_id = project_id_from(conn)

    if project_id in [nil, ""] do
      conn |> put_status(400) |> json(%{"success" => false, "error" => "Project ID is required"})
    else
      if Executions.update_execution_record(execution_id, conn.body_params || %{}, project_id) do
        json(conn, %{"success" => true})
      else
        conn |> put_status(500) |> json(%{"success" => false, "error" => "Failed to update execution"})
      end
    end
  end

  # -- cancel / stop ---------------------------------------------------------------

  def cancel(conn, %{"project_id" => project_id, "execution_id" => execution_id}) do
    case Executions.get_execution(execution_id, project_id) do
      nil ->
        conn |> put_status(404) |> json(%{"success" => false, "error" => "Execution not found"})

      execution ->
        current = execution["status"] || "QUEUED"

        if current != "QUEUED" do
          conn
          |> put_status(409)
          |> json(%{"success" => false, "error" => "Cannot cancel execution in status #{current}"})
        else
          try do
            Executions.validate_status_transition("QUEUED", "CANCELED")

            now = RadasAI.DB.now()

            Executions.update_execution_record(execution_id, %{
              "status" => "CANCELED",
              "canceledAt" => now,
              "cancelReason" => "user",
              "statusUpdatedAt" => now
            }, project_id)

            Executions.append_execution_log(execution_id, "[api] Canceled by user\n", project_id)

            try do
              Radas.Repo.transaction(fn ->
                RadasAI.Admission.release(reference_id: execution_id)
              end)
            rescue
              _ -> :ok
            end

            json(conn, %{"success" => true, "status" => "CANCELED"})
          rescue
            e in ArgumentError -> conn |> put_status(409) |> json(%{"success" => false, "error" => e.message})
          end
        end
    end
  end

  def stop(conn, %{"project_id" => project_id, "execution_id" => execution_id}) do
    case Executions.get_execution(execution_id, project_id) do
      nil ->
        conn |> put_status(404) |> json(%{"success" => false, "error" => "Execution not found"})

      execution ->
        current = execution["status"] || "QUEUED"

        if current == "CANCELING" do
          json(conn, %{"success" => true, "status" => "CANCELING"})
        else
          try do
            Executions.validate_status_transition(current, "CANCELING")

            now = RadasAI.DB.now()

            Executions.update_execution_record(execution_id, %{
              "status" => "CANCELING",
              "cancelRequestedAt" => now,
              "statusUpdatedAt" => now
            }, project_id)

            Executions.append_execution_log(execution_id, "[api] Stop requested\n", project_id)
            json(conn, %{"success" => true, "status" => "CANCELING"})
          rescue
            e in ArgumentError -> conn |> put_status(409) |> json(%{"success" => false, "error" => e.message})
          end
        end
    end
  end

  # -- logs ---------------------------------------------------------------------------

  def logs_parsed(conn, %{"execution_id" => execution_id}) do
    project_id = project_id_from(conn)

    if project_id in [nil, ""] do
      conn |> put_status(400) |> json(%{"success" => false, "error" => "Project ID is required"})
    else
      raw = ExecutionHistory.get_execution_log(execution_id, project_id)

      if raw in [nil, ""] do
        json(conn, %{"success" => true, "lines" => []})
      else
        lines = parse_log_lines(raw, conn.query_params)
        json(conn, %{"success" => true, "lines" => lines, "nextCursor" => nil})
      end
    end
  end

  defp parse_log_lines(raw, params) do
    playbook_filter = String.trim(params["playbook"] || "")
    host_filter = String.trim(params["host"] || "")

    raw
    |> String.split("\n")
    |> Enum.with_index()
    |> Enum.reject(fn {line, _i} -> String.trim(line) == "" end)
    |> Enum.map(fn {line, line_num} ->
      log_line = %{"text" => line, "lineNumber" => line_num}

      log_line =
        case Regex.run(~r/^PLAY\s+\[(.+?)\]/, line) do
          [_, play] -> Map.put(log_line, "playbook", String.trim(play))
          _ -> log_line
        end

      log_line =
        case Regex.run(~r/^\[?(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}[\.\d]*)\]?/, line) do
          [_, ts] -> Map.put(log_line, "timestamp", ts)
          _ -> log_line
        end

      log_line =
        case Regex.run(~r/^(\S+)\s*\|\s*/, line) do
          [_, host] -> Map.put(log_line, "host", host)
          _ -> log_line
        end

      lower = String.downcase(line)

      level =
        cond do
          String.contains?(lower, "fatal:") or String.contains?(lower, "failed!") or String.contains?(lower, "error") -> "error"
          String.contains?(lower, "warning") or String.contains?(lower, "warn") -> "warning"
          String.contains?(lower, "changed:") or String.contains?(lower, "ok:") -> "success"
          String.contains?(lower, "skipping") -> "info"
          true -> "info"
        end

      log_line = Map.put(log_line, "level", level)

      keep_playbook = playbook_filter == "" or playbook_filter == "all" or
                        String.contains?(String.downcase(Map.get(log_line, "playbook", "")), String.downcase(playbook_filter)) or
                        String.contains?(String.downcase(line), String.downcase(playbook_filter))

      keep_host = host_filter == "" or host_filter == "all" or
                    String.contains?(String.downcase(Map.get(log_line, "host", "")), String.downcase(host_filter)) or
                    String.contains?(String.downcase(line), String.downcase(host_filter))

      if keep_playbook and keep_host, do: log_line
    end)
    |> Enum.reject(&is_nil/1)
  end

  def log_incremental(conn, %{"execution_id" => execution_id}) do
    project_id = project_id_from(conn)

    if project_id in [nil, ""] do
      conn |> put_status(400) |> json(%{"success" => false, "error" => "Project ID is required"})
    else
      offset = parse_int(conn.query_params["offset"]) || 0
      {text, next_offset, file_size, is_complete} = Executions.read_log_chunk(execution_id, offset, 1024 * 1024, project_id)
      status = Executions.get_execution(execution_id, project_id) |> then(&(if &1, do: &1["status"], else: "UNKNOWN"))

      json(conn, %{
        "success" => true,
        "text" => text,
        "nextOffset" => next_offset,
        "fileSize" => file_size,
        "isComplete" => is_complete,
        "status" => status
      })
    end
  end

  def log_stream(conn, %{"execution_id" => execution_id}) do
    project_id = conn.query_params["project_id"]
    offset = parse_int(conn.query_params["offset"]) || 0

    stream =
      Stream.resource(
        fn -> {offset, 0} end,
        fn
          {offset, empty_reads} ->
            if empty_reads >= 300 do
              {:halt, {offset, empty_reads}}
            else
              {text, next_offset, size, complete} = Executions.read_log_chunk(execution_id, offset, 1024 * 1024, project_id)
              status = Executions.get_execution(execution_id, project_id) |> then(&(if &1, do: &1["status"], else: "UNKNOWN"))

              if text != "" do
                event = %{"type" => "chunk", "text" => text, "nextOffset" => next_offset, "fileSize" => size, "isComplete" => complete, "status" => status}
                frame = "data: " <> Jason.encode!(event) <> "\n\n"
                {[frame], {next_offset, if(complete, do: 301, else: 0)}}
              else
                {[frame_status(status)], {offset, empty_reads + 1}}
              end
            end
        end,
        fn _ -> :ok end
      )

    conn = put_resp_content_type(conn, "text/event-stream")
    conn = put_resp_header(conn, "cache-control", "no-cache")
    conn = send_chunked(conn, 200)

    Enum.reduce_while(stream, conn, fn frame, acc ->
      case chunk(acc, frame) do
        {:ok, acc} -> {:cont, acc}
        {:error, _} -> {:halt, acc}
      end
    end)
  end

  defp frame_status(status) do
    "data: " <> Jason.encode!(%{"type" => "status", "status" => status}) <> "\n\n"
  end

  def logs_append(conn, %{"execution_id" => execution_id}) do
    project_id = project_id_from(conn)
    text = to_string(conn.body_params["text"] || "")

    if project_id in [nil, ""] do
      conn |> put_status(400) |> json(%{"success" => false, "error" => "Project ID is required"})
    else
      Executions.append_execution_log(execution_id, text, project_id)
      json(conn, %{"success" => true})
    end
  end

  # -- clear / stats / settings ---------------------------------------------------------

  def clear(conn, _params) do
    project_id = project_id_from(conn)

    if project_id in [nil, ""] do
      conn |> put_status(400) |> json(%{"success" => false, "error" => "Project ID is required"})
    else
      json(conn, %{"success" => true, "deletedCount" => ExecutionHistory.clear_all_executions(project_id)})
    end
  end

  def stats(conn, _params) do
    project_id = project_id_from(conn)

    if project_id in [nil, ""] do
      conn |> put_status(400) |> json(%{"success" => false, "error" => "Project ID is required"})
    else
      json(conn, %{"success" => true, "stats" => ExecutionHistory.get_execution_stats(project_id)})
    end
  end

  def settings_show(conn, _params) do
    json(conn, %{
      "success" => true,
      "settings" => ExecutionHistory.load_execution_settings(),
      "stats" => ExecutionHistory.get_execution_stats(nil)
    })
  end

  def settings_save(conn, _params) do
    data = conn.body_params || %{}
    settings = ExecutionHistory.save_execution_settings(data)
    json(conn, %{"success" => true, "settings" => settings})
  end

  # -- execution-wide SSE stream (status change events) -----------------------------------

  def execution_stream(conn, _params) do
    frames =
      ExecutionHistory.list_executions(limit: 100)
      |> Enum.map(fn execution ->
        event = %{"type" => "status", "id" => execution["id"], "status" => execution["status"]}
        "data: " <> Jason.encode!(event) <> "\n\n"
      end)

    conn = put_resp_content_type(conn, "text/event-stream")
    conn = put_resp_header(conn, "cache-control", "no-cache")
    conn = send_chunked(conn, 200)

    Enum.reduce_while(frames, conn, fn frame, acc ->
      case chunk(acc, frame) do
        {:ok, acc} -> {:cont, acc}
        {:error, _} -> {:halt, acc}
      end
    end)
  end

  defp parse_int(nil), do: nil

  defp parse_int(value) when is_binary(value) do
    case Integer.parse(value) do
      {n, _} -> n
      :error -> nil
    end
  end

  defp parse_int(value) when is_integer(value), do: value
end
