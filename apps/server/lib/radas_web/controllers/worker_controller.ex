defmodule RadasWeb.WorkerController do
  @moduledoc """
  Port of the registration/heartbeat/system-info slice of
  `api/worker_routes.py` with identical response shapes.

  **Coexistence boundary:** `/api/worker/claim`, `/api/worker/executions/*`
  stay on Flask via nginx while the execution pipeline is filesystem-bound
  (they read/write `DATA_DIR/projects/<id>/history/executions/*.json`). The
  endpoints served here (register/heartbeat/system-info) share state with
  Flask through the Postgres `worker_tokens` index and the worker profile
  files, so registration is safe to cut over early.

  Auth: either the `X-Worker-Registration-Secret` env secret (register) or a
  worker Bearer token (heartbeat / system-info), verified via
  `RadasAI.WorkerRegistry.verify_token/1`.
  """

  use RadasWeb, :controller

  import Plug.Conn

  alias RadasAI.WorkerRegistry

  # -- register ----------------------------------------------------------------

  def register(conn, _params) do
    provided = get_req_header(conn, "x-worker-registration-secret") |> List.first() |> then(&(&1 || ""))
    reg_secret = String.trim(System.get_env("WORKER_REGISTRATION_SECRET") || "")
    jwt_user = conn.assigns[:current_user] || %{}
    via_jwt = conn.assigns[:token] != nil and jwt_user["user_id"] not in [nil, ""]
    allowed = (reg_secret != "" and Plug.Crypto.secure_compare(provided, reg_secret)) or via_jwt

    cond do
      not allowed and provided == "" ->
        conn
        |> put_status(401)
        |> json(%{
          "success" => false,
          "error" => "Authentication required to register workers."
        })

      not allowed ->
        conn
        |> put_status(403)
        |> json(%{
          "success" => false,
          "error" => "Worker registration denied: invalid registration secret"
        })

      true ->
        name = String.trim(to_string(conn.body_params["name"] || ""))

        if name == "" do
          conn |> put_status(400) |> json(%{"success" => false, "error" => "Worker name is required"})
        else
          capabilities = conn.body_params["capabilities"] || %{}
          tags = conn.body_params["tags"] || []

          {worker_id, worker_token} = WorkerRegistry.create_worker(name, capabilities, List.wrap(tags))

          json(conn, %{
            "success" => true,
            "workerId" => worker_id,
            "workerToken" => worker_token
          })
        end
    end
  end

  # -- heartbeat ------------------------------------------------------------------

  def heartbeat(conn, _params) do
    case worker_auth(conn) do
      {:ok, worker_id} ->
        case WorkerRegistry.heartbeat(worker_id) do
          nil ->
            auth_denied(conn)

          worker ->
            json(conn, %{
              "success" => true,
              "workerId" => worker["id"],
              "requestSystemInfo" => worker["systemInfoRequested"] == true
            })
        end

      {:error, :invalid} ->
        auth_denied(conn)
    end
  end

  # -- system info ------------------------------------------------------------------

  def system_info(conn, _params) do
    case worker_auth(conn) do
      {:ok, worker_id} ->
        worker = WorkerRegistry.load_worker(worker_id)

        if worker do
          worker =
            worker
            |> Map.put("systemInfo", conn.body_params["systemInfo"] || %{})
            |> Map.put("systemInfoRequested", false)

          WorkerRegistry.save_worker(worker)
          json(conn, %{"success" => true})
        else
          auth_denied(conn)
        end

      {:error, :invalid} ->
        auth_denied(conn)
    end
  end


  # -- claim (Go worker protocol: 204 = no work, NO body) ---------------------------

  def claim(conn, _params) do
    case worker_auth(conn) do
      {:ok, worker_id} ->
        if claim_rate_limited?(worker_id) do
          conn
          |> put_status(429)
          |> json(%{"success" => false, "error" => "Rate limit exceeded"})
        else
          worker = WorkerRegistry.load_worker(worker_id) || %{}
          max_concurrency = parse_int(worker["capabilities"]["maxConcurrency"], 1)

          case RadasAI.ExecutionClaim.claim_next(worker_id, worker,
                 max_concurrency: max_concurrency
               ) do
            {:ok, execution_id, execution, _project_id} ->
              json(conn, %{
                "success" => true,
                "executionId" => execution_id,
                "execution" => execution,
                "queuedAt" => execution["queuedAt"]
              })

            :no_work ->
              # Go worker contract: 204 = no work, and the body MUST be empty.
              send_resp(conn, 204, "")
          end
        end

      {:error, :invalid} ->
        auth_denied(conn)
    end
  end

  # -- execution log (worker-owned) ---------------------------------------------------

  def execution_log(conn, %{"execution_id" => execution_id}) do
    case worker_auth(conn) do
      {:ok, worker_id} ->
        text = to_string(conn.body_params["text"] || "")

        cond do
          text == "" ->
            conn |> put_status(400) |> json(%{"success" => false, "error" => "Log text is required"})

          true ->
            case RadasAI.Executions.get_execution(execution_id, nil) do
              nil ->
                conn |> put_status(404) |> json(%{"success" => false, "error" => "Execution not found"})

              execution ->
                cond do
                  execution["workerId"] != worker_id ->
                    conn
                    |> put_status(403)
                    |> json(%{"success" => false, "error" => "Worker does not own this execution"})

                  true ->
                    RadasAI.Executions.append_execution_log(execution_id, text, execution["projectId"] || "default")
                    json(conn, %{"success" => true})
                end
            end
        end

      {:error, :invalid} ->
        auth_denied(conn)
    end
  end

  # -- execution finish (worker-owned, status allowlist) --------------------------------

  @finish_statuses ["SUCCESS", "FAILED", "CANCELED"]

  def execution_finish(conn, %{"execution_id" => execution_id}) do
    case worker_auth(conn) do
      {:ok, worker_id} ->
        status = String.upcase(to_string(conn.body_params["status"] || ""))
        body = conn.body_params || %{}

        cond do
          status not in @finish_statuses ->
            conn
            |> put_status(400)
            |> json(%{"success" => false, "error" => "Status must be SUCCESS, FAILED or CANCELED"})

          true ->
            case RadasAI.Executions.get_execution(execution_id, nil) do
              nil ->
                conn |> put_status(404) |> json(%{"success" => false, "error" => "Execution not found"})

              execution ->
                if execution["workerId"] != worker_id do
                  conn
                  |> put_status(403)
                  |> json(%{"success" => false, "error" => "Worker does not own this execution"})
                else
                  updates = %{
                    "status" => status,
                    "result" => body["result"],
                    "errorCode" => safe_error_code(body["errorCode"])
                  }

                  RadasAI.Executions.update_execution_record(execution_id, updates, execution["projectId"])

                  # Release the admission lease so the worker can claim again.
                  try do
                    RadasAI.Admission.release(reference_id: execution_id)
                  rescue
                    _ -> :ok
                  end

                  json(conn, %{"success" => true})
                end
            end
        end

      {:error, :invalid} ->
        auth_denied(conn)
    end
  end

  # errorCode allowlist (safeErrorCode): never persist free-text errors.
  @safe_error_codes MapSet.new([
                      "TIMEOUT",
                      "CONNECTION_ERROR",
                      "ANSIBLE_FAILED",
                      "ANSIBLE_UNREACHABLE",
                      "CANCELLED",
                      "INTERNAL_ERROR",
                      "VALIDATION_FAILED",
                      "PLAYBOOK_NOT_FOUND",
                      "INVENTORY_ERROR"
                    ])

  defp safe_error_code(code) when is_binary(code) do
    if MapSet.member?(@safe_error_codes, code), do: code, else: "INTERNAL_ERROR"
  end

  defp safe_error_code(_), do: nil

  defp parse_int(nil, default), do: default

  defp parse_int(v, _default) when is_integer(v), do: v
  defp parse_int(v, _default) when is_float(v), do: trunc(v)

  defp parse_int(v, default) when is_binary(v) do
    case Float.parse(v) do
      {f, _} -> trunc(f)
      :error -> default
    end
  end

  defp parse_int(_, default), do: default

  # 1-second claim rate limit per worker (mirrors Python).
  defp claim_rate_limited?(worker_id) do
    now = System.os_time(:millisecond)
    key = {:claim_rate, worker_id}
    last = :persistent_term.get(key, nil)

    if last != nil and now - last < 1000 do
      true
    else
      :persistent_term.put(key, now)
      false
    end
  end

  # -- helpers ------------------------------------------------------------------------

  defp auth_denied(conn) do
    conn
    |> put_status(401)
    |> json(%{"success" => false, "error" => "Invalid worker token"})
  end

  defp worker_auth(conn) do
    token =
      get_req_header(conn, "authorization")
      |> List.first()
      |> then(fn
        "Bearer " <> rest -> String.trim(rest)
        _ -> nil
      end)

    case WorkerRegistry.verify_token(token) do
      {worker_id, _worker} -> {:ok, worker_id}
      nil -> {:error, :invalid}
    end
  end
end
