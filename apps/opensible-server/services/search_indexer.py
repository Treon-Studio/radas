"""Inverted index document indexing and full-text search engine (UC565)."""
from __future__ import annotations

import logging
import re
import time
from typing import Any, Dict, List, Optional

from storage.kv import kv_get, kv_list, kv_set

logger = logging.getLogger(__name__)

INDEX_DOCS_SCOPE = "search_index_docs"


def _tokenize(text: str) -> List[str]:
    """Tokenize string into lowercase alphanumeric tokens."""
    if not text:
        return []
    words = re.findall(r"[a-zA-Z0-9_\-]+", text.lower())
    return [w for w in words if len(w) > 1]


def index_document(
    doc_id: str,
    doc_type: str,
    text_content: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    """Index a document for fast multi-field full-text search (UC565)."""
    clean_id = doc_id.strip()
    tokens = list(set(_tokenize(text_content)))

    entry = {
        "doc_id": clean_id,
        "doc_type": doc_type.strip(),
        "text_content": text_content,
        "tokens": tokens,
        "metadata": metadata or {},
        "indexed_at": time.time(),
    }
    kv_set(INDEX_DOCS_SCOPE, clean_id, entry)
    logger.info(f"Indexed document {clean_id} ({doc_type}) with {len(tokens)} tokens")


def search_indexed_documents(
    query: str,
    doc_type: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Search indexed documents by keywords with relevance matching (UC565)."""
    query_tokens = _tokenize(query)
    if not query_tokens:
        return []

    all_rows = kv_list(INDEX_DOCS_SCOPE)
    results = []

    for item in all_rows:
        doc = item.get("value")
        if not doc or not isinstance(doc, dict):
            continue

        if doc_type and doc.get("doc_type") != doc_type:
            continue

        doc_tokens = set(doc.get("tokens", []))
        raw_text = doc.get("text_content", "").lower()

        # Score matching tokens and substring hits
        score = sum(1 for qt in query_tokens if qt in doc_tokens or qt in raw_text)
        if score > 0:
            results.append({
                "doc_id": doc.get("doc_id"),
                "doc_type": doc.get("doc_type"),
                "score": score,
                "metadata": doc.get("metadata", {}),
            })

    results.sort(key=lambda x: x["score"], reverse=True)
    return results

