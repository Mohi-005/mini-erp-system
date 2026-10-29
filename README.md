# Mini ERP / হিসাব

Bangla-first business management for Bangladeshi merchants. Phase 2A adds Supabase email/password clients, tenant RLS and atomic onboarding around the preserved Phase 1 preview. **Hosted DEV database security tests passed 55/55. Manual web DEV tests on 20 October 2026 also verified confirmation-required signup and the complete password-recovery/password-update flow.** This is development verification, not production readiness: production SMTP/deliverability, a clean local migration rebuild, and physical Android/deep-link/accessibility QA remain deferred. No operational financial module, Phase 2B implementation, or deployment is authorized. See [Phase 2A verification](docs/phase2a.md) and [actual database results](docs/phase2a-db-evidence.md).

## Start locally

Prerequisites: Node.js 22.13+ (verified with 24.19.0), npm 11+, and network access for the first install. Run from this folder:

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Missing public configuration produces an honest unavailable connection screen with disabled auth submission. Open the separate sample to inspect the preserved V3 screens. Sample records/filters are isolated from Supabase; no sample save/post/payment is enabled. Direct business hash routes do not bypass the auth/session gate. The sample never reads V3 localStorage.

This workspace is linked to the authorized hosted DEVELOPMENT project **mini erp dev**, ref `jujwnhwrktmimtcnljsd`. Ignored per-app `.env.local` files contain its URL and publishable client key. Start web on an allowed callback port (5173 or 5174). Hosted email confirmation is ON. An earlier DEV test encountered email rate limiting, but subsequent manual web tests completed Gmail confirmation and password recovery/password update successfully. This proves the tested DEV path worked at that time; it does not establish production SMTP setup or sustained email deliverability. A user-approved temporary confirmation-OFF test window from earlier controlled QA was restored afterward. No production configuration was changed.

Docker is not required for the hosted verification path used here:

```powershell
npx supabase migration list
npx supabase db lint --linked --fail-on error
```

The 55 SQL assertions ran through Docker-free `db query --linked --file` with a rollback-only output collector; see the evidence document before rerunning. Never reset the hosted project. Synthetic SQL fixtures and separate web Auth/business fixtures were removed and absence verified. No CI or remote Git repository was needed.

Optional local-stack commands below require an already available compatible container runtime; this machine has no usable virtualization, and no BIOS/install changes are required by this task:

```powershell
npx supabase start
npx supabase db reset --local
npx supabase test db --local
```

These commands target a disposable local stack only and have NOT passed here. For another environment, copy per-app `.env.example` to ignored `.env.local` and supply its **publishable** key (never a secret/service-role key). Web uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; mobile uses `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Emulator local-host access uses `10.0.2.2`; native runtime/deep links remain unverified. Restart Vite/Expo after changes. Optional local mail catcher: http://127.0.0.1:54324. Production SMTP is later deployment work. Local config does not automatically configure hosted Auth.

The MVP uses Supabase PostgreSQL/Auth, tenant RLS and safe Data API access. Onboarding is one transactional RPC. Financial RPCs and Storage are future work; no separate Express MVP backend. Phone is contact information, not login identity. OWNER/STAFF are the only merchant roles; Staff optional permissions default deny.

```powershell
npm run mobile
npm run android
```

`mobile` starts Expo; use a matching Expo Go client or local development build. `android` requires Android Studio, an installed compatible SDK/JDK, and a running emulator or USB-debuggable device with adb. An Android JavaScript export is **not** an APK or device test. No EAS account or paid service is required by this foundation.

```powershell
npm run format
npm run check
```

Individual checks: `format:check`, `lint`, `typecheck`, `test`, `build` (web), `build:android` (Metro Android export). `npm run preview --workspace @mini-erp/web` serves the built web app locally. `npm exec --workspace @mini-erp/mobile -- expo install --check` checks SDK package compatibility.

## Structure and authoritative documentation

- `apps/web`: React/TypeScript/Vite responsive shell.
- `apps/mobile`: React Native/Expo/TypeScript Android shell.
- `packages/shared`: translations, navigation contracts, tokens and text/date helpers. Demo fixtures have a separate import entry.
- `supabase/`: canonical local config, migration history and rollback-isolated database tests; no operational seed or Edge Function needed.
- `database/migrations`: retained historical README pointing to the canonical system.
- [Requirements and traceability](docs/requirements.md): stable IDs and retained source scope.
- [Architecture decisions](docs/architecture.md): confirmed constraints, recommendation, unresolved choices and conflicts.
- [Permissions](docs/permissions.md): verified identity/tenant enforcement and future module contracts.
- [Backlog and acceptance](docs/delivery.md): dependencies and stage gates.
- [Known issues and verification](docs/status.md): truthful completion status.
- [Source manifest](docs/sources.md): reference provenance and archive inspection.
- [API status](docs/api.md): hosted DEV Auth, Data API and onboarding contract; no financial API.

Only active docs are maintained as the current specification. `docs/reference` is immutable evidence; older proposals do not override latest decisions. No real `.env` or credentials belong in Git. No production setup/deployment is authorized. Preserve the Phase 1 baseline `278d655`; Phase 2A changes remain uncommitted for review. See status.md for actual test results and unresolved advisories.
