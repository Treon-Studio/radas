"""Sanitize the RADAS OpenAPI snapshot for type generation.

The /api/v2 snapshot contains 29 unresolvable $ref entries (tracked in
contracts/radas-api-v2-violations-baseline.json). This script replaces each
broken ref with a generic object so type generation succeeds; fixing the
refs belongs to the server spec itself.
"""
import json, os, sys

SPEC = sys.argv[1] if len(sys.argv) > 1 else "../../contracts/radas-api-v2.openapi.json"
OUT = "src/generated/openapi-sanitized.json"

spec = json.load(open(SPEC))
root = spec

def resolve_ptr(ptr):
    if not isinstance(ptr, str) or not ptr.startswith("#/"):
        return None
    node = root
    for part in ptr[2:].split("/"):
        part = part.replace("~1", "/").replace("~0", "~")
        if isinstance(node, dict) and part in node:
            node = node[part]
        elif isinstance(node, list):
            try:
                node = node[int(part)]
            except (ValueError, IndexError):
                return None
        else:
            return None
    return node

def collect_broken(node, out):
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "$ref":
                if not (isinstance(v, str) and resolve_ptr(v) is not None):
                    out.append(v)
            else:
                collect_broken(v, out)
    elif isinstance(node, list):
        for item in node:
            collect_broken(item, out)

def fix(node):
    if isinstance(node, dict):
        if "$ref" in node and not (isinstance(node["$ref"], str) and resolve_ptr(node["$ref"]) is not None):
            node.pop("$ref")
            node["type"] = "object"
        for v in list(node.values()):
            fix(v)
    elif isinstance(node, list):
        for item in node:
            fix(item)

broken = []
collect_broken(spec, broken)
print(f"broken refs sanitized: {len(broken)}")
fix(spec)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(spec, open(OUT, "w"), indent=1)
print(f"written: {OUT}")
