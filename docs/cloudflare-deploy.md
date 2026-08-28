# Deploy radas ke Cloudflare Pages + Tunnel (free tier)

Arsitektur target:

```
Browser
  ├─ console → Cloudflare Pages (free)        https://radas-console.pages.dev
  │              └─ /api → VITE_API_BASE (URL tunnel)
  └─ api → https://radas-api.<host>.trycloudflare.com
                │  (Cloudflare Tunnel, keluar dari VPS)
                ▼
             VPS: radas-server :5001 + radas-worker (+ Postgres opsional)
```

## 1. Deploy console ke Cloudflare Pages

```bash
cd /Users/ridho/Documents/go/github.com/raizora/radas

# Build dengan API base = URL tunnel (ganti setelah tunnel aktif, lihat §2)
VITE_API_BASE="https://radas-api.YOUR-TUNNEL.trycloudflare.com" \
  pnpm --filter @radas/console build

# Deploy (wajib login sekali: npx wrangler login)
cd apps/console
npx wrangler pages deploy dist --project-name radas-console
```

Project pertama kali dibuat otomatis; URL: `https://radas-console.pages.dev`.
Custom domain: Cloudflare dashboard → Workers & Pages → radas-console →
Custom domains → tambah `console.domainmu.com`.

**Catatan:** kalau `VITE_API_BASE` diubah, build ulang + deploy ulang
(env di-inline saat build, bukan runtime).

## 2. Cloudflare Tunnel di VPS (tanpa buka port)

Di VPS:

```bash
# Install cloudflared (Debian/Ubuntu)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Login & buat tunnel
cloudflared tunnel login          # buka URL, pilih account
cloudflared tunnel create radas   # simpan credential

# Jalankan tunnel ke server lokal :5001
cloudflared tunnel run --url http://localhost:5001
# atau versi named (production): buat config + service systemd (lihat §3)
```

Output akan memberi URL sementara `https://radas-api-xxxx.trycloudflare.com`.
Gunakan URL itu sebagai `VITE_API_BASE` pada build §1, atau pasang di custom
domain lewat dashboard (DNS → tunnel → route `api.domainmu.com`).

## 3. systemd service (biar tunnel selalu hidup)

Buat `/etc/cloudflared/config.yml`:

```yaml
tunnel: radas
credentials-file: /root/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: api.domainmu.com
    service: http://localhost:5001
  - service: http_status:404
```

```bash
# Route DNS + install service
cloudflared tunnel route dns radas api.domainmu.com
cloudflared service install
systemctl enable cloudflared
systemctl start cloudflared
```

## 4. Server & worker di VPS

Sama seperti lokal — `pnpm dev:radas` atau pm2 di VPS:

```bash
cd /path/to/radas
pnpm install
cd apps/server && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
# set .env: DATABASE_URL (Neon) + JWT_SECRET_KEY kuat + CORS_ALLOWED_ORIGINS
pm2 start ecosystem.config.cjs
```

## Env penting untuk production

| Var | Nilai |
|---|---|
| `DATABASE_URL` | Neon (sudah di `.env`) |
| `JWT_SECRET_KEY` | random kuat (`openssl rand -hex 32`) |
| `INTERNAL_CALL_SECRET` | random kuat |
| `CORS_ALLOWED_ORIGINS` | `https://radas-console.pages.dev,https://console.domainmu.com` |
| `GITHUB_OAUTH_CLIENT_ID/SECRET` | (jika pakai GitHub OAuth) |
| `GITHUB_OAUTH_REDIRECT_URI` | `https://api.domainmu.com/api/github/oauth/callback` |

## Rollback / update

- Console: `npx wrangler pages deploy dist --project-name radas-console` (lagi)
- Tunnel: `systemctl restart cloudflared`

## Catatan lapangan (VPS dengan UFW + Docker)

- **UFW `INPUT policy DROP` memblokir cloudflared container** ke origin.
  Wajib izinkan bridge:
  ```bash
  ufw allow from 10.0.0.0/24 to any port 5001 proto tcp
  ufw allow from 127.0.0.1 to any port 5001 proto tcp
  ```
- Jika host punya banyak container/iptables, jalankan cloudflared **dalam
  Docker** (jaringan bersih):
  ```bash
  docker run -d --name radas-tunnel --restart=always \
    cloudflare/cloudflared:latest tunnel --url http://10.0.0.1:5001
  # gateway Docker: ip -4 addr show docker0 | grep inet
  # log: docker logs radas-tunnel | grep trycloudflare
  ```
- Quick tunnel URL berubah tiap restart — untuk produksi gunakan named
  tunnel + custom domain (route DNS di dashboard Cloudflare).

## Named tunnel + custom domain (produksi, permanen)

Quick tunnel URL berubah tiap restart — untuk produksi gunakan named tunnel:

```bash
# Di Mac (sekali, sudah login): buat tunnel + route DNS
cloudflared tunnel create radas-api
cloudflared tunnel route dns radas-api api-radas.treonstudio.com

# Copy credentials ke VPS
scp ~/.cloudflared/<tunnel-id>.json root@VPS:/root/.cloudflared/

# Di VPS: config ingress (/root/.cloudflared/radas-api.yml)
#   tunnel: <tunnel-id>
#   credentials-file: /etc/cloudflared/<tunnel-id>.json
#   ingress:
#     - hostname: api-radas.treonstudio.com
#       service: http://127.0.0.1:5001
#     - service: http_status:404

# Jalankan di Docker (--network host + --user 0:0 agar baca config di /root)
docker run -d --name radas-tunnel --restart=always --network host --user 0:0 \
  -v /root/.cloudflared:/etc/cloudflared \
  cloudflare/cloudflared:latest tunnel --config /etc/cloudflared/radas-api.yml run <tunnel-id>
```

Build console dengan domain permanen:
```bash
VITE_API_BASE=https://api-radas.treonstudio.com pnpm --filter @radas/console build
cd apps/console && npx wrangler pages deploy dist --project-name radas-console
```

Aktif: **https://radas-console.pages.dev** → API **https://api-radas.treonstudio.com**

## VPS cleanup (hapus aplikasi lain, khusus radas)

```bash
# Systemd services non-radas
for svc in haro-relay mcp-haro cloudflared cloudflared-tunnel; do
  systemctl stop $svc && systemctl disable $svc
done
rm -f /etc/systemd/system/{haro-relay,mcp-haro,cloudflared,cloudflared-tunnel}.service

# Docker containers non-radas
docker rm -f haro-minio-init haro-minio haro-redis haro-postgres 9router mem0-selfhost-postgres-1

# App & tunnel credentials lama
rm -rf /opt/haro
rm -f /root/.cloudflared/99a53745*.json /root/.cloudflared/config.yml /root/.cloudflared/api-token

# Tunnel haro-proxy dari Cloudflare (dari Mac dengan cert.pem)
cloudflared tunnel delete 99a53745-fd3e-416b-a107-099c6057d0af
```

Hasil: VPS hanya berisi radas-server + radas-worker + radas-tunnel (named
`radas-api`). Docker tersisa hanya `radas-tunnel`.
