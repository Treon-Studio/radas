defmodule RadasAI.Playbooks do
  @moduledoc """
  Port of `storage/playbook_storage.py` — dual-store playbook management:

  - UI store: JSON files under `DATA_DIR/projects/<id>/ui/playbooks/<id>.json`
  - Repo store: YAML files under `DATA_DIR/projects/<id>/repo/playbooks/<name>.yml`

  List merges both stores (JSON first, then repo YAML by name, skipping name
  conflicts) with metadata-order then updated-at ordering.
  """

  alias RadasAI.ProjectPaths
  alias RadasAI.KV

  @sanitize_re ~r/[<>:"\/\\|?*]/

  defp projects_dir, do: ProjectPaths.projects_dir()

  defp ui_playbooks_dir(project_id) do
    dir = Path.join([projects_dir(), project_id, "ui", "playbooks"])
    File.mkdir_p!(dir)
    dir
  end

  defp repo_playbooks_dir(project_id) do
    dir = Path.join([projects_dir(), project_id, "repo", "playbooks"])
    File.mkdir_p!(dir)
    dir
  end

  @doc "Sanitize a playbook name into a filename stem (Python parity)."
  @spec sanitize_filename(String.t()) :: String.t()
  def sanitize_filename(name) do
    name = Regex.replace(@sanitize_re, name || "", "_") |> String.trim()
    name = Regex.replace(~r/\s+/, name, "_")
    if name == "", do: "playbook", else: name
  end

  defp playbook_file(project_id, playbook_id),
    do: Path.join(ui_playbooks_dir(project_id), "#{playbook_id}.json")

  defp repo_playbook_file(project_id, playbook_name) do
    Path.join(repo_playbooks_dir(project_id), "#{sanitize_filename(playbook_name)}.yml")
  end

  defp pb_scope(project_id), do: "playbooks:#{project_id}"

  @doc "Whether a playbook name is already used (JSON or repo YAML)."
  @spec check_name_conflict(String.t(), String.t(), String.t() | nil) :: boolean()
  def check_name_conflict(project_id, name, exclude_playbook_id \\ nil) do
    json_conflict? =
      Enum.any?(list_json(project_id), &(&1["name"] == name and &1["id"] != exclude_playbook_id))

    json_conflict? or
      Enum.any?(list_repo_yaml(project_id), &(&1["name"] == name and &1["id"] != exclude_playbook_id))
  end

  @doc "Create a playbook record (JSON store)."
  @spec create_playbook(String.t(), String.t(), String.t(), [map()]) :: map()
  def create_playbook(project_id, name, description, plays \\ []) do
    playbook_id = "pb-" <> (:crypto.strong_rand_bytes(6) |> Base.encode16(case: :lower))
    ts = System.system_time(:second)

    playbook = %{
      "id" => playbook_id,
      "name" => name,
      "description" => description || "",
      "plays" => plays || [],
      "metadata" => %{"created_at" => ts, "updated_at" => ts, "version" => 1}
    }

    File.write!(playbook_file(project_id, playbook_id), Jason.encode!(playbook, pretty: true))
    summary(playbook, playbook_id, project_id)
  end

  @doc "List playbooks merged from both stores with Python ordering."
  @spec list_playbooks(String.t()) :: [map()]
  def list_playbooks(project_id) do
    playbooks = list_json(project_id) ++ list_repo_yaml(project_id)

    {with_order, without_order} =
      Enum.split_with(playbooks, fn p -> p["metadata"]["order"] != nil end)

    with_order = Enum.sort_by(with_order, &(&1["metadata"]["order"] || 0))
    without_order = Enum.sort_by(without_order, &(&1["updated_at"] || ""), :desc)
    with_order ++ without_order
  end

  @doc "Get one playbook (JSON body, or raw YAML wrapper for repo store)."
  @spec get_playbook(String.t(), String.t()) :: map() | nil
  def get_playbook(project_id, playbook_id) do
    case File.read(playbook_file(project_id, playbook_id)) do
      {:ok, binary} ->
        case Jason.decode(binary) do
          {:ok, playbook} -> playbook
          _ -> nil
        end

      _ ->
        # Repo YAML: id is the uuid5-style name-derived id from listing.
        Enum.find_value(list_repo_yaml(project_id), fn p ->
          if p["id"] == playbook_id, do: p["full"] || p
        end)
    end
  end

  @doc "Update a JSON playbook (name/description/plays/disabled/metadata)."
  @spec update_playbook(String.t(), String.t(), map()) :: map() | nil
  def update_playbook(project_id, playbook_id, patch) do
    path = playbook_file(project_id, playbook_id)

    case File.read(path) do
      {:ok, binary} ->
        case Jason.decode(binary) do
          {:ok, playbook} ->
            playbook = apply_patch(playbook, patch)

            metadata =
              playbook["metadata"]
              |> Map.new()
              |> Map.put("updated_at", System.system_time(:second))
              |> Map.update("version", 1, &(&1 + 1))

            playbook = Map.put(playbook, "metadata", metadata)
            File.write!(path, Jason.encode!(playbook, pretty: true))
            playbook

          _ ->
            nil
        end

      _ ->
        nil
    end
  end

  @doc "Delete a JSON playbook and its kv mirror; repo YAML is untouched."
  @spec delete_playbook(String.t(), String.t()) :: boolean()
  def delete_playbook(project_id, playbook_id) do
    path = playbook_file(project_id, playbook_id)
    deleted = File.exists?(path) && File.rm(path) == :ok
    KV.delete(pb_scope(project_id), playbook_id)
    deleted
  end

  @doc "Save a repo YAML playbook (raw content)."
  @spec save_repo_yaml(String.t(), String.t(), String.t()) :: :ok
  def save_repo_yaml(project_id, playbook_name, yaml_content) do
    File.write!(repo_playbook_file(project_id, playbook_name), yaml_content)
    :ok
  end

  # ---------------------------------------------------------------------------
  # Internals
  # ---------------------------------------------------------------------------

  defp list_json(project_id) do
    dir = ui_playbooks_dir(project_id)

    case File.ls(dir) do
      {:ok, files} ->
        Enum.flat_map(files, fn f ->
          if String.ends_with?(f, ".json") do
            playbook_id = String.trim_trailing(f, ".json")

            with {:ok, binary} <- File.read(Path.join(dir, f)),
                 {:ok, playbook} <- Jason.decode(binary) do
              [summary(playbook, playbook_id, project_id)]
            else
              _ -> []
            end
          else
            []
          end
        end)

      _ ->
        []
    end
  end

  defp list_repo_yaml(project_id) do
    dir = repo_playbooks_dir(project_id)

    case File.ls(dir) do
      {:ok, files} ->
        files
        |> Enum.filter(&String.ends_with?(&1, ".yml"))
        |> Enum.flat_map(fn f ->
          path = Path.join(dir, f)
          yaml_name = Path.basename(f, ".yml")

          with {:ok, binary} <- File.read(path),
               {:ok, raw} <- YamlElixir.read_from_string(binary) do
            # YamlElixir returns atom keys; stringify into string-keyed maps.
            # A playbook YAML file is a top-level LIST of plays (Python's
            # PlaybookParser wraps it): derive the name from the first play.
            raw = stringify(raw)

            {name, plays, description} =
              case raw do
                %{"name" => n} = m when is_map(m) ->
                  {n || yaml_name, m["plays"] || [], m["description"] || ""}

                plays when is_list(plays) ->
                  first_name =
                    Enum.find_value(plays, yaml_name, fn play ->
                      if is_map(play) and play["name"], do: to_string(play["name"])
                    end)

                  {first_name, plays, ""}

                _ ->
                  {yaml_name, [], ""}
              end

            playbook = %{"name" => name, "description" => description, "plays" => plays}
            id = playbook_uuid(project_id, name)
            plays_count = length(plays || [])
            mtime = File.stat!(path).mtime |> :calendar.datetime_to_gregorian_seconds() |> Kernel.-(62_167_219_200)

            [
              %{
                "id" => id,
                "project_id" => project_id,
                "name" => name,
                "description" => playbook["description"] || "",
                "plays_count" => plays_count,
                "tags" => playbook["tags"] || [],
                "tag" => "",
                "disabled" => false,
                "metadata" => %{"version" => 1, "created_at" => mtime, "updated_at" => mtime},
                "updated_at" => mtime,
                "full" => Map.put(playbook, "id", id) |> Map.put("projectId", project_id)
              }
            ]
          else
            _ -> []
          end
        end)

      _ ->
        []
    end
  end

  # Python uuid5(NAMESPACE_URL, ...) parity — sha1 digest with RFC-4122 bits.
  defp playbook_uuid(project_id, name) do
    namespace =
      <<0x6B, 0xA7, 0xB8, 0x11, 0x9D, 0xAD, 0x11, 0xD1, 0x80, 0xB4, 0x00, 0xC0, 0x4F, 0xD4, 0x30, 0xC8>>

    bytes =
      :crypto.hash(:sha, namespace <> "playbook:#{project_id}:#{name}")
      |> binary_part(0, 16)
      |> :binary.bin_to_list()

    bytes =
      bytes
      |> List.replace_at(6, Enum.at(bytes, 6) |> Bitwise.band(0x0F) |> Bitwise.bor(0x50))
      |> List.replace_at(8, Enum.at(bytes, 8) |> Bitwise.band(0x3F) |> Bitwise.bor(0x80))

    hex = Enum.map_join(bytes, "", fn b -> :io_lib.format("~2.16.0b", [b]) end) |> IO.iodata_to_binary()

    String.slice(hex, 0, 8) <> "-" <> String.slice(hex, 8, 4) <> "-" <>
      String.slice(hex, 12, 4) <> "-" <> String.slice(hex, 16, 4) <> "-" <> String.slice(hex, 20, 12)
  end

  defp summary(playbook, playbook_id, project_id) do
    metadata = playbook["metadata"] || %{}

    tags =
      cond do
        is_list(playbook["tags"]) -> playbook["tags"]
        is_list(metadata["tags"]) -> metadata["tags"]
        playbook["tag"] || metadata["tag"] ->
          (playbook["tag"] || metadata["tag"]) |> to_string() |> String.split(",") |> Enum.map(&String.trim/1) |> Enum.reject(&(&1 == ""))
        true -> []
      end

    %{
      "id" => playbook_id,
      "project_id" => project_id,
      "name" => playbook["name"] || "Unnamed Playbook",
      "description" => playbook["description"] || "",
      "plays_count" => length(playbook["plays"] || []),
      "created_at" => metadata["created_at"],
      "updated_at" => metadata["updated_at"],
      "version" => metadata["version"] || 1,
      "tags" => tags,
      "tag" => Enum.join(tags, ", "),
      "disabled" => playbook["disabled"] || metadata["disabled"] || false,
      "metadata" => metadata
    }
  end

  defp apply_patch(playbook, patch) do
    playbook =
      Enum.reduce(["name", "description"], playbook, fn f, acc ->
        if patch[f] != nil, do: Map.put(acc, f, String.trim(to_string(patch[f]))), else: acc
      end)

    playbook = if patch["plays"], do: Map.put(playbook, "plays", patch["plays"]), else: playbook
    if patch["disabled"] != nil, do: Map.put(playbook, "disabled", patch["disabled"]), else: playbook
  end

  defp stringify(data) when is_map(data) do
    Map.new(data, fn {k, v} -> {to_string(k), stringify(v)} end)
  end

  defp stringify(data) when is_list(data), do: Enum.map(data, &stringify/1)
  defp stringify(data), do: data
end
