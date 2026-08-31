# RADAS 9Router module

This package is the RADAS-native 9Router capability boundary. It provides a
small, dependency-free upstream adapter layer used by the Flask blueprint in
`api.ai_router_routes`:

- provider-specific base URL resolution for OpenAI-compatible APIs;
- wire-format translation between OpenAI chat and Anthropic Messages /
  Gemini generateContent, including SSE re-framing (`translators.py`);
- bounded upstream timeouts and error classification;
- ordered fallback orchestration in the API layer;
- non-streaming JSON and SSE pass-through for OpenAI-protocol providers;
- usage estimation when an upstream omits usage metadata.

The Console integration remains at `/system/ai` and uses RADAS authentication,
organization membership, PostgreSQL, and existing UI primitives. Provider
credentials are encrypted with RADAS `SecretEncryption` before persistence and
are never returned by the API.

This module is an independent RADAS implementation of selected 9Router
capabilities. It does not copy the upstream 9Router source or claim to be an
official 9Router distribution. If upstream 9Router code is added later, retain
its MIT license and copyright notice from:
https://github.com/decolua/9router
