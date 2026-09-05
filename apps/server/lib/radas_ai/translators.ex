defmodule RadasAI.Translators do
  @moduledoc """
  Port of `services/ai_router/translators.py` — wire-format translators.

  Translates OpenAI chat-completions requests/responses to and from native
  provider protocols (Anthropic Messages, Gemini generateContent), mirroring
  the upstream 9Router translation layer for the text-chat subset:

  - request: system extraction, role mapping, stop/temperature/max_tokens;
  - response: content assembly, finish-reason and usage mapping;
  - SSE: native event streams re-framed as OpenAI `chat.completion.chunk`.

  Text-only by design this iteration: non-text content parts raise a
  non-retryable 400 so nothing is silently dropped. Tool calls, vision, and
  audio remain untranslated (see docs/architecture/9router-parity.md).
  """

  alias RadasAI.GatewayError

  @anthropic_version "2023-06-01"

  @anthropic_stop %{
    "end_turn" => "stop",
    "stop_sequence" => "stop",
    "max_tokens" => "length"
  }

  @gemini_stop %{
    "STOP" => "stop",
    "MAX_TOKENS" => "length",
    "SAFETY" => "content_filter",
    "RECITATION" => "content_filter"
  }

  @doc "Anthropic API version header value."
  def anthropic_version, do: @anthropic_version

  # ---------------------------------------------------------------------------
  # Endpoints & headers
  # ---------------------------------------------------------------------------

  def anthropic_endpoint(base_url) do
    base = String.trim_trailing(base_url || "", "/")

    cond do
      String.ends_with?(base, "/v1/messages") -> base
      String.ends_with?(base, "/v1") -> base <> "/messages"
      true -> base <> "/v1/messages"
    end
  end

  def gemini_endpoint(base_url, model, stream \\ false) do
    base = String.trim_trailing(base_url || "", "/")
    action = if stream, do: "streamGenerateContent?alt=sse", else: "generateContent"

    cond do
      String.ends_with?(base, "/v1beta") -> "#{base}/models/#{model}:#{action}"
      true -> "#{base}/v1beta/models/#{model}:#{action}"
    end
  end

  def anthropic_headers(api_key) do
    %{
      "x-api-key" => api_key,
      "anthropic-version" => @anthropic_version,
      "content-type" => "application/json"
    }
  end

  def gemini_headers(api_key) do
    %{"x-goog-api-key" => api_key, "content-type" => "application/json"}
  end

  # ---------------------------------------------------------------------------
  # Anthropic Messages protocol
  # ---------------------------------------------------------------------------

  @doc "Translate an OpenAI chat request body to an Anthropic Messages body."
  def openai_to_anthropic(payload) do
    {system_parts_rev, convo_rev} =
      Enum.reduce(payload["messages"] || [], {[], []}, fn message, {sys, convo_rev} ->
        role = to_string(message["role"] || "")
        text = flatten_text(message["content"], "anthropic")

        if role == "system" do
          {[text | sys], convo_rev}
        else
          a_role = if role == "assistant", do: "assistant", else: "user"

          case convo_rev do
            [%{"role" => ^a_role} = last | rest] ->
              # Consecutive same-role messages merge: append to the tail.
              last = Map.update!(last, "content", &(&1 ++ [%{"type" => "text", "text" => text}]))
              {sys, [last | rest]}

            _ ->
              {sys, [%{"role" => a_role, "content" => [%{"type" => "text", "text" => text}]} | convo_rev]}
          end
        end
      end)

    build_anthropic_request(payload, system_parts_rev, convo_rev)
  end

  defp build_anthropic_request(payload, system_parts_rev, convo_rev) do
    system_parts = system_parts_rev |> Enum.reverse() |> Enum.reject(&(&1 == ""))
    convo = Enum.reverse(convo_rev)

    request = %{
      "model" => payload["model"],
      "max_tokens" => int_or(payload["max_tokens"], 4096),
      "messages" => convo
    }

    request =
      if system_parts != [] do
        Map.put(request, "system", Enum.join(system_parts, "\n\n"))
      else
        request
      end

    request =
      if payload["temperature"] != nil do
        Map.put(request, "temperature", to_float(payload["temperature"]))
      else
        request
      end

    request =
      if payload["top_p"] != nil do
        Map.put(request, "top_p", to_float(payload["top_p"]))
      else
        request
      end

    case payload["stop"] do
      stop when is_binary(stop) and stop != "" ->
        Map.put(request, "stop_sequences", [stop])

      stop when is_list(stop) ->
        seqs = Enum.map(stop, &to_string/1) |> Enum.reject(&(&1 == ""))

        if seqs != [], do: Map.put(request, "stop_sequences", seqs), else: request

      _ ->
        request
    end
  end

  @doc "Translate an Anthropic Messages response to an OpenAI chat completion."
  def anthropic_to_openai(response, model) do
    text =
      (response["content"] || [])
      |> Enum.filter(&(is_map(&1) and Map.get(&1, "type") == "text"))
      |> Enum.map_join("", &to_string(Map.get(&1, "text", "")))

    usage = response["usage"] || %{}
    prompt_tokens = int_or(usage["input_tokens"], 0)
    completion_tokens = int_or(usage["output_tokens"], 0)

    %{
      "id" => to_string(response["id"] || "chatcmpl-" <> random_id()),
      "object" => "chat.completion",
      "created" => System.system_time(:second),
      "model" => model,
      "choices" => [
        %{
          "index" => 0,
          "message" => %{"role" => "assistant", "content" => text},
          "finish_reason" => Map.get(@anthropic_stop, response["stop_reason"], "stop")
        }
      ],
      "usage" => %{
        "prompt_tokens" => prompt_tokens,
        "completion_tokens" => completion_tokens,
        "total_tokens" => prompt_tokens + completion_tokens
      }
    }
  end

  @doc """
  Re-frame Anthropic Messages SSE lines as OpenAI chat chunks.

  Accepts an enumerable of raw lines (binary or lines split already); returns
  an enumerable of `data: {json}\\n\\n` frames ending with `data: [DONE]\\n\\n`.
  """
  def anthropic_sse_to_openai(lines, model) do
    chunk_id = "chatcmpl-" <> random_id()
    created = System.system_time(:second)

    Stream.concat(
      Stream.transform(lines, nil, fn
        # message_stop halts processing; the final DONE comes from the concat
        # below — same byte output as Python's yield-then-return.
        _raw, :done ->
          {:halt, :done}

        raw, usage_acc ->
          line = to_string(raw) |> String.trim()

          if String.starts_with?(line, "data:") do
            payload_text = String.trim(String.slice(line, 5..-1//1))

            case Jason.decode(payload_text) do
              {:ok, %{"type" => type} = event} when is_map(event) ->
                emit_anthropic_event(type, event, chunk_id, created, model, usage_acc)

              _ ->
                {[], usage_acc}
            end
          else
            {[], usage_acc}
          end
      end),
      ["data: [DONE]\n\n"]
    )
  end

  defp emit_anthropic_event("message_start", event, chunk_id, created, model, _usage_acc) do
    message = event["message"] || %{}
    start_usage = message["usage"] || %{}
    usage = %{"prompt_tokens" => int_or(start_usage["input_tokens"], 0)}

    chunk = chunk(chunk_id, created, model, %{"role" => "assistant", "content" => ""})
    {[sse_frame(chunk)], usage}
  end

  defp emit_anthropic_event("content_block_delta", event, chunk_id, created, model, usage_acc) do
    delta = event["delta"] || %{}

    if Map.get(delta, "type") == "text_delta" do
      chunk = chunk(chunk_id, created, model, %{"content" => to_string(Map.get(delta, "text", ""))})
      {[sse_frame(chunk)], usage_acc}
    else
      {[], usage_acc}
    end
  end

  defp emit_anthropic_event("message_delta", event, chunk_id, created, model, usage_acc) do
    delta_usage = event["usage"] || %{}

    usage_acc =
      if delta_usage["output_tokens"] != nil do
        Map.put(usage_acc || %{}, "completion_tokens", int_or(delta_usage["output_tokens"], 0))
      else
        usage_acc || %{}
      end

    delta = event["delta"] || %{}
    finish = Map.get(@anthropic_stop, if(is_map(delta), do: delta["stop_reason"]), "stop")

    frame = chunk(chunk_id, created, model, %{}, finish, if(usage_acc == %{}, do: nil, else: usage_acc))
    {[sse_frame(frame)], usage_acc}
  end

  defp emit_anthropic_event("message_stop", _event, _chunk_id, _created, _model, usage_acc) do
    {:halt, usage_acc}
  end

  defp emit_anthropic_event(_type, _event, _chunk_id, _created, _model, usage_acc) do
    {[], usage_acc}
  end

  # ---------------------------------------------------------------------------
  # Gemini generateContent protocol
  # ---------------------------------------------------------------------------

  @doc "Translate an OpenAI chat request body to a Gemini generateContent body."
  def openai_to_gemini(payload) do
    {system_parts_rev, contents_rev} =
      Enum.reduce(payload["messages"] || [], {[], []}, fn message, {sys, contents_rev} ->
        role = to_string(message["role"] || "")
        text = flatten_text(message["content"], "gemini")

        if role == "system" do
          {[text | sys], contents_rev}
        else
          g_role = if role == "assistant", do: "model", else: "user"

          case contents_rev do
            [%{"role" => ^g_role} = last | rest] ->
              # Consecutive same-role messages merge: append to the tail.
              last = Map.update!(last, "parts", &(&1 ++ [%{"text" => text}]))
              {sys, [last | rest]}

            _ ->
              {sys, [%{"role" => g_role, "parts" => [%{"text" => text}]} | contents_rev]}
          end
        end
      end)

    system_parts = system_parts_rev |> Enum.reverse() |> Enum.reject(&(&1 == ""))
    contents = Enum.reverse(contents_rev)

    request = %{"contents" => contents}

    request =
      if system_parts != [] do
        Map.put(request, "systemInstruction", %{"parts" => [%{"text" => Enum.join(system_parts, "\n\n")}]})
      else
        request
      end

    generation =
      %{}
      |> maybe_put("maxOutputTokens", payload["max_tokens"], &int_or(&1, 0))
      |> maybe_put("temperature", payload["temperature"], &to_float/1)
      |> maybe_put("topP", payload["top_p"], &to_float/1)

    generation =
      case payload["stop"] do
        stop when is_binary(stop) and stop != "" -> Map.put(generation, "stopSequences", [stop])
        stop when is_list(stop) -> Map.put(generation, "stopSequences", Enum.map(stop, &to_string/1) |> Enum.reject(&(&1 == "")))
        _ -> generation
      end

    if generation == %{} do
      request
    else
      Map.put(request, "generationConfig", generation)
    end
  end

  @doc "Translate a Gemini generateContent response to an OpenAI chat completion."
  def gemini_to_openai(response, model) do
    candidate = (response["candidates"] || [%{}]) |> List.first() || %{}
    content = candidate["content"] || %{}

    text =
      (content["parts"] || [])
      |> Enum.filter(&(is_map(&1) and Map.has_key?(&1, "text")))
      |> Enum.map_join("", &to_string(Map.get(&1, "text", "")))

    usage = response["usageMetadata"] || %{}
    prompt_tokens = int_or(usage["promptTokenCount"], 0)
    completion_tokens = int_or(usage["candidatesTokenCount"], 0)

    %{
      "id" => "chatcmpl-" <> random_id(),
      "object" => "chat.completion",
      "created" => System.system_time(:second),
      "model" => model,
      "choices" => [
        %{
          "index" => 0,
          "message" => %{"role" => "assistant", "content" => text},
          "finish_reason" => Map.get(@gemini_stop, candidate["finishReason"], "stop")
        }
      ],
      "usage" => %{
        "prompt_tokens" => prompt_tokens,
        "completion_tokens" => completion_tokens,
        "total_tokens" => prompt_tokens + completion_tokens
      }
    }
  end

  @doc "Re-frame Gemini alt=sse events as OpenAI chat chunks."
  def gemini_sse_to_openai(lines, model) do
    chunk_id = "chatcmpl-" <> random_id()
    created = System.system_time(:second)

    Stream.concat(
      Stream.transform(lines, nil, fn raw, _acc ->
        line = to_string(raw) |> String.trim()

        if String.starts_with?(line, "data:") do
          payload_text = String.trim(String.slice(line, 5..-1//1))

          case Jason.decode(payload_text) do
            {:ok, event} when is_map(event) ->
              frames = emit_gemini_event(event, chunk_id, created, model)
              {frames, nil}

            _ ->
              {[], nil}
          end
        else
          {[], nil}
        end
      end),
      ["data: [DONE]\n\n"]
    )
  end

  defp emit_gemini_event(event, chunk_id, created, model) do
    candidates = event["candidates"] || []
    candidate = List.first(candidates) || %{}
    content = candidate["content"] || %{}

    frames =
      (content["parts"] || [])
      |> Enum.filter(&(is_map(&1) and Map.get(&1, "text") not in [nil, ""]))
      |> Enum.map(fn part ->
        chunk(chunk_id, created, model, %{"content" => to_string(part["text"])})
      end)

    usage = event["usageMetadata"] || %{}

    usage_map =
      if usage != %{} do
        %{
          "prompt_tokens" => int_or(usage["promptTokenCount"], 0),
          "completion_tokens" => int_or(usage["candidatesTokenCount"], 0)
        }
      end

    finish = Map.get(@gemini_stop, candidate["finishReason"])

    frames =
      if finish do
        frames ++ [chunk(chunk_id, created, model, %{}, finish, usage_map)]
      else
        frames
      end

    Enum.map(frames, &sse_frame/1)
  end

  # ---------------------------------------------------------------------------
  # Shared OpenAI chunk framing
  # ---------------------------------------------------------------------------

  defp chunk(chunk_id, created, model, delta, finish \\ nil, usage \\ nil) do
    base = %{
      "id" => chunk_id,
      "object" => "chat.completion.chunk",
      "created" => created,
      "model" => model,
      "choices" => [%{"index" => 0, "delta" => delta, "finish_reason" => finish}]
    }

    if usage, do: Map.put(base, "usage", usage), else: base
  end

  defp sse_frame(obj), do: "data: " <> Jason.encode!(obj) <> "\n\n"

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp flatten_text(content, provider) when is_binary(content), do: content

  defp flatten_text(content, provider) when is_list(content) do
    texts =
      Enum.map(content, fn part ->
        if is_map(part) and Map.get(part, "type") == "text" do
          to_string(Map.get(part, "text", ""))
        else
          raise GatewayError,
            message: "Non-text message content is not supported for provider #{provider}",
            status: 400,
            retryable: false
        end
      end)

    Enum.join(texts, "\n")
  end

  defp flatten_text(nil, _provider), do: ""

  defp flatten_text(_content, provider) do
    raise GatewayError,
      message: "Non-text message content is not supported for provider #{provider}",
      status: 400,
      retryable: false
  end

  defp max_tokens(payload, default), do: int_or(payload["max_tokens"], default)

  defp maybe_put(map, _key, nil, _cast), do: map
  defp maybe_put(map, key, value, cast), do: Map.put(map, key, cast.(value))

  defp int_or(nil, default), do: default
  defp int_or(value, _default) when is_integer(value), do: value
  defp int_or(value, default) when is_float(value), do: trunc(value)

  defp int_or(value, default) when is_binary(value) do
    case Integer.parse(value) do
      {int, _} -> int
      :error -> default
    end
  end

  defp int_or(_, default), do: default

  defp to_float(value) when is_integer(value), do: value * 1.0
  defp to_float(value) when is_float(value), do: value
  defp to_float(value) when is_binary(value) do
    case Float.parse(value) do
      {f, _} -> f
      :error -> 0.0
    end
  end

  defp random_id, do: :crypto.strong_rand_bytes(6) |> Base.encode16(case: :lower)
end
