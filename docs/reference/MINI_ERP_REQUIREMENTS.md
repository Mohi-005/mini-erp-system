# Mini ERP — implementation requirements

Version: 1.0 • Prepared: 15 October 2026 • Status: proposed implementation baseline

## 1. Purpose and authority

Build a simple business assistant for Bangladeshi shopkeepers, retailers, wholesalers, and small businesses. Users must manage products, stock, purchases, sales, dues, payments, expenses, invoices, actual profit, and future estimates without accounting or technical knowledge.

This is a corrected specification, not a claim that software has been built or that every launch decision has been approved. Original source files remain unchanged.

Source order: explicit user decisions override the supplied `readme (2).md`; that requirements document overrides `Mini_ERP_UI_Backend_Map.pdf`; the PDF supplies interaction and backend guidance; earlier assistant suggestions are not independent requirements. This document resolves ambiguities with the defaults below. Material departures are explicitly recorded in section 3.

Companion documents: [architecture and API blueprint](MINI_ERP_BLUEPRINT.md) and [delivery plan and acceptance tests](MINI_ERP_DELIVERY_PLAN.md).

Product priorities: ease of use, correct calculations, reliability, data integrity, security, mobile accessibility, useful automation. Security and correctness are release gates regardless of their position in that list.

## 2. Release scope

### MVP — required

- Responsive web and Android-first application with one backend/database and consistent authentication, permissions, calculations, and data.
- Bangla-first interface, English switch, BDT, Asia/Dhaka reporting dates, Bangla and Latin numeric entry.
- Owner and Staff business roles; separate platform administration capabilities.
- Authentication, verified recovery, onboarding, business membership, invitations, and session controls.
- Products, categories, units and fixed product-specific unit conversions; optional product image and grade.
- Opening stock/value, stock movements, stock adjustments, valuation, low-stock alerts.
- Multi-item purchases and sales, cash/credit/partial settlement, discounts, acquisition charges, historical prices/costs.
- Customers, suppliers, opening dues, payment allocation, advances/credits, returns, corrections and actual refunds.
- Expenses, gross profit, net operating profit, basic reports and customer statements.
- Estimator with instant what-if calculations and best/expected/worst scenarios, isolated from operational posting.
- Automatic invoices, Bangla/English PDF, search, reprint and system printing.
- Business settings, bounded staff permissions, audit history, private file storage.
- Saved drafts, safe retries, explicit pending-confirmation states; clearly separated investor demo.
- Migration scripts, tests, setup/deployment documentation, backup and restore procedure.

### Later releases

Full offline transaction synchronization; voice; AI; demand forecasting; automated ordering; digital-payment gateway integrations; multi-branch; logistics integrations; advanced accounting/financial analytics; automated notifications; arbitrary custom roles; configurable workflow builders; automatic supplier recommendations. Basic low-stock purchase suggestions remain optional within MVP, with no notifications or automated orders.

Bluetooth printer integrations, CSV import/export, and advanced price tiers are separate optional increments. MVP must support system print/PDF; optional hardware support must not be advertised before device testing.

### Explicit product limits

MVP is an operational stock/dues/profit system. It does not promise statutory accounts, tax filing, a balance sheet, payroll, or complete cash/bank reconciliation. Recorded payment methods are not payment processing. A responsive website alone does not satisfy the Android deliverable.

## 3. Decision register

These are proposed defaults ready to guide implementation; they are not represented as prior user approvals.

| ID | Decision/default | Reason and source reconciliation |
|---|---|---|
| D01 | React/TypeScript/Vite/Tailwind web; React Native/Expo/TypeScript Android; Express/TypeScript API; PostgreSQL | Retains requirements §§32–34. Supabase is not assumed approved. PostgreSQL hosting may be managed without changing domain contracts. |
| D02 | Use a maintained authentication provider with server-verified identity; provider selected during foundation | Do not maintain a second password database alongside managed identity. Phone-first verified registration/recovery is required; select an SMS-capable provider before public onboarding. |
| D03 | Moving weighted-average inventory cost; one fixed costing policy per business for MVP | Replaces PDF's ambiguous average/latest-price switch. Catalog purchase-price defaults are not inventory valuation. |
| D04 | Negative stock disabled with no MVP enable toggle | Explicit narrowing of PDF M40 and requirements' optional enablement. Future enablement requires provisional costing/revaluation design. |
| D05 | One business stock location per MVP business; account can hold memberships in several businesses | Multi-business tenancy is distinct from multi-branch inventory. |
| D06 | Per-member permissions using Owner/Staff defaults | Corrects PDF individual toggles writing shared role permissions. No role proliferation. |
| D07 | Posted financial documents are immutable; corrections create linked reversals/replacements | Covers expenses as well as sales, purchases and payments. |
| D08 | Base-unit stock with product-specific fixed pack conversions | Supports buying bags/boxes and selling kg/pieces; conversions are snapshotted on transactions. |
| D09 | Manual price override allowed only with permission; no automated price tiers initially | Supports common wholesale negotiation without adding a pricing engine. |
| D10 | Online confirmation required for financial posting; drafts and local estimator work offline | Preserves source low-connectivity requirement without claiming offline synchronization. |
| D11 | Batch/expiry fields, when used, belong to stock lots, not only product records | Optional lot tracking must be coherent. All lots share product weighted-average valuation; quantity/expiry remains lot-specific. |
| D12 | Platform billing excluded from MVP unless explicitly added | Not established by either source document. A merchant may record their platform subscription as an ordinary expense. |
| D13 | No tax automation in baseline; invoices are ordinary business invoices | Tax requirements and applicable invoice obligations must be assessed for the launch merchants before release. Do not claim tax compliance. |
| D14 | Operational profit uses posted sales/costs and recorded operating expenses | Unrecorded expenses, depreciation, financing, or tax are not silently assumed included. UI explains report scope. |

Open launch choices and their gates appear in the delivery plan. UI scaffolding and domain work can start with these defaults; public release cannot bypass those gates.

## 4. Roles and access

| Capability | Owner | Staff default | Platform administrator |
|---|---|---|---|
| Product/customer lookup, sell, issue sale invoice | Yes | Yes | No merchant access by default |
| Purchase, receive due, pay supplier, add expense | Yes | Off; individually assignable | No merchant access by default |
| View purchase costs, profit, financial reports | Yes | Off; explicit grants | No merchant access by default |
| Price override / discount | Yes | Off; explicit grant with limits | Not through merchant UI |
| Stock count/adjustment | Yes | Off; may be granted | Not through merchant UI |
| Return, cancel, correct, refund, opening balances | Yes | Off; Owner-only MVP | Controlled support process only |
| Manage staff/business configuration/audit history | Yes | No | Platform settings only |
| Personal language, sign out, view own account | Yes | Yes | Own account |

Permissions are checked by the API on every action and sensitive field. Product lookup must omit cost information for users without cost visibility. Purchase permission inherently needs relevant purchase-price visibility; the permission editor explains dependencies. Stock valuation and estimator product cost autofill require cost-view permission. Staff may use the estimator with manually supplied inputs without access to hidden costs.

Owner cannot access another business without membership. Staff cannot grant permissions, create Owners, or alter their own membership. Keep at least one active Owner. Ownership transfer requires step-up authentication, acceptance by the new Owner, and an audit entry. Revoked membership blocks subsequent requests even if an access token has not expired.

Platform control includes releases, migrations, translations, default catalogs, feature flags, monitoring, and audited support. No arbitrary SQL console in the merchant application. Support access is time-limited, business-scoped, reasoned, and logged; emergency access has a documented approval path. Platform administrators use MFA. Platform administrators do not silently impersonate an Owner.

## 5. Onboarding and identity

1. Choose personal language; register/verify identity; enter name, business name and type.
2. Create business, Owner membership, default categories/settings and onboarding state transactionally after identity verification. Retried provisioning must not create duplicate businesses.
3. Explain live versus demo mode. Offer guided product entry and opening balances.
4. Set a cutover date. Enter opening stock quantities and cost values; enter customer/supplier opening dues or credits with reference notes.
5. Review and post opening entries; they do not create sales, purchase revenue, or cash receipts. Corrections use linked reversals.
6. Staff join through a single-use, expiring invitation bound to the intended verified identity. Existing users can accept membership without duplicate accounts.

Recovery uses a real verified delivery channel before launch. Reset codes/tokens never appear in production logs. Rate-limit login, recovery, verification and invitations, with generic account-existence responses. Password reset, account compromise actions and sign-out-all revoke sessions appropriately. Use provider-managed password hashing when passwords are used. Provider selection must support the intended web and Android login flows.

## 6. Catalog and units

Product: immutable ID, business, Bangla name, optional English name, generated/editable SKU, category, base unit, purchase-price default, selling-price default, minimum stock, optional supplier/image/grade, active status and archive timestamp. Current quantity and inventory value are derived/cached ledger results, never editable catalog fields.

SKU is unique within a business. Similar names trigger a duplicate warning rather than an absolute name+unit prohibition: brands/grades can legitimately share names. Names and SKU remain searchable after archive for historical transactions. Archived products cannot be added to new sales but can participate in linked returns.

Each product has one base unit and zero or more named pack conversions, e.g. rice bag = 50 kg; oil carton = 12 bottles. Do not globally define a bag's weight. Units must be dimension-compatible; litre-to-kg is not an automatic conversion. Quantities support at most six decimal places, with per-unit allowed increments (pieces normally integers). Reject precision that exceeds the product rule. Existing transaction unit names, factors, prices and quantities never change when a conversion is later updated.

Optional lots carry batch code, expiry, received quantity and remaining quantity. Lot-tracked sales propose earliest expiry first and record actual lot allocations. Expired lots are blocked from ordinary sale; Owner records disposal or a separately authorized policy. Returns link to original lots. Enabling lot tracking on existing stock requires an allocation/count migration, not an unchecked toggle.

## 7. Shared financial rules

### Precision and rounding

- Currency is BDT only in MVP. Store monetary totals at two decimal places; store unit costs at higher precision (six decimals minimum). Use exact decimal arithmetic, never binary floating point for persisted money.
- Proposed storage: money NUMERIC(18,2), unit costs NUMERIC(24,8), quantities NUMERIC(18,6), conversion factors NUMERIC(18,6). API decimal values are strings. Validate bounds before posting.
- Round line extended selling amounts to two decimals using decimal half-up. Calculate a percentage invoice discount on the rounded subtotal; round to two decimals. Fixed discounts cannot exceed subtotal. No negative line quantities/prices in ordinary posting endpoints.
- Allocate invoice discount and acquisition costs proportionally using integer minor-unit residual allocation; stable line order breaks ties. Allocated shares must sum exactly to the parent amount.
- MVP sales support one invoice-level discount, fixed or percentage, plus named additional charges. Returns use original allocated amounts. Historical rules are versioned.

### Inventory cost

For an ordinary receipt: new quantity = old quantity + received base quantity; new inventory value = old value + received landed cost; new weighted unit cost = new value / new quantity. Store value and quantity as authoritative ledger effects; unit averages are derived.

Landed cost = goods value after purchase discounts + capitalized acquisition charges. Default charge allocation is proportional to goods value. If total goods value is zero, require an explicit allocation rather than divide by zero. Do not allocate mixed kg/pieces by raw quantity.

Sale COGS uses the weighted cost at posting. Persist line COGS and unit-cost snapshot. A final sale consuming all remaining quantity consumes the exact remaining carrying value, avoiding rounding residue. Historical profit does not use today's catalog prices.

Stock gains use current weighted cost when available; at zero stock an Owner supplies a documented cost. Stock losses remove carrying cost and create a linked inventory-loss expense once. Purchase stock is not also an operating expense. Capitalized freight is not expensed again. Future receipts affect future weighted cost, not earlier sale snapshots.

### Revenue, expenses and dates

Net sales revenue = posted line sales minus allocated discounts plus qualifying sales charges minus sales credits. Gross profit = net sales revenue minus net COGS. Net operating profit = gross profit minus recorded operating expenses and inventory losses, including relevant return valuation variances. Label limitations clearly.

Credit collection is not new revenue. Supplier payment is not a second purchase expense. Customer advances and supplier advances do not create revenue/COGS. Owner contributions and withdrawals are not sales/operating expenses.

Store UTC event timestamps and explicit Asia/Dhaka business dates. Inventory/cost-affecting documents post in current server order; MVP does not backdate inventory valuation. Record an optional source-document date for reference. Owner may backdate payments/expenses within an open reporting period with a reason. Closed periods require an audited reopen or current-period correction. Historical as-of balances use effective ledger dates and signed entries, not only today's status fields.

## 8. Purchase workflow

Select supplier → add products, quantities and unit prices → enter charges → specify who is owed each charge → record payments → server preview → review → confirm.

Supplier is required for any credit purchase. Paid anonymous purchases may use an explicit walk-in supplier record. Purchase prices prefill from the catalog but remain editable by permitted purchasers. Updating the future default price is a separate, explicit setting; inventory cost always follows actual receipts.

Every charge has amount, payee, capitalized/operating classification, and settlement. Goods supplier dues include only charges owed to that supplier. A separately paid carrier charge creates a separate payment; an unpaid carrier charge belongs to that carrier's payable account. Only one originating expense/charge entry is recorded; payment does not duplicate its cost.

Posting creates purchase and items, charge allocations, stock/value movements, payable entries, settlement payments/allocations, and audit events atomically. A failure leaves none of these partially posted. Purchase PDF/receipt attachments are private.

## 9. Sale workflow

Choose products → quantity/unit → permitted price override and discount → customer → settlement method and amount → authoritative review → confirmation → invoice/success.

Customer is optional only for fully settled walk-in sales. Any due requires a named customer. Credit sales do not need a phone number, but the UI recommends adding contact information. Cash tendered can exceed total: amount applied is capped at total and change is shown separately. Excess noncash settlement requires an explicit customer-advance choice; never silently creates a negative due.

Server preview is not a reservation. Confirmation revalidates permissions, active products, prices, discounts, customer ownership, quantities and stock. A changed financial total or unavailable stock returns a conflict for review, not a silent change. Approved price overrides remain explicit and audited.

Posting creates sale/items, stock/value movements and COGS, customer debit, received payments/allocations, immutable invoice snapshot, and audit event in one database transaction. Credit-only sales create no zero-value payment. PDF rendering happens after posting and can be retried without reposting the sale.

## 10. Parties, dues and payments

Customer/supplier name is required; phone/address are optional. Normalize Bangladesh numbers while preserving friendly display. Phone is a duplicate hint, not a unique identity: businesses may share contacts. The same real party may have separate customer and supplier accounts; never automatically net receivable against payable.

Signed party ledgers track opening balance, invoices, credits, payments, payment reversals and refunds. Receivables and payables reports show positive dues separately from advances/credits rather than concealing them in one net headline.

Payment flow shows original charge/opening balance, previously settled, new amount, and resulting due. Default allocation is oldest open charge first within the same party; Owner/permitted user may select specific documents. Allocation is server-validated and locked against concurrent collections. Amounts above due become explicit unapplied credits/advances. A payment may cover multiple documents; one document may have multiple payments.

Methods: Cash, bKash, Nagad, Rocket, Bank, Card, Other. These record externally completed money movements; they do not charge an account. Store date, method, reference, actor and optional note. Distinguish recorded payment, gateway status (future), and payment allocation. Show payment history independently from sales history.

Payment reversal means a mistaken recorded payment did not occur; refund means money actually went back. These are separate audited events. A refund cannot exceed available credit and cannot automatically erase an unrelated debt.

## 11. Returns, cancellation and correction

Drafts are editable/deletable. Posted documents are immutable. Every correction references the original, requires an Owner reason, and posts signed compensating effects. Prevent a second cancellation and cumulative return quantities above original quantities.

Sales return: select original items and quantity, physical disposition (restock or damaged), and financial credit. Reverse original allocated revenue/discount/charges according to the return rules; restore original COGS for returned quantities. Restock sound goods at original returned cost; damaged returns immediately post an inventory-loss entry. Customer credit reduces the debt or becomes refundable credit. Record actual cash refund separately when it occurs.

Purchase return: select original receipt and quantities with sufficient stock/lot availability. Supplier credit uses original returnable goods charges; nonrefundable freight remains excluded. Remove inventory at current carrying cost. Post the difference between inventory value removed and supplier credit as a separately labeled purchase-return valuation gain/loss. This prevents hidden rewrites of earlier COGS. Tests must cover returns after later receipts and sales.

Simple cancellation is allowed only when the original goods and settlement effects can be explicitly unwound. If payments or stock have subsequent dependencies, guide the Owner through return/credit/refund or correction rather than pretending the original event never happened. Returned/voided documents remain searchable. Corrections create replacement document IDs and preserve cross-links; no invoice number is reused.

Expense correction reverses the expense and its incorrectly recorded settlement effects, then posts a replacement. Reimbursement of a real expense is a separate event. Reversing a payment never invents a physical cash refund.

## 12. Expenses and profit reports

Expense entry requires category, positive amount and effective date; optional note/receipt. Default paid-now with method; optionally record unpaid against a named supplier/payee. MVP is not general accrual accounting, but must not imply an unpaid expense was paid. Post expense recognition once; later settlement affects dues and payment records only.

Default categories: rent, electricity, salary, transport, packaging, repairs, internet, phone, other. Owner can add/archive categories without modifying historical labels. A purchase's capitalized charge must not be offered as a second ordinary expense.

Reports: sales, purchases, expenses, gross/net operating profit, current/as-of inventory and valuation, customer dues, supplier dues, payment history and statements. Filters: date, permitted party/product/category and source-specified daily/weekly/monthly/yearly groups. Product reports show gross profit; do not allocate general rent/salary to product net profit without an explicit allocation policy.

Dashboard shows sales, purchases, expenses, scoped profit, stock product count, stock value where permitted, low-stock count, receivables and payables. Never add kg and pieces into one total stock quantity. Label period flows separately from current/as-of balances. All summaries reconcile to drill-down records.

## 13. Estimator contract

Estimator data and routes cannot post stock, payments, sales or purchases. Local calculations use the same versioned decimal formulas as server validation. Saved scenarios are tenant-private; optional product references only prefill permitted values and are snapshotted on save.

Inputs: purchase quantity Q, purchase unit price B, expected sale price S, acquisition charges A, operating costs O, wastage fraction W, expected sold quantity V, fixed/percentage discount D. All inputs are nonnegative; W is 0–1; 0 ≤ V ≤ Q×(1−W). Percentage discounts are 0–100%; fixed discounts cannot exceed expected sales.

Outputs distinguish:
- Goods purchase cost = Q×B.
- Cash required = Q×B + A + O (assumes all costs paid; excludes financing timing).
- Weighted landed unit cost C = (Q×B + A)/Q when Q > 0.
- Expected net sales R = V×S minus discount.
- Expected COGS = V×C.
- Wastage loss = Q×W×C.
- Unsold quantity = Q×(1−W)−V; remaining stock value = unsold quantity×C.
- Expected gross profit = R−COGS.
- Expected net operating profit = gross profit−wastage loss−O.
- Scenario cash surplus/shortfall = R−cash required; this differs from profit when stock remains unsold.
- Margin = net operating profit/R where R > 0; otherwise show unavailable. A zero quantity shows zero purchase outputs and no division-based results.

These labels deliberately correct the source example's freight classification. For Q=500, B=60, S=70, A=1,000, O=0, W=0, V=500: cash required=31,000, sales=35,000, COGS=31,000, gross/net profit=4,000. Optionally show 'markup before transport' 5,000, but do not call that the same gross-profit metric used in actual landed-cost reports.

At V=480 with no wastage: sales=33,600, COGS=29,760, profit=3,840, remaining inventory=1,240, cash surplus=2,600. With 2% wastage and V=480: wastage cost=620, remaining stock=620, net profit=3,220. The PDF's unexplained scenario numbers are not acceptance fixtures.

Best/expected/worst are independently specified inputs, not arbitrary multipliers. Clearly show loss and assumptions. No saved scenario automatically becomes a purchase. Optional low-stock suggestion uses observed net sales over a stated window, clamps at zero, respects pack increments, and hides the recommendation for insufficient history.

## 14. Invoices and printing

Create exactly one original invoice per posted sale; number unique within business and configured series. Server issues numbers safely under concurrency. Do not promise gapless numbering. Corrections/credits have their own unique references.

Snapshot seller/customer details, both available product names, unit/conversion, quantities, prices, discount allocations, charges, totals, paid/due at issue and timestamps. A reprint preserves original transaction details and original payment-at-issue; a clearly labeled current balance/payment-history section may show later settlements. A cancellation overlay/credit reference must not erase the original content.

Bangla/English switch changes labels, not accounting values. If an English product name was absent at issue, use the original available name. Embed suitable Bangla fonts and verify shaping in generated PDFs. Support A4 and a selected receipt layout via PDF/system printing. Printer-specific Bluetooth support is separately tested. Print counters mean requested/attempted print, not guaranteed physical printing.

## 15. Interface, connectivity and accessibility

Mobile primary navigation: Home, Sales, Stock, Estimator, More. More includes Purchases/history, Sales/history, Customers, Suppliers, Payments/Dues, Expenses, Invoices, Reports, and permitted Settings/Staff/Activity. Desktop sidebar uses the same destinations with permission filtering.

Large touch targets, readable text, labeled icons, high contrast, minimal typing, numeric keyboards, search, progressive optional fields and clear review screens. Accessible names, keyboard order, screen-reader feedback, error focus and text scaling are required. Do not use color alone to communicate debt, errors or success. Staff views do not reveal hidden finance through cards or exports.

Every list has loading, empty, error and permission-denied states. Every posting flow has draft, validating, ready-for-review, submitting, confirmed, rejected and confirmation-unknown states. After a timeout, preserve payload and idempotency key and query transaction status. Never tell the user a confirmed transaction failed just because the response was lost.

Drafts are namespaced by user and business, have a retention limit, and are isolated/cleared on logout or business switch. Cached product data is advisory; server revalidates before posting. Network indicator is informative, not proof that posting can succeed. Avoid duplicate submissions across both clients.

## 16. Customization, operations and demo

Owner configuration: business profile/logo, categories, units, product conversions, payment-method availability, expense categories, invoice appearance, staff permissions and low-stock thresholds. Personal language belongs to the user. Configuration is validated, audited and effective-dated where it affects transactions. Do not expose switches for unsupported accounting behavior.

Developer configuration: versioned migrations, environment settings, platform defaults, translations, bounded feature flags, monitoring and release compatibility. Flags do not bypass permissions. Previously installed Android clients must either remain compatible with API changes or receive a clear update-required state.

Demo is a separate environment or strongly isolated tenant with synthetic data, persistent DEMO banner, no real payment integrations and tightly scoped reset. Reset cannot accept arbitrary business targets. No real customer information in demo seeds. Investor flow covers opening stock → sale → due → collection → expense → report → estimator → invoice → same data on Android.

Production requires private backups, restore rehearsal including attachments, monitoring/alerts, secret rotation procedures, migration rollback/forward-repair plans, and a retention/export policy. Operational targets are proposed in the delivery plan; provider selection must support them.

## 17. Definition of done

A feature is complete only when UI, server rules, persistence, permissions, validation, loading/empty/error states, tests, web/mobile behavior, documentation and manual verification all pass. No fake dashboard totals, placeholder auth, local-only finance database, or untested 'offline support' may be described as complete.

The MVP is complete only when a representative nontechnical shopkeeper can onboard, enter opening records, buy/sell, collect/pay dues, record expenses, correct mistakes, inspect stock/profit, estimate a purchase and print an invoice across web and Android, with all release gates passed.
