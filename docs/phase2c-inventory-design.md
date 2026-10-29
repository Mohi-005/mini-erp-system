# Phase 2C.1 — Inventory Ledger Foundation

Status: **implemented in the local working tree and applied to the authorized hosted DEV project on 21 October 2026, according to user-provided CLI output.** User reports the Inventory UI manual check was completed successfully. This is not a production-readiness claim.

## Scope implemented

This increment establishes quantity-only inventory history for the selected business:

- One `inventory_balances` row per business/product with a non-negative current quantity.
- An append-only `inventory_movements` ledger with permanent IDs, operation identity, actor, timestamp, source kind, optional source reference, reason/note and resulting balance.
- An atomic, one-time opening-stock RPC.
- An atomic manual adjustment RPC (stock-in/stock-out), requiring a reason and preventing negative stock.
- Row locks on the product balance so concurrent changes serialize at the database boundary.
- Business RLS for reads and explicit denial of direct client writes to balance/history tables.
- A product-insert trigger creating the initial zero balance and a backfill for existing products.
- A web Inventory page with stock list, low-stock label, opening stock form, reasoned adjustment form and latest 200 movement rows.
- A persisted browser retry payload for uncertain responses. Retrying uses the same operation ID and same submitted fields; the database returns an existing matching movement instead of posting a duplicate.

## Verification record

- DEV migration `20261021000200_inventory_ledger.sql` was applied after the user verified local/remote migration history; latest reported list matched through `20261021000200`.
- `npm run check` passed: format, ESLint, TypeScript across workspaces, 30/30 shared tests, Web production build and Android export. Vite emitted a non-blocking JavaScript chunk-size warning (`565.76 kB` vs `500 kB`).
- The hosted command for `inventory_ledger.test.sql` returned `finish` plan `1..34`; Master Data returned `1..47`; Master Data regression returned `1..6`. The CLI output supplied only each final plan table and did not display individual assertion rows. Record the result as “test plan completed with no visible failure diagnostic”, not as independently inspected assertion-by-assertion proof.
- The user reports that the Inventory page manual check completed successfully. This is evidence for that manual path only; it does not replace tenant-isolation adversarial tests, a full network-failure E2E suite, or Android device testing.

## Database contract

`inventory_balances` is a current-state cache maintained in the same transaction as each ledger movement. `inventory_movements` is the traceable history. Direct insert/update/delete privileges are not granted to authenticated clients. Only authenticated RPC calls can write stock in this increment.

`record_inventory_opening_stock` must run before any other movement for that product and may be recorded only once. Zero opening quantity is allowed, because it still records that an opening count was completed. `adjust_inventory_stock` accepts only `IN` or `OUT`, a strictly positive magnitude, and a non-empty reason. An `OUT` operation that would make stock negative rolls back without changing either table.

Each current Phase 2C.1 RPC is one product movement. The `operation_id` is unique within the business and the payload must match on retry. Future multi-product sale/purchase documents require separate document-level idempotency keys and will create per-product stock movements inside their own atomic RPC.

## Permissions

The read page requires `inventory.view`; product names/units additionally require `products.view`. Posting opening stock or an adjustment requires `inventory.adjust`. OWNER works only within their active business; STAFF requires explicit grants. The UI check is not enforcement—the database RPC and RLS perform the authoritative checks.

## Explicitly not included

This increment does **not** implement purchases, sales, returns, payments, supplier/customer balances, invoices, stock valuation, cost of goods sold, profit, expense posting or the full reporting module. The movement table currently shows the latest 200 rows, not unlimited/filterable history. Purchase/sales posting must create its stock movements within the same database transaction as the related financial document.

Quantities use PostgreSQL `numeric`; form input is retained/normalized as decimal text. Authoritative balance arithmetic is on the server. The UI formats amounts for display. The minimum-stock indicator compares one product against its own threshold; quantities across different units must never be summed.

## Next sequence

1. Keep the local/remote migration history aligned; do not run a destructive reset.
2. Record detailed pgTAP assertion output/evidence where possible, including fixture rollback checks.
3. Begin the Sales transaction design and acceptance-fixture gate. Document the accepted sale/payment/discount/rounding rules before creating financial posting RPCs.
4. Add the SQL migration and pgTAP/RLS/idempotency tests; review first, verify the linked project is `mini erp dev` (`jujwnhwrktmimtcnljsd`), then apply only to DEV.
5. Implement shared types/validation, then Web UI, followed by Android integration and full transaction E2E.
6. Purchase posting depends on the approved freight/charge allocation and costing policy. Do not present valuation/profit until the corresponding policy and engine are implemented.
