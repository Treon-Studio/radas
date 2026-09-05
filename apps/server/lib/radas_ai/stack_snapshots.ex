defmodule RadasAI.StackSnapshots do
  @moduledoc """
  Port of `services/stack_snapshots.py` — per-stack tfvars/state file
  snapshots stored in the `snapshots` Postgres table (bytea JSON payload),
  capped at 5 per stack.
  """

  import RadasAI.DB

  alias RadasAI.CloudStacks

  @max_snapshots 5

  @doc """
  Snapshot terraform.tfvars + terraform.tfstate into the snapshots table.
  Returns the snapshot id (ms epoch) or nil when there is nothing to save.
  """
  @spec snapshot(String.t() | nil, String.t(), String.t()) :: String.t() | nil
  def snapshot(project_id, name, reason \\ "manual") do
    sd = CloudStacks.stack_dir(project_id, name)

    payload =
      Enum.reduce(["terraform.tfvars", "terraform.tfstate"], %{}, fn f, acc ->
        path = Path.join(sd, f)

        if File.exists?(path) do
          content =
            case File.read(path) do
              {:ok, bin} -> bin
              _ -> ""
            end

          Map.put(acc, f, content)
        else
          acc
        end
      end)

    if payload == %{} do
      nil
    else
      ts = System.system_time(:millisecond)
      snap_id = Integer.to_string(ts)

      data =
        Jason.encode!(%{"files" => payload, "created_at" => ts / 1000.0, "reason" => reason})

      execute!(
        """
        INSERT INTO snapshots (project_id, stack, ts, data) VALUES ($1, $2, $3, $4)
        ON CONFLICT (project_id, stack, ts) DO UPDATE SET ts = EXCLUDED.ts, data = EXCLUDED.data
        """,
        [project_id || "default", name, ts * 1.0, data]
      )

      prune(project_id, name)
      snap_id
    end
  end

  @doc "Keep only the newest #{@max_snapshots} snapshots for a stack."
  @spec prune(String.t() | nil, String.t()) :: :ok
  def prune(project_id, name) do
    rows =
      query_all!(
        "SELECT ts FROM snapshots WHERE project_id = $1 AND stack = $2 ORDER BY ts DESC",
        [project_id || "default", name]
      )

    Enum.drop(rows, @max_snapshots)
    |> Enum.each(fn r ->
      execute!("DELETE FROM snapshots WHERE project_id = $1 AND stack = $2 AND ts = $3", [
        project_id || "default",
        name,
        r["ts"]
      ])
    end)

    :ok
  end

  @doc "Newest-first snapshot list (Python list_snapshots): {id, created_at, reason}."
  @spec list_snapshots(String.t() | nil, String.t(), integer()) :: [map()]
  def list_snapshots(project_id, name, limit \\ 1000) do
    rows =
      query_all!(
        "SELECT ts, data FROM snapshots WHERE project_id = $1 AND stack = $2 ORDER BY ts DESC LIMIT $3",
        [project_id || "default", name, limit]
      )

    Enum.map(rows, fn r ->
      data = r["data"] || ""
      data = if is_binary(data), do: data, else: IO.iodata_to_binary(data)

      decoded =
        case Jason.decode(data) do
          {:ok, decoded} -> decoded
          _ -> %{}
        end

      %{
        "id" => Integer.to_string(trunc(r["ts"])),
        "created_at" => decoded["created_at"],
        "reason" => decoded["reason"]
      }
    end)
  end

  @doc """
  Restore terraform.tfvars/tfstate from a snapshot (Python restore);
  defaults to the newest snapshot. Returns the snapshot id or nil.
  """
  @spec restore(String.t() | nil, String.t(), String.t() | nil) :: String.t() | nil
  def restore(project_id, name, snapshot_id \\ nil) do
    snaps = list_snapshots(project_id, name)
    target = snapshot_id || (snaps != [] && hd(snaps)["id"]) || nil

    if target in [nil, ""] do
      nil
    else
      ts = String.to_integer(target)

      row =
        query_one!(
          "SELECT ts, data FROM snapshots WHERE project_id = $1 AND stack = $2 AND ts = $3",
          [project_id || "default", name, ts * 1.0]
        )

      case row do
        nil ->
          nil

        row ->
          data = row["data"] || ""
          data = if is_binary(data), do: data, else: IO.iodata_to_binary(data)

          case Jason.decode(data) do
            {:ok, %{"files" => files}} ->
              sd = CloudStacks.stack_dir(project_id, name)
              File.mkdir_p!(sd)

              Enum.each(files, fn {f, content} ->
                File.write!(Path.join(sd, f), content)
              end)

              target

            _ ->
              nil
          end
      end
    end
  end
end
