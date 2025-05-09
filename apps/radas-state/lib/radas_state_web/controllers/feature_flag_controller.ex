defmodule RadasStateWeb.FeatureFlagController do
  use RadasStateWeb, :controller
  alias RadasState.FeatureFlags

  def index(conn, _params) do
    feature_flags = FeatureFlags.list_feature_flags()
    render(conn, "index.json", feature_flags: feature_flags)
  end

  def show(conn, %{"id" => id}) do
    feature_flag = FeatureFlags.get_feature_flag!(id)
    render(conn, "show.json", feature_flag: feature_flag)
  end

  def create(conn, %{"feature_flag" => feature_flag_params}) do
    with {:ok, feature_flag} <- FeatureFlags.create_feature_flag(feature_flag_params) do
      conn
      |> put_status(:created)
      |> render("show.json", feature_flag: feature_flag)
    end
  end

  def update(conn, %{"id" => id, "feature_flag" => feature_flag_params}) do
    feature_flag = FeatureFlags.get_feature_flag!(id)
    with {:ok, feature_flag} <- FeatureFlags.update_feature_flag(feature_flag, feature_flag_params) do
      render(conn, "show.json", feature_flag: feature_flag)
    end
  end

  def delete(conn, %{"id" => id}) do
    feature_flag = FeatureFlags.get_feature_flag!(id)
    with {:ok, _} <- FeatureFlags.delete_feature_flag(feature_flag) do
      send_resp(conn, :no_content, "")
    end
  end
end
