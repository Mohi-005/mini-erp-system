# Mini ERP — সম্পূর্ণ Web MVP Roadmap

**রোডম্যাপের অবস্থা:** ২১ অক্টোবর ২০২৬ পর্যন্ত পাওয়া repository notes, বর্তমান test/build output এবং ব্যবহারকারীর manual test confirmation অনুযায়ী।
**লক্ষ্য:** Bangladesh-first, Bangla-first Mini ERP-এর একটি বাস্তব ব্যবহারযোগ্য Web MVP; Android একই backend/database ব্যবহার করবে।
**গুরুত্বপূর্ণ:** এটি milestone map, নির্দিষ্ট সময়ের প্রতিশ্রুতি নয়। প্রতিটি milestone-এর implementation, tests, security review এবং manual acceptance লাগবে।

## ১. এখন পর্যন্ত কোথায় পৌঁছেছি

| Milestone                                            | অবস্থা                                                          | প্রমাণ/সীমা                                                                                                                                                                                                                                    |
| ---------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1 — App shell ও baseline                       | ভিত্তি আছে                                                      | কিছু dashboard/demo content এখনো synthetic; সেটিকে live business data ধরা যাবে না।                                                                                                                                                             |
| Phase 2A — Auth, tenancy, ownership ও RLS foundation | মূল foundation আছে                                              | আগের DEV audit-এ 55/55 database assertions পাসের রেকর্ড আছে; production email delivery ও native/mobile callback আলাদাভাবে যাচাই হয়নি।                                                                                                          |
| Phase 2B — Master Data                               | ব্যবহারকারী-যাচাইসহ implemented                                 | Product/category/unit/customer/supplier CRUD ও database authorization scope আছে। সাম্প্রতিক test command-এ `master_data.test.sql` শেষ হয়েছে `1..47`, regression suite `1..6`; আউটপুটে failure diagnostic দেখা যায়নি।                           |
| Phase 2C.1 — Quantity-only Inventory Ledger          | DEV-তে migration applied; UI manual test ব্যবহারকারী সফল বলেছেন | Opening stock, reason-সহ IN/OUT adjustment, movement history, non-negative stock, tenant permission এবং retry identity আছে। Test command-এ `inventory_ledger.test.sql` শেষ হয়েছে `1..34`; CLI output-এ individual assertion detail দেখা যায়নি। |
| Workspace validation                                 | সফল                                                             | `npm run check`: Prettier, ESLint, workspace TypeScript, 30/30 unit tests, Web build এবং Android export সম্পন্ন। Web bundle-size warning আছে, কিন্তু build ব্যর্থ নয়।                                                                          |

**এখনও সম্পূর্ণ নয়:** Sales/Purchase, payment/dues ledger, invoice, expenses, estimator, real-data dashboard/reports, audit trail এবং release/deployment readiness। UI-তে কোনো নমুনা স্ক্রিন দেখা গেলেই সেটিকে live transactional feature বলা যাবে না।

## ২. পূর্ণ Web MVP-তে পৌঁছানোর বাকি milestone map

এই পরিকল্পনায় **৯টি বড় implementation/release milestone** ধরা হয়েছে। প্রথমটি হলো বর্তমান phase-এর closeout; পরেরগুলো হলো বাস্তব business workflows। একটি milestone-এর ভিতরে একাধিক কোডিং ও testing ধাপ থাকবে।

### Milestone 1 — Inventory phase closeout ও reporting scope

- Documentation-এ DEV migration, checks ও manual result-এর সত্যিকারের অবস্থা হালনাগাদ করা।
- Opening-stock, adjustment, insufficient-stock rejection, duplicate retry এবং tenant/permission behavior-এর evidence একত্র করা।
- Quantity/low-stock রিপোর্টে আলাদা unit-এর quantity কখনো একসঙ্গে যোগ না করা।
- Valuation/COGS-কে costing rule ঠিক না হওয়া পর্যন্ত “unknown/not implemented” রাখা; অনুমান করে profit দেখানো যাবে না।

### Milestone 2 — Sales workflow ও atomic posting

- Product search, multiple sale lines, quantity, selling-price snapshot, customer (প্রয়োজনে walk-in), discount, payment method এবং draft/review/confirm screen।
- এক PostgreSQL transaction-এ sale, immutable line snapshots, stock-out movement, payment/amount received, due, invoice reference ও idempotency outcome সংরক্ষণ।
- একই অনুরোধ retry করলে দ্বিতীয় sale তৈরি হবে না। কোনো অংশ ব্যর্থ হলে পুরো transaction rollback হবে।
- Costing rule অনুমোদিত না হওয়া পর্যন্ত COGS/profit দেখানো যাবে না।

### Milestone 3 — Purchase workflow ও stock receipt

- Supplier, multiple product lines, buy-price snapshots, freight/other charges, paid/partial/unpaid এবং review-before-save।
- Purchase, stock-in movement এবং supplier payable/payment-এর transaction boundary তৈরি।
- Freight/other-cost allocation এবং charge payee policy অনুমোদন ছাড়া payable বা item cost-এ নীরবে ভাগ করা যাবে না।

### Milestone 4 — Payment ledger ও party statements

- Customer payment collection এবং supplier settlement আলাদা direction-এ।
- Original amount, previously paid, new payment, remaining due, method/date/reference, allocations ও history।
- Advance/overpayment ও allocation policy নির্ধারণ; permanent references এবং duplicate-safe retries।
- Receivable ও payable এক account-এ মেশানো যাবে না; payment collection-কে নতুন revenue ধরা যাবে না।

### Milestone 5 — Returns, cancellation, correction ও audit trail

- Posted record delete করে ইতিহাস হারানো নয়; linked reversal/correction record।
- Sale cancellation/return এবং purchase return-এ stock, due, payment ও invoice status-এর atomic consistency।
- Actor, action, time, record, before/after ও reason-এর read-only audit history।
- Refund বনাম ভুল entry reversal আলাদা হতে হবে।

### Milestone 6 — Invoice ও document workflow

- প্রতিটি confirmed sale থেকে permanent invoice number/reference ও historical snapshot।
- Invoice search/detail/history, bilingual Bangla/English view, print/PDF/reprint।
- Original invoice এবং বর্তমান settlement/status স্পষ্টভাবে আলাদা দেখানো।
- Tax, printing constraints ও launch-specific invoice details নিশ্চিত না হওয়া পর্যন্ত সেগুলোকে অনুমোদিত বলে দেখানো যাবে না।

### Milestone 7 — Expenses ও estimator

- Expense categories, amount/date/method, optional note/receipt এবং linked corrections।
- Estimator-এ quantity, buy/sell price, freight/other cost, waste, discount/volume এবং best/expected/worst scenario।
- Estimator হিসাব inventory/sales/purchase/party balance পরিবর্তন করবে না; saved scenario/PDF আলাদা accepted scope অনুযায়ী।

### Milestone 8 — Real-data dashboard, reports, shop directory ও settings

- Dashboard-এর Today/Week/Month/Custom filter ও quick actions বাস্তব posted records থেকে।
- Sales, purchase, expense, stock/movement/low-stock, dues/payment এবং অনুমোদিত costing-এর পর profit reports। প্রতিটি report থেকে source record drill-down/reconciliation।
- Shop directory: name/code search, owner/mobile/address/email, edit/archive/restore ও exact shop/date transaction filters। Shop record কখনো tenant identity হিসেবে ব্যবহার হবে না।
- Business settings, invoice preferences, staff grants/invitations এবং বাকি settings; প্রতিটি permission server/RLS-এ কার্যকর হতে হবে।

### Milestone 9 — Full acceptance, Web/Android consistency ও release readiness

- Auth/recovery, permissions, tenant isolation, network failure/retry, date/timezone, decimal precision, keyboard/screen-reader/large-text/accessibility acceptance।
- Android device/emulator, native callback/session persistence ও usability tests; build export একা device QA-এর প্রমাণ নয়।
- Clean migration/rebuild/restore rehearsal, backup/retention/monitoring, environment separation, no secrets, release/deployment/rollback checklist।
- Core flow end-to-end: opening stock → purchase → sale → customer due/payment → invoice → reports; একই data Web ও Android-এ।

## ৩. কেন Sales/Purchase-এর আগে rule-freeze দরকার

Project requirements/architecture-এ এখনও কিছু financial decisions open আছে। এগুলোকে অনুমান করে code-এ স্থায়ী করলে sale, stock, payable, profit ও returns-এর হিসাব ভুল হতে পারে। বিশেষ করে:

- Inventory costing: weighted-average বনাম FIFO বা অন্য accepted rule; freight/returns কীভাবে cost বদলাবে।
- Numeric precision, money rounding এবং discount/residual allocation fixtures।
- Purchase freight/other charges supplier payable-এ যাবে, নাকি আলাদা payee/expense হবে এবং item cost-এ কীভাবে বরাদ্দ হবে।
- Customer receipt/supplier settlement allocation, advance/overpayment এবং reversal behavior।
- Returns/cancellations/backdating এবং tax/invoice launch scope।

**পরবর্তী কাজের ক্রম:** আগে এই policies-এর accepted test fixtures লিখতে হবে; তারপর database schema/RPC + RLS + pgTAP; তারপর shared logic/types; তারপর Web UI; তারপর Android integration ও E2E. কোনো financial posting-এর আগে policy freeze আবশ্যক।

## ৪. পরের কাজটি কী

**পরবর্তী technical milestone: Sales transaction design + policy acceptance fixtures.** শুরুতে schema push নয়। প্রথমে confirmed vs open policy তালিকা, table/RPC boundary, failure/rollback/idempotency cases এবং test fixtures তৈরি করা হবে। এরপর migration/test source review; কেবল DEV target নিশ্চিত করে এবং review শেষে apply করা হবে। Production migration চালানো হবে না।

## ৫. “সম্পূর্ণ” বলার acceptance checklist

- [ ] Sales ও purchase real data-তে save হয় এবং failed request আংশিক financial state রেখে যায় না।
- [ ] Stock, customer due, supplier payable, payment ledger ও invoice এক transaction boundary-তে consistent।
- [ ] Retrying একই request duplicate sale/purchase/payment তৈরি করে না।
- [ ] Returns/cancellations delete নয়, linked reversal/correction দিয়ে হিসাব মিলিয়ে রাখে।
- [ ] Dashboard/report totals drill-down থেকে source records-এর সঙ্গে reconcile হয়; unsupported profit/valuation দেখায় না।
- [ ] Owner/Staff permission, tenant isolation এবং data exposure database layer-এ পরীক্ষা করা হয়েছে।
- [ ] Bangla/English, Dhaka business dates, decimal entry, responsive layout এবং accessibility manually tested।
- [ ] Web ও Android একই backend-এর একই business records ব্যবহার করে।
- [ ] Backup/restore, release/rollback এবং environment/secret checks-এর evidence আছে।
- [ ] `npm run check`, database suites ও manual end-to-end acceptance-এর output রেকর্ড করা আছে।

এই checklist পূরণ না হওয়া পর্যন্ত সঠিক status হবে **“MVP development/testing in progress”**, “production-ready” নয়।
