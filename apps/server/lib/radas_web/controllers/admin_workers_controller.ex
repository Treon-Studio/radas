defmodule RadasWeb.AdminWorkersController do
  @moduledoc """
  Port of `api/admin_routes.py` — worker management surface (admin):
  list/create/get/patch/delete, token rotation (plaintext returned once),
  enable/disable, request-info, and per-worker run listing.
  """

  use RadasWeb, :controller

  import Plug.Conn

  alias RadasAI.WorkerRegistry

  defp online?(worker), do: WorkerRegistry.is_worker_online(worker["id"] || "", 60)

  defp public_worker(worker) do
    %{
      "id" => worker["id"],
      "name" => worker["name"],
      "description" => worker["description"],
      "enabled" => Map.get(worker, "enabled", true),
      "capabilities" => worker["capabilities"] || %{},
      "tags" => worker["tags"] || [],
      "tagColors" => worker["tagColors"] || %{},
      "createdAt" => worker["createdAt"],
      "lastSeenAt" => worker["lastSeenAt"],
      "currentExecutionId" => worker["currentExecutionId"]
    }
  end

  defp detailed_worker(worker) do
    public_worker(worker)
    |> Map.merge(%{
      "status" => if(online?(worker), do: "online", else: "offline"),
      "systemInfo" => worker["systemInfo"],
      "systemInfoUpdatedAt" => worker["systemInfoUpdatedAt"]
    })
  end

  def list(conn, _params) do
    workers =
      WorkerRegistry.load_all_workers()
      |> Enum.map(fn {_id, w} -> public_worker(w) end)

    json(conn, %{"success" => true, "workers" => workers})
  end

  def create(conn, _params) do
    body = conn.body_params || %{}
    name = (body["name"] || "") |> to_string() |> String.trim()

    if name == "" do
      conn |> put_status(400) |> json(%{"success" => false, "error" => "Worker name is required"})
    else
      worker = WorkerRegistry.create_worker(name, body["capabilities"] || %{}, body["tags"] || [])
      json(conn, %{"success" => true, "worker" => detailed_worker(worker), "workerToken" => worker["token"]})
    end
  rescue
    e -> conn |> put_status(500) |> json(%{"success" => false, "error" => Exception.message(e)})
  end

  def show(conn, %{"worker_id" => worker_id}) do
    case WorkerRegistry.load_worker(worker_id) do
      nil -> conn |> put_status(404) |> json(%{"success" => false, "error" => "Worker not found"})
      worker -> json(conn, %{"success" => true, "worker" => detailed_worker(worker)})
    end
  end

  def update(conn, %{"worker_id" => worker_id}) do
    body = conn.body_params || %{}

    case WorkerRegistry.load_worker(worker_id) do
      nil ->
        conn |> put_status(404) |> json(%{"success" => false, "error" => "Worker not found"})

      worker ->
        updates = %{}

        updates =
          if Map.has_key?(body, "name") do
            name = (body["name"] || "") |> to_string() |> String.trim()

            if name == "" do
              throw({:bad, conn, "Worker name cannot be empty"})
            else
              Map.put(updates, "name", name)
            end
          else
            updates
          end

        updates =
          if Map.has_key?(body, "tags") do
            unless is_list(body["tags"]), do: throw({:bad, conn, "Tags must be an array"})
            Map.put(updates, "tags", body["tags"])
          else
            updates
          end

        updates =
          if Map.has_key?(body, "tagColors") do
            unless is_map(body["tagColors"]), do: throw({:bad, conn, "tagColors must be an object"})
            Map.put(updates, "tagColors", body["tagColors"])
          else
            updates
          end

        updates =
          if Map.has_key?(body, "capabilities"), do: Map.put(updates, "capabilities", body["capabilities"]), else: updates

        updates =
          if Map.has_key?(body, "description"), do: Map.put(updates, "description", body["description"]), else: updates

        if updates == %{} do
          conn |> put_status(400) |> json(%{"success" => false, "error" => "No fields to update"})
        else
          worker = Map.merge(worker, updates)

          case WorkerRegistry.save_worker(worker) do
            true ->
              case WorkerRegistry.load_worker(worker_id) do
                nil -> conn |> put_status(500) |> json(%{"success" => false, "error" => "Failed to load updated worker"})
                updated -> json(conn, %{"success" => true, "worker" => detailed_worker(updated)})
              end

            _ ->
              conn |> put_status(500) |> json(%{"success" => false, "error" => "Failed to update worker"})
          end
        end
    end
  catch
    {:bad, conn, msg} -> conn |> put_status(400) |> json(%{"success" => false, "error" => msg})
  end

  def delete(conn, %{"worker_id" => worker_id}) do
    if WorkerRegistry.delete_worker(worker_id) do
      json(conn, %{"success" => true})
    else
      conn |> put_status(404) |> json(%{"success" => false, "error" => "Worker not found"})
    end
  end

  def rotate_token(conn, %{"worker_id" => worker_id}) do
    case WorkerRegistry.rotate_worker_token(worker_id) do
      nil -> conn |> put_status(404) |> json(%{"success" => false, "error" => "Worker #{worker_id} not found"})
      plaintext -> json(conn, %{"success" => true, "workerToken" => plaintext, "message" => "IMPORTANT: Save this token! It will not be shown again."})
    end
  end

  def enable(conn, %{"worker_id" => worker_id}) do
    if WorkerRegistry.set_worker_enabled(worker_id, true) do
      json(conn, %{"success" => true})
    else
      conn |> put_status(404) |> json(%{"success" => false, "error" => "Worker not found"})
    end
  end

  def disable(conn, %{"worker_id" => worker_id}) do
    if WorkerRegistry.set_worker_enabled(worker_id, false) do
      json(conn, %{"success" => true})
    else
      conn |> put_status(404) |> json(%{"success" => false, "error" => "Worker not found"})
    end
  end

  def request_info(conn, %{"worker_id" => worker_id}) do
    case WorkerRegistry.request_system_info(worker_id) do
      nil -> conn |> put_status(404) |> json(%{"success" => false, "error" => "Worker not found"})
      worker -> json(conn, %{"success" => true, "worker" => detailed_worker(worker)})
    end
  end

  def runs(conn, %{"worker_id" => worker_id}) do
    # Executions previously claimed/run by this worker (best effort).
    rows =
      RadasAI.DB.query_all!(
        """
        SELECT data FROM executions
        WHERE data->>'workerId' = $1
        ORDER BY created_at DESC LIMIT 50
        """,
        [worker_id]
      )

    runs = Enum.map(rows, & &1["data"])
    json(conn, %{"success" => true, "runs" => runs})
  rescue
    _ -> json(conn, %{"success" => true, "runs" => []})
  end
end
