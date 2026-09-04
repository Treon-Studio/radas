defmodule RadasAI.GatewayTest do
  use ExUnit.Case, async: true

  # Ported from `test_anthropic_gateway_dispatch`, `test_gemini_gateway_dispatch`
  # (in test_ai_router_translators.py) and the gateway error/usage tests.
  alias RadasAI.Gateway
  alias RadasAI.GatewayError

  @openai_request %{
    "model" => "claude-3-5-sonnet",
    "messages" => [
      %{"role" => "system", "content" => "Be terse."},
      %{"role" => "user", "content" => "Hello"},
      %{"role" => "user", "content" => "Again"},
      %{"role" => "assistant", "content" => "Hi"}
    ],
    "max_tokens" => 512,
    "stop" => ["STOP", "END"],
    "temperature" => 0.2
  }

  test "anthropic dispatch translates request and response" do
    seen = :ets.new(:seen, [:set, :public])

    fetch = fn url, headers, _body, _timeout ->
      :ets.insert(seen, {:url, url})
      :ets.insert(seen, {:headers, headers})

      %{
        "id" => "msg_9",
        "content" => [%{"type" => "text", "text" => "ok"}],
        "stop_reason" => "end_turn",
        "usage" => %{"input_tokens" => 3, "output_tokens" => 1}
      }
    end

    result =
      Gateway.complete(
        Gateway.target("anthropic", "claude-3-5-sonnet", "sk-ant", ""),
        @openai_request,
        fetch_json: fetch
      )

    assert :ets.lookup(seen, :url) |> hd() |> elem(1) == "https://api.anthropic.com/v1/messages"

    headers = :ets.lookup(seen, :headers) |> hd() |> elem(1)
    assert headers["x-api-key"] == "sk-ant"
    assert headers["anthropic-version"] == "2023-06-01"

    assert get_in(result, ["choices", Access.at(0), "message", "content"]) == "ok"
    assert result["usage"]["prompt_tokens"] == 3
  end

  test "gemini dispatch builds the generateContent endpoint" do
    seen = :ets.new(:seen, [:set, :public])

    fetch = fn url, headers, _body, _timeout ->
      :ets.insert(seen, {:url, url})
      :ets.insert(seen, {:headers, headers})

      %{
        "candidates" => [%{"content" => %{"parts" => [%{"text" => "ok"}]}, "finishReason" => "STOP"}],
        "usageMetadata" => %{"promptTokenCount" => 5, "candidatesTokenCount" => 1}
      }
    end

    result =
      Gateway.complete(
        Gateway.target("google", "gemini-1.5-flash", "g-key", ""),
        %{"messages" => [%{"role" => "user", "content" => "hi"}]},
        fetch_json: fetch
      )

    assert :ets.lookup(seen, :url) |> hd() |> elem(1) ==
             "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"

    headers = :ets.lookup(seen, :headers) |> hd() |> elem(1)
    assert headers["x-goog-api-key"] == "g-key"

    assert get_in(result, ["choices", Access.at(0), "message", "content"]) == "ok"
  end

  test "openai protocol passthrough sends model and stream=false" do
    seen = :ets.new(:seen, [:set, :public])

    fetch = fn _url, _headers, body, _timeout ->
      :ets.insert(seen, {:body, Jason.decode!(body)})
      %{"choices" => [%{"message" => %{"content" => "hey"}}], "usage" => %{"prompt_tokens" => 1, "completion_tokens" => 1}}
    end

    result =
      Gateway.complete(
        Gateway.target("deepseek", "deepseek-chat", "dk", ""),
        %{"messages" => [%{"role" => "user", "content" => "hi"}]},
        fetch_json: fetch
      )

    body = :ets.lookup(seen, :body) |> hd() |> elem(1)
    assert body["model"] == "deepseek-chat"
    assert body["stream"] == false
    assert get_in(result, ["choices", Access.at(0), "message", "content"]) == "hey"
  end

  test "streaming anthropic end-to-end through the injectable lines seam" do
    events =
      ~s(event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"yo"}}\n\n) <>
        ~s(event: message_stop\ndata: {"type":"message_stop"}\n\n)

    lines = String.split(events, "\n")
    chunks = Gateway.stream(Gateway.target("anthropic", "claude-3-5-sonnet", "sk", ""), %{"messages" => [%{"role" => "user", "content" => "hi"}]}, lines: lines)
    body = Enum.join(chunks, "")

    frames =
      body
      |> String.split("\n", trim: false)
      |> Enum.filter(&String.starts_with?(&1, "data: "))
      |> Enum.reject(&(&1 == "data: [DONE]"))
      |> Enum.map(&(String.slice(&1, 6..-1//1) |> String.trim() |> Jason.decode!()))

    deltas = Enum.map(frames, &get_in(&1, ["choices", Access.at(0), "delta", "content"]))
    assert "yo" in deltas
    assert String.ends_with?(body, "data: [DONE]\n\n")
  end

  test "embeddings rejects non-openai protocols" do
    assert_raise GatewayError, ~r/not supported for provider anthropic/, fn ->
      Gateway.embeddings(Gateway.target("anthropic", "x", "k", ""), %{"input" => ["a"]})
    end
  end

  test "capability guard rejects unlisted capabilities" do
    assert_raise GatewayError, ~r/not supported for provider openai \(openai protocol\)/, fn ->
      Gateway.video_status(Gateway.target("openai", "x", "k", ""), "v1")
    end

    assert_raise GatewayError, ~r/not supported for provider deepseek \(openai protocol\)/, fn ->
      Gateway.images_generate(Gateway.target("deepseek", "x", "k", ""), %{"prompt" => "p"})
    end
  end

  test "usage estimation when upstream omits usage" do
    response = %{"choices" => [%{"message" => %{"content" => "12345678"}}]}
    {prompt, completion} = Gateway.usage_from_response(response, [%{"content" => "12345678"}])
    assert prompt == 2
    assert completion == 2
  end

  test "usage passthrough when upstream provides it" do
    response = %{"usage" => %{"prompt_tokens" => 10, "completion_tokens" => 4}}
    {prompt, completion} = Gateway.usage_from_response(response, [])
    assert {prompt, completion} == {10, 4}
  end

  test "endpoint resolution falls back to provider spec" do
    assert Gateway.endpoint(Gateway.target("deepseek", "m", "k", "")) == "https://api.deepseek.com/v1/chat/completions"
    assert Gateway.endpoint(Gateway.target("custom", "m", "k", "https://relay.example/v1")) == "https://relay.example/v1/chat/completions"
  end
end

defmodule RadasAI.RateLimitTest do
  use ExUnit.Case, async: false

  # Ported from the rate-limit behaviors asserted in the Python suite.
  alias RadasAI.RateLimit

  setup do
    RateLimit.reset()
    :ok
  end

  test "unlimited when limit is 0" do
    assert RateLimit.allow("org", "openai", 0) == {true, 0}
  end

  test "allows under limit and reports retry-after when over" do
    assert {true, 0} = RateLimit.allow("org-rl", "openai", 2)
    assert {true, 0} = RateLimit.allow("org-rl", "openai", 2)
    {allowed, retry_after} = RateLimit.allow("org-rl", "openai", 2)
    assert allowed == false
    assert retry_after >= 1
  end

  test "windows are per-org and per-provider" do
    assert {true, 0} = RateLimit.allow("org-a", "openai", 1)
    assert {true, 0} = RateLimit.allow("org-b", "openai", 1)
    assert {false, _} = RateLimit.allow("org-a", "openai", 1)
    assert {true, 0} = RateLimit.allow("org-a", "anthropic", 1)
  end
end

defmodule RadasAI.MultipartTest do
  use ExUnit.Case, async: true

  alias RadasAI.Multipart

  test "encodes fields and one file with a boundary" do
    {body, content_type} = Multipart.encode(%{"model" => "whisper-1"}, "file", "a.mp3", "BYTES", "audio/mpeg")

    assert String.starts_with?(content_type, "multipart/form-data; boundary=----radas9router")
    assert String.contains?(body, "Content-Disposition: form-data; name=\"model\"\r\n\r\nwhisper-1\r\n")
    assert String.contains?(body, "name=\"file\"; filename=\"a.mp3\"")
    assert String.contains?(body, "Content-Type: audio/mpeg\r\n\r\nBYTES")
    assert String.ends_with?(body, "--" <> String.trim_leading(content_type, "multipart/form-data; boundary=") <> "--\r\n")
  end
end

defmodule RadasAI.PxpipeTest do
  use ExUnit.Case, async: true

  # Ported behaviors from test_ai_router_video_pxpipe.py pxpipe legs.
  alias RadasAI.Pxpipe

  test "disabled returns skip summary" do
    result = Pxpipe.compress_with_pxpipe(%{"messages" => []}, enabled: true, pxpipe_url: "")
    assert result["body"] == nil
    assert result["summary"]["reason"] == "pxpipe_not_configured"
  end

  test "below min chars is skipped" do
    small = %{"messages" => [%{"content" => "tiny"}]}
    result = Pxpipe.compress_with_pxpipe(small, enabled: true, pxpipe_url: "http://localhost:1", min_chars: 25_000)
    assert result["body"] == nil
    assert result["summary"]["reason"] == "below_min_chars"
  end

  test "pxpipe connection failure fails open" do
    big = %{"messages" => [%{"content" => String.duplicate("x", 30_000)}]}
    result = Pxpipe.compress_with_pxpipe(big, enabled: true, pxpipe_url: "http://127.0.0.1:1", timeout_ms: 500)
    assert result["body"] == nil
    assert result["summary"]["applied"] == false
  end
end
