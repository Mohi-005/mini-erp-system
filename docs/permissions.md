# Intended permission matrix

Phase 2A implements database-enforced identity/tenant policies and client convenience helpers. Hosted DEV RLS tests executed on 19 October 2026: **55/55 passed, 0 failed**, with independent rollback/fixture-absence checks. See phase2a-db-evidence.md. The business-module matrix below remains a future feature contract, not operational authorization for unimplemented modules.

U4 freezes business roles to OWNER and STAFF only. OWNER controls their own business; STAFF is one role with individually configurable capabilities. Customer/Supplier and business type are not application roles. U5 freezes all optional Staff grants to DENY until explicitly granted by an Owner, superseding earlier On defaults. Supabase Auth identifies users; tenant RLS plus database/server permission checks enforce access. No frontend visibility check substitutes for authorization.

| Capability                                          | Owner in own business | Staff proposed default / grant                                               | Platform principal                        |
| --------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------- | ----------------------------------------- |
| Product/customer lookup                             | Yes                   | Off / products.view, customers.view                                          | No merchant access by default             |
| Sell; view own sale/invoice                         | Yes                   | Off / sales.create, invoices.read                                            | No                                        |
| Purchase; supplier lookup                           | Yes                   | Off / purchases.create, suppliers.view; requires cost visibility             | No                                        |
| Create/edit/archive/restore products, parties       | Yes                   | Off / individual catalog or party grants; archive limits to decide           | No                                        |
| Receive dues / pay supplier                         | Yes                   | Off / payments.receive, payments.pay independently                           | No                                        |
| Add expenses                                        | Yes                   | Off / expenses.create                                                        | No                                        |
| View costs, valuation, profit/reports               | Yes                   | Off / costs.read, inventory.value.read, profit.read, reports.view separately | No                                        |
| Price override / discount                           | Yes                   | Off / independent bounded grants                                             | No                                        |
| Stock count/adjustment                              | Yes                   | Off / inventory.adjust with reason                                           | No                                        |
| Return, cancel, correct, refund, openings           | Yes with reason       | Owner-only proposed for MVP                                                  | No routine support write                  |
| Estimator manual inputs                             | Yes                   | Off; future cost autofill requires costs.read                                | No merchant access                        |
| Business settings, invitations, staff grants, audit | Yes                   | No                                                                           | Platform configuration only               |
| Own language/account/logout                         | Yes                   | Yes                                                                          | Own account only                          |
| Tenant management, billing, releases, support       | No platform rights    | No platform rights                                                           | Separate capabilities; billing scope open |

Future acceptance: Owner cannot access another business; revoked membership/grants block the next request even with an old token; Staff cannot escalate privileges or edit another member; last Owner cannot be removed; all child references/exports/files/status lookups are tenant checked. Platform access uses separate routes/principals and audited, time-bounded support grants if approved. No blanket Owner impersonation. Permission previews are presentation examples only.

PLATFORM_DEVELOPER is an internal platform concept, separate from merchant memberships. Future responsibilities may include releases, upgrades, migrations, feature flags, technical configuration, monitoring, platform billing configuration, localization/defaults, maintenance and support tooling. This does not automatically grant merchant financial-data access. Any future support access requires a controlled, auditable, time-bounded mechanism. No support impersonation is implemented or authorized in Phase 1.

## Phase 2A enforcement

Only OWNER and STAFF are database role values. PLATFORM_DEVELOPER is not a membership role and has no database bypass. The shared can() helper is display convenience; unknown/inactive roles deny. OWNER authority is inherent, without dozens of grant rows. Staff has zero optional permissions by default.

All five public application tables have RLS enabled and explicit grants. Profiles are self-only. Active membership authorizes business/settings/team reads. Owner can update only own business contact/name and default language; fixed currency/timezone/negative stock and creator/identity fields have no client update grant. Owner can add an existing Auth UUID as STAFF and change Staff ACTIVE/INACTIVE status. Owner rows cannot be modified or deleted through the Data API, preserving the last Owner until a later reviewed ownership flow. No Staff-management/invitation UI is implemented.

Permission rows reference immutable member IDs; Owner may grant/revoke only on own Staff, Staff may read only own grants, and inactive members lose tenant/grant access even with an old token. Private security-definer helpers use safe empty search_path, explicit qualified references, auth.uid() and minimal EXECUTE grants. Private schema is excluded from the Data API. No recursive membership policy.

The concise allowlist is defined in packages/shared/src/permissions.ts and checked in SQL: sales.create, purchases.create, products.view/manage, customers.view/manage, suppliers.view/manage, reports.view, prices.change, corrections.create, payments.receive/pay, expenses.create, inventory.view/adjust, inventory.value.read, costs.read, profit.read and invoices.read. These are future capability contracts; no corresponding operational modules exist. Future module policies must enforce their grants in the database, not merely reuse can() in React.

Tests in supabase/tests/database/identity_tenancy.test.sql executed against authorized mini erp dev through Docker-free CLI hosted SQL, preserving BEGIN/ROLLBACK and all assertions. They exercise actual database roles/claims, cross-tenant denial, escalation, revocation and atomic onboarding. Client unit tests remain separate evidence. No audit-event application table or financial audit engine is added in Phase 2A. Local clean reset remains unavailable; live email callbacks and Android runtime are not proven by these SQL tests.
