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

import difflib
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


def get_item_changelog(name: str) -> List[Dict[str, Any]]:
    """Retrieve the version changelog for a registry item (UC662)."""
    item = get_item(name)
    if not item:
        raise ValueError(f"Registry item '{name}' not found")
    src = Path(item["path"])
    meta = _read_meta(src)
    return meta.get("changelog", [])


def resolve_dependencies(name: str) -> List[str]:
    """
    Resolve all transitive dependencies for a registry item in topological order (UC663).
    Returns list of dependency names in the order they must be installed.
    """
    resolved: List[str] = []
    visited: set = set()
    visiting: set = set()

    def _dfs(current: str):
        if current in visiting:
            raise ValueError(f"Circular dependency detected involving '{current}'")
        if current in visited:
            return
        visiting.add(current)
        item = get_item(current)
        if not item:
            raise ValueError(f"Dependency '{current}' not found in registry")
        src = Path(item["path"])
        meta = _read_meta(src)
        deps = meta.get("dependencies") or []
        for dep in deps:
            _dfs(dep)
        visiting.remove(current)
        visited.add(current)
        if current != name and current not in resolved:
            resolved.append(current)

    _dfs(name)
    return resolved


def install(
    project_id: Optional[str],
    stack: str,
    name: str,
    version: Optional[str] = None,
    resolve_deps: bool = False,
) -> Dict[str, Any]:
    """Copy a registry item's code into the stack workspace. Returns manifest update."""
    deps_installed: List[str] = []
    if resolve_deps:
        dependencies = resolve_dependencies(name)
        manifest_curr = _load_manifest(project_id, stack)
        for dep in dependencies:
            if dep not in manifest_curr:
                install(project_id, stack, dep, resolve_deps=False)
                deps_installed.append(dep)
                manifest_curr = _load_manifest(project_id, stack)

    item = get_item(name)
    if not item:
        raise ValueError(f"Registry item '{name}' not found")
    src = Path(item["path"])
    meta = _read_meta(src)

    target_version = item.get("version", "1.0.0")
    if version:
        # Check if version matches current or known versions
        known_versions = [target_version]
        if "versions" in meta and isinstance(meta["versions"], dict):
            known_versions.extend(list(meta["versions"].keys()))
        if "changelog" in meta and isinstance(meta["changelog"], list):
            for c in meta["changelog"]:
                if isinstance(c, dict) and c.get("version"):
                    known_versions.append(c["version"])
        if version not in known_versions:
            raise ValueError(f"Version '{version}' not found for '{name}'")
        target_version = version

    sd = _stack_dir_of(project_id, stack)
    manifest = _load_manifest(project_id, stack)
    if name in manifest:
        raise ValueError(f"'{name}' already installed on stack '{stack}'. Uninstall first.")
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
    manifest[name] = {"type": item["type"], "version": target_version,
                      "installed_at": int(time.time()), "files_copied": copied}
    _save_manifest(project_id, stack, manifest)
    res = {
        "name": name,
        "type": item["type"],
        "version": target_version,
        "stack": stack,
        "files_copied": copied,
    }
    if deps_installed:
        res["dependencies_installed"] = deps_installed
    return res


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


def publish_from_stack(
    project_id: Optional[str],
    stack: str,
    name: str,
    item_type: str,
    file_patterns: List[str],
    version: str = "1.0.0",
    description: str = "",
    tags: Optional[List[str]] = None,
    dependencies: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Publish reusable code from a stack workspace directly into the code registry (UC664)."""
    name = (name or "").strip()
    if not name:
        raise ValueError("Item name is required")
    if item_type not in ITEM_TYPES:
        raise ValueError(f"Invalid item type '{item_type}'. Allowed: {ITEM_TYPES}")

    sd = _stack_dir_of(project_id, stack)
    target_dir = _registry_root() / item_type / name
    target_dir.mkdir(parents=True, exist_ok=True)

    published_files: List[str] = []
    for pattern in file_patterns:
        matched = list(sd.glob(pattern)) if "*" in pattern else [sd / pattern]
        for src_path in matched:
            if src_path.is_file():
                rel = src_path.relative_to(sd)
                dest = target_dir / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_text(src_path.read_text(encoding="utf-8"), encoding="utf-8")
                published_files.append(str(rel))

    if not published_files:
        raise ValueError(f"No files matched patterns {file_patterns} in stack '{stack}'")

    meta = {
        "name": name,
        "type": item_type,
        "version": version,
        "description": description,
        "tags": tags or [],
        "dependencies": dependencies or [],
        "changelog": [{"version": version, "date": time.strftime("%Y-%m-%d"), "changes": [f"Published from stack {stack}"]}],
    }
    (target_dir / "radas.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    return {
        "success": True,
        "name": name,
        "type": item_type,
        "version": version,
        "stack": stack,
        "files_published": published_files,
    }


def diff_installed_item(
    project_id: Optional[str],
    stack: str,
    name: str,
    target_version: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate dry-run diff between stack's installed files and registry item target version (UC665)."""
    manifest = _load_manifest(project_id, stack)
    rec = manifest.get(name)
    if not rec:
        raise ValueError(f"'{name}' is not installed on stack '{stack}'")

    item = get_item(name)
    if not item:
        raise ValueError(f"Registry item '{name}' not found")

    sd = _stack_dir_of(project_id, stack)
    src = Path(item["path"])
    target_v = target_version or item.get("version", "1.0.0")

    file_diffs: List[Dict[str, Any]] = []
    has_changes = False

    if item["type"] == "tofu-block":
        for f in item["files"]:
            if not f.endswith(".tf"):
                continue
            src_file = src / f
            dst_name = f"{name}-{Path(f).name}"
            installed_dest = sd / dst_name

            old_lines = installed_dest.read_text(encoding="utf-8").splitlines(keepends=True) if installed_dest.exists() else []
            new_lines = src_file.read_text(encoding="utf-8").splitlines(keepends=True)

            diff_lines = list(difflib.unified_diff(
                old_lines,
                new_lines,
                fromfile=f"a/{dst_name} ({rec.get('version', 'installed')})",
                tofile=f"b/{dst_name} ({target_v})",
            ))

            diff_str = "".join(diff_lines)
            if diff_str:
                has_changes = True
                status = "added" if not old_lines else "modified"
            else:
                status = "unchanged"

            file_diffs.append({
                "file": dst_name,
                "status": status,
                "diff": diff_str,
            })
    else:  # ansible-role
        role_dir = sd / "roles" / name
        for f in item["files"]:
            src_file = src / f
            installed_dest = role_dir / f
            old_lines = installed_dest.read_text(encoding="utf-8").splitlines(keepends=True) if installed_dest.exists() else []
            new_lines = src_file.read_text(encoding="utf-8").splitlines(keepends=True)

            diff_lines = list(difflib.unified_diff(
                old_lines,
                new_lines,
                fromfile=f"a/roles/{name}/{f} ({rec.get('version', 'installed')})",
                tofile=f"b/roles/{name}/{f} ({target_v})",
            ))

            diff_str = "".join(diff_lines)
            if diff_str:
                has_changes = True
                status = "added" if not old_lines else "modified"
            else:
                status = "unchanged"

            file_diffs.append({
                "file": f"roles/{name}/{f}",
                "status": status,
                "diff": diff_str,
            })

    return {
        "name": name,
        "type": item["type"],
        "installed_version": rec.get("version", "unknown"),
        "target_version": target_v,
        "has_changes": has_changes,
        "file_diffs": file_diffs,
    }


def update_installed_item(
    project_id: Optional[str],
    stack: str,
    name: str,
    version: Optional[str] = None,
) -> Dict[str, Any]:
    """Update an installed registry item to the latest or pinned version (UC665)."""
    manifest = _load_manifest(project_id, stack)
    rec = manifest.get(name)
    if not rec:
        raise ValueError(f"'{name}' is not installed on stack '{stack}'")

    old_version = rec.get("version", "unknown")
    uninstall(project_id, stack, name)
    installed_res = install(project_id, stack, name, version=version, resolve_deps=False)

    return {
        "success": True,
        "name": name,
        "previous_version": old_version,
        "new_version": installed_res["version"],
        "stack": stack,
        "files_updated": installed_res["files_copied"],
    }


def sync_git_registry(
    git_url: str,
    branch: str = "main",
    dest_subdir: Optional[str] = None,
) -> Dict[str, Any]:
    """Sync reusable code registry items from a remote or local Git repository (UC666)."""
    git_url = (git_url or "").strip()
    if not git_url:
        raise ValueError("git_url is required")

    import subprocess
    import tempfile

    synced_items: List[str] = []
    root = _registry_root()
    root.mkdir(parents=True, exist_ok=True)

    local_path = Path(git_url.replace("file://", ""))
    if local_path.exists() and local_path.is_dir():
        source_dir = local_path
        cleanup_temp = False
    else:
        temp_clone_dir = tempfile.mkdtemp(prefix="radas_reg_git_")
        cleanup_temp = True
        try:
            cmd = ["git", "clone", "--depth", "1", "--branch", branch, git_url, temp_clone_dir]
            subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            source_dir = Path(temp_clone_dir)
        except Exception as e:
            shutil.rmtree(temp_clone_dir, ignore_errors=True)
            raise ValueError(f"Failed to clone Git repository '{git_url}': {e}")

    try:
        scan_dir = source_dir / dest_subdir if dest_subdir else source_dir
        for itype in ITEM_TYPES:
            tdir = scan_dir / itype
            if not tdir.exists():
                continue
            for entry in tdir.iterdir():
                if entry.is_dir() and (entry / "radas.json").exists():
                    target = root / itype / entry.name
                    target.parent.mkdir(parents=True, exist_ok=True)
                    if target.exists():
                        shutil.rmtree(target, ignore_errors=True)
                    shutil.copytree(entry, target)
                    synced_items.append(entry.name)
    finally:
        if cleanup_temp:
            shutil.rmtree(source_dir, ignore_errors=True)

    return {
        "success": True,
        "git_url": git_url,
        "branch": branch,
        "items_synced": synced_items,
        "count": len(synced_items),
    }