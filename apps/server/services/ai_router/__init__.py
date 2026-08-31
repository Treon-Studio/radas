"""RADAS AI Router domain module.

This package contains provider adapters and routing logic for the 9Router-compatible
OpenAI gateway. HTTP routes remain in ``api.ai_router_routes`` so the server's
blueprint registry stays backwards compatible.
"""

from .gateway import GatewayError, OpenAIGateway, ProviderTarget, usage_from_response
from .providers import PROVIDERS, ProviderSpec, provider_for_model, spec_for, TTS_VOICES
from .compression import compress_messages
from .rate_limit import allow as allow_request
from .accounts import gather_credentials, list_accounts, rotate
from .endpoint_keys import create_key, list_keys, lookup, revoke, touch
from .pricing import estimate_cost
from .telemetry import cost_summary, list_request_logs, record_request_log
from .rtk import compress_text
from .pxpipe import compress_with_pxpipe
from .response_store import build_context_messages, get_response, store_response
from .proxy_pools import ProxyPoolError, delete_pool, gateway_with_proxy, list_pools, resolve_proxy_url, upsert_pool
from .ponytail import apply_ponytail, ponytail_prompt
from .oauth import ALL_OAUTH_PROVIDER_NAMES, OAUTH_DEVICE_PROVIDERS, OAUTH_IMPORT_PROVIDERS, begin_device_flow, complete_device_flow, import_token, OAuthError, OAUTH_PROVIDERS, begin_flow, complete_flow, client_id_for, get_valid_access_token, list_accounts as list_oauth_accounts, refresh_account, revoke as revoke_oauth_account

__all__ = ["GatewayError", "OpenAIGateway", "ProviderTarget", "usage_from_response", "PROVIDERS", "ProviderSpec", "TTS_VOICES", "provider_for_model", "spec_for", "compress_messages", "allow_request", "gather_credentials", "list_accounts", "rotate", "create_key", "list_keys", "lookup", "revoke", "touch", "estimate_cost", "cost_summary", "list_request_logs", "record_request_log", "apply_ponytail", "ponytail_prompt", "compress_text", "compress_with_pxpipe", "store_response", "get_response", "build_context_messages", "ProxyPoolError", "list_pools", "upsert_pool", "delete_pool", "resolve_proxy_url", "gateway_with_proxy", "OAuthError", "OAUTH_PROVIDERS", "begin_flow", "complete_flow", "client_id_for", "get_valid_access_token", "list_oauth_accounts", "refresh_account", "revoke_oauth_account", "ALL_OAUTH_PROVIDER_NAMES", "OAUTH_DEVICE_PROVIDERS", "OAUTH_IMPORT_PROVIDERS", "begin_device_flow", "complete_device_flow", "import_token"]
