defmodule RadasStateWeb.AuthPlug do
  import Plug.Conn

  @doc """
  Plug untuk autentikasi sederhana berbasis Bearer token.
  Token 'admin-token' = admin, 'user-token' = user.
  Role disimpan di conn.assigns[:current_role].
  """
  def init(opts), do: opts

  def call(conn, _opts) do
    case get_req_header(conn, "authorization") do
      ["Bearer admin-token"] -> assign(conn, :current_role, :admin)
      ["Bearer user-token"] -> assign(conn, :current_role, :user)
      _ ->
        conn
        |> send_resp(401, "Unauthorized")
        |> halt()
    end
  end
end
