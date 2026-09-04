defmodule RadasAI.ChatPipeline do
  @moduledoc """
  Port of `_chat_completions_core` in `api/ai_router_routes.py`.

  Full chat pipeline: validation → RTK token-saver policy → Ponytail →
  ordered fallback chain (route combo or the default multi-tier chain) →
  per-provider rate limiting + credential rotation + gateway attempts →
  usage/telemetry recording (fail-open).

  Returns `{:ok, response_map, meta}` for JSON successes, `{:ok, stream,
  meta}` for SSE successes, or `{:error, status, body}` for failures.
  """

  alias RadasAI.{
    Accounts,
    Compression,
    Gateway,
    GatewayError,
    Providers,
    RateLimit,
    Telemetry
  }

  import RadasAI.DB
  import Plug.Conn, only: [get_req_header: 2]

  @max_messages 100
  @max_message_chars 200_000

  @default_fallback_chain ["gpt-4o-mini", "claude-3-5-sonnet", "gemini-1.5-flash", "deepseek-chat"]

  defmodule Input do
    @moduledoc false
    defstruct [:conn, :org_id, :user_id, :data, :token_saver_header_off, :ponytail_level, :testing?]
  end

  @doc "Run the pipeline. `conn` supplies headers/claims; `data` is the JSON body."
  @spec run(Plug.Conn.t(), String.t(), map(), keyword()) ::
          {:ok, map(), map()} | {:ok, Enumerable.t(), map()} | {:error, integer(), map()}
  def run(conn, org_id, data, opts \\ []) do
    user_id = user_id_from(conn)
    testing? = Keyword.get_lazy(opts, :testing?, fn -> Application.get_env(:radas, :gateway_testing, false) end)

    with {:ok, messages} <- validate_messages(data["messages"]),
         {:ok, requested_model} <- validate_model(data["model"]) do
      stream = truthy(data["stream"])

      # 1. Token-saver policy: per-route settings, X-9Router-Token-Saver: off wins.
      header_off = conn |> get_req_header("x-9router-token-saver") |> List.first() |> then(&(&1 == "off"))
      route = route_for(org_id, requested_model)

      {compressed_messages, tokens_saved} =
        if header_off do
          {messages, 0}
        else
          rtk_enabled = if route, do: truthy(Map.get(route, "rtk_compression_enabled", true)), else: true
          caveman_mode = normalize_caveman(route && route["caveman_mode"])
          Compression.compress_messages(messages, enabled: rtk_enabled, mode: caveman_mode)
        end

      # 1b. Ponytail persona injection.
      compressed_messages =
        case ponytail_level(conn) do
          nil -> compressed_messages
          level -> Ponytail.apply_ponytail(compressed_messages, level)
        end

      # 2. Ordered fallback chain: route combo or default multi-tier chain.
      fallback_chain = build_chain(route, requested_model)

      request_id = "req-" <> uuid12()
      started = System.monotonic_time(:millisecond)
      attempts = []

      # 3. Attempt execution through the ordered fallback chain.
      execute_chain(%{
        chain: fallback_chain,
        org_id: org_id,
        user_id: user_id,
        data: data,
        messages: compressed_messages,
        stream: stream,
        testing?: testing?,
        request_id: request_id,
        started: started,
        attempts: attempts,
        tokens_saved: tokens_saved,
        requested_model: requested_model,
        last_error: nil
      })
    end
  end

  defp execute_chain(%{chain: []} = state), do: finalize_error(state)

  defp execute_chain(state) do
    %{chain: [target_model | rest]} = state

    if target_model == nil do
      finalize_error(state)
    else
      provider = Providers.provider_for_model(target_model)
      prov = provider_row(state.org_id, provider)
      rate_limit = int_or(prov && prov["rate_limit_per_min"], 0)

      {allowed, _retry_after} = RateLimit.allow(state.org_id, provider, rate_limit)

      cond do
        not allowed ->
          attempt = %{"provider" => provider, "model" => target_model, "status" => "rate_limited"}
          error = %GatewayError{message: "Provider #{provider} rate limit reached", status: 429, retryable: true}
          execute_chain(%{state | chain: rest, attempts: state.attempts ++ [attempt], last_error: error})

        true ->
          credentials = Accounts.gather_credentials(state.org_id, provider, Providers.spec_for(provider).env_key)

          if credentials == [] do
            if state.testing? do
              # Tests may exercise the route without provisioning a paid
              # provider; production never synthesizes a completion.
              response = testing_response(target_model, state, provider)
              {:ok, response, success_meta(state, provider, target_model, response)}
            else
              error = %GatewayError{message: "No credentials configured for provider #{provider}"}

              attempt = %{"provider" => provider, "model" => target_model, "status" => "error", "error" => error.message}
              execute_chain(%{state | chain: rest, attempts: state.attempts ++ [attempt], last_error: error})
            end
          else
            try_credential(state, rest, provider, target_model, credentials, [])
          end
      end
    end
  end

  defp try_credential(state, rest, provider, target_model, [credential | more], _errors) do
    target = Gateway.target(provider, target_model, credential["api_key"], credential["base_url"])
    attempt_start = System.monotonic_time(:millisecond)

    try do
      if state.stream do
        response_iter = Gateway.stream(target, Map.put(state.data, "messages", state.messages))
        attempt = %{"provider" => provider, "model" => target_model, "status" => "success"}
        meta = success_meta(state, provider, target_model, nil, attempt_start, state.attempts ++ [attempt])
        {:ok, response_iter, meta}
      else
        response = Gateway.complete(target, Map.put(state.data, "messages", state.messages))

        {prompt_tokens, completion_tokens} = Gateway.usage_from_response(response, state.messages)
        usage = Map.new(response["usage"] || %{})
        usage = usage |> Map.put_new("prompt_tokens", prompt_tokens) |> Map.put_new("completion_tokens", completion_tokens)
        usage = Map.put(usage, "total_tokens", usage["prompt_tokens"] + usage["completion_tokens"])
        usage = Map.put(usage, "rtk_tokens_saved", state.tokens_saved)
        response = Map.put(response, "usage", usage)

        latency = System.monotonic_time(:millisecond) - attempt_start
        attempt = %{"provider" => provider, "model" => target_model, "status" => "success", "latency_ms" => latency}
        {:ok, response, success_meta(state, provider, target_model, response, attempt_start, state.attempts ++ [attempt])}
      end
    rescue
      e in GatewayError ->
        latency = System.monotonic_time(:millisecond) - attempt_start
        attempt = %{"provider" => provider, "model" => target_model, "status" => "error", "http_status" => e.status, "error" => String.slice(e.message || "", 0, 200), "latency_ms" => latency}
        state = %{state | attempts: state.attempts ++ [attempt], last_error: e}

        if e.retryable and more != [] do
          try_credential(state, rest, provider, target_model, more, [])
        else
          execute_chain(%{state | chain: rest})
        end
    end
  end

  defp try_credential(state, rest, _provider, _target_model, [], _errors) do
    execute_chain(%{state | chain: rest})
  end

  defp success_meta(state, provider, model, response, attempt_start \\ nil, attempts \\ nil) do
    latency_ms = if attempt_start, do: System.monotonic_time(:millisecond) - state.started, else: nil

    meta = %{
      "request_id" => state.request_id,
      "provider" => provider,
      "model" => model,
      "fallback_triggered" => state.requested_model != model,
      "tokens_saved" => state.tokens_saved,
      "attempts" => attempts || state.attempts,
      "user_id" => state.user_id,
      "org_id" => state.org_id,
      "endpoint" => "chat",
      "requested_model" => state.requested_model,
      "stream" => state.stream,
      "latency_ms" => latency_ms
    }

    if response != nil do
      prompt = response["usage"]["prompt_tokens"] || 0
      completion = response["usage"]["completion_tokens"] || 0
      Map.merge(meta, %{"prompt_tokens" => prompt, "completion_tokens" => completion})
    else
      meta
    end
  end

  defp finalize_error(state) do
    status = if state[:last_error] && state.last_error.status, do: state.last_error.status, else: 502
    message = if state[:last_error], do: state.last_error.message, else: "No configured provider was available"
    latency_ms = System.monotonic_time(:millisecond) - state.started

    record(
      state,
      status: "error",
      error_code: "upstream_error",
      http_status: status,
      latency_ms: latency_ms
    )

    {:error, status, %{"error" => %{"message" => message, "type" => "upstream_error"}}}
  end

  @doc "Record usage + telemetry for a successful chat response (fail-open)."
  @spec record_success(map(), map()) :: :ok
  def record_success(meta, response) do
    try do
      execute!(
        """
        INSERT INTO org_ai_usage
          (id, org_id, user_id, provider_used, model_used, prompt_tokens, completion_tokens, tokens_saved_rtk, fallback_triggered, timestamp)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        """,
        [
          "usg-" <> uuid12(),
          meta["org_id"],
          meta["user_id"],
          meta["provider"],
          meta["model"],
          meta["prompt_tokens"] || 0,
          meta["completion_tokens"] || 0,
          meta["tokens_saved"] || 0,
          meta["fallback_triggered"],
          now()
        ]
      )
    rescue
      _ -> :ok
    end

    record(meta, status: "success")

    if is_map(response) do
      response
      |> Map.put_new("id", "chatcmpl-" <> uuid12())
      |> Map.put("system_fingerprint", "fp_radas9router_" <> meta["provider"])
    else
      response
    end
  end

  defp record(meta, extra) do
    Telemetry.record_request_log(
      Keyword.merge(
        [
          org_id: meta["org_id"],
          user_id: meta["user_id"],
          endpoint: meta["endpoint"] || "chat",
          requested_model: meta["requested_model"],
          attempts: meta["attempts"],
          request_id: meta["request_id"],
          resolved_provider: meta["provider"],
          resolved_model: meta["model"],
          tokens_saved_rtk: meta["tokens_saved"] || 0,
          stream: meta["stream"] || false
        ],
        Enum.to_list(extra)
      )
    )
  end

  # -- validation & helpers ---------------------------------------------------

  defp validate_messages(messages) when is_list(messages) and length(messages) > 0 and length(messages) <= @max_messages do
    valid? =
      Enum.all?(messages, fn m ->
        is_map(m) and is_binary(Map.get(m, "role")) and
          (is_binary(Map.get(m, "content")) or is_list(Map.get(m, "content")))
      end)

    total_chars =
      messages
      |> Enum.map(&String.length(to_string(Map.get(&1, "content") || "")))
      |> Enum.sum()

    if valid? and total_chars <= @max_message_chars do
      {:ok, messages}
    else
      {:error, 400, %{"error" => %{"message" => "messages payload exceeds limits", "type" => "invalid_request_error"}}}
    end
  end

  defp validate_messages(_), do: {:error, 400, %{"error" => %{"message" => "messages array is required", "type" => "invalid_request_error"}}}

  defp validate_model(model) when is_binary(model) do
    model = String.trim(model)

    cond do
      model == "" -> {:error, 400, %{"error" => %{"message" => "model is required", "type" => "invalid_request_error"}}}
      String.length(model) > 128 -> {:error, 400, %{"error" => %{"message" => "model is too long", "type" => "invalid_request_error"}}}
      true -> {:ok, model}
    end
  end

  defp validate_model(_), do: {:error, 400, %{"error" => %{"message" => "model is required", "type" => "invalid_request_error"}}}

  defp route_for(org_id, requested_model) do
    query_one!("SELECT * FROM org_ai_routes WHERE org_id = $1 AND alias_name = $2", [org_id, requested_model])
  end

  defp build_chain(route, requested_model) do
    if route do
      fallbacks =
        case route["fallback_models"] do
          list when is_list(list) -> list
          binary when is_binary(binary) -> Jason.decode(binary) |> elem(1) |> List.wrap() |> Enum.filter(&is_binary/1)
          _ -> []
        end

      [route["primary_model"] | Enum.reject(fallbacks, &(&1 == ""))]
    else
      [requested_model | @default_fallback_chain]
    end
    |> Enum.reject(&(&1 in [nil, ""]))
  end

  defp normalize_caveman(mode) when is_binary(mode) do
    mode = String.downcase(mode)
    if mode in ["true", "1"], do: "full", else: mode
  end

  defp normalize_caveman(_), do: "off"

  defp ponytail_level(conn) do
    case get_req_header(conn, "x-9router-ponytail") |> List.first() do
      nil -> nil
      "" -> nil
      level -> String.downcase(String.trim(level))
    end
    |> then(fn
      level when level in ["lite", "full", "ultra"] -> level
      _ -> nil
    end)
  end

  defp provider_row(org_id, provider) do
    query_one!(
      "SELECT * FROM org_ai_providers WHERE org_id = $1 AND provider_name = $2 AND is_active = TRUE",
      [org_id, provider]
    )
  end

  defp testing_response(target_model, state, provider) do
    prompt_tokens = state.messages |> Enum.map(&String.length(to_string(Map.get(&1, "content") || ""))) |> Enum.sum() |> div(4) |> max(1)

    %{
      "id" => "chatcmpl-" <> uuid12(),
      "object" => "chat.completion",
      "created" => System.system_time(:second),
      "model" => target_model,
      "choices" => [%{"index" => 0, "message" => %{"role" => "assistant", "content" => "Test gateway response"}, "finish_reason" => "stop"}],
      "usage" => %{
        "prompt_tokens" => prompt_tokens,
        "completion_tokens" => 3,
        "total_tokens" => 3,
        "rtk_tokens_saved" => state.tokens_saved
      },
      "_provider" => provider
    }
  end

  defp user_id_from(conn) do
    user = conn.assigns[:current_user] || %{}
    user["user_id"] || "system"
  end

  defp truthy(nil), do: false
  defp truthy(value) when value == true, do: true
  defp truthy("true"), do: true
  defp truthy(_), do: false

  defp int_or(nil, default), do: default
  defp int_or(v, _d) when is_integer(v), do: v
  defp int_or(_, default), do: default

  defp uuid12, do: :crypto.strong_rand_bytes(6) |> Base.encode16(case: :lower)

  # Silence unused alias warnings for modules referenced dynamically.
  @compile {:used, [:EndpointKeys, :ResponseStore]}
end
