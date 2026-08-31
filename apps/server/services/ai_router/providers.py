"""Provider metadata and protocol capabilities for the RADAS 9Router module."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping


@dataclass(frozen=True)
class ProviderSpec:
    name: str
    display_name: str
    base_url: str
    protocol: str = "openai"
    env_key: str = ""
    capabilities: frozenset[str] = frozenset({"chat", "embeddings"})


PROVIDERS: Mapping[str, ProviderSpec] = {
    "openai": ProviderSpec("openai", "OpenAI", "https://api.openai.com/v1", env_key="OPENAI_API_KEY", capabilities=frozenset({"chat", "embeddings", "audio", "images", "responses"})),
    "deepseek": ProviderSpec("deepseek", "DeepSeek", "https://api.deepseek.com/v1", env_key="DEEPSEEK_API_KEY"),
    "anthropic": ProviderSpec("anthropic", "Anthropic", "https://api.anthropic.com", protocol="anthropic", env_key="ANTHROPIC_API_KEY", capabilities=frozenset({"chat", "messages"})),
    "google": ProviderSpec("google", "Google Gemini", "https://generativelanguage.googleapis.com", protocol="gemini", env_key="GOOGLE_API_KEY", capabilities=frozenset({"chat", "embeddings", "audio"})),
    "xai": ProviderSpec("xai", "xAI", "https://api.x.ai/v1", env_key="XAI_API_KEY", capabilities=frozenset({"chat", "video"})),
    "groq": ProviderSpec("groq", "Groq", "https://api.groq.com/openai/v1", env_key="GROQ_API_KEY", capabilities=frozenset({"chat", "audio"})),
    "openrouter": ProviderSpec("openrouter", "OpenRouter", "https://openrouter.ai/api/v1", env_key="OPENROUTER_API_KEY"),
    "mistral": ProviderSpec("mistral", "Mistral", "https://api.mistral.ai/v1", env_key="MISTRAL_API_KEY"),
    "moonshot": ProviderSpec("moonshot", "Moonshot", "https://api.moonshot.ai/v1", env_key="MOONSHOT_API_KEY"),
    "qwen": ProviderSpec("qwen", "Qwen", "https://dashscope.aliyuncs.com/compatible-mode/v1", env_key="DASHSCOPE_API_KEY"),
    "zhipu": ProviderSpec("zhipu", "Zhipu GLM", "https://open.bigmodel.cn/api/paas/v4", env_key="ZHIPUAI_API_KEY"),
    "together": ProviderSpec("together", "Together AI", "https://api.together.xyz/v1", env_key="TOGETHER_API_KEY"),
    "fireworks": ProviderSpec("fireworks", "Fireworks AI", "https://api.fireworks.ai/inference/v1", env_key="FIREWORKS_API_KEY"),
    "perplexity": ProviderSpec("perplexity", "Perplexity", "https://api.perplexity.ai", env_key="PERPLEXITY_API_KEY"),
    "cohere": ProviderSpec("cohere", "Cohere", "https://api.cohere.com/compatibility/v1", env_key="COHERE_API_KEY"),
    "ollama": ProviderSpec("ollama", "Ollama", "http://127.0.0.1:11434/v1", env_key="OLLAMA_API_KEY"),
}


# Text-to-speech voice catalogs per audio-capable provider (public catalogs).
TTS_VOICES: Mapping[str, list[str]] = {
    "google": ["Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede"],
    "openai": ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"],
    "groq": [
        "Arista-PlayAI", "Atlas-PlayAI", "Basil-PlayAI", "Briggs-PlayAI", "Calum-PlayAI",
        "Celeste-PlayAI", "Cheyenne-PlayAI", "Chip-PlayAI", "Cillian-PlayAI", "Deedee-PlayAI",
        "Floyd-PlayAI", "Freddie-PlayAI", "Gail-PlayAI", "Indigo-PlayAI", "Mamaw-PlayAI",
        "Mason-PlayAI", "Mikail-PlayAI", "Mitch-PlayAI", "Quinn-PlayAI", "Ron-PlayAI",
        "Scarlett-PlayAI", "Donna-PlayAI",
    ],
}


def provider_for_model(model: str) -> str:
    """Resolve explicit 9Router prefixes before conservative name aliases."""
    value = (model or "").strip().lower()
    if "/" in value:
        prefix = value.split("/", 1)[0]
        aliases = {"cc": "anthropic", "cx": "openai", "gh": "openai", "cu": "cursor", "glm": "zhipu", "minimax": "minimax", "kimi": "moonshot", "kr": "google", "oc": "ollama", "vertex": "google"}
        if prefix in aliases:
            return aliases[prefix]
    for marker, name in (("claude", "anthropic"), ("gemini", "google"), ("deepseek", "deepseek"), ("grok", "xai"), ("qwen", "qwen"), ("kimi", "moonshot"), ("glm", "zhipu"), ("mistral", "mistral"), ("command", "cohere")):
        if marker in value:
            return name
    return "openai"


def spec_for(provider: str) -> ProviderSpec:
    return PROVIDERS.get(provider, ProviderSpec(provider, provider, "", env_key=f"{provider.upper()}_API_KEY"))
