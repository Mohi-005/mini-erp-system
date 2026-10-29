# Phase 2A implementation and verification

Updated 20 October 2026 (Asia/Dhaka). Baseline Phase 1 commit `278d655` remains preserved. The active branch is `handoff/phase2a`; its original handoff commit is `f126319` and the subsequent auth/recovery plus documentation closeout commit is `181f644`. **Hosted DEV database security remains PASS (55/55). User-reported manual web E2E verification PASSes for confirmation-required signup and password recovery/password update.** Production SMTP/deliverability, clean local migration replay, and physical Android/native QA remain deferred. The user has directed work to continue to the next stage; the read-only Phase 2B planning audit is underway, but no Phase 2B schema, migration or application code has been created.

## Authorized hosted development fallback

The latest completion instruction (U6) authorizes hosted DEVELOPMENT verification, superseding U5's local-only restriction. The user created/linked **mini erp dev**, ref `jujwnhwrktmimtcnljsd`, and applied `20261019000100_identity_tenancy.sql`. This session independently confirmed the linked project/name, ACTIVE_HEALTHY status, Tokyo `ap-northeast-1`, PostgreSQL 17.11 and matching local/remote migration `20261019000100`. Hosted `db lint --linked --fail-on error` passed with no schema errors.

Docker/Podman is unavailable and hardware virtualization is disabled. No BIOS change, machine-wide installation or local Docker requirement was imposed. Local clean reset/rebuild remains NOT EXECUTED. Hosted verification is evidence of this project's applied schema and behavior, not a clean replay from an empty local stack.

CLI 2.121.0's `db query --linked --file` uses the Management API without Docker. The existing `test db --linked` route requires Docker and was not used again. Neither cloud CI nor GitHub changes were necessary for hosted verification. No production deployment, paid service or new migration was introduced during Phase 2A verification.

## Database security execution

All **55 pgTAP assertions executed: 55 PASS, 0 FAIL**, plan `1..55`. Full assertion evidence and collector method: [hosted database evidence](phase2a-db-evidence.md). The original SQL file returned only the final plan through the hosted query response; a transaction-local result collector retained each assertion without changing its expression or SQL role/claim context. BEGIN/ROLLBACK were preserved. No assertions were skipped or weakened.

Coverage includes Owner A/B cross-tenant denial, Staff A/B isolation, anonymous denial on all five tables, profile/settings scope, Staff self-promotion/self-grant denial, Owner management of own Staff, cross-tenant membership/grant denial, revocation with unchanged claims, immutable creator/Owner, missing actor, RPC signature, safe retry/key mismatch, duplicate initial onboarding, defaults, multi-membership schema and full rollback after a forced required-step failure.

The only fixture adjustment restricted initial settings inserts to the two synthetic business IDs rather than all DEV businesses. All 55 assertions passed after that adjustment. No migration/RLS defect or policy weakening was required.

Independent post-transaction queries confirmed zero synthetic SQL users/businesses and zero injected test triggers. Before web testing, all five application tables and Auth users were empty. The separate web tests created two test Auth/profile identities and one clearly named DEMO business; guarded cleanup removed only those fixtures. Final counts: users/profiles/businesses/memberships/permissions/settings all **0**. Normal hosted service/audit logs were not purged. No test password file remains.

## Hosted Auth and public local configuration

Ignored `apps/web/.env.local` and `apps/mobile/.env.local` now contain only the authorized DEV URL and publishable key. Web variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Native: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Client config rejects privileged/legacy keys; none were written to source or output. Restart Vite/Expo after environment changes.

The hosted project initially had Site URL `http://localhost:3000` and no callback allowlist. DEV configuration now uses Site URL `http://127.0.0.1:5174` and exactly these redirects, without wildcards:

- `http://127.0.0.1:5173/auth/callback`
- `http://127.0.0.1:5174/auth/callback`
- `minierp://auth/callback`

Local `supabase/config.toml` does not automatically configure the hosted project. Its local site remains port 5173 with the same callback paths. No production URL was changed.

Hosted email/password is enabled; phone, anonymous, manual identity linking and social providers remain disabled. The final provider review found the hosted six-character minimum and secure-password-change OFF differed from local config. DEV now enforces minimum 8 and secure password change ON; secure email change remains ON. A real seven-character signup was rejected with HTTP 422 weak_password and an eight-character-minimum message, creating no record. Leaked-password protection is unavailable on the current plan and was not enabled; no paid upgrade. Hosted public Auth settings confirmed signup enabled and email confirmation enabled at closeout. Initial signup with reserved example.com was rejected (`email_address_invalid`); the user supplied a controlled inbox. With confirmation enabled, an earlier signup attempt hit HTTP 429 `over_email_send_rate_limit`; no account/session/business was manufactured for that failed attempt. A later user-run test on 20 October successfully received and opened the confirmation email; the account remained inaccessible before confirmation and became accessible after the confirmation link was opened. The result is manual DEV-web evidence, not production email-deliverability proof.

The user explicitly approved a temporary DEV-only Confirm email OFF window. Auth settings confirmed `mailer_autoconfirm=true`. One direct Auth diagnostic signup and one fresh web signup using the controlled inbox's plus-alias succeeded. After those tests, Confirm email was restored ON in the Dashboard and independently checked through public Auth settings (`mailer_autoconfirm=false`). No SMTP, rate-limit or production protection was weakened. Test credentials were generated temporarily, never logged or added to source, and removed with the fixtures.

## Actual web verification

Browser: in-app Chromium, local Vite `http://127.0.0.1:5174`, connected directly to hosted DEV.

| Check                                                     | Result / observed evidence                                                                                                                                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signup/login/recovery screens                             | PASS, Bangla/English labels and honest errors                                                                                                                                                               |
| Real email/password web signup                            | PASS during approved DEV confirmation-OFF window; new Auth/profile rows and session                                                                                                                         |
| Confirmation-enabled signup failure                       | PASS error handling for hosted HTTP 429; no fake success/session/business                                                                                                                                   |
| Successful confirmation-required/no-session signup branch | PASS: user manually observed no account access before Gmail confirmation; account opened after clicking confirmation link (20 Oct DEV web)                                                                  |
| Login / invalid password                                  | PASS; invalid attempt stayed signed out; correct credentials loaded the account                                                                                                                             |
| Zero memberships                                          | PASS; new authenticated user reached onboarding; no premature business                                                                                                                                      |
| Initial onboarding RPC                                    | PASS through web; one business, authenticated actor OWNER/ACTIVE, settings bn/BDT/Asia/Dhaka/negative stock false                                                                                           |
| Session / tenant reload                                   | PASS; full reload recovered the same business through authenticated membership                                                                                                                              |
| Sign out / direct hash protection                         | PASS; tenant removed; direct #sales and reload stayed behind login                                                                                                                                          |
| Language persistence                                      | PASS; profile en survived reload; business default remained bn                                                                                                                                              |
| Demo isolation                                            | PASS; separate labeled samples contained no live test account/business; demo bn switch returned to account en                                                                                               |
| Recovery request                                          | PASS truthful HTTP 429 failure handling; a later user-run request delivered a reset email (20 Oct DEV web)                                                                                                  |
| Confirmation callback / reset callback / new password     | PASS by user report: confirmation link required before access; fresh reset link opened reset form, matching passwords updated successfully, old password failed and new password logged in (20 Oct DEV web) |
| Auth layout                                               | PASS at 390×844 and 1440×900, no page-wide horizontal overflow; viewport override reset                                                                                                                     |
| Captured console                                          | No application exceptions or warnings observed; temporary diagnostic removed                                                                                                                                |
| Follow-up project validation after auth/recovery updates  | PASS: Prettier, ESLint, Web/Mobile/Shared TypeScript, 14/14 tests, Web build and Android Expo export (20 Oct local run)                                                                                     |

Prior unconfigured-client checks remain valid: disabled submissions, no fake success, direct hash gate and separate demo were inspected before public config existed. Phase 1's real Chrome zoom/navigation/scroll evidence remains historical; viewport changes here are not new zoom or device tests.

## Auth, session and language implementation

Email/password only; phone is optional contact data. Signup metadata provides display/form defaults, never authorization. Immediate-session and confirmation-required/no-session outcomes are separate. Recovery uses normal Supabase email/PKCE callbacks and password update. Accepted requests do not claim delivery. Production SMTP remains later deployment work.

Web SDK persists sessions in normal browser storage with PKCE callbacks. Android uses compatible AsyncStorage, processLock, lifecycle-aware refresh and `minierp://auth/callback` code exchange. This is sandboxed persistence, not a claim of encrypted token storage. Passwords remain transient form/SDK input; no second password store or custom JWT authorization.

Auth events clear old user/profile/tenant state synchronously before deferred SDK operations. Generation guards invalidate stale requests; session loading is followed by getUser, own ACTIVE memberships and RLS-permitted business/settings/grants. Zero memberships -> onboarding; one -> automatic selection; multiple -> explicit selector. A cached business ID never proves membership. Transient failures block tenant content; sign-out failures show an error and permit retry.

Profile preferred_language (bn/en, default bn) controls the account, then business default, then bn. Preference updates affect only self. The isolated demo inherits display language and switches independently. No V3 localStorage is read.

## Schema and authorization

Tables: profiles, businesses, business_members, business_member_permissions, business_settings. All five have RLS; 12 policies and explicit column grants were inspected on hosted DEV. UUID PKs, timestamptz instants, non-destructive FKs, membership uniqueness, OWNER/STAFF and ACTIVE/INACTIVE checks, bn/en checks, BD/BDT/Asia/Dhaka and negative-stock-false constraints are present. No financial/operational table exists.

RPC: `public.create_initial_business(uuid,text,text,text,text) -> uuid`. Private functions: touch_updated_at(), create_profile() Auth trigger, is_member(uuid), is_owner(uuid), owns_staff(uuid), reads_permissions(uuid). Safe empty search_path, qualified references and minimal execution grants; private schema is outside the Data API. Hosted platform also supplies public.rls_auto_enable. No platform bypass or audit-event application table.

Onboarding derives actor from auth.uid()/auth.role(), uses a per-user transaction lock and unique (created_by,onboarding_key), and atomically ensures profile + business + OWNER + settings. Same key/business payload returns the original ID; different business input rejects. An active member cannot use another key to repeat initial onboarding. The UI freezes uncertain payload/key for retry. Future additional-business creation/ownership transfer requires a separate reviewed flow.

Owner can update only own business name/contact/default language, add an existing Auth UUID as STAFF, change own Staff status, and grant/revoke allowlisted permissions. Owner rows are client-immutable. Staff optional grants default deny and inactive membership loses access. PLATFORM_DEVELOPER is not a merchant role. The shared can() function is presentation convenience, never enforcement.

`database.types.ts` remains a deliberately narrowed hand-maintained client contract. Hosted `gen types typescript --linked --schema public` succeeded; columns, nullability and RPC inputs were compared. Raw output is ignored at artifacts/phase2a-hosted-types.ts. Narrow write types and literal constraints are intentional; generated TypeScript alone does not describe SQL column grants or CHECK constraints.

## Automated checks and security

The previous hosted-check record passed Prettier, ESLint, all workspace TypeScript, **11/11 shared/client tests**, web production build and Android Metro/Hermes export. Following the later auth/recovery changes, the user's latest local `npm run check` output passed Prettier, ESLint, all workspace TypeScript, **14/14 tests**, web production build and Android Expo export on 20 October 2026. The original three tests remain retained; SDK doubles verify client transitions, not database isolation. The historical hosted-check log is `artifacts/phase2a-hosted-check.log`; it should not be confused with the later 14-test run. Export emitted only the existing NO_COLOR/FORCE_COLOR warning. Supabase generated `.temp`/`.branches` caches are excluded from formatting.

Current audit: **22 transitive findings, 15 high, 7 moderate, 0 critical**; unchanged baseline. artifacts/phase2a-hosted-audit.json. Expo install --check PASS. Audit's proposed Expo 44.0.6 remediation is incompatible with Expo 58/RN 0.88; no force fix, override, downgrade or unrelated major update. No force fix, override, downgrade or unrelated major framework upgrade was applied. A root `@types/node@^24.19.2` dev dependency was added for Node test typings and `package-lock.json` updated; the dependency findings have not yet been re-audited after that change. Advisories require compatible upstream reassessment before production.

Real env files/cache/builds/artifacts are ignored; only `.env.example` files are tracked. Credential scan and Git/reference checks are recorded in `status.md`. The Phase 2A auth/recovery and documentation closeout was committed as `181f644`. No production credentials or deployment were introduced. The latest local audit showed no configured Git remote (`git remote -v` was empty). Phase 2B planning audit is underway, but no Phase 2B code or migration exists yet.

## Remaining gates

- Web DEV confirmation-required signup and recovery/password update were subsequently verified manually on 20 October. Keep this evidence scoped to the tested local web callback and hosted DEV project. Production SMTP, sustained deliverability, quota behavior over time, and native/mobile email callbacks remain unverified. Restored confirmation remains enabled.
- Local clean migration reset/rebuild remains unavailable. Hosted tests are not equivalent to a clean rebuild. Cloud CI may be considered later if explicitly needed; none was added here.
- Android device/emulator, custom-scheme confirmation/recovery, native session persistence, Back/keyboard/large text/TalkBack and APK behavior remain deferred. Export/type checks are not device proof; Expo Go alone does not prove custom-scheme callbacks.
- Invitations/ownership transfer UI, deliberate extra-business creation, operational product/party CRUD, posting/stock/payments/expenses/reports, invoice generation, estimator persistence, audit engine, Storage, billing, gateways, notifications, offline sync and deployment remain outside Phase 2A.

**Phase 2A web DEV email-flow gate: PASS by user-reported manual E2E verification; production readiness: NO.** Local clean migration reset/rebuild and physical Android/native callback/session/accessibility checks remain deferred. Production SMTP/deliverability is also unverified. The user has directed the project to proceed to the next stage, and read-only Phase 2B planning is underway. Before creating a migration, product/category/unit and customer/supplier fields, purchase-price visibility, archive/restore rules and database permission tests must be settled. No Phase 2B schema or application code has been implemented yet.

Official implementation references: [password Auth](https://supabase.com/docs/guides/auth/passwords), [React Native Auth](https://supabase.com/docs/guides/auth/quickstarts/react-native), [native deep links](https://supabase.com/docs/guides/auth/native-mobile-deep-linking), [database testing](https://supabase.com/docs/guides/database/testing), [CLI reference](https://supabase.com/docs/reference/cli).

## Phase 2A handoff inventory (historical)

The list below records the **37 changed/new files** (24 modified, 13 created) in the Phase 2A handoff inventory relative to the Phase 1 baseline. That inventory is historical and is preserved by the original handoff commit `f126319`; it does not describe the current working tree. The subsequent auth/recovery and documentation closeout touched 12 files and was committed as `181f644`. The latest user-provided post-commit status showed a clean working tree.

- Root: .prettierignore, AGENTS.md, README.md, package.json, package-lock.json.
- Web: apps/web/.env.example; src/App.tsx, FoundationApp.tsx, main.tsx, styles.css.
- Mobile: apps/mobile/.env.example, App.tsx, FoundationApp.tsx, app.json, index.ts, package.json.
- Shared: packages/shared/package.json; src/index.ts, auth.ts, auth-text.ts, database.types.ts, permissions.ts; tests/auth.test.ts.
- Canonical database: supabase/.gitignore, config.toml, migrations/20261019000100_identity_tenancy.sql, tests/database/identity_tenancy.test.sql.
- Documentation: database/migrations/README.md; docs/api.md, architecture.md, delivery.md, permissions.md, requirements.md, sources.md, status.md, phase2a.md, phase2a-db-evidence.md.

Actual .env.local files, CLI link/cache files and artifacts/builds are ignored and are excluded from that review inventory. Immutable docs/reference files are unchanged.
