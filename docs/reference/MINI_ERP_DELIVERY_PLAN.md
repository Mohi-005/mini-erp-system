# Mini ERP — build sequence, acceptance and release gates

Version 1.0 • 15 October 2026

Read alongside [requirements](MINI_ERP_REQUIREMENTS.md) and [architecture](MINI_ERP_BLUEPRINT.md).

## 1. Readiness decision

CONDITIONAL START for implementation against the proposed baseline. The original audit's calculation, transaction and permission ambiguities now have documented defaults. This is not production approval and not proof of implementation correctness. Resolve the explicit gates below at the indicated stage; source departures must remain visible rather than silently becoming assumed approvals.

No existing application was found in this chat's workspace. This package specifies a new implementation; if an existing repository is provided later, inspect and map it before replacing anything.

## 2. Decisions still requiring selection or validation

| Gate | Decision | Proposed direction | Must resolve before |
|---|---|---|---|
| G01 | Accept material scope choices | No negative stock; no tax automation; manual price override without pricing tiers; separate platform administration | Affected schema/feature implementation |
| G02 | Identity and verified delivery provider | Maintained provider supporting intended Bangladesh phone verification/recovery and Expo/web flows | Authentication integration and public signup |
| G03 | Hosting, private storage, backup service and budget | Managed PostgreSQL, HTTPS API, private object storage, staging/production separation | Deployment and operational validation |
| G04 | Launch merchant categories and tax/invoice obligations | Validate actual intended businesses; do not advertise statutory invoicing until assessed | Pilot/release |
| G05 | Device/printer support | Test selected low-end Android devices, web browsers, A4 and receipt PDF/system printing | Print/mobile release |
| G06 | Recovery and retention commitments | Proposed RPO ≤15 minutes, RTO ≤4 hours; decide financial/file/log retention and export policy | Live financial data |
| G07 | Pilot size/performance load | Proposed 10,000 products/business, 100,000 transactions/business, 20 concurrent active users/business | Performance acceptance |
| G08 | Domain calculation review | Reconcile weighted costing, return variance and profit labels with a qualified business/accounting reviewer and pilot merchants | Live financial data |

The implementation team can proceed on independent work while these gates are pending. Credentials, paid services, publishing and merchant-data migration require concrete configuration; do not fabricate completed integrations.

## 3. Build order and exit criteria

| Stage | Work | Exit gate |
|---|---|---|
| 0 — Baseline | Confirm source departures, version specifications, map any existing repository, record architecture decisions | No hidden ambiguity in implemented scope; requirement IDs trace to backlog |
| 1 — Foundation | Monorepo, CI, database migrations, identity integration, tenancy, Owner/Staff, private storage scaffolding, web/mobile shells, i18n | Cross-business denial tests; membership revoke tests; staging configuration |
| 2 — Catalog and opening records | Products, categories, units/conversions, parties, lots, opening quantity/value/dues | Opening records reconcile; archive/history and conversion tests pass |
| 3 — Posting engine | Decimal arithmetic, cost/value ledger, party ledger, payment allocations, idempotency, locks, audit and outbox | Rollback, retry, rounding, concurrent stock and collection tests pass |
| 4 — Purchases and sales | Full review/confirmation, freight payees, cash change, credit/partial payments, invoice snapshot | End-to-end purchase→sale→due flow reconciles on both clients |
| 5 — Corrections and expenses | Returns, credits, refunds, stock count/loss, payment reversal, expense posting/correction, opening corrections | Dependent transaction tests and ledger reconciliation pass |
| 6 — Insights and documents | Dashboard/reports, actual profit, estimator/scenarios, low-stock, PDF/system printing | Reports match ledger fixtures; estimator is isolated; Bangla documents verified |
| 7 — Product completion | Android parity, accessibility, draft recovery, failure states, invitations/settings/audit, platform controls | Target devices and shopkeeper task walkthroughs pass |
| 8 — Release readiness | Restore rehearsal, performance/security checks, monitoring, migration rehearsal, synthetic demo and docs | All launch gates closed; no critical financial/security defects |

Android development starts with the foundation and follows each vertical workflow; it is not postponed until all backend/UI assumptions have hardened. Quality checks run in every stage, not only stage 8.

Suggested pilot: one to three consenting businesses with supported workflows after release gates pass. Do not import live balances before cutover/reconciliation checks. An investor demo is a separate milestone, not proof of production readiness.

## 4. Numerical acceptance fixtures

Each fixture is isolated unless explicitly chained. Money is BDT; values below use the proposed requirements rules.

| Test | Input/action | Expected |
|---|---|---|
| F01 | Open 100 kg at 60; sell 20 at 70; receive 1,000 | Stock 80; carrying value 4,800; sale 1,400; COGS 1,200; gross profit 200; due 400 |
| F02 | After F01, collect remaining 400 | Due zero; revenue still 1,400 and gross profit still 200; receipt history increases |
| F03 | After F01, record paid operating expense 50 | Net operating profit 150; stock/COGS unchanged |
| F04 | Buy 500 kg at 60; capitalize 1,000 carrier freight; pay goods supplier 20,000 and carrier 1,000 | Inventory 31,000; unit cost 62; supplier due 10,000; carrier due zero; payments 21,000 |
| F05 | Open 100 at 60; buy another 100 at 80; sell 50 at 90 | Average 70; sale 4,500; COGS 3,500; remaining quantity 150/value 10,500 |
| F06 | Buy 2 bags, each 50 kg; sell 500 grams | Base receipt 100 kg; issue 0.5 kg; remaining 99.5 kg |
| F07 | Two lines 0.05 and 0.05; 10% invoice discount | Subtotal 0.10; discount 0.01; final 0.09; deterministic shares sum to 0.01 |
| F08 | Sale 1,400; cash tendered 1,500 | Applied cash 1,400; change 100; due zero; no customer advance |
| F09 | Customer opening due 500; sale due 400; receive 600 with oldest-first allocation | Opening settled 500; sale settled 100; remaining due 300; no invented opening revenue |
| F10 | Customer due 400; explicitly receive advance-inclusive payment 500 | Due zero, unapplied credit 100; revenue unchanged |
| F11 | Original sale 20 units at 70, original cost 60; return 5 sound units, no discount | Credit 350; restore stock value 300; revenue reduces 350; COGS reduces 300; refund only when separately posted |
| F12 | Purchase 10 units at 60, then 10 at 80; return 2 of first receipt with supplier credit 120 | Remove inventory at 70×2=140; remaining quantity 18/value 1,260; return valuation loss 20; prior COGS unchanged |
| F13 | Stock 10 units at 60; count 9 without concurrent movements | Adjustment −1/value −60; inventory-loss expense 60 once; reason required |
| F14 | Estimator 500×60, sell all at 70, freight 1,000, no waste | Cash required 31,000; sales 35,000; gross/net profit 4,000; no operational changes |
| F15 | F14 estimator, sell 480, no waste | Revenue 33,600; COGS 29,760; profit 3,840; remaining value 1,240; cash surplus 2,600 |
| F16 | F14 estimator, sell 480 with 2% waste | Waste 10/value 620; remaining 10/value 620; net profit 3,220 |
| F17 | Expense 100 paid cash, later discovered it was actually 80 | Linked reversal/replacement preserves history; net expense/payment 80; no fictitious cash refund record |
| F18 | Sell final fractional quantity from a carrying-value balance | Final inventory quantity and value both zero; no stranded rounding residue |

Additional fixture boundaries: zero-price product, zero quantity rejection, maximum numeric limits, mixed pack units, discounts at 0/100%, malformed numbers, waste at 0/100%, zero estimator revenue, damaged returns, partial freight refunds, and unsupported unit conversion.

## 5. Integration, concurrency and security acceptance

| ID | Test | Required behavior |
|---|---|---|
| T01 | Two devices sell the last unit | One commit; one STOCK_LOW; no partial payment/invoice |
| T02 | Response lost after sale commit, then same-key retry | Same sale/invoice/result; one set of ledger movements |
| T03 | Same key with different amount | Conflict; no second mutation |
| T04 | Failure injected at each posting step | Entire financial transaction rolls back; safe retry possible |
| T05 | Two devices collect final customer due simultaneously | No accidental over-allocation; explicit advance flow needed for excess |
| T06 | Two returns race against original sold quantity | Combined return cannot exceed original eligible quantity |
| T07 | Stock count saved after concurrent sale | Version conflict/reconciliation, no overwritten sale |
| T08 | Catalog price changes after preview | Explicit review conflict unless valid authorized price override; no silent repricing |
| T09 | Edit name/price/unit/business logo after sale | Original invoice snapshot remains unchanged |
| T10 | Cross-business IDs in nested line items, party and allocations | Denied at API and relationship boundary |
| T11 | Cross-business report/PDF/upload/download/status lookup | No data or existence leak |
| T12 | Staff calls restricted endpoint or reads cost fields directly | Server rejects action/omits fields; hidden UI alone not sufficient |
| T13 | Owner revokes active Staff permission | Subsequent protected operation denied despite old token |
| T14 | Staff changes another member or self to Owner | Denied; audit/security event recorded appropriately |
| T15 | Last Owner removal / invitation reuse / expired invite | Prevented |
| T16 | Demo reset given real tenant target | Denied; real data unchanged |
| T17 | Estimator save/calculate/PDF | Only estimator/document records affected; tenant permissions enforced |
| T18 | PDF worker fails after sale | Sale remains confirmed; PDF job retries without reposting |
| T19 | Midnight Asia/Dhaka and month boundaries | Correct day/month grouping; no host-timezone dependence |
| T20 | Logout/business switch with saved draft | Drafts/cache never cross user or business boundaries |
| T21 | Current and historical reports after reversal | Signed entries reconcile; past periods not silently rewritten by current status |
| T22 | Backup restore to clean environment | Ledger totals, snapshots and relevant attachments reconcile; measured recovery targets met |
| T23 | Old supported Android client after API migration | Works with compatible contract or receives safe update-required response |
| T24 | Financial-cache reconciliation | Detect deliberate mismatch; do not silently change original records |

## 6. Usability and operational acceptance

- Proposed usability benchmark: at least five representative Bangla-speaking shopkeepers complete sale, purchase, due collection, expense and invoice tasks without developer assistance after a short onboarding. Record errors and revise confusing flows before release.
- Verify Bangla shaping, numeric entry, screen-reader labels, contrast, touch targets, keyboard navigation and large text on target devices. Product business terminology receives a native-language review.
- Proposed normal-load targets: p95 list/search under 1 second and posting under 2 seconds server-side, excluding third-party delivery/network latency, at G07 load. Define measurement environment before claiming performance.
- Exercise slow connection, disconnect before/after commit, expired session during draft, failed verification delivery, unavailable storage and failed PDF worker.
- Demonstrate monitoring for failed jobs, authorization anomalies, reconciliation mismatches and backup failures without leaking secrets/customer financial payloads.
- Document release owner, incident contact, restore steps, migration repair, retention/export policy and user communication procedure.

## 7. Source coverage

All 46 primary requirements sections are mapped below. PDF M01–M45, W01–W09 and pp.56–61 are addressed through the named workflows; additions resolve gaps rather than silently treating mockups as complete schemas.

| Source sections | Coverage in revised package |
|---|---|
| 1–3, 46: purpose/users/principles | Requirements 1–2, 15, 17 |
| 4–5: language/currency/units | Requirements 2, 6–7, 15 |
| 6–7: modules/dashboard | Requirements 2, 12, 15 |
| 8–9: sales/purchases | Requirements 8–11; blueprint posting/API |
| 10–12: products/inventory/alerts | Requirements 6–7, 13; inventory model and tests |
| 13–14: estimator/what-if | Requirements 13; F14–F16 and T17 |
| 15–16: profit/expenses | Requirements 7, 11–12; financial fixtures |
| 17–19: parties/payments | Requirements 5, 10; allocation model/tests |
| 20–21: invoices/reports | Requirements 12, 14; document and reporting contracts |
| 22–23: web/mobile UX | Requirements 15; staged Android delivery/usability gates |
| 24–25: voice/connectivity | Requirements 2, 15; future voice and current draft/retry behavior |
| 26–28: identity/roles/security | Requirements 4–5; blueprint 6; security acceptance |
| 29–31: database/consistency/audit | Blueprint 2–4; atomic posting/reconciliation tests |
| 32–34: technologies/API | Requirements D01–D02; blueprint 1, 5 |
| 35–36: errors/empty states | Requirements 15; blueprint error contracts |
| 37–38: demo/investor flow | Requirements 16; delivery stages and T16 |
| 39: testing | Delivery sections 4–6 |
| 40–41: scope/phases | Requirements 2–3; delivery 2–3 |
| 42–43: organization/docs | Blueprint structure; documentation checklist below |
| 44–45: development rules/done | Requirements 17; stage exit and release gates |

Specific PDF corrections: M03/M04 identity and recovery; M14/M17 cancellation/returns; M16 freight payees; M18 valuation; M22 expense reversal; M25 scenario formulas; M29 opening dues; M30/M32 allocation and idempotency; M35 invoice/current settlement distinction; M40 negative-stock and personal-language scope; M41 member permissions; M42 role example; p.59 missing API groups; p.60 incomplete tenant/schema relationships.

## 8. Implementation documentation checklist

Required repository deliverables: README, PROJECT_REQUIREMENTS, DEVELOPMENT_ROADMAP with truthful completion state, API_DOCUMENTATION/OpenAPI contract, schema/migrations/seeds, environment example without secrets, architecture decision records, permission matrix, financial formula fixtures, supported-device list, deployment/runbook, backup/restore procedure, known limitations and pilot checklist.

No feature is marked complete solely because its screen exists. Each backlog item links a requirement, API/data behavior, permission rule and acceptance test. Failed financial/security gates block release; optional enhancements do not delay a correctly scoped MVP.
