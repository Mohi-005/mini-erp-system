# Mini ERP — architecture, data and API blueprint

Version 1.0 • 15 October 2026 • Companion to [requirements](MINI_ERP_REQUIREMENTS.md)

## 1. Architecture

```text
React web                 React Native / Expo Android
        \                 /
         HTTPS versioned Express API
         identity verification + membership + permissions
         shared validation + domain posting services
                  |
             PostgreSQL
         transactions / constraints / tenant isolation
                  |
         outbox → document/background worker → private object storage

Separate platform administration → restricted platform API
External identity provider → verified identity, sessions, recovery
```

The API is the only operational write boundary. Clients never directly mutate stock, balances, costs, payments or invoice numbers. Shared TypeScript contracts/decimal functions support previews and estimator parity; the server remains authoritative. Do not duplicate live financial business logic in independent web/mobile implementations.

Retain the source's React/Vite/TypeScript, Expo and Express/PostgreSQL preference. Pin compatible supported versions during foundation and record them in lockfiles. Identity and hosting provider selection are gates, not invented integrations. If Supabase is selected later, document whether it supplies identity/storage/Postgres only or replaces API operations; never retain two conflicting posting paths or password systems.

Suggested repository:
```text
mini-erp/
  web/                  responsive application
  mobile/               Android application
  backend/              API, posting services, workers
  shared/               contracts, validation, decimal rules, translations
  database/migrations/  versioned schema and policies
  database/seeds/       synthetic demo fixtures
  tests/                integration, concurrency, security and end-to-end tests
  docs/                 decisions, setup, API, operations, rollout and recovery
```

## 2. Data model

All tenant-owned records include business_id; identifiers are immutable. Tables below list important fields, not exhaustive SQL. Add timestamps, actor references and necessary indexes. Global identity/platform records are the deliberate exception to tenant ownership. Tenant foreign keys must validate business_id together with the referenced ID.

| Domain | Entities and critical fields |
|---|---|
| Identity | user_profiles(id, provider_subject unique, display_name, preferred_language); no local password hash when managed identity is selected |
| Membership | businesses(id, name, type, timezone, currency, status, is_demo); business_members(id, business_id, user_id, role, status, permission_version); member_permissions(member_id, permission, limits); invitations(token_hash, intended_identity, expires_at, accepted_at) |
| Platform | platform_members(user_id, capabilities); support_grants(actor, business_id, reason, approved_by, expires_at); platform_audit_events; feature_flags |
| Configuration | business_settings(version, invoice_defaults, accounting_policy_version); categories; expense_categories; units(dimension, precision); payment_methods; reporting_periods |
| Catalog | products(id, SKU, name_bn, name_en, category_id, base_unit_id, default_buy_price, default_sell_price, min_qty, preferred_supplier_id, lot_tracked, status, archived_at); product_units(product_id, unit_id, factor, version) |
| Inventory | inventory_balances(product_id, base_qty, carrying_value, version); inventory_movements(product_id, signed_qty, signed_value, source_type, source_id, source_line_id, reversal_of, reason, effective_at); lots(product_id, batch_code, expiry); lot_movements and lot_balances |
| Parties | parties(id, name, normalized_phone, address); party_accounts(party_id, kind=customer/supplier); party_entries(account_id, signed_amount, entry_type, document_id, effective_date, reversal_of); party_balance_cache(account_id, balance, version) |
| Opening | opening_documents(cutover_date, status, reason); opening_stock_lines(product_id, qty, value, lot_id); opening_party_lines(account_id, signed_amount) |
| Sales | sales(customer_account_id nullable, subtotal, discount, charges, total, effective_date, state, policy_version, correction_of); sale_items(product_id, names_snapshot, unit_snapshot, conversion_snapshot, base_qty, unit_price, discount_share, net_line_total, cogs_value, unit_cost_snapshot); sale_lot_allocations |
| Purchases | purchases(supplier_account_id, goods_total, state, effective_date, policy_version, correction_of); purchase_items(product_id, qty/unit snapshots, net_goods_value, landed_value); purchase_charges(payee_account_id, amount, classification, settlement_state); charge_allocations(charge_id, purchase_item_id, amount) |
| Settlement | payments(direction, account_id nullable, method, amount, reference, effective_date, state, reversal_of); payment_allocations(payment_id, party_charge_entry_id, amount); credit_allocations(credit_entry_id, charge_entry_id, amount); refunds(payment_id, originating_credit_id, amount) |
| Adjustments | returns(kind, original_document_id, reason, state); return_items(original_line_id, qty, credit_value, inventory_value, disposition); correction_links(original_id, reversal_id, replacement_id); stock_counts(product_id, observed_qty, expected_version, reason, state) |
| Expenses | expenses(category_id, amount, effective_date, payee_account_id nullable, source_charge_id nullable, state, reversal_of); expense_settlements(expense_id, payment_id, amount); valuation_adjustments(source_id, signed_amount, category) |
| Documents | invoices(sale_id unique, series_id, number, issue_snapshot, issued_at, state); invoice_series(prefix, next_sequence); credit_documents; document_jobs; document_files(private_object_key, content_hash, template_version, language) |
| Estimator | estimates(owner_user_id, title, formula_version); estimate_scenarios(estimate_id, name, input_snapshot, calculated_snapshot); no operational posting hooks |
| Reliability | idempotency_requests(actor_id, operation, key, request_hash, state, result_reference, response, timestamps); audit_events(actor, action, entity, before, after, reason, request_id); outbox_events(type, payload_reference, attempts, status) |

Party debit/credit convention: positive balance means customer owes merchant for customer accounts, or merchant owes supplier for supplier accounts. Negative means advance/credit. Every entry type defines its signed effect explicitly. Payment allocations settle documents but do not themselves create a second party-ledger effect.

## 3. Required constraints and invariants

- Unique business membership; unique SKU per business; unique invoice series/number; one original invoice per sale.
- Tenant-aware foreign keys on every customer, supplier, product, category, document and allocation reference.
- Nonnegative ordinary quantities/amounts; signed effects allowed only through controlled ledger/reversal routines. Refunds/returns cannot exceed available original quantities or credits.
- Base stock cannot go negative. Lot quantity totals reconcile to product quantity when lot tracking is enabled.
- Inventory balance = sum of signed quantity/value movements; party balance = sum of signed party entries. Caches are repairable projections, never independent truth.
- Payment allocations plus unapplied amount equal the payment's available amount. Concurrent allocation cannot exceed charge outstanding or payment credit.
- Sale total equals allocated net line totals plus valid charges. Sum of cost/discount allocations equals parent cost/discount exactly.
- Corrections and reversals link to original records. Original posted payloads cannot be edited by ordinary database roles.
- Archived masters remain referenced by history. Financial rows cannot be hard-deleted through application APIs.
- Idempotency key unique within business, actor and operation; persisted result and domain effects commit together.
- Audit events for financial changes commit with those changes. Security denial events may be recorded separately with privacy-safe metadata.

Schema migrations must name the constraint or service responsible for each invariant. Cross-row rules require locks/service logic or database routines; do not pretend a simple CHECK constraint enforces aggregate balances.

## 4. Transaction lifecycle and concurrency

1. Authenticate; verify current business membership and operation permission.
2. Parse and validate decimal strings, bounded payloads and referenced IDs.
3. Acquire/create the idempotency record within the posting transaction. Compare canonical request hash. Repeated same payload returns original authorized result; changed payload gives IDEMPOTENCY_CONFLICT.
4. Lock referenced inventory/lot balances in stable product/lot order. Lock relevant party balance/allocation rows and document state. Retry deadlocks/serialization conflicts within bounded server limits.
5. Revalidate quantity, available stock/credit, review version and price permissions. A conflict requiring user review does not silently reprice or repost.
6. Calculate authoritative amounts and append document/ledger/settlement/invoice/audit entries. Update caches using the same transaction.
7. Commit result reference and idempotency response with all effects.
8. Dispatch document/render work through a committed outbox. Return confirmed document identifiers even if PDF is still pending.

All financial write endpoints, including stock adjustments, openings, corrections and expense operations, are idempotent. Clients persist the operation key before first submission and retain it through retry/status lookup. Keep a compact permanent operation identity with financial records; do not allow an old retry to become a new transaction after a short cache expiry. Permissions are rechecked before returning a cached sensitive response.

Stock count submits observed quantity and expected stock version. If stock changed, require refresh/reconciliation; do not overwrite the balance. Purchase/sale returns lock original lines and cumulative returned quantities. Party settlement locks prevent two devices collecting the same remaining due.

## 5. API contract

Use `/api/v1/businesses/:businessId/...` for tenant routes. The business ID is a selector, not authorization: verify active membership, tenant-scoped references and action permissions on every request. Platform routes are separate. Internal database queries use parameterization and tenant context.

Common success: `{ ok: true, data, requestId }`. Error: `{ ok: false, error: { code, messageKey, fieldErrors, retryable }, requestId }`. Clients translate message keys. No SQL errors, tokens or secrets in user responses.

All lists: bounded cursor pagination, allowlisted sort/filter, stable ID tie-breaker. Dates are ISO business dates or UTC timestamps as documented. Money/quantity values are strings, not JSON floats. POST mutations use Idempotency-Key; editable draft/master updates use version/If-Match where concurrent edits matter.

| Route group | Required contracts |
|---|---|
| `/auth` | Provider sign-in/verification/recovery integration; session/logout-all; never a fabricated development reset in production |
| `/me`, `/memberships` | Profile/language, accessible businesses, active membership context |
| `/businesses` | Idempotent onboarding/provisioning; restricted Owner business update |
| `/products`, `/categories`, `/units` | Search/detail/create/edit/archive; product conversions; explicit price update |
| `/customers`, `/suppliers` | Lookup/create/edit, balances, transactions, current/as-of statements |
| `/opening-balances` | Preview/post; traceable correction; onboarding review |
| `/sales` | Preview, confirm, list/detail; original invoice reference; return/correction/cancel commands |
| `/purchases` | Preview, confirm, list/detail; item/charge allocations; return/correction/cancel commands |
| `/inventory` | Balances, valuation, movement history, lots, count preview/post, low-stock; optional suggestion |
| `/payments` | Receive/pay preview and post; allocation preview/post; advance, reversal and refund; history |
| `/expenses` | Categories, preview/post, history/detail, reverse-and-replace; optional settlement |
| `/invoices` | List/detail/by-sale, render/PDF status/download, print-attempt event; original and current balance clearly distinguished |
| `/reports` | Dashboard, sales, purchases, expenses, profit, inventory, dues, payments, statements; matching PDF endpoints |
| `/estimator` | Calculate/validate; save/list/detail scenarios; scenario PDF; no operational mutations |
| `/settings` | Business, invoice, catalogs and supported settings; personal language remains `/me` |
| `/members` | Invite/accept, permission update, deactivate, Owner transfer; current membership version checks |
| `/audit-events` | Owner-filtered, paginated read-only access |
| `/operations/:key` | Authorized lookup of financial operation state/result after uncertain response |
| `/uploads` | Authorized upload intent, validation/completion, private download access and cleanup |
| `/demo/reset` | Demo-only authorized seed reset, no caller-controlled arbitrary target |
| `/health` | Minimal public liveness; detailed readiness/metrics restricted |
| `/platform` | Restricted feature configuration, support grants, health and release controls |

Key errors: VALIDATION_ERROR, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, STOCK_LOW, VERSION_CONFLICT, REVIEW_EXPIRED, IDEMPOTENCY_CONFLICT, ALLOCATION_EXCEEDED, RETURN_LIMIT_EXCEEDED, PERIOD_CLOSED, RATE_LIMITED, UPDATE_REQUIRED and INTERNAL_ERROR. Use appropriate HTTP statuses and retry guidance. Avoid exposing whether another tenant's record exists.

Sale confirmation input includes preview token/version, customer ID where needed, product/unit IDs, quantity strings, explicitly authorized prices/discount, payment method/amount and optional reference. Server verifies or recomputes all totals. The preview token binds financial inputs and relevant versions; it does not reserve stock.

Sale result includes sale ID, invoice ID/number, posted totals, settlement/due, stock version and document-generation status. Client never has to create the invoice in a second financial transaction.

## 6. Security design

Use least-privilege application database credentials, separate migration credentials and environment isolation. Tenant filtering in services is mandatory; PostgreSQL row-level policies provide defense in depth where used. Pool connections must not leak tenant context across requests. Include child tables, views, exports, files and workers in tenant tests.

Identity tokens are verified against provider signature/issuer/audience and session policy. Current membership is authoritative for business authorization. Web session/cookie strategy must include CSRF protection where cookies authorize requests, restrictive CORS, secure cookie attributes and XSS defenses. Android tokens belong in platform secure storage. Do not log authorization headers, recovery tokens or sensitive full payloads.

Private object keys include tenant ownership but path names alone are not authorization. Validate type, size and content; reject executable uploads; use expiring authorized downloads. Receipts and invoices are not public assets. Sanitize rendered text and guard exports against spreadsheet formula injection if CSV is added.

Rate-limit auth, financial requests, exports and uploads appropriately. Keep immutable/audited administrator actions and investigate suspicious authorization failures. Backups and logs receive their own access controls and retention rules.

Reference guidance: [OWASP authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html). If Supabase is adopted, review [RLS and privileged access](https://supabase.com/docs/guides/database/postgres/row-level-security); secret/service credentials and privileged functions must not become a tenant-isolation bypass.

## 7. Delivery and upgrade design

Use development, staging and production environments. No production secrets or customer records in demo seeds. CI checks formatting/types, meaningful unit tests, database constraints, integration/concurrency tests and authorization regression tests before promotion.

Use additive migrations first, then compatible application rollout, then delayed removal of old fields/routes. Mobile versions can remain installed for months; version API contracts and define the minimum supported app version. Feature flags target tenants safely and have rollback defaults.

Scheduled reconciliation compares stock/value/party caches to ledgers and raises discrepancies without silently altering history. Backup jobs and render jobs are observable and retryable. Recovery restores database and necessary private objects to a consistent point. A rollback of application code must not erase committed customer transactions.
