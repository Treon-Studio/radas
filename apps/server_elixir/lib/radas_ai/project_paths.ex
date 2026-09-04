defmodule RadasAI.ProjectPaths do
  @moduledoc """
  Port of `utils/project_paths.py` — project-directory layout over
  `DATA_DIR/projects/<project_id>` (byte-compatible with Flask).
  """

  def data_dir, do: System.get_env("DATA_DIR") || Path.join(File.cwd!(), "data")
  def projects_dir, do: Path.join(data_dir(), "projects")

  def project_dir(project_id), do: Path.join(projects_dir(), project_id)

  def project_repo_dir(project_id), do: Path.join(project_dir(project_id), "repo")

  def project_executions_dir(project_id),
    do: Path.join([project_dir(project_id), "history", "executions"])

  def project_logs_dir(project_id), do: Path.join([project_dir(project_id), "history", "logs"])

  def project_inventories_dir(project_id),
    do: Path.join(project_dir(project_id), "inventories")

  def project_inventory_file(project_id),
    do: Path.join([project_dir(project_id), "repo", "inventory.yml"])

  def project_roles_config_file(project_id),
    do: Path.join([project_dir(project_id), "data", "roles-config.json"])

  def project_secrets_dir(project_id) do
    dir = Path.join(project_dir(project_id), "secrets")
    File.mkdir_p!(dir)
    dir
  end

  def project_vault_dir(project_id), do: Path.join(project_secrets_dir(project_id), "vault")
  def project_vault_keys_dir(project_id), do: Path.join(project_secrets_dir(project_id), "vault_keys")
  def project_vaults_file(project_id), do: Path.join(project_vault_dir(project_id), "vaults.json")

  @doc "Inventory file names probed by Python (in order)."
  @spec inventory_names() :: [String.t()]
  def inventory_names,
    do: ["inventory.yaml", "inventory.yml", "hosts.yaml", "hosts.yml", "hosts", "hosts.ini"]

  @doc """
  Collect candidate inventory files for a project (the named probes plus any
  nested files whose name matches, skipping group_vars/host_vars).
  Returns absolute paths.
  """
  @spec find_inventory_files(String.t()) :: [String.t()]
  def find_inventory_files(project_id) do
    inventories = project_inventories_dir(project_id)
    names = inventory_names()
    out = Enum.map(names, &Path.join(inventories, &1)) |> Enum.filter(&File.exists?/1)

    nested =
      case File.ls(inventories) do
        {:ok, _} ->
          walk_files(inventories)
          |> Enum.filter(fn path ->
            Path.basename(path) in names and
              not (String.contains?(path, "group_vars") or String.contains?(path, "host_vars"))
          end)

        _ ->
          []
      end

    out = Enum.uniq(out ++ nested)

    if out == [] do
      default = project_inventory_file(project_id)
      if File.exists?(default), do: [default], else: []
    else
      out
    end
  end

  defp walk_files(dir) do
    case File.ls(dir) do
      {:ok, entries} ->
        Enum.flat_map(entries, fn entry ->
          path = Path.join(dir, entry)

          if File.dir?(path) do
            walk_files(path)
          else
            [path]
          end
        end)

      _ ->
        []
    end
  end
end
