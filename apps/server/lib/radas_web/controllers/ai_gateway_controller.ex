defmodule RadasWeb.AIGatewayController do
  @moduledoc """
  Port of the 12 gateway endpoints in `api/ai_router_routes.py`
  (`/api/v1/*`): models, chat completions (JSON + SSE), embeddings, audio
  STT/TTS/voices, compress, videos, images, and responses.

  All endpoints authenticate via `RadasWeb.Plugs.GatewayAuth` (endpoint key or
  RADAS JWT) and resolve the org context like Python does.
  """

  use RadasWeb, :controller

  import Plug.Conn

  alias RadasAI.{ChatPipeline, Compression, Gateway, GatewayError, Providers, Pxpipe, ResponseStore}
  alias RadasWeb.Plugs.OrgAccess

  # -- Models -----------------------------------------------------------------

  def models(conn, _params) do
    org_id = OrgAccess.resolve_org_id(conn)
    with :ok <- org_check(conn, org_id) do
      providers =
        RadasAI.DB.query_all!(
          "SELECT provider_name FROM org_ai_providers WHERE org_id = $1 AND is_active = TRUE",
          [org_id]
        )
        |> Enum.map(& &1["provider_name"])

      routes =
        RadasAI.DB.query_all!(
          "SELECT alias_name, primary_model, fallback_models FROM org_ai_routes WHERE org_id = $1",
          [org_id]
        )

      models =
        for provider <- providers do
          spec = Providers.spec_for(provider)
          %{"id" => provider, "object" => "model", "owned_by" => spec.display_name}
        end ++
          for route <- routes do
            %{"id" => route["alias_name"], "object" => "model", "owned_by" => "combo"}
          end

      json(conn, %{"object" => "list", "data" => models})
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  # -- Chat completions ---------------------------------------------------------

  def chat_completions(conn, _params) do
    org_id = OrgAccess.resolve_org_id(conn)
    data = conn.body_params

    case ChatPipeline.run(conn, org_id, data) do
      {:ok, response, meta} when is_map(response) ->
        response = ChatPipeline.record_success(meta, response)
        conn
        |> put_resp_header("x-9router-request-id", meta["request_id"])
        |> put_resp_header("x-9router-provider", meta["provider"])
        |> put_resp_header("x-9router-model", meta["model"])
        |> json(response)

      {:ok, stream, meta} ->
        conn = ChatPipeline.record_success(meta, nil) && conn

        conn
        |> put_resp_content_type("text/event-stream")
        |> put_resp_header("cache-control", "no-cache")
        |> put_resp_header("x-9router-request-id", meta["request_id"])
        |> put_resp_header("x-9router-provider", meta["provider"])
        |> put_resp_header("x-9router-model", meta["model"])
        |> send_chunked(200)
        |> pump_stream(stream, meta)

      {:error, status, body} ->
        conn |> put_status(status) |> json(body)
    end
  end

  defp pump_stream(conn, stream, meta) do
    stream
    |> Enum.reduce_while(conn, fn chunk, conn ->
      case chunk(conn, chunk) do
        {:ok, conn} -> {:cont, conn}
        {:error, _reason} -> {:halt, conn}
      end
    end)
    |> then(fn conn ->
      ChatPipeline.record_success(meta, nil)
      conn
    end)
  end

  # -- Embeddings ----------------------------------------------------------------

  def embeddings(conn, _params) do
    org_id = OrgAccess.resolve_org_id(conn)
    with :ok <- org_check(conn, org_id) do
      data = conn.body_params
      model = to_string(data["model"] || "")
      provider = provider_for(model, data)

      run_passthrough(conn, org_id, provider, model, "embeddings", fn target, payload ->
        Gateway.embeddings(target, payload)
      end)
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  # -- Audio ----------------------------------------------------------------------

  def audio_transcriptions(conn, _params) do
    org_id = OrgAccess.resolve_org_id(conn)

    with :ok <- org_check(conn, org_id) do
      {filename, content_type, file_bytes} = extract_upload(conn)
      fields = Map.new(conn.params || %{}, fn {k, v} -> {to_string(k), to_string(v)} end) |> Map.delete("file")
      model = Map.get(fields, "model", "whisper-1")
      provider = provider_for(model, %{})

      execute_gateway(conn, org_id, provider, model, "stt", fn target ->
        Gateway.transcribe(target, file_bytes, filename, content_type, fields)
      end)
      |> case do
        {:ok, result} ->
          record_audio(conn, org_id, provider, model, "stt")
          json(conn, result)

        {:error, status, body} ->
          conn |> put_status(status) |> json(body)
      end
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  def audio_speech(conn, _params) do
    org_id = OrgAccess.resolve_org_id(conn)

    with :ok <- org_check(conn, org_id) do
      data = conn.body_params
      model = to_string(data["model"] || "tts-1")
      provider = provider_for(model, %{})

      execute_gateway(conn, org_id, provider, model, "tts", fn target ->
        Gateway.speak(target, data)
      end)
      |> case do
        {:ok, {audio, content_type}} ->
          record_audio(conn, org_id, provider, model, "tts")
          conn |> put_resp_content_type(content_type) |> send_resp(200, audio)

        {:error, status, body} ->
          conn |> put_status(status) |> json(body)
      end
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  def audio_voices(conn, _params) do
    org_id = OrgAccess.resolve_org_id(conn)

    with :ok <- org_check(conn, org_id) do
      json(conn, %{"voices" => Providers.tts_voices()})
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  # -- Compress ----------------------------------------------------------------------

  def compress(conn, _params) do
    org_id = OrgAccess.resolve_org_id(conn)

    with :ok <- org_check(conn, org_id) do
      data = conn.body_params
      messages = data["messages"]

      unless is_list(messages) and messages != [] do
        return_error(conn, 400, "messages array is required", "invalid_request_error")
      else
        format = get_req_header(conn, "x-9router-format") |> List.first() || "openai"

        if String.downcase(format) == "claude" do
          pxpipe =
            Pxpipe.compress_with_pxpipe(%{"messages" => messages},
              enabled: System.get_env("PXPIPE_URL", "") != "",
              model: to_string(data["model"] || "")
            )

          if pxpipe["body"] do
            json(conn, %{"body" => pxpipe["body"], "summary" => pxpipe["summary"], "mode" => "pxpipe"})
          else
            json(conn, %{"messages" => messages, "tokens_saved" => 0, "mode" => "passthrough", "summary" => pxpipe["summary"]})
          end
        else
          headroom_url = System.get_env("HEADROOM_URL", "") |> String.trim_trailing("/")

          headroom_result =
            if headroom_url != "" do
              try do
                case Req.post(headroom_url <> "/v1/compress", json: %{"messages" => messages}, receive_timeout: 10_000, retry: false) do
                  {:ok, %Req.Response{status: s, body: body}} when s in 200..299 ->
                    if is_map(body) and is_list(body["messages"]), do: body |> Map.put_new("mode", "headroom")

                  _ -> nil
                end
              rescue
                _ -> nil
              end
            end

          case headroom_result do
            result when is_map(result) ->
              json(conn, result)

            nil ->
              {compressed, saved} = Compression.compress_messages(messages)
              json(conn, %{"messages" => compressed, "tokens_saved" => saved, "mode" => "rtk-local"})
          end
        end
      end
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  # -- Videos / Images ----------------------------------------------------------------

  @video_actions ["generations", "edits", "extensions"]

  def video_create(conn, %{"action" => action}) do
    org_id = OrgAccess.resolve_org_id(conn)

    with :ok <- org_check(conn, org_id) do
      if action not in @video_actions do
        return_error(conn, 404, "unknown video action", "invalid_request_error")
      else
        data = conn.body_params
        raw_model = to_string(data["model"] || "") |> String.trim()

        {provider, model} = split_provider_prefix(raw_model, Map.get(data, "provider"))
        provider = String.slice(provider || provider_for(model, %{}), 0, 63)

        execute_gateway(conn, org_id, provider, model, "video", fn target ->
          payload = Map.delete(data, "provider")
          payload = if model == "", do: payload, else: Map.put(payload, "model", model)
          Gateway.video_create(target, payload, action)
        end)
        |> case do
          {:ok, result} ->
            conn
            |> put_resp_header("x-9router-request-id", "req-" <> uuid12())
            |> put_resp_header("x-9router-provider", provider)
            |> json(result)

          {:error, status, body} ->
            conn |> put_status(status) |> json(body)
        end
      end
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  def video_status(conn, %{"video_id" => video_id}) do
    org_id = OrgAccess.resolve_org_id(conn)

    with :ok <- org_check(conn, org_id) do
      if String.length(video_id) > 128 do
        return_error(conn, 400, "video_id is too long", "invalid_request_error")
      else
        provider = (get_req_header(conn, "x-9router-provider") |> List.first()) || conn.query_params["provider"] || ""
        provider = String.slice(String.downcase(String.trim(provider)), 0, 63)
        model = String.slice(to_string(conn.query_params["model"] || ""), 0, 127)
        provider = if provider == "", do: provider_for(model || "grok-imagine-video", %{}), else: provider

        execute_gateway(conn, org_id, provider, model, "video", fn target ->
          Gateway.video_status(target, video_id)
        end)
        |> case do
          {:ok, result} -> json(conn, result)
          {:error, status, body} -> conn |> put_status(status) |> json(body)
        end
      end
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  def images_generations(conn, _params) do
    org_id = OrgAccess.resolve_org_id(conn)

    with :ok <- org_check(conn, org_id) do
      data = conn.body_params
      prompt = String.trim(to_string(data["prompt"] || ""))

      cond do
        prompt == "" or String.length(prompt) > 4000 ->
          return_error(conn, 400, "prompt is required and must be at most 4000 characters", "invalid_request_error")

        true ->
          model = String.trim(to_string(data["model"] || "dall-e-3"))
          provider = provider_for(model, data)

          case run_passthrough(conn, org_id, provider, model, "images", fn target, payload ->
                 Gateway.images_generate(target, payload)
               end) do
            {:ok, result, provider, model} ->
              conn
              |> put_resp_header("x-9router-provider", provider)
              |> put_resp_header("x-9router-model", model)
              |> json(result)

            {:error, status, body} ->
              conn |> put_status(status) |> json(body)
          end
      end
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  # -- Responses -----------------------------------------------------------------------

  def responses_create(conn, _params) do
    org_id = OrgAccess.resolve_org_id(conn)

    with :ok <- org_check(conn, org_id) do
      data = conn.body_params
      model = to_string(data["model"] || "")
      provider = provider_for(model, data)

      if truthy(data["store"]) do
        # Stateful: replay previous context, store the new response.
        previous_id = data["previous_response_id"]

        context =
          if previous_id in [nil, ""], do: [], else: ResponseStore.build_context_messages(org_id, previous_id)

        messages =
          context ++ [%{"role" => "user", "content" => extract_response_input(data)}]

        case execute_gateway(conn, org_id, provider, model, "responses", fn target ->
               chat_like_complete(target, data, messages)
             end) do
          {:ok, response} ->
            output_text = get_in(response, ["choices", Access.at(0), "message", "content"]) || ""

            response_id =
              ResponseStore.store_response(
                org_id: org_id,
                user_id: (conn.assigns[:current_user] || %{})["user_id"],
                provider_name: provider,
                model: model,
                input_messages: [%{"role" => "user", "content" => extract_response_input(data)}],
                output_json: response,
                output_text: output_text,
                previous_response_id: previous_id
              )

            response = Map.put(response, "id", response_id)
            json(conn, response)

          {:error, status, body} ->
            conn |> put_status(status) |> json(body)
        end
      else
        execute_gateway(conn, org_id, provider, model, "responses", fn target ->
          Gateway.responses_create(target, data)
        end)
        |> case do
          {:ok, result} -> json(conn, result)
          {:error, status, body} -> conn |> put_status(status) |> json(body)
        end
      end
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  def responses_compact(conn, _params) do
    org_id = OrgAccess.resolve_org_id(conn)

    with :ok <- org_check(conn, org_id) do
      data = conn.body_params

      case ChatPipeline.run(conn, org_id, Map.merge(data, %{"model" => data["model"] || "gpt-4o-mini"})) do
        {:ok, response, _meta} when is_map(response) ->
          json(conn, %{"responses" => response, "compact" => true})

        {:error, status, body} ->
          conn |> put_status(status) |> json(body)

        _ ->
          return_error(conn, 502, "compact requires a non-streaming provider response", "upstream_error")
      end
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  def responses_show(conn, %{"response_id" => response_id}) do
    org_id = OrgAccess.resolve_org_id(conn)

    with :ok <- org_check(conn, org_id) do
      case ResponseStore.get_response(org_id, response_id) do
        nil ->
          return_error(conn, 404, "Response not found", "invalid_request_error")

        row ->
          json(conn, %{
            "id" => row["id"],
            "object" => "response",
            "created_at" => row["created_at"],
            "model" => row["model"],
            "output_text" => row["output_text"],
            "previous_response_id" => row["previous_response_id"]
          })
      end
    else
      {:error, status, message} ->
        conn |> put_status(status) |> json(%{"error" => message})
    end
  end

  # -- shared helpers --------------------------------------------------------------------

  defp org_check(conn, org_id), do: OrgAccess.check(conn, org_id)

  defp run_passthrough(conn, org_id, provider, model, endpoint, fun) do
    execute_gateway(conn, org_id, provider, model, endpoint, fn target ->
      fun.(target, conn.body_params)
    end)
    |> case do
      {:ok, result} -> {:ok, result, provider, model}
      {:error, status, body} -> {:error, status, body}
    end
  end

  defp execute_gateway(conn, org_id, provider, model, endpoint, fun) do
    spec = Providers.spec_for(provider)

    cond do
      endpoint in ["video", "images", "responses", "embeddings", "stt", "tts"] and
          (spec.protocol != "openai" or not capability?(spec, capability_for(endpoint))) and
          endpoint not in ["stt", "tts"] ->
        {:error, 400,
         %{"error" => %{"message" => "Provider '#{provider}' does not support #{capability_for(endpoint)} generation", "type" => "invalid_request_error"}}}

      true ->
        with %{"api_key" => api_key, "base_url" => base_url} <- first_credential(org_id, provider, spec) do
          try do
            {:ok, fun.(Gateway.target(provider, model, api_key, base_url))}
          rescue
            e in GatewayError ->
              {:error, e.status || 502, %{"error" => %{"message" => e.message, "type" => "upstream_error"}}}
          end
        else
          _ ->
            {:error, 502, %{"error" => %{"message" => "No credentials configured for provider #{provider}", "type" => "upstream_error"}}}
        end
    end
  end

  defp capability_for("video"), do: "video"
  defp capability_for("images"), do: "images"
  defp capability_for("responses"), do: "responses"
  defp capability_for("embeddings"), do: "embeddings"
  defp capability_for(_), do: "chat"

  defp capability?(spec, cap), do: Providers.supports?(spec, "openai", cap)

  defp first_credential(org_id, provider, spec) do
    case RadasAI.Accounts.gather_credentials(org_id, provider, spec.env_key) do
      [first | _] -> first
      [] -> nil
    end
  end

  defp chat_like_complete(target, data, messages) do
    payload =
      data
      |> Map.take(["temperature", "top_p", "max_tokens"])
      |> Map.put("messages", messages)

    Gateway.complete(target, payload)
  end

  defp extract_response_input(%{"input" => input}) when is_binary(input), do: input
  defp extract_response_input(%{"input" => parts}) when is_list(parts) do
    Enum.map_join(parts, "\n", fn
      %{"content" => content} when is_binary(content) -> content
      content when is_binary(content) -> content
      _ -> ""
    end)
  end
  defp extract_response_input(_), do: ""

  defp provider_for(model, data) do
    explicit = data && data["provider"]

    if explicit in [nil, ""], do: Providers.provider_for_model(model), else: String.downcase(String.trim(to_string(explicit)))
  end

  defp split_provider_prefix(raw_model, explicit_provider) do
    if String.contains?(raw_model, "/") do
      [prefix, model] = String.split(raw_model, "/", parts: 2)
      provider = if explicit_provider in [nil, ""], do: prefix, else: explicit_provider
      {String.downcase(String.trim(to_string(provider))), model}
    else
      {String.downcase(String.trim(to_string(explicit_provider || ""))), raw_model}
    end
  end

  defp extract_upload(conn) do
    upload = conn.params && (conn.params["file"] || conn.params[:file])

    case upload do
      %Plug.Upload{path: path, filename: filename, content_type: content_type} ->
        {filename || "upload", content_type || "application/octet-stream", File.read!(path)}

      _ ->
        {"upload", "application/octet-stream", <<>>}
    end
  end

  defp record_audio(conn, org_id, provider, model, endpoint) do
    RadasAI.DB.execute!(
      """
      INSERT INTO org_ai_usage
        (id, org_id, user_id, provider_used, model_used, prompt_tokens, completion_tokens, tokens_saved_rtk, fallback_triggered, timestamp)
      VALUES ($1, $2, $3, $4, $5, 0, 0, 0, FALSE, $6)
      """,
      ["usg-" <> uuid12(), org_id, user_id(conn), provider, model, RadasAI.DB.now()]
    )

    RadasAI.Telemetry.record_request_log(
      org_id: org_id,
      user_id: user_id(conn),
      endpoint: endpoint,
      requested_model: model,
      attempts: [%{"provider" => provider, "model" => model, "status" => "success"}],
      status: "success",
      request_id: "req-" <> uuid12(),
      resolved_provider: provider,
      resolved_model: model
    )

    :ok
  rescue
    _ -> :ok
  end

  defp user_id(conn), do: (conn.assigns[:current_user] || %{})["user_id"] || "system"

  defp return_error(conn, status, message, type) do
    conn |> put_status(status) |> json(%{"error" => %{"message" => message, "type" => type}})
  end

  defp truthy(nil), do: false
  defp truthy(v) when v == true, do: true
  defp truthy("true"), do: true
  defp truthy(_), do: false

  defp uuid12, do: :crypto.strong_rand_bytes(6) |> Base.encode16(case: :lower)
end
