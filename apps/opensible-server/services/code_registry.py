"""Code registry — shadcn-style "bring your own code" (Fase 6 — UC 382+).

Radia stores reusable code as registry items (Terraform/OpenTofu blocks and
Ansible roles) under `REGISTRY_DIR` (default `server/registry/` — plain files
in the repo, so they can be git-versioned; the same layout maps to a DB
later by swapping this module's storage). When an item is "called" (install),
its source is COPIED into the target stack's workspace — like `npx shadcn
add`, not a dependency reference.

Copy rules:
- `tofu-block/<name>`   -> flatten `*.tf` into `<stack>/<name>-<file>.tf`
                          (flat dir, read by OpenTofu, name-prefixed to avoid
                          collisions). Resources inside must use a unique
                          prefix chosen by the item author.
- `ansible-role/<name>` -> copy whole tree to `<stack>/roles/<name>/`
                          (standard Ansible role layout).

An install manifest is tracked at `.cloud-provisioning/<stack>/registry.json`
so uninstall removes exactly the copied files.
"""
from __future__ import annotations

import json
import os
import shutil
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

ITEM_TYPES = ("tofu-block", "ansible-role")


def _registry_root() -> Path:
    return Path(os.environ.get("REGISTRY_DIR",
                               str(Path(__file__).resolve().parent.parent / "registry")))


def _manifest_path(project_id: Optional[str], stack: str) -> Path:
    from services.cloud_provisioning import _stack_data_dir
    return _stack_data_dir(project_id, stack) / "registry.json"


def _load_manifest(project_id: Optional[str], stack: str) -> Dict[str, Any]:
    p = _manifest_path(project_id, stack)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _save_manifest(project_id: Optional[str], stack: str, manifest: Dict[str, Any]) -> None:
    p = _manifest_path(project_id, stack)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def _read_meta(dirpath: Path) -> Dict[str, Any]:
    meta_file = dirpath / "radas.json"
    if meta_file.exists():
        try:
            return json.loads(meta_file.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def catalog() -> List[Dict[str, Any]]:
    """List all registry items with metadata (name, type, version, desc, tags)."""
    out: List[Dict[str, Any]] = []
    root = _registry_root()
    if not root.exists():
        return out
    for itype in ITEM_TYPES:
        tdir = root / itype
        if not tdir.exists():
            continue
        for entry in sorted(tdir.iterdir()):
            if not entry.is_dir():
                continue
            meta = _read_meta(entry)
            out.append({
                "name": entry.name,
                "type": itype,
                "version": meta.get("version", "0.0.0"),
                "description": meta.get("description", ""),
                "tags": meta.get("tags", []),
            })
    return out


def get_item(name: str, itype: Optional[str] = None) -> Optional[Dict[str, Any]]:
    name = (name or "").strip()
    if not name:
        return None
    for candidate_type in [itype] if itype else ITEM_TYPES:
        if not candidate_type:
            continue
        d = _registry_root() / candidate_type / name
        if d.exists():
            meta = _read_meta(d)
            files = sorted([str(p.relative_to(d)) for p in d.rglob("*") if p.is_file()
                            and p.name != "radas.json"])
            return {"name": name, "type": candidate_type, "path": str(d),
                    "version": meta.get("version", "0.0.0"),
                    "description": meta.get("description", ""),
                    "tags": meta.get("tags", []), "files": files}
    return None


def _stack_dir_of(project_id: Optional[str], stack: str) -> Path:
    from services.cloud_provisioning import _stack_dir
    sd = _stack_dir(project_id, stack)
    if not sd.exists():
        raise ValueError(f"Stack '{stack}' not found")
    return sd


def install(project_id: Optional[str], stack: str, name: str) -> Dict[str, Any]:
    """Copy a registry item's code into the stack workspace. Returns manifest update."""
    item = get_item(name)
    if not item:
        raise ValueError(f"Registry item '{name}' not found")
    sd = _stack_dir_of(project_id, stack)
    manifest = _load_manifest(project_id, stack)
    if name in manifest:
        raise ValueError(f"'{name}' already installed on stack '{stack}'. Uninstall first.")
    src = Path(item["path"])
    copied: List[str] = []
    if item["type"] == "tofu-block":
        for f in item["files"]:
            if not f.endswith(".tf"):
                continue
            src_file = src / f
            dst_name = f"{name}-{Path(f).name}"
            dest = sd / dst_name
            dest.write_text(src_file.read_text(encoding="utf-8"), encoding="utf-8")
            copied.append(dst_name)
    else:  # ansible-role → <stack>/roles/<name>/
        role_dir = sd / "roles" / name
        if role_dir.exists():
            raise ValueError(f"Role directory already exists: roles/{name}")
        role_dir.mkdir(parents=True, exist_ok=True)
        for f in item["files"]:
            src_file = src / f
            dest = role_dir / f
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(src_file.read_text(encoding="utf-8"), encoding="utf-8")
            copied.append(f"roles/{name}/{f}")
    manifest[name] = {"type": item["type"], "version": item["version"],
                      "installed_at": int(time.time()), "files_copied": copied}
    _save_manifest(project_id, stack, manifest)
    return {"name": name, "type": item["type"], "version": item["version"],
            "stack": stack, "files_copied": copied}


def uninstall(project_id: Optional[str], stack: str, name: str) -> Dict[str, Any]:
    """Remove a registry item's copied files from the stack workspace."""
    manifest = _load_manifest(project_id, stack)
    rec = manifest.get(name)
    if not rec:
        raise ValueError(f"'{name}' is not installed on stack '{stack}'")
    sd = _stack_dir_of(project_id, stack)
    removed: List[str] = []
    if rec.get("type") == "ansible-role":
        role_dir = sd / "roles" / name
        if role_dir.exists():
            shutil.rmtree(role_dir, ignore_errors=True)
            removed = [f"roles/{name}/"]
    else:
        for f in rec.get("files_copied") or []:
            dest = sd / f
            if dest.exists():
                dest.unlink()
                removed.append(f)
    manifest.pop(name, None)
    _save_manifest(project_id, stack, manifest)
    return {"name": name, "stack": stack, "removed": removed}


def installed(project_id: Optional[str], stack: str) -> List[Dict[str, Any]]:
    m = _load_manifest(project_id, stack)
    return [{"name": n, **v} for n, v in sorted(m.items())]


def export_item_bundle(name: str) -> Dict[str, Any]:
    """Export a registry item and its files as a standalone portable JSON bundle (UC661)."""
    item = get_item(name)
    if not item:
        raise ValueError(f"Registry item '{name}' not found")
    src = Path(item["path"])
    meta = _read_meta(src)

    files_dict: Dict[str, str] = {}
    for f in item.get("files", []):
        fpath = src / f
        if fpath.is_file():
            try:
                files_dict[f] = fpath.read_text(encoding="utf-8")
            except Exception:
                pass

    return {
        "name": item["name"],
        "type": item["type"],
        "version": item.get("version", "1.0.0"),
        "description": item.get("description", ""),
        "tags": item.get("tags", []),
        "dependencies": meta.get("dependencies", []),
        "changelog": meta.get("changelog", []),
        "files": files_dict,
    }


def import_item_bundle(bundle_data: Dict[str, Any]) -> Dict[str, Any]:
    """Import a registry item package bundle into the local registry (UC661)."""
    name = (bundle_data.get("name") or "").strip()
    if not name:
        raise ValueError("Item name is required in bundle")

    itype = bundle_data.get("type", "tofu-block")
    if itype not in ITEM_TYPES:
        raise ValueError(f"Invalid item type '{itype}'. Allowed: {ITEM_TYPES}")

    root = _registry_root()
    target_dir = root / itype / name
    target_dir.mkdir(parents=True, exist_ok=True)

    # Write metadata
    meta = {
        "name": name,
        "type": itype,
        "version": bundle_data.get("version", "1.0.0"),
        "description": bundle_data.get("description", ""),
        "tags": bundle_data.get("tags", []),
        "dependencies": bundle_data.get("dependencies", []),
        "changelog": bundle_data.get("changelog", []),
    }
    (target_dir / "radas.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    # Write files
    files = bundle_data.get("files") or {}
    for rel_path, content in files.items():
        dst = target_dir / rel_path
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(content, encoding="utf-8")

    return {
        "success": True,
        "name": name,
        "type": itype,
        "version": meta["version"],
        "files_count": len(files),
    }