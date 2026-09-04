defmodule RadasWeb.AIManagementController do
  @moduledoc """
  Port of the 29 management endpoints in `api/ai_router_routes.py`
  (`/api/orgs/<org_id>/ai/*`): provider vault CRUD, route combos, usage,
  redacted logs, cost estimates, proxy pools, OAuth (PKCE/device/import),
  endpoint keys, and multi-account credentials.

  Reads require org membership; mutations require owner/admin
  (`RadasWeb.Plugs.OrgAccess.check/3` with mutate: true).
  """

  use RadasWeb, :controller

  import Plug.Conn
  import RadasAI.DB

  alias RadasAI.{EndpointKeys, OAuth, ProxyPools}
  alias RadasWeb.Plugs.OrgAccess

  @provider_re ~r/^[a-z0-9][a-z0-9_.-]{1,63}$/

  # -- Providers -----------------------------------------------------------------

  def providers_show(conn, %{"org_id" => org_id}) do
    with :ok <- check(conn, org_id) do
      rows = query_all!("SELECT id, org_id, provider_name, base_url, is_active, rate_limit_per_min, created_at, updated_at FROM org_ai_providers WHERE org_id = $1 ORDER BY provider_name ASC", [org_id])
      json(conn, %{"providers" => rows})
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  def providers_save(conn, %{"org_id" => org_id}) do
    with :ok <- check(conn, org_id, mutate: true) do
      data = conn.body_params
      provider_name = String.downcase(String.trim(to_string(data["provider_name"] || "")))
      api_key = String.trim(to_string(data["api_key"] || ""))
      base_url = String.trim_trailing(String.trim(to_string(data["base_url"] || "")), "/")

      rate_limit =
        case Integer.parse(to_string(data["rate_limit_per_min"] || 60)) do
          {n, ""} -> n
          _ -> :error
        end

      cond do
        not Regex.match?(@provider_re, provider_name) or api_key == "" or String.length(api_key) > 4096 ->
          conn |> put_status(400) |> json(%{"error" => "valid provider_name and api_key are required"})

        rate_limit == :error ->
          conn |> put_status(400) |> json(%{"error" => "rate_limit_per_min must be an integer"})

        base_url != "" and not valid_base_url?(base_url) ->
          conn |> put_status(400) |> json(%{"error" => "base_url must be an http(s) URL without embedded credentials"})

        rate_limit < 1 or rate_limit > 100_000 ->
          conn |> put_status(400) |> json(%{"error" => "rate_limit_per_min must be between 1 and 100000"})

        true ->
          encrypted = RadasAI.SecretEncryption.encrypt(api_key)
          ts = now()
          existing = query_one!("SELECT id FROM org_ai_providers WHERE org_id = $1 AND provider_name = $2", [org_id, provider_name])

          id =
            case existing do
              %{"id" => id} ->
                execute!(
                  "UPDATE org_ai_providers SET api_key_encrypted = $1, base_url = $2, rate_limit_per_min = $3, is_active = TRUE, updated_at = $4 WHERE id = $5",
                  [encrypted, base_url, rate_limit, ts, id]
                )

                id

              nil ->
                id = "prov-" <> uuid12()
                execute!(
                  "INSERT INTO org_ai_providers (id, org_id, provider_name, api_key_encrypted, base_url, is_active, rate_limit_per_min, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7, $7)",
                  [id, org_id, provider_name, encrypted, base_url, rate_limit, ts]
                )

                id
            end

          json(conn, %{"success" => true, "id" => id})
      end
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  def providers_update(conn, %{"org_id" => org_id, "provider_id" => provider_id}) do
    with :ok <- check(conn, org_id, mutate: true) do
      active = truthy(conn.body_params["is_active"])

      execute!(
        "UPDATE org_ai_providers SET is_active = $1, updated_at = $2 WHERE id = $3 AND org_id = $4",
        [active, now(), provider_id, org_id]
      )

      json(conn, %{"success" => true})
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  def providers_delete(conn, %{"org_id" => org_id, "provider_id" => provider_id}) do
    with :ok <- check(conn, org_id, mutate: true) do
      execute!("DELETE FROM org_ai_providers WHERE id = $1 AND org_id = $2", [provider_id, org_id])
      json(conn, %{"success" => true})
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  # -- Routes (combos) -----------------------------------------------------------------

  def routes_show(conn, %{"org_id" => org_id}) do
    with :ok <- check(conn, org_id) do
      rows = query_all!("SELECT * FROM org_ai_routes WHERE org_id = $1 ORDER BY alias_name ASC", [org_id])

      rows =
        Enum.map(rows, fn row ->
          case row["fallback_models"] do
            binary when is_binary(binary) ->
              case Jason.decode(binary) do
                {:ok, list} -> Map.put(row, "fallback_models", list)
                _ -> Map.put(row, "fallback_models", [])
              end

            _ ->
              row
          end
        end)

      json(conn, %{"routes" => rows})
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  @alias_re ~r/^[a-z0-9][a-z0-9_.:-]{1,127}$/

  def routes_save(conn, %{"org_id" => org_id}) do
    with :ok <- check(conn, org_id, mutate: true) do
      data = conn.body_params
      alias_name = String.downcase(String.trim(to_string(data["alias_name"] || "")))
      primary_model = String.trim(to_string(data["primary_model"] || ""))
      fallback_models = data["fallback_models"] || []

      valid_fallbacks? =
        is_list(fallback_models) and length(fallback_models) <= 20 and
          Enum.all?(fallback_models, &is_binary/1)

      cond do
        not Regex.match?(@alias_re, alias_name) or primary_model == "" or String.length(primary_model) > 128 ->
          conn |> put_status(400) |> json(%{"error" => "alias_name and primary_model are invalid"})

        not valid_fallbacks? ->
          conn |> put_status(400) |> json(%{"error" => "fallback_models must be a list of at most 20 model names"})

        true ->
          fallback_models = Enum.map(fallback_models, &String.trim/1)
          fb_json = Jason.encode!(fallback_models)
          existing = query_one!("SELECT id FROM org_ai_routes WHERE org_id = $1 AND alias_name = $2", [org_id, alias_name])

          id =
            case existing do
              %{"id" => id} ->
                execute!(
                  "UPDATE org_ai_routes SET primary_model = $1, fallback_models = $2, rtk_compression_enabled = $3, caveman_mode = $4 WHERE id = $5",
                  [primary_model, fb_json, truthy(data["rtk_compression_enabled"] || true), truthy(data["caveman_mode"]), id]
                )

                id

              nil ->
                id = "route-" <> uuid12()

                execute!(
                  "INSERT INTO org_ai_routes (id, org_id, alias_name, primary_model, fallback_models, rtk_compression_enabled, caveman_mode, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
                  [id, org_id, alias_name, primary_model, fb_json, truthy(data["rtk_compression_enabled"] || true), truthy(data["caveman_mode"]), now()]
                )

                id
            end

          json(conn, %{"success" => true, "id" => id})
      end
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  def routes_delete(conn, %{"org_id" => org_id, "route_id" => route_id}) do
    with :ok <- check(conn, org_id, mutate: true) do
      execute!("DELETE FROM org_ai_routes WHERE id = $1 AND org_id = $2", [route_id, org_id])
      json(conn, %{"success" => true})
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  # -- Usage / Logs / Costs -----------------------------------------------------------

  def usage(conn, %{"org_id" => org_id}) do
    with :ok <- check(conn, org_id) do
      records = query_all!("SELECT * FROM org_ai_usage WHERE org_id = $1 ORDER BY timestamp DESC LIMIT 50", [org_id])

      total_prompt = Enum.sum(Enum.map(records, &(&1["prompt_tokens"] || 0)))
      total_completion = Enum.sum(Enum.map(records, &(&1["completion_tokens"] || 0)))
      total_saved = Enum.sum(Enum.map(records, &(&1["tokens_saved_rtk"] || 0)))
      fallbacks = Enum.count(records, & &1["fallback_triggered"])

      json(conn, %{
        "records" => records,
        "summary" => %{
          "total_requests" => length(records),
          "total_prompt_tokens" => total_prompt,
          "total_completion_tokens" => total_completion,
          "total_tokens_saved_rtk" => total_saved,
          "fallbacks_triggered" => fallbacks,
          "efficiency_percentage" => trunc(total_saved / max(1, total_prompt + total_saved) * 100)
        }
      })
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  def logs(conn, %{"org_id" => org_id}) do
    with :ok <- check(conn, org_id) do
      case Integer.parse(to_string(conn.query_params["limit"] || "50")) do
        {limit, _} ->
          since = parse_float(conn.query_params["since"])
          until = parse_float(conn.query_params["until"])
          status = conn.query_params["status"]

          if status not in [nil, "", "success", "error"] do
            conn |> put_status(400) |> json(%{"error" => "status must be success or error"})
          else
            status = if status == "", do: nil, else: status
            logs = RadasAI.Telemetry.list_request_logs(org_id, limit: limit, since: since, until: until, status: status)
            json(conn, %{"logs" => logs})
          end

        :error ->
          conn |> put_status(400) |> json(%{"error" => "limit must be an integer"})
      end
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  def costs(conn, %{"org_id" => org_id}) do
    with :ok <- check(conn, org_id) do
      summary =
        RadasAI.Telemetry.cost_summary(org_id,
          since: parse_float(conn.query_params["since"]),
          until: parse_float(conn.query_params["until"])
        )

      json(conn, summary)
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  # -- Proxy pools -------------------------------------------------------------------

  def proxy_pools_show(conn, %{"org_id" => org_id}) do
    with :ok <- check(conn, org_id) do
      json(conn, %{"pools" => ProxyPools.list_pools(org_id)})
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  def proxy_pools_save(conn, %{"org_id" => org_id}) do
    with :ok <- check(conn, org_id, mutate: true) do
      data = conn.body_params

      case safe(fn -> ProxyPools.upsert_pool(org_id, to_string(data["label"] || ""), to_string(data["proxy_url"] || "")) end) do
        {:ok, result} -> json(conn, result)
        {:error, e} -> conn |> put_status(Map.get(e, :status, 400)) |> json(%{"error" => e.message})
      end
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  def proxy_pools_delete(conn, %{"org_id" => org_id, "pool_id" => pool_id}) do
    with :ok <- check(conn, org_id, mutate: true) do
      json(conn, %{"success" => ProxyPools.delete_pool(org_id, pool_id)})
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  def proxy_pools_test(conn, %{"org_id" => org_id, "pool_id" => pool_id}) do
    with :ok <- check(conn, org_id) do
      pools = ProxyPools.list_pools(org_id)
      pool = Enum.find(pools, &(&1["id"] == pool_id))

      case pool do
        nil ->
          conn |> put_status(404) |> json(%{"error" => "proxy pool not found"})

        _ ->
          # Egress health check: resolve the encrypted URL and hit a cheap endpoint.
          url = ProxyPools.resolve_proxy_url(org_id)

          result =
            if url do
              try do
                case Req.get("https://www.google.com/generate_204", proxy: url, receive_timeout: 5000, retry: false) do
                  {:ok, %Req.Response{status: s}} when s < 500 -> %{"ok" => true, "status" => s}
                  {:ok, %Req.Response{status: s}} -> %{"ok" => false, "status" => s}
                  {:error, _} -> %{"ok" => false, "error" => "unreachable"}
                end
              rescue
                e -> %{"ok" => false, "error" => String.slice(Exception.message(e) || "error", 0, 200)}
              end
            else
              %{"ok" => false, "error" => "pool not resolvable"}
            end

          json(conn, %{"test" => result})
      end
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  # -- OAuth ---------------------------------------------------------------------------

  def oauth_providers_list(conn, %{"org_id" => _org_id}) do
    providers =
      Enum.map(OAuth.oauth_providers(), fn {name, spec} ->
        %{"name" => name, "flow" => "pkce", "client_id" => OAuth.client_id_for(spec)}
      end) ++
        Enum.map(OAuth.device_providers(), fn {name, _entry} ->
          %{"name" => name, "flow" => "device"}
        end) ++
        Enum.map(OAuth.import_providers(), fn {name, _flow} ->
          %{"name" => name, "flow" => "import"}
        end)

    json(conn, %{"providers" => providers})
  end

  def oauth_begin(conn, %{"org_id" => org_id, "provider" => provider}) do
    with :ok <- check(conn, org_id, mutate: true) do
      redirect_uri = to_string(conn.body_params["redirect_uri"] || "")
      label = to_string(conn.body_params["label"] || "")

      case safe(fn -> OAuth.begin_flow(org_id, provider, label, redirect_uri) end) do
        {:ok, result} -> json(conn, result)
        {:error, e} -> conn |> put_status(Map.get(e, :status, 400)) |> json(%{"error" => e.message})
      end
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  def oauth_complete(conn, %{"org_id" => org_id, "provider" => provider}) do
    with :ok <- check(conn, org_id, mutate: true) do
      code = to_string(conn.body_params["code"] || "")
      state = to_string(conn.body_params["state"] || "")

      case safe(fn -> OAuth.complete_flow(org_id, provider, code, state) end) do
        {:ok, result} -> json(conn, result)
        {:error, e} -> conn |> put_status(Map.get(e, :status, 400)) |> json(%{"error" => e.message})
      end
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  def oauth_device_begin(conn, %{"org_id" => org_id, "provider" => provider}) do
    with :ok <- check(conn, org_id, mutate: true) do
      label = to_string(conn.body_params["label"] || "")

      case safe(fn -> OAuth.begin_device_flow(org_id, provider, label) end) do
        {:ok, result} -> json(conn, result)
        {:error, e} -> conn |> put_status(Map.get(e, :status, 400)) |> json(%{"error" => e.message})
      end
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  def oauth_device_complete(conn, %{"org_id" => org_id, "provider" => provider}) do
    with :ok <- check(conn, org_id, mutate: true) do
      state = to_string(conn.body_params["state"] || "")

      case safe(fn -> OAuth.complete_device_flow(org_id, provider, state) end) do
        {:ok, result} -> json(conn, result)
        {:error, e} -> conn |> put_status(Map.get(e, :status, 400)) |> json(%{"error" => e.message})
      end
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  def oauth_import_token(conn, %{"org_id" => org_id, "provider" => provider}) do
    with :ok <- check(conn, org_id, mutate: true) do
      data = conn.body_params

      case safe(fn ->
             OAuth.import_token(org_id, provider,
               label: to_string(data["label"] || ""),
               access_token: to_string(data["access_token"] || ""),
               refresh_token: to_string(data["refresh_token"] || ""),
               expires_in: parse_int_or(data["expires_in"], 3600),
               scope: to_string(data["scope"] || "")
             )
           end) do
        {:ok, result} -> json(conn, result)
        {:error, e} -> conn |> put_status(Map.get(e, :status, 400)) |> json(%{"error" => e.message})
      end
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  def oauth_accounts_show(conn, %{"org_id" => org_id}) do
    with :ok <- check(conn, org_id) do
      json(conn, %{"accounts" => OAuth.list_accounts(org_id)})
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  def oauth_accounts_delete(conn, %{"org_id" => org_id, "account_id" => account_id}) do
    with :ok <- check(conn, org_id, mutate: true) do
      json(conn, %{"success" => OAuth.revoke(org_id, account_id)})
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  # -- Endpoint keys ---------------------------------------------------------------------

  def endpoint_keys_show(conn, %{"org_id" => org_id}) do
    with :ok <- check(conn, org_id) do
      json(conn, %{"keys" => EndpointKeys.list_keys(org_id)})
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  def endpoint_keys_save(conn, %{"org_id" => org_id}) do
    with :ok <- check(conn, org_id, mutate: true) do
      json(conn, EndpointKeys.create_key(org_id, to_string(conn.body_params["label"] || "")))
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  def endpoint_keys_delete(conn, %{"org_id" => org_id, "key_id" => key_id}) do
    with :ok <- check(conn, org_id, mutate: true) do
      json(conn, %{"success" => EndpointKeys.revoke(org_id, key_id)})
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  # -- Multi-account credentials --------------------------------------------------------------

  def accounts_show(conn, %{"org_id" => org_id}) do
    with :ok <- check(conn, org_id) do
      provider = conn.query_params["provider"] || ""

      rows =
        if provider == "" do
          query_all!("SELECT id, provider_name, label, base_url, priority, is_active, created_at FROM org_ai_provider_accounts WHERE org_id = $1 ORDER BY provider_name, priority, created_at", [org_id])
        else
          query_all!("SELECT id, provider_name, label, base_url, priority, is_active, created_at FROM org_ai_provider_accounts WHERE org_id = $1 AND provider_name = $2 ORDER BY priority, created_at", [org_id, provider])
        end

      json(conn, %{"accounts" => rows})
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  def accounts_save(conn, %{"org_id" => org_id}) do
    with :ok <- check(conn, org_id, mutate: true) do
      data = conn.body_params
      provider_name = String.downcase(String.trim(to_string(data["provider_name"] || "")))
      label = String.trim(to_string(data["label"] || ""))
      api_key = String.trim(to_string(data["api_key"] || ""))

      cond do
        not Regex.match?(@provider_re, provider_name) or label == "" or api_key == "" ->
          conn |> put_status(400) |> json(%{"error" => "valid provider_name, label, and api_key are required"})

        true ->
          encrypted = RadasAI.SecretEncryption.encrypt(api_key)
          ts = now()
          account_id = "acct-" <> uuid12()

          execute!(
            """
            INSERT INTO org_ai_provider_accounts (id, org_id, provider_name, label, api_key_encrypted, base_url, priority, is_active, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, $8)
            ON CONFLICT (org_id, provider_name, label) DO UPDATE
              SET api_key_encrypted = EXCLUDED.api_key_encrypted, base_url = EXCLUDED.base_url,
                  priority = EXCLUDED.priority, is_active = TRUE, updated_at = EXCLUDED.updated_at
            """,
            [account_id, org_id, provider_name, label, encrypted, to_string(data["base_url"] || ""), parse_int_or(data["priority"], 100), ts]
          )

          json(conn, %{"success" => true, "id" => account_id})
      end
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  # -- helpers ---------------------------------------------------------------------------

  defp check(conn, org_id, opts \\ []), do: OrgAccess.check(conn, org_id, opts)

  defp safe(fun) do
    {:ok, fun.()}
  rescue
    e -> {:error, e}
  end

  defp valid_base_url?(url) do
    case URI.parse(url) do
      %URI{scheme: scheme, host: host, userinfo: userinfo} ->
        scheme in ["http", "https"] and host not in [nil, ""] and userinfo in [nil, ""]

      _ ->
        false
    end
  end

  defp truthy(nil), do: false
  defp truthy(v) when v == true, do: true
  defp truthy("true"), do: true
  defp truthy(_), do: false

  defp parse_float(nil), do: nil

  defp parse_float(value) when is_binary(value) do
    case Float.parse(value) do
      {f, _} -> f
      :error -> nil
    end
  end

  defp parse_int_or(nil, default), do: default

  defp parse_int_or(value, default) when is_integer(value), do: value

  defp parse_int_or(value, default) when is_binary(value) do
    case Integer.parse(value) do
      {n, _} -> n
      :error -> default
    end
  end

  defp uuid12, do: :crypto.strong_rand_bytes(6) |> Base.encode16(case: :lower)
end
