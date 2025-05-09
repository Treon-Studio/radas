defmodule RadasStateWeb.EnvironmentController do
  use RadasStateWeb, :controller
  alias RadasState.Environments

  def index(conn, _params) do
    environments = Environments.list_environments()
    render(conn, "index.json", environments: environments)
  end

  def show(conn, %{"id" => id}) do
    environment = Environments.get_environment!(id)
    render(conn, "show.json", environment: environment)
  end

  def create(conn, %{"environment" => environment_params}) do
    role = conn.assigns[:current_role] || :user
    case Environments.create_environment(environment_params, role) do
      {:ok, environment} ->
        conn
        |> put_status(:created)
        |> render("show.json", environment: environment)
      {:error, :unauthorized} ->
        conn |> put_status(:forbidden) |> json(%{error: "Unauthorized"})
      {:error, :name_taken} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Name already taken"})
      {:error, changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: changeset})
    end
  end

  def update(conn, %{"id" => id, "environment" => environment_params}) do
    environment = Environments.get_environment!(id)
    role = conn.assigns[:current_role] || :user
    case Environments.update_environment(environment, environment_params, role) do
      {:ok, environment} ->
        render(conn, "show.json", environment: environment)
      {:error, :unauthorized} ->
        conn |> put_status(:forbidden) |> json(%{error: "Unauthorized"})
      {:error, :name_taken} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Name already taken"})
      {:error, changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: changeset})
    end
  end

  def delete(conn, %{"id" => id}) do
    environment = Environments.get_environment!(id)
    with {:ok, _} <- Environments.delete_environment(environment) do
      send_resp(conn, :no_content, "")
    end
  end
end
