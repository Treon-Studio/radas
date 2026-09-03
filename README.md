<div align="center"><a name="readme-top"></a>

<a href="https://github.com/Treon-Studio/radas">
  <img src="https://github.com/user-attachments/assets/27070ab9-be52-4e0b-b1d6-3149e9826a70" width="120" alt="Radas Banner">
</a>

# Radas

**GitOps control plane untuk OpenTofu & Ansible.**

Kelola infrastruktur multi-cloud dari satu console: provisioning, konfigurasi,
cost, secrets, RBAC, CI/CD, AI assist — dengan PostgreSQL/Neon sebagai
persistence dan model multi-tenant berbasis org.

[Official Site][official-site] · [Docs][docs] · [Changelog][changelog] · [Issues][github-issues-link]

</div>

<details>
<summary><kbd>Table of contents</kbd></summary>

#### TOC

- [✨ Features](#-features)
- [🏗️ Arsitektur](#️-arsitektur)
- [⌨️ Local Development](#️-local-development)
- [🗄️ Database (PostgreSQL/Neon)](#️-database-postgresqlneon)
- [👥 Multi-tenant](#-multi-tenant)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

</details>

## ✨ Features

### Provisioning & IaC

- **Multi-cloud stacks** — wizard berbasis schema untuk Hetzner, Biznet Gio,
  IDCloudHost, AWS, GCP, Azure, Cloudflare, Kubernetes/EKS/GKE, dan ByteDC.
- **OpenTofu lifecycle** — plan / apply / destroy / validate / test via worker
  pool (Go worker), remote state, drift detection, snapshots & rollback.
- **Stack ops** — lock/unlock (maintenance), taint/untaint, output viewer,
  force-unlock, per-stack approval & policy gate.

### Governance & Security

- **RBAC** — users, roles, permissions, service accounts & API tokens.
- **Approval gate** — prod apply butuh persetujuan; role-per-environment.
- **Feature flags** — progressive delivery & kill-switch (`block_apply`,
  per-stack block, rollout %, whitelist/blacklist, audit trail, TTL).
- **Test cases** — assertion library (CIDR publik, secret di tfvars, IAM
  wildcard, dll), blocker fail menahan apply, integrasi `tofu test`.
- **MFA (TOTP)** & **SSO OIDC**, compliance scorecard, audit log.

### Cost & FinOps

- **Cost analysis** — estimasi per stack/provider, budget & alert, forecast,
  tag breakdown, rightsizing suggestion, cost reports.

### Integrasi & CI/CD

- **Preview environment per PR** — stack ephemeral dibuat & di-teardown
  otomatis via webhook GitHub.
- **GitHub Actions management** — repos, workflows, runs, dispatch/rerun/
  cancel, workflow templates (scaffold & commit), secrets/variables.
- **BYOC (Bring Your Own Cloud)** — hubungkan akun cloud existing, validasi
  kredensial, discovery resource, generate import block OpenTofu.
- **Code Registry** — simpan modul IaC & role Ansible, install ke stack
  (shadcn-style copy), version & metadata.

### Platform

- **PostgreSQL/Neon** — seluruh persistence di Postgres (auth, config, worker
  index, kv-store, executions, stack state, snapshots).
- **Multi-tenant org** — orgs → members (owner/admin/member/readonly) →
  projects; akses project di-gate per membership (403 lintas-org).
- **AI tools** — chat assistant, plan review (cost/security), playbook draft,
  auto-dokumentasi infrastruktur.

## 🏗️ Arsitektur

```
radas/
├── apps/
│   ├── radas-console/     # React 19 + Vite + TanStack Router/Query (UI)
│   ├── opensible-server/  # Flask API (RPC) + services + storage (Postgres)
│   ├── opensible-worker/  # Go worker — claim & eksekusi OpenTofu/Ansible
│   └── cli/               # Go CLI (radas)
├── templates/opensible-iac/  # Modul OpenTofu per provider
└── docs/                     # ROADMAP (666 use cases), ARCHITECTURE, dsb
```

## ⌨️ Local Development

Prasyarat: Node 22+, pnpm 10, Python 3.12, Go 1.25+, PostgreSQL 15 (lokal)
atau Neon (cloud).

```bash
# 1. Dependencies
pnpm install
cd apps/server && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

# 2. Database (Postgres lokal — atau set DATABASE_URL ke Neon)
brew install postgresql@15 && brew services start postgresql@15
createdb radas && createdb radas_test

# 3. Jalankan (pm2 orchestrates server :5001, console :8080, worker)
pnpm dev:radas
```

Buka **http://localhost:8080** → login `admin` / `admin12345` (bisa diubah
via `ADMIN_INITIAL_PASSWORD` di `ecosystem.config.cjs`).

### Test

```bash
cd apps/server
.venv/bin/python -m pytest tests/ -q      # memakai radas_test, schema reset per test
```

## 🗄️ Database (PostgreSQL/Neon)

- `DATABASE_URL` **wajib** — server menolak boot tanpa koneksi Postgres yang
  bisa diakses (Neon supported: `postgres://user:pass@host/db?sslmode=require`).
- Skema dikelola `storage/pg_schema.py` (versioned `schema_migrations`).
- Migrasi data lama (SQLite/JSON → PG):

```bash
cd apps/server
DATABASE_URL=postgres://… .venv/bin/python scripts/migrate_legacy.py --data-dir data
```

Detail lengkap: [`docs/postgres-neon.md`](docs/postgres-neon.md).

## 👥 Multi-tenant

- `orgs` + `org_members` (owner/admin/member/readonly) + `projects.org_id`.
- JWT membawa `org_id`; `POST /api/auth/switch-org` untuk ganti konteks.
- Route project-scoped memakai `require_project_access` — user di luar org
  pemilik project mendapat 403.

## 🤝 Contributing

Contributions welcome — bug reports, feature requests, atau code.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Roadmap & backlog: [`docs/ROADMAP.md`](docs/ROADMAP.md).

## 📄 License

Distributed under the Apache License 2.0. See [`LICENSE`](./LICENSE).

---

<div align="center">

Made with ❤️ by [Treon Studio](https://github.com/Treon-Studio)

</div>

<!-- Links -->
[official-site]: https://github.com/Treon-Studio/radas
[docs]: docs/postgres-neon.md
[changelog]: https://github.com/Treon-Studio/radas/blob/main/CHANGELOG.md
[github-issues-link]: https://github.com/Treon-Studio/radas/issues
[github-project-link]: https://github.com/Treon-Studio/radas/projects
