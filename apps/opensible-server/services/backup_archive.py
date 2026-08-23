"""DATA_DIR backup archive generator and restore tooling (UC650)."""
from __future__ import annotations

import json
import logging
import time
import zipfile
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def create_backup_archive(
    data_dir: Path,
    output_zip_path: Path,
    include_db_dump: bool = False,
) -> Dict[str, Any]:
    """Create a complete backup archive zip of the DATA_DIR directory (UC650)."""
    data_dir = Path(data_dir)
    output_zip_path = Path(output_zip_path)
    output_zip_path.parent.mkdir(parents=True, exist_ok=True)

    file_count = 0
    now = time.time()

    with zipfile.ZipFile(output_zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        manifest = {
            "version": "1.0.0",
            "created_at": now,
            "source_dir": str(data_dir),
            "include_db_dump": include_db_dump,
        }
        zf.writestr("backup_manifest.json", json.dumps(manifest, indent=2))

        for file_path in data_dir.rglob("*"):
            if file_path.is_file():
                rel_path = file_path.relative_to(data_dir)
                if any(part.startswith(".tmp") or part.endswith(".sock") for part in rel_path.parts):
                    continue
                try:
                    zf.write(file_path, arcname=str(Path("data") / rel_path))
                    file_count += 1
                except Exception as e:
                    logger.warning(f"Skipping {file_path} in backup: {e}")

    size_bytes = output_zip_path.stat().st_size if output_zip_path.exists() else 0
    logger.info(f"Created backup archive at {output_zip_path} ({file_count} files, {size_bytes} bytes)")
    return {
        "success": True,
        "archive_path": str(output_zip_path),
        "files_count": file_count,
        "bytes": size_bytes,
        "created_at": now,
    }


def restore_backup_archive(
    backup_zip_path: Path,
    target_data_dir: Path,
) -> Dict[str, Any]:
    """Restore a backup archive zip into target DATA_DIR (UC650)."""
    backup_zip_path = Path(backup_zip_path)
    target_data_dir = Path(target_data_dir)
    if not backup_zip_path.exists():
        raise ValueError(f"Backup archive not found: {backup_zip_path}")

    target_data_dir.mkdir(parents=True, exist_ok=True)
    files_restored = 0

    with zipfile.ZipFile(backup_zip_path, "r") as zf:
        for member in zf.infolist():
            if member.filename.startswith("data/"):
                rel_path = member.filename[len("data/"):]
                if not rel_path:
                    continue
                dest_path = target_data_dir / rel_path
                if member.is_dir():
                    dest_path.mkdir(parents=True, exist_ok=True)
                else:
                    dest_path.parent.mkdir(parents=True, exist_ok=True)
                    with zf.open(member) as src, open(dest_path, "wb") as dst:
                        dst.write(src.read())
                    files_restored += 1

    logger.info(f"Restored {files_restored} files to {target_data_dir} from {backup_zip_path}")
    return {
        "success": True,
        "restored_to": str(target_data_dir),
        "files_restored": files_restored,
    }
