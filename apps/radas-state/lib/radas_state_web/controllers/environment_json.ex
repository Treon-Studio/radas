defmodule RadasStateWeb.EnvironmentJSON do
  def index(%{environments: environments}) do
    %{data: Enum.map(environments, &environment/1)}
  end

  def show(%{environment: environment}) do
    %{data: environment(environment)}
  end

  defp environment(env) do
    %{
      id: env.id,
      name: env.name,
      description: env.description,
      inserted_at: env.inserted_at,
      updated_at: env.updated_at
    }
  end
end
