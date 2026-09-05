defmodule RadasAI.RTKTest do
  use ExUnit.Case, async: true

  # Ported from `apps/server/tests/test_ai_router_rtk.py`.
  alias RadasAI.RTK

  defp diff(hunk_lines) do
    "diff --git a/main.go b/main.go\n@@ -1,2 +1,2 @@\n" <>
      Enum.map_join(0..(hunk_lines - 1), "\n", &"+ line #{&1}")
  end

  test "git_diff caps each hunk" do
    compressed = RTK.filter_git_diff(diff(150))
    assert String.contains?(compressed, "... +50 hunk lines truncated (RTK)")
    assert String.contains?(compressed, "+ line 0")
    refute String.contains?(compressed, "+ line 149")
  end

  test "git_log caps output" do
    log = Enum.map_join(0..299, "\n", &"commit #{String.duplicate("a", 40)}#{&1}")
    compressed = RTK.filter_git_log(log)
    count = compressed |> String.split("commit") |> length()
    assert count - 1 == 200
    assert String.contains?(compressed, "+100 log lines truncated (RTK)")
  end

  test "git_status porcelain summary" do
    status =
      "## main...origin/main\n" <>
        Enum.map_join(0..14, "\n", &"M  src/file#{&1}.go") <> "\n?? new.py\n"

    compressed = RTK.filter_git_status(status)
    assert String.starts_with?(compressed, "* main")
    refute String.contains?(compressed, "~ Modified: 0 files")
    assert String.contains?(compressed, "+ Staged: 15 files")
    # STATUS_MAX_FILES = 10
    assert String.contains?(compressed, "... +5 more (RTK)")
    assert String.contains?(compressed, "? Untracked: 1 files")
  end

  test "git_status long form clean" do
    assert RTK.filter_git_status("On branch main\nnothing to commit, working tree clean") ==
             "Clean working tree"
  end

  test "build_output collapses runs" do
    text = Enum.join(["Compiling pkg-a", "Compiling pkg-b", "Downloading pkg-c", "ERROR: boom"], "\n")
    compressed = RTK.filter_build_output(text)
    assert String.contains?(compressed, "Compiling pkg-a (2 packages)")
    assert String.contains?(compressed, "Downloading pkg-c")
    assert String.contains?(compressed, "ERROR: boom")
  end

  test "grep caps per file" do
    text = Enum.map_join(0..24, "\n", &"src/app.py:#{&1}:print('x')")
    compressed = RTK.filter_grep(text)
    count = compressed |> String.split(":print('x')") |> length()
    assert count - 1 == 10
    assert String.contains?(compressed, "+15 more matches (RTK)")
  end

  test "find groups directories" do
    text =
      Enum.map_join(for(i <- 0..29, j <- 0..2, do: {i, j}), "\n", fn {i, j} ->
        "src/dir#{i}/file#{j}.py"
      end)

    compressed = RTK.filter_find(text)
    assert String.contains?(compressed, "...")
    assert String.contains?(compressed, "more directories (RTK)")
  end

  test "tree caps lines" do
    text = Enum.map_join(1..300, "\n", fn _ -> "├── item" end)
    compressed = RTK.filter_tree(text)
    assert String.contains?(compressed, "... +100 tree lines truncated (RTK)")
  end

  test "ls summarizes extensions" do
    rows = Enum.map_join(0..59, "\n", &"-rw-r--r-- 1 u u 10 #{&1} file#{&1}.py")
    compressed = RTK.filter_ls("total 120\n" <> rows)
    assert String.contains?(compressed, "[60 entries:")
    assert String.contains?(compressed, "... +50 more entries (RTK)")
  end

  test "read_numbered collapses blank runs" do
    text =
      Enum.map_join(1..37, "\n", &"#{&1}|content line") <>
        "\n38|content line\n38|content line\n\n\n\n40|tail line\n"

    compressed = RTK.filter_read_numbered(text)
    count = compressed |> String.split("38|content line") |> length()
    assert count - 1 == 1
    # Blank runs collapse to a single blank line, never two.
    refute String.contains?(compressed, "\n\n\n")
  end

  test "dedup_log collapses consecutive duplicates" do
    text = Enum.map_join(1..50, "\n", fn _ -> "ERROR: request failed" end)
    compressed = RTK.filter_dedup_log(text)
    assert String.contains?(compressed, "ERROR: request failed")
    assert String.contains?(compressed, "(49 duplicate lines)")
  end

  test "smart_truncate keeps head and tail" do
    text = Enum.map_join(0..399, "\n", &"row #{&1}")
    compressed = RTK.filter_smart_truncate(text)
    assert String.starts_with?(compressed, "row 0")
    assert String.ends_with?(compressed, "row 399")
    assert String.contains?(compressed, "... +220 lines truncated (RTK)")
  end

  test "dedup_log hard cap" do
    text = Enum.map_join(0..2999, "\n", &"unique line #{&1}")
    compressed = RTK.filter_dedup_log(text)
    assert String.contains?(compressed, "truncated at 2000 lines")
  end

  test "autodetect order" do
    assert RTK.auto_detect_filter(diff(200)) == "git_diff"
    assert RTK.auto_detect_filter(Enum.map_join(0..49, "\n", &"commit #{String.duplicate("a", 40)}#{&1}")) == "git_log"
    assert RTK.auto_detect_filter("On branch main\nM  a.py") == "git_status"
    assert RTK.auto_detect_filter("src/a.py:12:def f():\nsrc/b.py:30:def g():") == "grep"
    assert RTK.auto_detect_filter("├── a\n└── b") == "tree"

    assert RTK.auto_detect_filter(
             "total 5\n-rw-r--r-- 1 u u 1 1 a.py\n-rw-r--r-- 1 u u 1 1 b.py\n-rw-r--r-- 1 u u 1 1 c.py"
           ) == "ls"

    assert RTK.auto_detect_filter(Enum.map_join(0..29, "\n", &"line #{&1}")) == "dedup_log"
  end

  test "compress_text skips small payloads" do
    assert RTK.compress_text("short text") == {"short text", ""}
  end

  test "compress_text detects and compresses" do
    text = Enum.map_join(0..2499, "\n", &"unique #{&1}")
    {compressed, name} = RTK.compress_text(text)
    assert name == "dedup-log"
    assert String.contains?(compressed, "truncated at 2000 lines")
    assert String.length(compressed) < String.length(text)
  end
end

defmodule RadasAI.CompressionTest do
  use ExUnit.Case, async: true

  # Ported from `test_compress_messages_with_caveman_and_route_flags`.
  alias RadasAI.Compression

  test "compress_messages with caveman and route flags" do
    big_log = Enum.map_join(1..200, "\n", fn _ -> "request failed: timeout" end)
    messages = [%{"role" => "user", "content" => big_log}, %{"role" => "user", "content" => "tiny"}]

    {compressed, saved} = Compression.compress_messages(messages, enabled: true, mode: "full")
    assert saved > 0
    assert String.contains?(compressed |> hd() |> Map.fetch!("content"), "(199 duplicate lines)")
    # RTK filters only; the caveman suffix lands on the LAST message.
    refute String.contains?(compressed |> hd() |> Map.fetch!("content"), "[Be concise.")

    last = List.last(compressed) |> Map.fetch!("content")
    assert last == "tiny\n[Be concise. Prefer actionable steps and compact code.]"

    {unchanged, zero} = Compression.compress_messages(messages, enabled: false)
    assert unchanged |> hd() |> Map.fetch!("content") == big_log
    assert zero == 0
  end

  test "caveman suffix variants" do
    assert String.ends_with?(Compression.caveman("x", "lite"), "[Respond concisely; preserve essential details.]")
    assert String.ends_with?(Compression.caveman("x", "ultra"), "[ULTRA CONCISE: return only the answer and required code.]")
    assert Compression.caveman("", "full") == ""
  end
end

defmodule RadasAI.ProvidersTest do
  use ExUnit.Case, async: true

  alias RadasAI.Providers

  test "registry has 16 providers" do
    assert Providers.all() |> map_size() == 16
  end

  test "protocol and capabilities per provider" do
    openai = Providers.spec_for("openai")
    assert openai.protocol == "openai"
    assert Providers.supports?(openai, "openai", "images")
    refute Providers.supports?(openai, "openai", "video")

    anthropic = Providers.spec_for("anthropic")
    assert anthropic.protocol == "anthropic"
    refute Providers.supports?(anthropic, "openai", "embeddings")
  end

  test "unknown provider gets generic spec" do
    spec = Providers.spec_for("minimax")
    assert spec.base_url == ""
    assert spec.env_key == "MINIMAX_API_KEY"
  end

  test "provider_for_model resolves prefixes first" do
    assert Providers.provider_for_model("cc/claude-3-5-sonnet") == "anthropic"
    assert Providers.provider_for_model("cx/gpt-4o") == "openai"
    assert Providers.provider_for_model("glm/glm-4") == "zhipu"
    assert Providers.provider_for_model("kimi/moonshot-v1") == "moonshot"
    assert Providers.provider_for_model("kr/gemini-2.5") == "google"
    assert Providers.provider_for_model("oc/llama3") == "ollama"
  end

  test "provider_for_model falls back to name aliases then openai" do
    assert Providers.provider_for_model("claude-3-5-sonnet") == "anthropic"
    assert Providers.provider_for_model("gemini-1.5-flash") == "google"
    assert Providers.provider_for_model("deepseek-chat") == "deepseek"
    assert Providers.provider_for_model("grok-2") == "xai"
    assert Providers.provider_for_model("gpt-4o") == "openai"
    assert Providers.provider_for_model("whatever-model") == "openai"
    assert Providers.provider_for_model(nil) == "openai"
  end

  test "tts voices catalogs" do
    voices = Providers.tts_voices()
    assert map_size(voices) == 3
    assert "alloy" in voices["openai"]
    assert "Zephyr" in voices["google"]
    assert "Arista-PlayAI" in voices["groq"]
  end
end

defmodule RadasAI.PricingTest do
  use ExUnit.Case, async: true

  alias RadasAI.Pricing

  test "known model cost estimate" do
    # claude-3-5-sonnet: input 3.00, output 15.00 per 1M
    cost = Pricing.estimate_cost("claude-3-5-sonnet", 1_000_000, 1_000_000)
    assert cost == 18.0
  end

  test "gpt-4o-mini estimate" do
    cost = Pricing.estimate_cost("gpt-4o-mini-2024", 2_000_000, 500_000)
    assert cost == 0.6
  end

  test "unknown model costs zero (never fabricate spend)" do
    assert Pricing.estimate_cost("totally-unknown-model", 1_000_000, 1_000_000) == 0.0
    assert Pricing.estimate_cost(nil, 100, 100) == 0.0
  end

  test "audio models are zero-priced" do
    assert Pricing.estimate_cost("whisper-1", 1000, 0) == 0.0
  end
end

defmodule RadasAI.PonytailTest do
  use ExUnit.Case, async: true

  alias RadasAI.Ponytail

  test "prompt assembles per level" do
    for level <- ["lite", "full", "ultra"] do
      prompt = Ponytail.ponytail_prompt(level)
      assert String.contains?(prompt, "lazy senior developer")
      assert String.contains?(prompt, "ACTIVE EVERY RESPONSE")
      assert String.contains?(prompt, String.capitalize(level) <> ":")
    end
  end

  test "unknown level raises" do
    assert_raise ArgumentError, fn -> Ponytail.ponytail_prompt("mega") end
  end

  test "apply_ponytail injects into existing system message" do
    messages = [
      %{"role" => "system", "content" => "You are helpful."},
      %{"role" => "user", "content" => "write a function"}
    ]

    out = Ponytail.apply_ponytail(messages, "full")
    assert length(out) == 2
    system = hd(out)
    assert String.starts_with?(system["content"], "You are helpful.")
    assert String.contains?(system["content"], "lazy senior developer")
  end

  test "apply_ponytail creates system message when absent" do
    messages = [%{"role" => "user", "content" => "hi"}]
    out = Ponytail.apply_ponytail(messages, "lite")
    assert length(out) == 2
    assert hd(out)["role"] == "system"
    assert String.contains?(hd(out)["content"], "lazy senior developer")
  end

  test "apply_ponytail handles content-parts system message" do
    messages = [
      %{"role" => "system", "content" => [%{"type" => "text", "text" => "base"}]},
      %{"role" => "user", "content" => "hi"}
    ]

    out = Ponytail.apply_ponytail(messages, "ultra")
    [part] = hd(out)["content"]
    assert String.contains?(part["text"], "base")
    assert String.contains?(part["text"], "lazy senior developer")
  end
end

defmodule RadasAI.GatewayErrorTest do
  use ExUnit.Case, async: true

  alias RadasAI.GatewayError

  test "retryable classification defaults false" do
    err = GatewayError.exception(message: "boom")
    assert err.retryable == false
    assert err.status == nil
  end

  test "constructs with status and retryable" do
    err = GatewayError.exception(message: "rate limited", status: 429, retryable: true)
    assert err.status == 429
    assert err.retryable == true
    assert err.message == "rate limited"
  end
end
