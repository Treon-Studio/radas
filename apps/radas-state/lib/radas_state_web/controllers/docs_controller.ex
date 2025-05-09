defmodule RadasStateWeb.DocsController do
  use RadasStateWeb, :controller
  def index(conn, _params) do
    json(conn, %{message: "API documentation endpoint (stub)"})
  end
end
