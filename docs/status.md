# Current Mini ERP Project Status

Updated 21 October 2026 (Asia/Dhaka). This is the current status summary; older phase-specific reports remain historical evidence and should be read with their recorded dates.

## Current stage

**Phase 2C.1 — Quantity-only Inventory Ledger is installed in the local working tree and its migration has been applied to the authorized hosted DEV project.** The user reports that the inventory UI manual test was completed successfully. This is not a claim that the complete ERP or a production release is ready.

## Verified earlier foundation

- Phase 2A Supabase identity/tenant foundation, email/password web authentication, tenant selection, onboarding, recovery and password update have documented hosted DEV and user-run browser verification.
- The authorized development Supabase project is `mini erp dev`, project ref `jujwnhwrktmimtcnljsd`. Production is not an authorized target for these development migrations.
- Phase 2A hosted security tests recorded 55/55 pgTAP assertions passing, with rollback/fixture-absence checks. Local clean database reset/replay and physical Android QA remain unverified.
- Phase 2B adds tenant-scoped product categories, units, products, customers, suppliers and protected current purchase-reference prices, plus archive/restore and explicit RLS/permission policies.
- The Phase 2B master-data migration and archived-product-reference correction migration were applied to the authorized DEV project. The user reran `master_data.test.sql` and `master_data_regressions.test.sql`; the CLI displayed `finish` plans `1..47` and `1..6` with no visible failure diagnostic. This particular CLI output does not show each assertion row individually.
- The user has manually tested the Master Data page's key record workflows and reported that they worked correctly.
- The inventory migration `20261021000200_inventory_ledger.sql` was applied to the authorized DEV project after migration-list verification. Local and remote history matched through `20261021000200` at the latest reported check.

## Latest local checks reported by the user

| Check                              | Latest reported result                        | Limitation                                                                                    |
| ---------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Prettier format check              | PASS                                          | All matched files use Prettier style                                                          |
| ESLint                             | PASS                                          | `npm run check` reached later steps with no lint errors                                       |
| TypeScript typecheck               | PASS across web, mobile and shared workspaces | Validates types, not remote database behavior                                                 |
| Shared automated tests             | PASS: 30 passed, 0 failed                     | Shared unit tests only; not a complete operational ERP test                                   |
| Web production build               | PASS                                          | Vite emitted a non-blocking 565.76 kB JavaScript chunk warning above 500 kB                   |
| Android export                     | PASS                                          | Expo exported an Android bundle; this is not proof of physical-device behavior                |
| `master_data.test.sql`             | CLI displayed `finish` plan `1..47`           | No failure diagnostic visible; individual assertion rows were not included in that CLI output |
| `master_data_regressions.test.sql` | CLI displayed `finish` plan `1..6`            | No failure diagnostic visible; individual assertion rows were not included                    |
| `inventory_ledger.test.sql`        | CLI displayed `finish` plan `1..34`           | No failure diagnostic visible; individual assertion rows were not included                    |
| Manual Inventory UI                | User reports successful completion            | User-confirmed UI check; not a full tenant-isolation/network-failure/device E2E suite         |

`npm run check` completed all its defined stages successfully: format, lint, typecheck, 30 unit tests, Web production build and Android export. Do not infer production readiness from these checks alone.

## Phase 2C.1 — installed quantity-only Inventory Ledger

The DEV migration and UI integration are now in place according to the user's command results. This increment includes `inventory_balances`, append-only `inventory_movements`, one-time opening-stock RPC, reason-required manual IN/OUT adjustments, RLS and database permission checks, product-insert balance trigger/backfill, shared validation and a web stock screen. User reports the manual UI check succeeded.

**Remaining inventory scope:** quantity valuation/COGS, movements automatically posted by purchase/sales documents, full history pagination/date filtering, and the complete reporting module are not completed by this increment. Do not treat reference purchase prices as actual historical cost or claim stock valuation/profit until costing and posting policies are approved and implemented.

## Important product rules to preserve

- Keep the approved stack: React/TypeScript/Vite web, Expo/React Native Android, shared Supabase Auth/Postgres, strict tenant RLS.
- Do not weaken OWNER/STAFF boundaries or default-deny Staff grants.
- Do not store authoritative stock/payment balances in React state or browser storage.
- Do not allow direct client writes to inventory balances/ledger. Financial document posting belongs in atomic PostgreSQL RPCs.
- Negative stock stays disabled. Every manual stock adjustment requires a reason.
- The stock ledger tracks quantities only in this phase. Do not present reference purchase price as actual historical cost or claim stock valuation/profit until the costing policy and posting engine are implemented.
- Demo/sample transactions remain visibly synthetic and isolated from live business data.
- Never modify `docs/reference/**`; preserve original Version 3 material as immutable evidence.
- Do not commit or deploy until the user explicitly approves after verification.

## Remaining product phases

1. Close out Phase 2C.1 evidence and start the Sales design/policy acceptance gate; do not guess open financial rules.
2. Implement atomic Sales posting with stock-out, initial payment/due, immutable snapshots and duplicate-safe retries.
3. Implement atomic Purchase posting with stock receipt and supplier payable, after freight/charge allocation policy is approved.
4. Implement a separate payment ledger, customer collections, supplier settlements, allocations and party statements.
5. Add returns/cancellation/correction as linked reversals and an auditable history; no destructive rewrite of posted records.
6. Generate searchable, bilingual invoices with print/PDF/reprint once tax/printing launch scope is fixed.
7. Add expenses and the isolated estimator.
8. Connect dashboard/reports/shop directory/settings to actual persisted business data; no fake KPIs.
9. Complete Web/Android integration, staff/permission flows, tenant-security and E2E tests, device/accessibility QA, backup/restore, monitoring and release readiness.

## Release blockers / deferred verification

Production SMTP and deliverability, local clean migration replay, physical Android/device callbacks/session persistence, full accessibility and device tests, dependency advisory reassessment, backups/restore tests, and production deployment remain unresolved gates. No production migration or deployment is authorized by this status document.
