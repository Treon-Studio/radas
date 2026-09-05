defmodule RadasAI.Gateway do
  @moduledoc """
  Port of `services/ai_router/gateway.py` — functional OpenAI-compatible
  upstream gateway.

  Dependency-free adapter layer (HTTP via Req): bounded timeouts, error
  classification (429/5xx retryable), wire-format translation for Anthropic /
  Gemini via `RadasAI.Translators`, media passthroughs (embeddings, audio,
  images, responses, video), and usage estimation when upstream omits usage.

  Testability: every JSON call goes through an injectable `fetch_json` fn and
  every stream through an injectable `lines` source, mirroring Python's
  `opener=` seam.
  """

  alias RadasAI.GatewayError
  alias RadasAI.Providers
  alias RadasAI.Translators

  @default_timeout_ms 45_000

  @enforce_keys [:name, :model, :api_key]
  defstruct [:name, :model, :api_key, base_url: ""]

  @type t :: %__MODULE__{name: String.t(), model: String.t(), api_key: String.t(), base_url: String.t()}

  def target(name, model, api_key, base_url \\ "") do
    %__MODULE__{name: name, model: model, api_key: api_key, base_url: base_url}
  end

  @doc "Default JSON fetcher: POST raw JSON body, return decoded map."
  def default_fetch_json(url, headers, body, timeout_ms) do
    case Req.post(url, body: body, headers: headers, receive_timeout: timeout_ms, retry: false) do
      {:ok, %Req.Response{status: status, body: resp_body}} when status in 200..299 ->
        resp_body

      {:ok, %Req.Response{status: status, body: resp_body}} ->
        raise GatewayError,
          message: error_body(status, resp_body),
          status: status,
          retryable: status == 429 or status >= 500

      {:error, _exception} ->
        raise GatewayError, message: "Upstream provider unavailable", retryable: true
    end
  rescue
    e in GatewayError -> reraise e, __STACKTRACE__
    _e -> raise GatewayError, message: "Upstream provider unavailable", retryable: true
  end

  @doc "Default SSE line source: POST and stream response body lines."
  def default_fetch_lines(url, headers, body, timeout_ms) do
    case Req.post(url, body: body, headers: headers, receive_timeout: timeout_ms, retry: false, into: :self) do
      {:ok, %Req.Response{status: 200, body: stream}} when is_map(stream) or is_function(stream) or is_list(stream) ->
        stream

      {:ok, %Req.Response{status: status, body: resp_body}} ->
        raise GatewayError,
          message: error_body(status, resp_body),
          status: status,
          retryable: status == 429 or status >= 500

      {:error, _exception} ->
        raise GatewayError, message: "Upstream provider unavailable", retryable: true
    end
  rescue
    e in GatewayError -> reraise e, __STACKTRACE__
    _e -> raise GatewayError, message: "Upstream provider unavailable", retryable: true
  end

  defp error_body(status, resp_body) when is_map(resp_body) do
    case resp_body do
      %{"error" => %{"message" => msg}} when is_binary(msg) -> msg
      %{"error" => msg} when is_binary(msg) -> msg
      _ -> "Upstream provider returned HTTP #{status}"
    end
  end

  defp error_body(status, resp_body) when is_binary(resp_body) do
    case Jason.decode(resp_body) do
      {:ok, %{"error" => %{"message" => msg}}} when is_binary(msg) -> msg
      {:ok, %{"error" => msg}} when is_binary(msg) -> msg
      _ -> "Upstream provider returned HTTP #{status}"
    end
  rescue
    _ -> "Upstream provider returned HTTP #{status}"
  end

  defp error_body(status, _), do: "Upstream provider returned HTTP #{status}"

  # ---------------------------------------------------------------------------
  # Endpoints
  # ---------------------------------------------------------------------------

  @doc "The /chat/completions endpoint for a target."
  def endpoint(%__MODULE__{} = target) do
    base = base_url(target)
    base <> "/chat/completions"
  end

  defp base_url(%__MODULE__{} = target) do
    base = String.trim_trailing(target.base_url || "", "/")

    if base == "" do
      spec = Providers.spec_for(target.name)

      if spec.base_url == "" do
        raise GatewayError, message: "No base URL configured for provider #{target.name}"
      end

      String.trim_trailing(spec.base_url, "/")
    else
      base
    end
  end

  # ---------------------------------------------------------------------------
  # Chat completion (non-stream)
  # ---------------------------------------------------------------------------

  @doc "One chat completion through the target's protocol."
  def complete(target, payload, opts \\ []) do
    fetch = Keyword.get(opts, :fetch_json, &default_fetch_json/4)
    timeout = Keyword.get(opts, :timeout_ms, @default_timeout_ms)
    spec = Providers.spec_for(target.name)

    case spec.protocol do
      "anthropic" -> complete_anthropic(target, payload, fetch, timeout)
      "gemini" -> complete_gemini(target, payload, fetch, timeout)
      _ -> complete_openai(target, payload, fetch, timeout)
    end
  end

  defp complete_openai(target, payload, fetch, timeout) do
    request_payload = payload |> Map.new() |> Map.put("model", target.model) |> Map.put("stream", false)

    result =
      fetch.(endpoint(target), json_headers(target.api_key), Jason.encode!(request_payload), timeout)

    unless is_map(result), do: raise(GatewayError, message: "Upstream returned an invalid response")
    result
  end

  defp complete_anthropic(target, payload, fetch, timeout) do
    translated = Translators.openai_to_anthropic(Map.put(Map.new(payload), "model", target.model))

    result =
      fetch.(
        Translators.anthropic_endpoint(base_url(target)),
        Translators.anthropic_headers(target.api_key),
        Jason.encode!(translated),
        timeout
      )

    unless is_map(result), do: raise(GatewayError, message: "Upstream returned an invalid response")
    Translators.anthropic_to_openai(result, target.model)
  end

  defp complete_gemini(target, payload, fetch, timeout) do
    translated = Translators.openai_to_gemini(payload)

    result =
      fetch.(
        Translators.gemini_endpoint(base_url(target), target.model),
        Translators.gemini_headers(target.api_key),
        Jason.encode!(translated),
        timeout
      )

    unless is_map(result), do: raise(GatewayError, message: "Upstream returned an invalid response")
    Translators.gemini_to_openai(result, target.model)
  end

  # ---------------------------------------------------------------------------
  # Chat streaming
  # ---------------------------------------------------------------------------

  @doc """
  Stream one chat completion; returns an enumerable of binary SSE frames.

  OpenAI-protocol providers pass through raw lines; Anthropic / Gemini are
  re-framed to `chat.completion.chunk` frames ending with a single
  `data: [DONE]\n\n`.
  """
  def stream(target, payload, opts \\ []) do
    lines_source = Keyword.get(opts, :lines)
    timeout = Keyword.get(opts, :timeout_ms, @default_timeout_ms)
    spec = Providers.spec_for(target.name)

    {translated, url, headers, translator} =
      case spec.protocol do
        "anthropic" ->
          translated = Translators.openai_to_anthropic(Map.put(Map.new(payload), "model", target.model))
          headers = Map.merge(Translators.anthropic_headers(target.api_key), %{"Accept" => "text/event-stream"})

          {translated, Translators.anthropic_endpoint(base_url(target)), headers,
           &Translators.anthropic_sse_to_openai(&1, target.model)}

        "gemini" ->
          translated = Translators.openai_to_gemini(payload)
          headers = Map.merge(Translators.gemini_headers(target.api_key), %{"Accept" => "text/event-stream"})

          {translated, Translators.gemini_endpoint(base_url(target), target.model, true), headers,
           &Translators.gemini_sse_to_openai(&1, target.model)}

        _ ->
          translated = payload |> Map.new() |> Map.put("model", target.model) |> Map.put("stream", true)
          headers = %{"Accept" => "text/event-stream", "Content-Type" => "application/json", "Authorization" => "Bearer " <> target.api_key}
          {translated, endpoint(target), headers, nil}
      end

    lines = lines_source || default_fetch_lines(url, headers, Jason.encode!(translated), timeout)

    if translator do
      translator.(lines)
    else
      Stream.map(lines, fn line -> if is_binary(line), do: line, else: to_string(line) end)
    end
  end

  # ---------------------------------------------------------------------------
  # Embeddings & capability passthroughs
  # ---------------------------------------------------------------------------

  @doc "POST /embeddings (OpenAI-protocol providers only)."
  def embeddings(target, payload, opts \\ []) do
    fetch = Keyword.get(opts, :fetch_json, &default_fetch_json/4)
    timeout = Keyword.get(opts, :timeout_ms, @default_timeout_ms)
    spec = Providers.spec_for(target.name)

    if spec.protocol != "openai" do
      raise GatewayError,
        message:
          "Embeddings are not supported for provider #{target.name} (#{spec.protocol} protocol)",
        status: 400,
        retryable: false
    end

    request_payload = Map.put(Map.new(payload), "model", target.model)
    fetch.(base_url(target) <> "/embeddings", json_headers(target.api_key), Jason.encode!(request_payload), timeout)
  end

  @doc "POST /images/generations (capability-gated passthrough)."
  def images_generate(target, payload, opts \\ []) do
    capability_passthrough(target, payload, "images", "/images/generations", opts)
  end

  @doc "POST /responses — stateless Responses API passthrough."
  def responses_create(target, payload, opts \\ []) do
    capability_passthrough(target, payload, "responses", "/responses", opts)
  end

  @doc "POST /videos/<action> — async video job creation (capability-gated)."
  def video_create(target, payload, action, opts \\ []) do
    suffix = if action == "generations", do: "", else: "/" <> action
    capability_passthrough(target, payload, "video", "/videos" <> suffix, opts)
  end

  @doc "GET /videos/<id> — poll one async video job."
  def video_status(target, video_id, opts \\ []) do
    timeout = Keyword.get(opts, :timeout_ms, @default_timeout_ms)
    guard_capability(target, "video")

    case Req.get(base_url(target) <> "/videos/" <> URI.encode_www_form(video_id),
           headers: Map.to_list(auth_headers(target.api_key)),
           receive_timeout: timeout,
           retry: false
         ) do
      {:ok, %Req.Response{status: status, body: body}} when status in 200..299 and is_map(body) ->
        body

      {:ok, %Req.Response{status: status, body: body}} ->
        raise GatewayError, message: error_body(status, body), status: status, retryable: status == 429 or status >= 500

      {:error, _} ->
        raise GatewayError, message: "Upstream provider unavailable", retryable: true
    end
  end

  defp capability_passthrough(target, payload, capability, path, opts) do
    fetch = Keyword.get(opts, :fetch_json, &default_fetch_json/4)
    timeout = Keyword.get(opts, :timeout_ms, @default_timeout_ms)
    guard_capability(target, capability)

    request_payload = Map.new(payload)

    request_payload =
      if target.model == "", do: request_payload, else: Map.put(request_payload, "model", target.model)

    result = fetch.(base_url(target) <> path, json_headers(target.api_key), Jason.encode!(request_payload), timeout)

    unless is_map(result), do: raise(GatewayError, message: "Upstream returned an invalid response")
    result
  end

  defp guard_capability(target, capability) do
    spec = Providers.spec_for(target.name)

    if spec.protocol != "openai" or not MapSet.member?(spec.capabilities, capability) do
      raise GatewayError,
        message:
          "#{capability} requests are not supported for provider #{target.name} (#{spec.protocol} protocol)",
        status: 400,
        retryable: false
    end
  end

  # ---------------------------------------------------------------------------
  # Audio (STT/TTS)
  # ---------------------------------------------------------------------------

  @doc "POST /audio/transcriptions — OpenAI multipart passthrough or native Gemini."
  def transcribe(target, file_bytes, filename, content_type, fields, opts \\ []) do
    fetch = Keyword.get(opts, :fetch_json, &default_fetch_json/4)
    timeout = Keyword.get(opts, :timeout_ms, @default_timeout_ms)
    audio_guard(target)

    if Providers.spec_for(target.name).protocol == "gemini" do
      transcribe_gemini(target, file_bytes, fetch, timeout)
    else
      {body, multipart_type} =
        RadasAI.Multipart.encode(fields, "file", filename, file_bytes, content_type)

      case Req.post(base_url(target) <> "/audio/transcriptions",
             body: body,
             headers: [{"Authorization", "Bearer " <> target.api_key}, {"Content-Type", multipart_type}],
             receive_timeout: timeout,
             retry: false
           ) do
        {:ok, %Req.Response{status: status, body: result}} when status in 200..299 and is_map(result) ->
          result

        {:ok, %Req.Response{status: status, body: body}} ->
          raise GatewayError, message: error_body(status, body), status: status, retryable: status == 429 or status >= 500

        {:error, _} ->
          raise GatewayError, message: "Upstream provider unavailable", retryable: true
      end
    end
  rescue
    e in GatewayError -> reraise e, __STACKTRACE__
  end

  defp transcribe_gemini(target, file_bytes, fetch, timeout) do
    payload = %{
      "contents" => [
        %{
          "role" => "user",
          "parts" => [
            %{"text" => "Transcribe this audio exactly."},
            %{"inline_data" => %{"mime_type" => "audio/mpeg", "data" => Base.encode64(file_bytes)}}
          ]
        }
      ]
    }

    result =
      fetch.(
        Translators.gemini_endpoint(base_url(target), target.model),
        Translators.gemini_headers(target.api_key),
        Jason.encode!(payload),
        timeout
      )

    candidate = (result["candidates"] || [%{}]) |> List.first() || %{}
    parts = get_in(candidate, ["content", "parts"]) || []

    text =
      parts
      |> Enum.filter(&is_map/1)
      |> Enum.map_join("", &(to_string(Map.get(&1, "text", ""))))
      |> String.trim()

    %{"text" => text}
  end

  @doc "POST /audio/speech — OpenAI passthrough or native Gemini audio generation."
  def speak(target, payload, opts \\ []) do
    timeout = Keyword.get(opts, :timeout_ms, @default_timeout_ms)
    audio_guard(target)

    if Providers.spec_for(target.name).protocol == "gemini" do
      speak_gemini(target, payload, timeout)
    else
      case Req.post(base_url(target) <> "/audio/speech",
             body: Jason.encode!(payload),
             headers: json_headers(target.api_key) |> Map.put("Accept", "audio/*") |> Map.to_list(),
             receive_timeout: timeout,
             retry: false
           ) do
        {:ok, %Req.Response{status: status, body: audio}} when status in 200..299 ->
          {audio, "audio/mpeg"}

        {:ok, %Req.Response{status: status, body: body}} ->
          raise GatewayError, message: error_body(status, body), status: status, retryable: status == 429 or status >= 500

        {:error, _} ->
          raise GatewayError, message: "Upstream provider unavailable", retryable: true
      end
    end
  rescue
    e in GatewayError -> reraise e, __STACKTRACE__
  end

  defp speak_gemini(target, payload, timeout) do
    generation = Map.new(payload["generationConfig"] || %{}) |> Map.put("responseModalities", ["AUDIO"])

    generation =
      if payload["voice"] do
        Map.put(generation, "speechConfig", %{
          "voiceConfig" => %{"prebuiltVoiceConfig" => %{"voiceName" => to_string(payload["voice"])}}
        })
      else
        generation
      end

    request_payload = %{
      "contents" => [%{"role" => "user", "parts" => [%{"text" => to_string(payload["input"] || "")}]}],
      "generationConfig" => generation
    }

    result =
      default_fetch_json(
        Translators.gemini_endpoint(base_url(target), target.model),
        Translators.gemini_headers(target.api_key),
        Jason.encode!(request_payload),
        timeout
      )

    candidate = (result["candidates"] || [%{}]) |> List.first() || %{}
    parts = get_in(candidate, ["content", "parts"]) || []

    audio_b64 =
      Enum.find_value(parts, fn part ->
        if is_map(part) do
          inline = Map.get(part, "inlineData") || Map.get(part, "inline_data")

          if is_map(inline) and inline["data"] != nil and inline["data"] != "", do: to_string(inline["data"])
        end
      end)

    unless audio_b64, do: raise(GatewayError, message: "Upstream returned no audio data")
    {Base.decode64!(audio_b64), "audio/pcm;rate=24000"}
  end

  defp audio_guard(target) do
    spec = Providers.spec_for(target.name)

    if not MapSet.member?(spec.capabilities, "audio") do
      raise GatewayError,
        message: "Audio endpoints are not supported for provider #{target.name} (#{spec.protocol} protocol)",
        status: 400,
        retryable: false
    end
  end

  # ---------------------------------------------------------------------------
  # Usage estimation
  # ---------------------------------------------------------------------------

  @doc """
  Token counts for one response; estimates from content length when the
  upstream omits usage metadata (chars // 4).
  """
  def usage_from_response(response, messages) do
    usage = if is_map(response), do: response["usage"]

    if is_map(usage) do
      {int_or(usage["prompt_tokens"], 0), int_or(usage["completion_tokens"], 0)}
    else
      prompt = messages |> Enum.map(&(String.length(to_string(Map.get(&1, "content") || "")))) |> Enum.sum()
      prompt = div(prompt, 4)

      completion =
        (response["choices"] || [])
        |> Enum.filter(&is_map/1)
        |> Enum.map(&(String.length(to_string(get_in(&1, ["message", "content"]) || ""))))
        |> Enum.sum()

      completion = div(completion, 4)
      {prompt, completion}
    end
  end

  # ---------------------------------------------------------------------------
  # Headers
  # ---------------------------------------------------------------------------

  defp json_headers(api_key),
    do: %{"Accept" => "application/json", "Content-Type" => "application/json", "Authorization" => "Bearer " <> api_key}

  defp auth_headers(api_key), do: %{"Accept" => "application/json", "Authorization" => "Bearer " <> api_key}

  defp int_or(nil, default), do: default
  defp int_or(value, _default) when is_integer(value), do: value
  defp int_or(value, _default) when is_float(value), do: trunc(value)

  defp int_or(value, default) when is_binary(value) do
    case Integer.parse(value) do
      {int, _} -> int
      :error -> default
    end
  end

  defp int_or(_, default), do: default
end
