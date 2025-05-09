defmodule RadasStateWeb.StatusUpdateController do
  use RadasStateWeb, :controller
  def index(conn, _params) do
    json(conn, %{message: "Status update endpoint (stub)"})
  end
end
