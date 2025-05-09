defmodule RadasStateWeb.MilestoneController do
  use RadasStateWeb, :controller
  def index(conn, _params) do
    json(conn, %{message: "Milestone endpoint (stub)"})
  end
end
