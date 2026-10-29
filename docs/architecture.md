# Architecture decision register

## Approved MVP architecture (ADR-001, FROZEN 18 October 2026)

U4 selects **Supabase**, superseding Express/TypeScript proposals in R §§32–34, P p.59, Q D01 and B §1. U5 authorizes Phase 2A identity/tenant migrations, RLS, atomic onboarding and web/mobile auth clients. U6 authorizes hosted DEVELOPMENT verification, superseding the local-only environment restriction. Version 3 remains visual evidence only. See phase2a.md for executed checks and remaining limitations.

| Concern                       | Approved boundary                                                       |
| ----------------------------- | ----------------------------------------------------------------------- |
| Shared platform / database    | Supabase / Supabase PostgreSQL                                          |
| Identity                      | Supabase Auth; never maintain a second password store                   |
| Tenant isolation              | PostgreSQL Row Level Security (RLS), membership and permission checks   |
| Normal reads / simple CRUD    | Supabase Data API / supabase-js, protected by RLS                       |
| Critical financial operations | Transactional PostgreSQL functions exposed through RPC                  |
| Files                         | Supabase Storage with private bucket/object policies                    |
| Special server operations     | Supabase Edge Functions only where necessary                            |
| Separate Express server       | Not used for MVP; reconsider only for a demonstrated future requirement |

This gives web and Android one backend, reduces MVP infrastructure, integrates identity/files, and places tenant isolation at the database boundary. PostgreSQL remains portable, and the architecture can later be extended or self-hosted. RLS and transactional RPC require careful policies, function privileges, validation and cross-tenant tests; they do not guarantee security by themselves.

Phase 1 is preserved at commit `278d655`; the active handoff branch is `handoff/phase2a` at `f126319`. Only the Phase 2A identity/tenancy foundation is implemented. Authorized hosted DEV is mini erp dev (`jujwnhwrktmimtcnljsd`): migration applied, hosted lint PASS, 55/55 database assertions PASS, core web Auth/onboarding PASS. User-reported manual DEV-web tests on 20 October verified confirmation-required signup and the full recovery/password-update flow. Production, deployment, operational tables and financial RPCs remain unauthorized. Local clean reset is unavailable; production SMTP/deliverability and Android/native runtime remain unverified. Hosted execution is distinct from a clean migration rebuild.

## Decision register

| ID      | Status                        | Decision and implementation gate                                                                                                                                                                                                                                                                             |
| ------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ADR-002 | Confirmed U1/R                | React/TS/Vite web, React Native/Expo/TS Android; one future shared backend/database. npm workspaces organize apps and shared code.                                                                                                                                                                           |
| ADR-003 | Frozen U4                     | Merchant roles are OWNER and STAFF only; Staff permissions are individually configurable. PLATFORM_DEVELOPER is a separate internal platform concept, never a merchant role or automatic financial-data access. Business type is metadata; Customer/Supplier are trading parties.                            |
| ADR-004 | Frozen U5                     | Supabase email/password, minimum 8 characters in local config and hosted DEV; normal email confirmation/recovery. Phone is optional contact data, not identity. No SMS/social/paid provider. Normal web PKCE session storage and Expo-compatible AsyncStorage session persistence; production SMTP deferred. |
| ADR-005 | Proposed, open                | Moving weighted-average inventory costing per Q D03. Compare FIFO/weighted cost and freight/return rules with merchant review before costing schema. Catalog price is never historical cost.                                                                                                                 |
| ADR-006 | Frozen default U4             | Negative stock is disabled by default. Any future opt-in policy and revaluation consequences need explicit approval before implementation.                                                                                                                                                                   |
| ADR-007 | Open                          | Platform billing: requirements, subscriptions, collections and provider unselected. Q exclusion is a proposal. No billing integration.                                                                                                                                                                       |
| ADR-008 | Open                          | Launch merchant types, single location versus branches, tax/invoice obligations, pricing tiers and lot scope; Q D05/D09/D11/D13 remain proposals.                                                                                                                                                            |
| ADR-009 | Provider frozen; DEV verified | Supabase supplies database/Auth/Storage. U6 authorizes mini erp dev in Tokyo/ap-northeast-1 for verification only. Production region, SMTP, backup/restore, budget and retention remain release decisions. No paid service or deployment authorized.                                                         |
| ADR-010 | Confirmed U1                  | Server-authoritative decimal money; atomic documents/stock/payments/balances/audit; permanent IDs/snapshots; stock and party/payment ledgers; persistent operation identity; concurrency protection; tenant isolation; immutable posted records with linked corrections; archive/restore.                    |
| ADR-011 | Proposed                      | Numeric widths, six-decimal quantities, half-up rounding/residual allocation, freight capitalization, payment allocation order, advances, periods/backdating, return variances from Q §§7–13. Must be accepted with fixtures before financial implementation.                                                |
| ADR-012 | Phase 2A authorized U5/U6     | Supabase identity/profile/business/membership/permission/settings foundation, RLS, onboarding and auth clients, with hosted DEV verification. No Phase 2B, financial engine, Storage buckets, production, app deployment or commit.                                                                          |
| ADR-013 | Implemented technical choice  | Small plain CSS token system instead of preferred Tailwind: preserves V3 CSS vocabulary without extra runtime/configuration. No competing UI framework. Locally bundled Hind Siliguri/Manrope on web; native system font fallback needs device shaping verification.                                         |
| ADR-014 | Proposed                      | Persistent drafts, online financial confirmation, saved scenario formulas, support grants, ownership transfer, RPO ≤15m/RTO ≤4h, load/usability targets from Q/D. Deferred until relevant gate; not implemented guarantees.                                                                                  |

## Reconciliation of material conflicts

- P M02–M04/p.60 suggest a local password table and development reset-code logs. Managed identity must not coexist with a second password store. Real recovery and session invalidation must be designed and tested; never expose reset codes in production.
- P M41 writes toggles to shared role permissions. U1 requires per-member grants; changing one Staff member must not affect another. P M42's example roles cannot add merchant roles.
- P M18 values stock using average/latest catalog purchase prices. U1 requires historical costs and inventory movements. Costing choice remains open; Q's weighted-average policy is not silently adopted.
- R §§13–15/P M23/W06 label transport separately from gross profit; Q capitalizes freight. Keep source examples as evidence; approve consistent estimator/report labels and cost classification before calculation work. Unexplained P scenario numbers are not reliable fixtures.
- P M30's short duplicate window cannot satisfy U1 persistent operation identity. Retries remain the same operation after timeouts/restarts and must not become new payments.
- P M22 DELETE expense and simplistic cancellation flows are superseded by U1 linked corrections, including settlement effects. Real refunds differ from reversing mistaken entries.
- P M07 duplicate name+unit blocking, P M29 unique phone, Q SKU-only uniqueness/phone warning, and V's required shop owner/phone/code differ. Decide catalog/party validation before master-data forms. Optional English product name is confirmed by R and U1.
- U5 resolves language ownership: profiles.preferred_language (bn/en, default bn), then business_settings.default_language (bn), then bn. Account language writes only the signed-in user's profile; sample language stays isolated. No blanket business preference overwrite.
- V shop directory extends the original customer UI; retain its backlog and exact code filter, detail/edit/archive/restore needs. A trading partner's shop is not a tenant membership or business type role. Supplier/customer ledgers stay distinct.
- V destructive product deletion, array references and local balance mutations are reference defects, never foundations for production writes. Original sources remain unchanged.
- Mobile starts now per U1, superseding R's later mobile phase. U3 authorizes clearly labeled synthetic visual totals and fixed scenarios. V's auth/local financial mutation engine is excluded.

## UI design reconciliation

V3's green `#135b43`, ink `#213b32`, mint `#e8f3ec`, white cards, soft gray background and rounded labeled controls are retained. Muted text is darkened for contrast. Hind Siliguri handles Bangla and Manrope Latin text; fonts are local web assets. Desktop sidebar becomes Home/Sales/Stock/Estimator/More navigation on small screens. U3-approved compositions include a sample dashboard/chart/history, product cards/fixed baskets, stock tables, directory, expense forms, estimator and invoice previews. Persistent demo labels identify every synthetic financial snapshot. No interaction posts, saves or calculates an operational transaction. Shared minimum type roles are 16px body/control/table, 14px supporting, 22px section, 30px page and 32px figures, expressed in rem on web. Native text keeps system scaling; device verification remains required.

## Security and transactional contract for Phase 2+

- Supabase Auth owns credentials. Never store plaintext passwords. Never ship service-role/secret keys to web or mobile; secret environment variables belong only in trusted server environments. Public client configuration is not authorization.
- Enable strict tenant RLS on tenant data. Membership must be checked against the authenticated identity; a client-provided `business_id` is a scope request, never proof of access. Validate parent/child references, permissions and revoked membership in the database/server on every applicable operation. No frontend-only authorization or cross-business access.
- Validate inputs and enforce database constraints, least-privilege function execution, secure sessions, audit logs and private Storage policies. Any privileged RPC must use a safe search path and explicit tenant/permission validation. Clients cannot bypass financial RPC by directly editing affected ledgers or balances.
- Money uses PostgreSQL NUMERIC, never floating point. Decimal precision, rounding, costing and allocations still require approved fixtures. Posted financial history is retained; important corrections use linked reversal/correction records. Masters archive/restore instead of destroying referenced history.
- Idempotency persists operation identity and request identity across retries/restarts. Duplicate financial requests must return the same authoritative outcome; ambiguous responses require status recovery, not a new posting.

## Inventory and atomic posting (design only)

`inventory_movements` is the traceable source history; `inventory_balances` is the fast current-state representation, reconciled to movements. Opening stock, purchase, sale, purchase return, sale cancellation/reversal and reasoned manual adjustment identify each movement. Direct stock overwrites are not the normal workflow. Negative stock is disabled by default; concurrency checks and balance updates belong inside the transaction.

A completed sale must atomically create the sale, sale_items, stock reduction, inventory movement, customer balance effect, applicable payment record, invoice record and audit log. A purchase must atomically create the purchase, purchase_items, stock increase, inventory movement, supplier payable effect, applicable payment record and audit log. Failure of any required part rolls back the logical posting. RPC owns the database transaction; an Edge Function must not split posting into independent Data API writes. A later printable file may be generated from the committed immutable invoice record with safe retries.

## Payment records and separate platform accounting

MVP payment methods: Cash, bKash, Nagad, Rocket, Bank, Card and Other, with an optional transaction/reference number. These record merchant business payments; direct gateway integrations require later official merchant/API arrangements. Never collect/store MFS PINs, OTPs, bank passwords, card CVV or financial credentials.

Platform revenue is a separate domain. Future concepts may include `platform_plans`, `business_subscriptions`, `platform_fee_rules`, `platform_invoices` and `platform_payments`. Do not mix platform fees into merchant sales/revenue/profit/expenses. A merchant subscription expense needs an explicit later business rule. Plans, fee calculation and collection remain unimplemented and undecided.

## Database directory transition

`database/` remains README-only historical documentation. Phase 2A makes `supabase/config.toml`, `supabase/migrations/` and `supabase/tests/database/` canonical. No operational seed, Edge Function or parallel migration runner. SQL fixtures are rollback-isolated; separate web Auth fixtures were removed after verification. CLI hosted `db query --linked` executed all 55 assertions through a temporary output collector without Docker. Local stack/reset remains unavailable; hosted migration history/lint/schema and runtime security are verified.

## Decisions remaining before affected Phase 2 work

U5 resolves email/password, Staff default deny and language ownership. Phase 2A loads own active memberships under RLS; zero leads to onboarding, one auto-selects, multiple require an explicit selector. Unknown/failed sessions expose no tenant context. Sign-out/account changes clear old context and invalidate in-flight loads. Database checks remain authoritative even when the UI has stale context.

Initial onboarding locks per authenticated user and atomically writes/ensures profile, business, OWNER and defaults. Same-key/same-business-input retries return the same ID; mismatched business data rejects. A second request key cannot create another initial business once active membership exists, including after reload. The schema permits multiple memberships; future deliberate business creation/ownership transfer requires a separate reviewed flow. Owner rows cannot be demoted/deactivated/deleted through current client grants.

Still open for later gates: production SMTP/deliverability; invitations/ownership transfer UI; production region/environments/budget; financial costing/precision/freight/allocations/returns; launch tax/device/printer scope; retention/restore targets and platform pricing. Hosted RLS and core web Auth passed, and confirmation/recovery/password-update flows were subsequently reported manually verified on DEV web. Phase 2B requires a separate explicit instruction and resolved catalog/party/unit scope. Local clean rebuild and native runtime remain separately unverified.
