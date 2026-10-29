# Hosted Phase 2A database evidence

Executed 19 October 2026 (Asia/Dhaka) against **mini erp dev**, project ref `jujwnhwrktmimtcnljsd`, PostgreSQL 17.11. No production target, Docker, CI, commit or schema weakening.

Migration `20261019000100` matches local and remote history. Hosted lint found no schema errors. Catalog inspection confirmed five RLS-enabled application tables, 12 policies, six private helpers/trigger functions, the authenticated onboarding RPC, OWNER/STAFF-only constraint and fixed Bangladesh defaults. The hosted platform also supplies `public.rls_auto_enable`; it is not a second application RPC.

## Execution method

CLI 2.121.0 supports `npx supabase db query --linked --file <sql>` through the Management API, without Docker. Running the original test file returned only its final `finish` result (`1..55`), so a result collector was required to retain every assertion.

The ignored `artifacts/phase2a-hosted-captured.sql` is derived from the canonical test file: after BEGIN/search_path, create a temporary `(seq bigserial, line text)` table and grant INSERT/SELECT/sequence usage to the simulated test roles. Prefix each top-level SELECT with INSERT into that temporary table. Before the original ROLLBACK, reset role and SELECT json_agg(line order by seq). This preserves all 55 assertions, SQL role/claim changes and rollback. No assertion was replaced, weakened or skipped. Setup now restricts settings fixtures to the two synthetic business IDs so unrelated DEV records are never included.

The original run and both collected runs executed; the final canonical-suite run has **55 passed, 0 failed**, plan `1..55`. Complete local output: `artifacts/phase2a-hosted-pgtap.json`. SQL and captured output are ignored artifacts; the TAP lines below are preserved for review.

## Rollback verification

Before tests: zero Auth users and businesses. A separate connection after the collected run counted zero users, profiles, businesses, memberships, permissions and settings, and zero `test_failure` triggers. A further check after the final rerun again confirmed no SQL fixture IDs or injected trigger. Thus SQL test fixtures did not persist. Separate web Auth fixtures (two test users, one DEMO business) were later created and removed under exact metadata/count guards; all six application/Auth counts returned to zero. Hosted service/audit logs were not purged.

These tests exercise actual database roles/claims. They do not prove browser email delivery, Android runtime behavior, a clean local migration rebuild, concurrent financial posting, or future module permissions.

## Actual TAP results

```text
ok 1 - RLS enabled on all five exposed tables
ok 2 - anonymous cannot execute onboarding
ok 3 - onboarding has only request/name/contact inputs
ok 4 - no caller-selected owner identity signature
ok 5 - Owner A reads own business
ok 6 - Owner A cannot read B
ok 7 - profiles scoped to current user
ok 8 - own language can change
ok 9 - cannot update another profile
ok 10 - Owner A adds existing user as Staff in A
ok 11 - Staff starts with no optional grants
ok 12 - Owner A cannot manage B membership
ok 13 - Data API cannot add another Owner
ok 14 - Owner A cannot grant permissions to B Staff
ok 15 - creator identity is immutable to clients
ok 16 - Owner grants allowed Staff permission
ok 17 - Owner controls own settings
ok 18 - Owner A cannot update B settings
ok 19 - negative stock cannot be enabled through client
ok 20 - Owner cannot deactivate last/self Owner
ok 21 - business creation cannot bypass RPC
ok 22 - Owner B cannot read A
ok 23 - Owner B settings are tenant scoped
ok 24 - B cannot read A membership
ok 25 - active Staff A can read A
ok 26 - Staff A cannot read B
ok 27 - Staff settings remain tenant scoped
ok 28 - Staff sees own explicit grant
ok 29 - Staff cannot promote self
ok 30 - Staff cannot grant self permission
ok 31 - Staff cannot update business settings
ok 32 - Staff cannot update business
ok 33 - Staff cannot modify membership
ok 34 - Owner revokes Staff membership
ok 35 - old Staff identity cannot read after revocation
ok 36 - revoked Staff cannot read grants
ok 37 - anon cannot read profiles
ok 38 - anon cannot read businesses
ok 39 - anon cannot read members
ok 40 - anon cannot read permissions
ok 41 - anon cannot read settings
ok 42 - RPC rejects missing auth.uid even with authenticated role
ok 43 - authenticated onboarding works
ok 44 - same request can safely retry
ok 45 - retry creates only one business
ok 46 - only authenticated actor receives Owner
ok 47 - onboarding creates defaults atomically
ok 48 - key cannot be reused with different business input
ok 49 - reload/different key cannot duplicate initial onboarding
ok 50 - membership schema permits future multi-business users
ok 51 - required settings failure aborts onboarding
ok 52 - failed onboarding leaves no business
ok 53 - failed onboarding rolls back profile creation
ok 54 - failed onboarding leaves no membership
ok 55 - no orphan business hidden by RLS
1..55
```
