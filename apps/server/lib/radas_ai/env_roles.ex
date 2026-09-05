defmodule RadasAI.EnvRoles do
  @moduledoc """
  Port of `services/env_roles.py` (Fase 5 — UC 67): role-per-environment
  access mapping, stored in the shared kv_store (`env_roles` scope).
  """

  import RadasAI.DB

  alias RadasAI.KV

  @doc "Full {project_id => {env => [roles]}} mapping (Python load)."
  @spec load() :: map()
  def load do
    case KV.load("env_roles") do
      v when is_map(v) -> v
      _ -> %{}
    end
  end

  @doc "{env => [roles]} for one project (Python get_for_project)."
  @spec get_for_project(String.t()) :: map()
  def get_for_project(project_id), do: Map.get(load(), project_id, %{})

  @doc "Save the mapping for one project (Python save_for_project)."
  @spec save_for_project(String.t(), map()) :: map()
  def save_for_project(project_id, mapping) do
    clean =
      Map.new(mapping || %{}, fn {env, roles} ->
        {to_string(env), Enum.map(List.wrap(roles), &to_string/1)}
      end)

    KV.set("env_roles", project_id, clean)
    clean
  end

  @doc """
  Whether any of `user_roles` may act on `env` of `project_id`. Unmapped
  environments are unrestricted (Python allowed/3).
  """
  @spec allowed(String.t(), String.t(), [String.t()]) :: boolean()
  def allowed(project_id, env, user_roles) do
    allowed_roles = Map.get(get_for_project(project_id), env || "", nil)

    cond do
      allowed_roles in [nil, []] -> true
      true -> MapSet.intersection(MapSet.new(user_roles || []), MapSet.new(allowed_roles)) != MapSet.new()
    end
  end
end
