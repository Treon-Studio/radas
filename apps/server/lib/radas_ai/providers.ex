defmodule RadasAI.Providers do
  @moduledoc """
  Port of `services/ai_router/providers.py`.

  Provider metadata and protocol capabilities. `provider_for_model/1` resolves
  explicit 9Router prefixes (`cc/`, `cx/`, ...) before conservative name
  aliases (claude → anthropic, gemini → google, ...).
  """

  @enforce_keys [:name, :display_name, :base_url]
  defstruct [:name, :display_name, :base_url, protocol: "openai", env_key: "", capabilities: MapSet.new(["chat", "embeddings"])]

  @type t :: %__MODULE__{
          name: String.t(),
          display_name: String.t(),
          base_url: String.t(),
          protocol: String.t(),
          env_key: String.t(),
          capabilities: MapSet.t(String.t())
        }

  # {name, display_name, base_url, protocol, env_key, capabilities}
  @provider_specs [
    {"openai", "OpenAI", "https://api.openai.com/v1", "openai", "OPENAI_API_KEY",
     ["chat", "embeddings", "audio", "images", "responses"]},
    {"deepseek", "DeepSeek", "https://api.deepseek.com/v1", "openai", "DEEPSEEK_API_KEY",
     ["chat", "embeddings"]},
    {"anthropic", "Anthropic", "https://api.anthropic.com", "anthropic", "ANTHROPIC_API_KEY",
     ["chat", "messages"]},
    {"google", "Google Gemini", "https://generativelanguage.googleapis.com", "gemini", "GOOGLE_API_KEY",
     ["chat", "embeddings", "audio"]},
    {"xai", "xAI", "https://api.x.ai/v1", "openai", "XAI_API_KEY", ["chat", "video"]},
    {"groq", "Groq", "https://api.groq.com/openai/v1", "openai", "GROQ_API_KEY", ["chat", "audio"]},
    {"openrouter", "OpenRouter", "https://openrouter.ai/api/v1", "openai", "OPENROUTER_API_KEY",
     ["chat", "embeddings"]},
    {"mistral", "Mistral", "https://api.mistral.ai/v1", "openai", "MISTRAL_API_KEY", ["chat", "embeddings"]},
    {"moonshot", "Moonshot", "https://api.moonshot.ai/v1", "openai", "MOONSHOT_API_KEY", ["chat", "embeddings"]},
    {"qwen", "Qwen", "https://dashscope.aliyuncs.com/compatible-mode/v1", "openai", "DASHSCOPE_API_KEY",
     ["chat", "embeddings"]},
    {"zhipu", "Zhipu GLM", "https://open.bigmodel.cn/api/paas/v4", "openai", "ZHIPUAI_API_KEY",
     ["chat", "embeddings"]},
    {"together", "Together AI", "https://api.together.xyz/v1", "openai", "TOGETHER_API_KEY",
     ["chat", "embeddings"]},
    {"fireworks", "Fireworks AI", "https://api.fireworks.ai/inference/v1", "openai", "FIREWORKS_API_KEY",
     ["chat", "embeddings"]},
    {"perplexity", "Perplexity", "https://api.perplexity.ai", "openai", "PERPLEXITY_API_KEY",
     ["chat", "embeddings"]},
    {"cohere", "Cohere", "https://api.cohere.com/compatibility/v1", "openai", "COHERE_API_KEY",
     ["chat", "embeddings"]},
    {"ollama", "Ollama", "http://127.0.0.1:11434/v1", "openai", "OLLAMA_API_KEY", ["chat", "embeddings"]}
  ]

  @prefix_aliases %{
    "cc" => "anthropic",
    "cx" => "openai",
    "gh" => "openai",
    "cu" => "cursor",
    "glm" => "zhipu",
    "minimax" => "minimax",
    "kimi" => "moonshot",
    "kr" => "google",
    "oc" => "ollama",
    "vertex" => "google"
  }

  @model_markers [
    {"claude", "anthropic"},
    {"gemini", "google"},
    {"deepseek", "deepseek"},
    {"grok", "xai"},
    {"qwen", "qwen"},
    {"kimi", "moonshot"},
    {"glm", "zhipu"},
    {"mistral", "mistral"},
    {"command", "cohere"}
  ]

  # Text-to-speech voice catalogs per audio-capable provider (public catalogs).
  @tts_voices %{
    "google" => ["Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede"],
    "openai" => ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"],
    "groq" => [
      "Arista-PlayAI", "Atlas-PlayAI", "Basil-PlayAI", "Briggs-PlayAI", "Calum-PlayAI",
      "Celeste-PlayAI", "Cheyenne-PlayAI", "Chip-PlayAI", "Cillian-PlayAI", "Deedee-PlayAI",
      "Floyd-PlayAI", "Freddie-PlayAI", "Gail-PlayAI", "Indigo-PlayAI", "Mamaw-PlayAI",
      "Mason-PlayAI", "Mikail-PlayAI", "Mitch-PlayAI", "Quinn-PlayAI", "Ron-PlayAI",
      "Scarlett-PlayAI", "Donna-PlayAI"
    ]
  }

  defp struct_for({name, display, base_url, protocol, env_key, caps}) do
    %__MODULE__{
      name: name,
      display_name: display,
      base_url: base_url,
      protocol: protocol,
      env_key: env_key,
      capabilities: MapSet.new(caps)
    }
  end

  @spec all() :: %{String.t() => t()}
  def all, do: Map.new(@provider_specs, fn entry -> {elem(entry, 0), struct_for(entry)} end)

  @spec tts_voices() :: %{String.t() => [String.t()]}
  def tts_voices, do: @tts_voices

  @doc "Resolve explicit 9Router prefixes before conservative name aliases."
  @spec provider_for_model(String.t() | nil) :: String.t()
  def provider_for_model(model) when is_binary(model) do
    value = String.downcase(String.trim(model))

    if String.contains?(value, "/") do
      prefix = value |> String.split("/", parts: 2) |> hd()

      case Map.get(@prefix_aliases, prefix) do
        nil -> marker_aliases(value)
        name -> name
      end
    else
      marker_aliases(value)
    end
  end

  def provider_for_model(nil), do: "openai"

  defp marker_aliases(value) do
    Enum.find_value(@model_markers, "openai", fn {marker, name} ->
      if String.contains?(value, marker), do: name
    end)
  end

  @doc "Spec for a known provider; unknown names get a generic OpenAI-compatible spec."
  @spec spec_for(String.t()) :: t()
  def spec_for(provider) do
    case Enum.find(@provider_specs, fn {name, _, _, _, _, _} -> name == provider end) do
      nil ->
        %__MODULE__{
          name: provider,
          display_name: provider,
          base_url: "",
          protocol: "openai",
          env_key: String.upcase(provider) <> "_API_KEY",
          capabilities: MapSet.new(["chat", "embeddings"])
        }

      entry ->
        struct_for(entry)
    end
  end

  @doc "Whether a provider spec supports a capability under its protocol."
  @spec supports?(t(), String.t(), String.t()) :: boolean()
  def supports?(%__MODULE__{} = spec, protocol, capability) do
    spec.protocol == protocol and MapSet.member?(spec.capabilities, capability)
  end
end
