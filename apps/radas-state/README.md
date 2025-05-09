# RadasState

## API Documentation

- [AuditLog API](api_docs/audit_log.md)

(Lihat folder `api_docs/` untuk dokumentasi API lainnya.)

To start your Phoenix server:

  * Run `mix setup` to install and setup dependencies
  * Start Phoenix endpoint with `mix phx.server` or inside IEx with `iex -S mix phx.server`

Now you can visit [`localhost:4000`](http://localhost:4000) from your browser.

Ready to run in production? Please [check our deployment guides](https://hexdocs.pm/phoenix/deployment.html).

---

## Struktur Direktori Utama

- `lib/radas_state/` — Modul utama (environments, feature_flags, project_statuses, knowledges, auth, notification, audit_log, jobs, milestones, status_updates)
- `lib/radas_state/services/` — Service layer (business logic)
- `lib/radas_state_web/` — Controller, router, JSON views
- `priv/repo/migrations/` — Migration database
- `api_docs/` — Dokumentasi API

## Roadmap Pengembangan (sesuai plans.md)

1. Environment Management
2. Feature Flag System
3. Project Status & Milestone Tracking
4. Knowledge Management (Notes)
5. Authentication & Authorization
6. Notification System
7. Audit Logging
8. Background Processing
9. API Documentation
10. Modular Service Layer

Lihat `plans.md` untuk detail tahapan dan deliverables.

## Learn more

  * Official website: https://www.phoenixframework.org/
  * Guides: https://hexdocs.pm/phoenix/overview.html
  * Docs: https://hexdocs.pm/phoenix
  * Forum: https://elixirforum.com/c/phoenix-forum
  * Source: https://github.com/phoenixframework/phoenix
