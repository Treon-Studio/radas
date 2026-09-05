defmodule RadasWeb.Plugs.GatewayAuth do
  @moduledoc """
  Port of `require_gateway_auth` in `api/ai_router_routes.py`.

  Authenticates /api/v1 gateway calls via org endpoint key or RADAS JWT:

  - `radas_epk_*` (Bearer or X-Api-Key) pins the organization server-side;
    X-Org-Id is ignored for them, and management access is refused.
  - Anything else falls through to standard RADAS JWT verification.
  """

  import Plug.Conn

  alias RadasAI.{AuthToken, EndpointKeys}

  def init(opts \\ []), do: opts

  def call(conn, _opts) do
    raw_key = presented_endpoint_key(conn)

    if raw_key do
      endpoint_key_auth(conn, raw_key)
    else
      jwt_auth(conn)
    end
  end

  @doc "The presented endpoint key, if any (Bearer or X-Api-Key with the epk prefix)."
  def presented_endpoint_key(conn) do
    auth_header =
      conn
      |> get_req_header("authorization")
      |> List.first()

    bearer =
      case auth_header do
        "Bearer " <> rest -> String.trim(rest)
        _ -> nil
      end

    api_key_header = get_req_header(conn, "x-api-key") |> List.first()

    cond do
      is_binary(bearer) and String.starts_with?(bearer, EndpointKeys.key_prefix()) -> bearer
      is_binary(api_key_header) and String.starts_with?(api_key_header, EndpointKeys.key_prefix()) -> api_key_header
      true -> nil
    end
  end

  defp endpoint_key_auth(conn, raw_key) do
    case EndpointKeys.lookup(raw_key) do
      nil ->
        send_auth_error(conn, "Invalid gateway API key")

      entry ->
        EndpointKeys.touch(entry["id"])

        conn
        |> assign(:current_user, %{
          "username" => "endpoint:" <> String.slice(entry["id"], 0, 8),
          "user_id" => "__endpoint__",
          "roles" => ["endpoint"],
          "org_id" => entry["org_id"],
          "endpoint_key" => true
        })
        |> assign(:token, raw_key)
        |> put_private(:gateway_endpoint_key, true)
    end
  end

  defp jwt_auth(conn) do
    with ["Bearer " <> token] <- [get_req_header(conn, "authorization") |> List.first()],
         secret when secret not in [nil, ""] <- System.get_env("JWT_SECRET_KEY"),
         {:ok, claims} <- AuthToken.verify(token, secret) do
      conn
      |> assign(:current_user, claims)
      |> assign(:token, token)
    else
      _ -> send_auth_error(conn, "Not authenticated")
    end
  end

  defp send_auth_error(conn, message) do
    body = Jason.encode!(%{"error" => %{"message" => message, "type" => "authentication_error"}})

    conn
    |> put_resp_content_type("application/json")
    |> send_resp(401, body)
    |> halt()
  end
end
