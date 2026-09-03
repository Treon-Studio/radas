# Immutable Deployment (GHCR)

Status: **Phase 1 active** — CI builds and publishes versioned images.
Target: deploy-by-version with rollback, no host-side builds.

## What runs today

1. `build-images.yml` (push ke main, path-filtered): build server/worker/console
   → push `ghcr.io/treon-studio/radas-<name>:<git-sha>` + `:latest`
   (buildx, GHA cache, `GITHUB_TOKEN` packages:write).
2. `deploy-vps.yml` tetap berjalan seperti sebelumnya (source build di VPS)
   — tidak berubah sampai langkah migrasi di bawah selesai.

## Migration steps to deploy-by-version

1. **Smoke test image per tag** (belum otomatis): jalankan server image
   `:<sha>` dengan Postgres ephemeral + `/api/health` 200 sebelum dianggap
   layak deploy (tambahkan job `verify-image` di build-images.yml).
2. **compose.versioned.yml**: salinan docker-compose dengan tiga image
   `ghcr.io/...:<GIT_SHA>` via env `RADAS_IMAGE_TAG`. VPS pull + `docker
   compose -f compose.versioned.yml up -d`.
3. **deploy-vps-v2.yml**: input `image_tag` (default = latest sha). Deploy =
   ssh non-root → `RADAS_IMAGE_TAG=<tag> docker compose up -d` → health
   check `/readyz` (bukan hanya `/api/health`) → simpan `deployed_tag` ke
   `deployed.txt` di VPS.
4. **Rollback**: `deploy-vps-v2.yml` dengan input tag lama dari daftar
   `docker images` / GHCR. Tidak ada rebuild — hanya re-pin.
5. **Retensi**: GHCR package settings — keep N terakhir + latest.

## Constraints

- `GITHUB_TOKEN` di repo ini tidak bisa pull image private milik repo lain —
  semua image `radas-*` dimiliki org ini (package creation sudah terbukti).
- Image naming memakai owner lowercase `treon-studio` (GHCR requirement).
- PM2/native path lama tetap sebagai fallback sampai langkah 2-3 hijau
  dua kali berturut-turut, lalu dihapus.
