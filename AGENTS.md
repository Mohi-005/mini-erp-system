# Mini ERP project guidance

- Reply in English. Only Phase 2A identity/auth/tenancy/RLS foundation is authorized. Do not begin Phase 2B, financial or operational modules.
- Read `docs/requirements.md`, `docs/architecture.md`, `docs/permissions.md`, `docs/delivery.md`, and `docs/status.md`. Latest explicit user instructions override proposals.
- Preserve the approved Version 3 হিসাব design, larger typography, shared translations, and existing work. Business types are not roles.
- `docs/reference/` is immutable evidence: never format, modify or execute its scripts.
- Approved MVP: Supabase PostgreSQL/Auth, tenant RLS, safe Data API reads/CRUD; later financial RPC/Storage and Edge Functions only when needed. No separate Express server. Canonical migrations/tests live in `supabase/`; `database/` is historical documentation only.
- Email/password only; phone is contact data. Client config uses publishable keys, never privileged keys. Staff optional permissions default deny. Language belongs to profiles, with a separate business default.
- Synthetic fixtures and simulated interactions must be visibly demo-only. Never read V3 localStorage, mix live records, fake saves or mutate operational balances in the browser.
- Financial design requires server decimals, atomic posting, tenant authorization, persistent operation identity, snapshots, linked corrections and master archive/restore.
- Run appropriate checks; distinguish build/export from device verification, viewport changes from real zoom, and previews from complete features. Update status truthfully.
- Preserve Phase 1 commit `278d655` and existing uncommitted Phase 2A work. No commits, history changes, production, deployment, paid services or machine-wide installations.
- Latest completion instructions authorize hosted DEVELOPMENT verification only: `mini erp dev`, ref `jujwnhwrktmimtcnljsd`. Confirm the target before SQL; never reset hosted data. SQL tests must retain BEGIN/ROLLBACK, capture all assertions and independently verify fixture absence afterward. CLI `db query --linked` works without local Docker; `test db --linked` still needs Docker.
- Local virtualization is unavailable and must not be installed or requested. Hosted verification is distinct from a clean local rebuild. Blocked or deferred checks are never PASS. Keep actual client configuration in ignored per-app environment files using publishable keys only.
