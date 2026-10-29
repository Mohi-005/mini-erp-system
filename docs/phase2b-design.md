# Phase 2B master-data foundation — implementation candidate

Status: **candidate bundle, not applied to any database and not yet accepted as a release**.

## Scope in this batch

- Business-scoped product categories, units, products, customers, and suppliers.
- Current product selling price and optional minimum-stock threshold as master data only.
- Optional current/reference purchase price in a separate protected relation.
- Archive/restore using `archived_at`; no client hard-delete grants.
- Row-level security, explicit column grants, active membership checks, OWNER control, and deny-by-default STAFF grants.
- Composite tenant-scoped foreign keys between products and categories/units/preferred suppliers.
- A small, client-side validation library that preserves decimal values as strings.

## Explicitly outside scope

No stock balance or movement ledger, opening stock, sales/purchase posting, historical purchase-line costs, customer receivable, supplier payable, payments, invoices, expenses, profit/COGS, batch/expiry/grade/lot model, payment gateway, file bucket, product image upload, offline sync, or production deployment.

## Design decisions used in this candidate

1. `product_purchase_references.reference_purchase_price` is current master/reference information only. It is separate from `products` so STAFF with `products.view` cannot read it unless it also has `costs.read`. Writes require both `products.manage` and `costs.read`; OWNER is authorized within their own business.
2. Customer/supplier `phone`, `address`, and `notes` are optional. Phone is not unique and no Bangladesh-only phone regex is enforced until the source validation conflict is resolved.
3. SKU is optional and is not constrained to be unique in this candidate. The project requirement register records conflicting catalog-validation proposals; silently enforcing a unique SKU, unique product name/unit, or unique party phone would pre-empt that decision. The UI must not imply that duplicates have already been rejected by the database.
4. Standard units are seeded per existing and newly-created business: piece, kg, gram, litre, millilitre, packet, box, bag, dozen. These standard unit rows cannot be renamed or archived. Custom units are business-scoped and have no conversion factors in this phase.
5. Archived categories, units, or suppliers remain linked to existing products. New or changed product references cannot select archived rows. Restore is an update to `archived_at = NULL`.
6. Default selling price is required and non-negative. Current reference purchase price is optional and stored only when present. PostgreSQL uses `numeric`; the shared validation helper sends normalized decimal strings and never calculates prices using JavaScript floating point. Financial precision/rounding fixtures remain a later decision.
7. Image upload is deferred because Storage/bucket policies have not been authorized in this scope. No arbitrary public image URL is stored.

## Permission matrix in the migration

| Data                        | Read                                  | Create/update/archive/restore           |
| --------------------------- | ------------------------------------- | --------------------------------------- |
| Products, categories, units | `products.view`                       | `products.manage`                       |
| Customers                   | `customers.view`                      | `customers.manage`                      |
| Suppliers                   | `suppliers.view`                      | `suppliers.manage`                      |
| Current purchase references | Both `products.view` and `costs.read` | Both `products.manage` and `costs.read` |

OWNER is allowed on the OWNER's own active business through the same database helper. STAFF needs every required grant explicitly. No delete policy or DELETE privilege is created for these master-data tables.

## Required validation before merge/apply

- Run the included shared unit tests and the repository's `npm run check` after merging the files.
- Review SQL syntax and security behavior; run the pgTAP script only after migration review and application to the intended development target.
- Verify the test transaction rolls back and independently confirm no `Phase 2B Synthetic` fixtures remain.
- Confirm local and hosted migration histories before applying. This file must never be applied to production as part of this candidate.
- Resolve catalog uniqueness and any required contact-field policy before building forms that make stronger promises.
- Update authoritative docs only after results are observed; a TypeScript test or build is not evidence of hosted RLS behavior.
