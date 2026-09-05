defmodule RadasAI.TranslatorsTest do
  use ExUnit.Case, async: true

  # Ported from `apps/server/tests/test_ai_router_translators.py`.
  alias RadasAI.GatewayError
  alias RadasAI.Translators

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

  describe "anthropic request translation" do
    test "maps system, merge, stop, temperature" do
      req = Translators.openai_to_anthropic(@openai_request)
      assert req["model"] == "claude-3-5-sonnet"
      assert req["max_tokens"] == 512
      assert req["system"] == "Be terse."
      assert req["stop_sequences"] == ["STOP", "END"]
      assert req["temperature"] == 0.2
      # Consecutive user messages merge into one Anthropic turn.
      assert Enum.map(req["messages"], & &1["role"]) == ["user", "assistant"]
      assert length(req["messages"] |> hd() |> Map.fetch!("content")) == 2
    end

    test "defaults max_tokens to 4096" do
      req = Translators.openai_to_anthropic(%{"model" => "m", "messages" => [%{"role" => "user", "content" => "x"}]})
      assert req["max_tokens"] == 4096
    end

    test "single string stop becomes one-element list" do
      req = Translators.openai_to_anthropic(%{"messages" => [%{"role" => "user", "content" => "x"}], "stop" => "END"})
      assert req["stop_sequences"] == ["END"]
    end

    test "endpoint variants" do
      assert Translators.anthropic_endpoint("https://api.anthropic.com/v1") == "https://api.anthropic.com/v1/messages"
      assert Translators.anthropic_endpoint("https://api.anthropic.com") == "https://api.anthropic.com/v1/messages"
      assert Translators.anthropic_endpoint("https://proxy.example/v1/messages") == "https://proxy.example/v1/messages"
    end

    test "headers carry version" do
      headers = Translators.anthropic_headers("sk-ant")
      assert headers["x-api-key"] == "sk-ant"
      assert headers["anthropic-version"] == "2023-06-01"
    end
  end

  describe "anthropic response translation" do
    test "maps content, finish reason, usage" do
      upstream = %{
        "id" => "msg_123",
        "content" => [%{"type" => "text", "text" => "Hello!"}, %{"type" => "text", "text" => " Bye"}],
        "stop_reason" => "max_tokens",
        "usage" => %{"input_tokens" => 11, "output_tokens" => 4}
      }

      result = Translators.anthropic_to_openai(upstream, "claude-3-5-sonnet")
      assert result["object"] == "chat.completion"
      assert result["model"] == "claude-3-5-sonnet"
      assert result["choices"] |> hd() |> get_in(["message", "content"]) == "Hello! Bye"
      assert result["choices"] |> hd() |> Map.fetch!("finish_reason") == "length"
      assert result["usage"] == %{"prompt_tokens" => 11, "completion_tokens" => 4, "total_tokens" => 15}
    end
  end

  describe "anthropic SSE translation" do
    test "re-frames native events as OpenAI chunks with a single DONE" do
      events =
        ~s(event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","usage":{"input_tokens":7}}}\n\n) <>
          ~s(event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"He"}}\n\n) <>
          ~s(event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"y"}}\n\n) <>
          ~s(event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}\n\n) <>
          ~s(event: message_stop\ndata: {"type":"message_stop"}\n\n)

      lines = String.split(events, "\n", trim: false)
      out = Translators.anthropic_sse_to_openai(lines, "claude-3-5-sonnet") |> Enum.join("")

      frames =
        out
        |> String.split("\n", trim: false)
        |> Enum.filter(&String.starts_with?(&1, "data: "))
        |> Enum.map(&String.trim(String.slice(&1, 6..-1//1)))

      parsed = Enum.map(Enum.slice(frames, 0..-2//1), &Jason.decode!/1)
      assert List.last(frames) == "[DONE]"
      assert parsed |> hd() |> get_in(["choices", Access.at(0), "delta"]) == %{"role" => "assistant", "content" => ""}
      assert parsed |> Enum.at(1) |> get_in(["choices", Access.at(0), "delta", "content"]) == "He"
      assert parsed |> Enum.at(2) |> get_in(["choices", Access.at(0), "delta", "content"]) == "y"

      final = List.last(parsed)
      assert final["choices"] |> hd() |> Map.fetch!("finish_reason") == "stop"
      assert final["usage"] == %{"prompt_tokens" => 7, "completion_tokens" => 2}
    end

    test "stream without message_stop still ends with exactly one DONE" do
      events =
        ~s(event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"yo"}}\n\n)

      out = events |> String.split("\n") |> Translators.anthropic_sse_to_openai("m") |> Enum.join("")
      assert String.ends_with?(out, "data: [DONE]\n\n")

      done_count = out |> String.split("data: [DONE]") |> length()
      assert done_count - 1 == 1
    end
  end

  describe "gemini request translation" do
    test "maps systemInstruction, roles, generationConfig" do
      req = Translators.openai_to_gemini(@openai_request)
      assert get_in(req, ["systemInstruction", "parts", Access.at(0), "text"]) == "Be terse."
      assert Enum.map(req["contents"], & &1["role"]) == ["user", "model"]
      assert length(req["contents"] |> hd() |> Map.fetch!("parts")) == 2

      assert req["generationConfig"] == %{
               "maxOutputTokens" => 512,
               "temperature" => 0.2,
               "stopSequences" => ["STOP", "END"]
             }
    end
  end

  describe "gemini response translation" do
    test "maps content, finish reason, usage" do
      upstream = %{
        "candidates" => [
          %{"content" => %{"parts" => [%{"text" => "Hi"}, %{"text" => " there"}]}, "finishReason" => "STOP"}
        ],
        "usageMetadata" => %{"promptTokenCount" => 9, "candidatesTokenCount" => 2}
      }

      result = Translators.gemini_to_openai(upstream, "gemini-1.5-flash")
      assert result["choices"] |> hd() |> get_in(["message", "content"]) == "Hi there"
      assert result["choices"] |> hd() |> Map.fetch!("finish_reason") == "stop"
      assert result["usage"] == %{"prompt_tokens" => 9, "completion_tokens" => 2, "total_tokens" => 11}
    end
  end

  describe "gemini SSE translation" do
    test "re-frames alt=sse events with a single DONE" do
      events =
        ~s(data: {"candidates":[{"content":{"parts":[{"text":"He"}]}}]}\n\n) <>
          ~s(data: {"candidates":[{"content":{"parts":[{"text":"y"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":4,"candidatesTokenCount":2}}\n\n)

      out = String.split(events, "\n", trim: false) |> Translators.gemini_sse_to_openai("gemini-1.5-flash") |> Enum.join("")

      frames =
        out
        |> String.split("\n", trim: false)
        |> Enum.filter(&String.starts_with?(&1, "data: "))
        |> Enum.map(&String.trim(String.slice(&1, 6..-1//1)))

      parsed = Enum.map(Enum.slice(frames, 0..-2//1), &Jason.decode!/1)
      assert List.last(frames) == "[DONE]"
      assert parsed |> hd() |> get_in(["choices", Access.at(0), "delta", "content"]) == "He"

      final = List.last(parsed)
      assert final["choices"] |> hd() |> Map.fetch!("finish_reason") == "stop"
      assert final["usage"] == %{"prompt_tokens" => 4, "completion_tokens" => 2}
    end

    test "stream endpoint variant" do
      assert String.ends_with?(Translators.gemini_endpoint("", "m", true), ":streamGenerateContent?alt=sse")
      assert Translators.gemini_endpoint("", "m") |> String.ends_with?(":generateContent")
    end
  end

  describe "unsupported content" do
    test "non-text part raises non-retryable 400" do
      assert_raise GatewayError, fn ->
        Translators.openai_to_anthropic(%{
          "model" => "m",
          "messages" => [
            %{"role" => "user", "content" => [%{"type" => "image_url", "image_url" => %{"url" => "x"}}]}
          ]
        })
      end
    end
  end
end
