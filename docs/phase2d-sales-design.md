# Phase 2D — Sales transaction engine: design gate

Status: **next planned development increment; no Sales migration or posting code is included in this document.** The purpose of this gate is to settle transaction contracts and acceptance fixtures before any financial schema is written or applied.

## Objective

Replace the current synthetic/fixed-basket Sales preview with a real business-scoped workflow that follows:

**Input → Validate → Calculate → Review → Confirm → Atomic save → Inventory/dues/invoice/report update**

## Proposed implementation boundary

A completed sale will ultimately need a single PostgreSQL transaction responsible for validating tenant membership and grants; validating active product/customer references; preserving product name/unit/selling-price snapshots; recording sale header and line rows; applying the accepted discount/rounding rule; creating stock-out movements without allowing negative stock; recording initial payment and remaining receivable; creating a permanent invoice reference/snapshot; and storing a persistent idempotency result. Any rejected part must roll back the entire transaction. The Web and Android clients must not write authoritative balances locally.

The exact table names, RPC arguments and constraints are to be chosen only after inspecting the current schema and accepted policies; this design document does not authorize a migration by itself.

## Decisions that must be frozen before posting code

| Decision                       | Current record                                                         | Requirement before implementation                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Negative stock                 | Frozen default: disabled                                               | Test that concurrent sales cannot drive quantity below zero.                                                               |
| Costing and COGS               | Open; weighted average is only a proposal                              | Decide whether COGS belongs in the first Sales increment or is explicitly deferred, and never present uncalculated profit. |
| Decimal precision and rounding | Open; PostgreSQL `numeric` confirmed, exact scales/rounding not frozen | Approve line-total, discount, payment and due fixtures, including rounding residuals.                                      |
| Discount semantics             | Open                                                                   | Define line-level vs invoice-level discount and allocation across lines.                                                   |
| Customer / walk-in semantics   | Requirement supports customer association; full policy not finalized   | Define whether a sale without a customer is permitted and how a walk-in record is represented.                             |
| Initial payment                | Cash/credit/partial payment is required                                | Define allowed methods, zero-paid sale behavior and how paid/due values are validated.                                     |
| Payment allocation / advance   | Open                                                                   | Define initial payment allocation, later collection, overpayment/advance and reversal behavior.                            |
| Invoice and tax scope          | Invoice required; tax/launch scope open                                | Define minimum immutable invoice snapshot and any tax fields before committing to a format.                                |
| Returns/cancellations          | Must use linked corrections, not destructive deletion                  | Define whether these are a later milestone and the initial sale status contract.                                           |
| Backdating and business dates  | Policy still needs confirmation                                        | Define accepted business date range and server timestamp behavior.                                                         |

## Acceptance fixtures required

Before writing the migration, create named, deterministic tests for at least:

1. Owner can post a valid multi-line sale inside their own business.
2. Staff without `sales.create` cannot post; a staff member with only view permission cannot post.
3. A product, customer or business ID from another tenant is rejected.
4. Invalid, inactive or archived products are handled according to the approved policy.
5. Exact decimal inputs are preserved; invalid, exponent and negative quantities/amounts are rejected.
6. Insufficient stock and concurrent conflicting sales leave sale, stock and payment unchanged.
7. Retrying the exact same idempotency key/payload returns the original result and does not duplicate rows/movements.
8. Reusing an idempotency key with changed input is rejected.
9. Any forced failure between critical writes rolls back all sale effects.
10. Initial paid amount and due reconcile exactly to the approved total after discount/rounding.
11. Sale line/invoice snapshots remain unchanged if product/customer master data changes later.
12. Cross-tenant reads/writes are denied at the database/RLS/RPC layer, not just hidden in React.

Tests must run on DEV with rollback-preserving fixtures. The CLI output that displays only `finish` is not sufficient as detailed assertion-by-assertion evidence; capture all TAP outcomes and verify that no synthetic fixtures remain after rollback.

## Implementation sequence after policy acceptance

1. Write accepted policy fixtures and test cases.
2. Inspect the active branch's current schema, grants, inventory RPCs and database types.
3. Draft the versioned migration and explicit RLS/column/function grants.
4. Review the SQL diff and failure/rollback behavior before applying anything.
5. Apply only after confirming linked target `mini erp dev` (`jujwnhwrktmimtcnljsd`); never target production.
6. Run database security/transaction tests and independently check tenant isolation and rollback.
7. Add generated/shared database types and decimal-safe validation.
8. Implement Web sale draft/review/confirmation, loading/error/retry states and invoice preview.
9. Wire Android to the same Supabase backend only after the shared transaction contract is stable.
10. Run `npm run check`, then manual end-to-end scenarios and update status/requirements documentation.

## Explicit exclusions from this design gate

No purchase posting, supplier payable, later payment collection, return/refund workflow, expense posting, profit reports, payment gateway, tax decisions, or production deployment is authorized by this document. These remain separate milestones or explicit decisions.
