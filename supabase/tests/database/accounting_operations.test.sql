-- Phase 2E accounting operations regression/security tests.
-- Synthetic fixtures only. Run against the local Supabase database with the
-- full migration chain, or the explicitly authorized mini erp dev environment.
-- The transaction rolls all fixtures back.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id, email) values
  ('13000000-0000-4000-8000-000000000001', 'phase2e-owner-a@example.test'),
  ('13000000-0000-4000-8000-000000000002', 'phase2e-owner-b@example.test'),
  ('13000000-0000-4000-8000-000000000003', 'phase2e-staff-a@example.test');

insert into public.businesses(id, name, created_by, onboarding_key) values
  ('23000000-0000-4000-8000-000000000001', 'Phase 2E Synthetic A',
   '13000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001'),
  ('23000000-0000-4000-8000-000000000002', 'Phase 2E Synthetic B',
   '13000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000002');

insert into public.business_members(business_id, user_id, role) values
  ('23000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', 'OWNER'),
  ('23000000-0000-4000-8000-000000000002', '13000000-0000-4000-8000-000000000002', 'OWNER'),
  ('23000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000003', 'STAFF');

insert into public.business_settings(business_id) values
  ('23000000-0000-4000-8000-000000000001'),
  ('23000000-0000-4000-8000-000000000002');

insert into public.customers(id, business_id, name, customer_type) values
  ('63000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', 'Phase 2E Customer', 'INDIVIDUAL');
insert into public.suppliers(id, business_id, name) values
  ('64000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', 'Phase 2E Supplier');

insert into public.products(id, business_id, name_bn, unit_id, default_selling_price, minimum_stock) values
  ('73000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', 'Phase 2E Product A',
    (select id from public.product_units where business_id='23000000-0000-4000-8000-000000000001' and code='KG'), 20, 1),
  ('73000000-0000-4000-8000-000000000002', '23000000-0000-4000-8000-000000000002', 'Phase 2E Product B',
    (select id from public.product_units where business_id='23000000-0000-4000-8000-000000000002' and code='KG'), 25, 1);

select ok(
  not has_column_privilege('authenticated', 'public.inventory_movements', 'unit_cost', 'SELECT')
  and not has_column_privilege('authenticated', 'public.inventory_movements', 'value_delta', 'SELECT')
  and has_column_privilege('authenticated', 'public.inventory_movements', 'quantity_delta', 'SELECT'),
  'inventory.view may see movement quantities but cannot read internal stock costs'
);

select ok(
  not has_column_privilege('authenticated', 'public.purchase_lines', 'unit_cost', 'SELECT')
  and not has_column_privilege('authenticated', 'public.purchase_lines', 'landed_unit_cost', 'SELECT')
  and has_table_privilege('authenticated', 'public.purchase_lines_read', 'SELECT'),
  'purchase lines expose no raw cost columns; clients read only the guarded view'
);

select is(
  (select count(*)::int from pg_proc where proname in ('post_sale','post_purchase','collect_customer_payment','pay_supplier') and pronargdefaults = 0),
  4,
  'transaction posting and settlement RPCs require explicit timestamps for stable retries'
);

select ok(
  has_column_privilege('authenticated', 'public.customers', 'shop_code', 'INSERT')
  and has_column_privilege('authenticated', 'public.customers', 'shop_code', 'UPDATE')
  and has_column_privilege('authenticated', 'public.customers', 'owner_name', 'INSERT')
  and has_column_privilege('authenticated', 'public.customers', 'linked_supplier_id', 'UPDATE'),
  'shop-specific columns have explicit column grants; RLS still requires customers.manage'
);

select ok(
  not has_column_privilege('authenticated', 'public.sales_documents', 'operation_id', 'SELECT')
  and not has_column_privilege('authenticated', 'public.purchases_documents', 'operation_id', 'SELECT')
  and not has_column_privilege('authenticated', 'public.customer_receipts', 'operation_id', 'SELECT')
  and not has_column_privilege('authenticated', 'public.supplier_payments', 'operation_id', 'SELECT')
  and not has_column_privilege('authenticated', 'public.business_expenses', 'operation_id', 'SELECT'),
  'internal idempotency keys are not client-readable'
);

select ok(
  not has_table_privilege('authenticated', 'public.sales_documents', 'INSERT')
  and not has_table_privilege('authenticated', 'public.sales_documents', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.sales_documents', 'DELETE')
  and not has_table_privilege('authenticated', 'public.purchases_documents', 'INSERT')
  and not has_table_privilege('authenticated', 'public.business_expenses', 'INSERT'),
  'clients cannot directly mutate financial documents or expenses'
);

select ok(
  has_function_privilege('authenticated', 'public.post_sale(uuid,uuid,jsonb,numeric,text,uuid,timestamptz)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.post_purchase(uuid,uuid,jsonb,numeric,numeric,text,text,uuid,timestamptz)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.collect_customer_payment(uuid,uuid,numeric,text,text,text,uuid,timestamptz)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.pay_supplier(uuid,uuid,numeric,text,text,text,uuid,timestamptz)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.post_sale(uuid,uuid,jsonb,numeric,text,uuid,timestamptz)', 'EXECUTE'),
  'posting RPCs are callable by authenticated actors and not anonymous clients'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"13000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$select public.record_inventory_opening_stock(
    '73000000-0000-4000-8000-000000000001', 4, '83000000-0000-4000-8000-000000000001', 'initial count'
  )$$,
  'Owner records opening stock before the first purchase'
);

select lives_ok(
  $$select public.post_purchase(
    '23000000-0000-4000-8000-000000000001',
    '64000000-0000-4000-8000-000000000001',
    '[{"product_id":"73000000-0000-4000-8000-000000000001","quantity":"6","unit_cost":"10"}]'::jsonb,
    12, 0, null, 'TEST-SUPPLIER-BILL', '83000000-0000-4000-8000-000000000002', '2026-10-10T04:00:00Z'
  )$$,
  'purchase posts supplier invoice, stock-in and landed cost atomically'
);

select is(
  (select quantity from public.inventory_balances where business_id='23000000-0000-4000-8000-000000000001' and product_id='73000000-0000-4000-8000-000000000001'),
  10::numeric,
  'opening quantity plus purchase results in the correct stock balance'
);

select is(
  (select landed_unit_cost from public.purchase_lines_read where business_id='23000000-0000-4000-8000-000000000001' and product_id='73000000-0000-4000-8000-000000000001'),
  12::numeric,
  'freight/other costs are allocated into the actual landed unit cost'
);

select is(
  (select unpriced_quantity from public.inventory_cost_state where business_id='23000000-0000-4000-8000-000000000001' and product_id='73000000-0000-4000-8000-000000000001'),
  4::numeric,
  'unknown opening stock remains unpriced instead of borrowing the reference price'
);

update public.suppliers set archived_at = now()
where business_id='23000000-0000-4000-8000-000000000001' and id='64000000-0000-4000-8000-000000000001';
select is(
  (public.post_purchase(
    '23000000-0000-4000-8000-000000000001',
    '64000000-0000-4000-8000-000000000001',
    '[{"product_id":"73000000-0000-4000-8000-000000000001","quantity":"6","unit_cost":"10"}]'::jsonb,
    12, 0, null, 'TEST-SUPPLIER-BILL', '83000000-0000-4000-8000-000000000002', '2026-10-10T04:00:00Z'
  )->>'duplicate'),
  'true',
  'same purchase retry returns the committed invoice even after supplier is archived'
);
update public.suppliers set archived_at = null
where business_id='23000000-0000-4000-8000-000000000001' and id='64000000-0000-4000-8000-000000000001';

select throws_ok(
  $$select public.post_purchase(
    '23000000-0000-4000-8000-000000000001',
    '64000000-0000-4000-8000-000000000001',
    '[{"product_id":"73000000-0000-4000-8000-000000000001","quantity":"1","unit_cost":"0"}]'::jsonb,
    1, 0, null, null, '83000000-0000-4000-8000-000000000012', '2026-10-10T04:00:00Z'
  )$$,
  '22023', null,
  'freight cannot be allocated across products with a zero-value subtotal'
);

select lives_ok(
  $$select public.post_sale(
    '23000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000001',
    '[{"product_id":"73000000-0000-4000-8000-000000000001","quantity":"4","unit_price":"20"}]'::jsonb,
    0, null, '83000000-0000-4000-8000-000000000003', '2026-10-11T04:00:00Z'
  )$$,
  'credit sale records the customer, invoice and stock-out in one operation'
);

select is(
  (select costing_status from public.sales_lines_read where sales_document_id=(select id from public.sales_documents where customer_id='63000000-0000-4000-8000-000000000001' and occurred_at='2026-10-11T04:00:00Z')),
  'UNKNOWN',
  'sale from unpriced opening stock marks COGS unknown rather than inventing it'
);

select lives_ok(
  $$select public.post_sale(
    '23000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000001',
    '[{"product_id":"73000000-0000-4000-8000-000000000001","quantity":"2","unit_price":"20"}]'::jsonb,
    0, null, '83000000-0000-4000-8000-000000000004', '2026-10-12T04:00:00Z'
  )$$,
  'sale from known-cost stock can be posted'
);

select is(
  (select cogs_amount from public.sales_lines_read where sales_document_id=(select id from public.sales_documents where customer_id='63000000-0000-4000-8000-000000000001' and occurred_at='2026-10-12T04:00:00Z')),
  24::numeric,
  'known-cost sale snapshots weighted-average COGS'
);

select is(
  (public.post_sale(
    '23000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000001',
    '[{"product_id":"73000000-0000-4000-8000-000000000001","quantity":"2","unit_price":"20"}]'::jsonb,
    0, null, '83000000-0000-4000-8000-000000000004', '2026-10-12T04:00:00Z'
  )->>'duplicate'),
  'true',
  'identical sale retry returns the previous invoice without duplicate stock or due'
);

select throws_ok(
  $$select public.post_sale(
    '23000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000001',
    '[{"product_id":"73000000-0000-4000-8000-000000000001","quantity":"2","unit_price":"19"}]'::jsonb,
    0, null, '83000000-0000-4000-8000-000000000004', '2026-10-12T04:00:00Z'
  )$$,
  '22023', null,
  'an idempotency key cannot be reused with changed financial data'
);

select is(
  (select quantity from public.inventory_balances where business_id='23000000-0000-4000-8000-000000000001' and product_id='73000000-0000-4000-8000-000000000001'),
  4::numeric,
  'failed duplicate/conflicting request does not mutate stock'
);

select throws_ok(
  $$select public.post_sale(
    '23000000-0000-4000-8000-000000000001', null,
    '[{"product_id":"73000000-0000-4000-8000-000000000001","quantity":"99","unit_price":"20"}]'::jsonb,
    1980, 'CASH', '83000000-0000-4000-8000-000000000005', '2026-10-12T04:00:00Z'
  )$$,
  '23514', null,
  'sale cannot take stock below zero'
);

select lives_ok(
  $$select public.collect_customer_payment(
    '23000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001',
    100, 'CASH', 'TEST-RECEIPT', null, '83000000-0000-4000-8000-000000000006', '2026-10-13T04:00:00Z'
  )$$,
  'customer collection creates one receipt and allocates against open invoices'
);

select is(
  (select outstanding_amount from public.customer_due_summary where business_id='23000000-0000-4000-8000-000000000001' and customer_id='63000000-0000-4000-8000-000000000001'),
  20::numeric,
  'customer outstanding due is reduced by exactly the collected amount'
);

select is(
  (select sum(amount) from public.customer_receipt_allocations where receipt_id=(select id from public.customer_receipts where reference_no='TEST-RECEIPT')),
  100::numeric,
  'receipt allocation total equals the accepted payment'
);

select throws_ok(
  $$select public.collect_customer_payment(
    '23000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001',
    21, 'CASH', null, null, '83000000-0000-4000-8000-000000000007', '2026-10-14T04:00:00Z'
  )$$,
  '22023', null,
  'customer overpayment is rejected'
);

select lives_ok(
  $$select public.pay_supplier(
    '23000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001',
    12, 'BANK', 'TEST-SUPPLIER-PAYMENT', null, '83000000-0000-4000-8000-000000000008', '2026-10-14T04:00:00Z'
  )$$,
  'supplier payment creates a payment record and allocation'
);

select is(
  (select outstanding_amount from public.supplier_due_summary where business_id='23000000-0000-4000-8000-000000000001' and supplier_id='64000000-0000-4000-8000-000000000001'),
  60::numeric,
  'supplier payable is reduced by the payment and remains tied to the purchase'
);

select lives_ok(
  $$select public.create_business_expense(
    '23000000-0000-4000-8000-000000000001', 'Transport', 50, '2026-10-15', 'CASH', null, 'Synthetic test expense', '83000000-0000-4000-8000-000000000009'
  )$$,
  'expense creation is persisted through the authorised RPC'
);

select is(
  (select amount from public.business_expenses where category='Transport' and expense_date='2026-10-15'),
  50::numeric,
  'expense amount is stored once'
);

select lives_ok(
  $$select public.void_business_expense(
    '23000000-0000-4000-8000-000000000001',
    (select id from public.business_expenses where category='Transport' and expense_date='2026-10-15'),
    'Correction in synthetic regression test'
  )$$,
  'expense correction voids rather than deleting historical record'
);

select is(
  (select status from public.business_expenses where category='Transport' and expense_date='2026-10-15'),
  'VOIDED',
  'voided expense remains available for audit/history and excluded from active totals'
);

select throws_ok(
  $$select public.post_sale(
    '23000000-0000-4000-8000-000000000002', null,
    '[{"product_id":"73000000-0000-4000-8000-000000000002","quantity":"1","unit_price":"25"}]'::jsonb,
    25, 'CASH', '83000000-0000-4000-8000-000000000010', '2026-10-16T04:00:00Z'
  )$$,
  '42501', null,
  'Owner A cannot post transactions into Owner B business even with a valid foreign product id'
);

select is(
  (select count(*)::int from public.sales_documents where business_id='23000000-0000-4000-8000-000000000002'),
  0,
  'cross-tenant attempt leaves the other business financially unchanged'
);

set local request.jwt.claims = '{"sub":"13000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into public.business_member_permissions(member_id, permission)
select id, permission from public.business_members
cross join (values ('inventory.view'), ('purchases.view')) as requested(permission)
where user_id='13000000-0000-4000-8000-000000000003';
set local request.jwt.claims = '{"sub":"13000000-0000-4000-8000-000000000003","role":"authenticated"}';

select ok(
  exists(select 1 from public.purchase_lines_read where business_id='23000000-0000-4000-8000-000000000001' and product_id='73000000-0000-4000-8000-000000000001'),
  'Staff with purchases.view can read the own-business purchase line'
);
select ok(
  (select unit_cost is null and line_total is null and allocated_other_cost is null and landed_unit_cost is null and not cost_visible
   from public.purchase_lines_read where business_id='23000000-0000-4000-8000-000000000001' and product_id='73000000-0000-4000-8000-000000000001'),
  'purchase line costs are masked for Staff without costs.read or profit.read'
);

select is(
  (select count(id)::int from public.inventory_movements where business_id='23000000-0000-4000-8000-000000000001'),
  4,
  'Staff with inventory.view can read own quantity ledger entries'
);

set local request.jwt.claims = '{"sub":"13000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into public.business_member_permissions(member_id, permission)
select id, 'costs.read' from public.business_members
where user_id='13000000-0000-4000-8000-000000000003';
set local request.jwt.claims = '{"sub":"13000000-0000-4000-8000-000000000003","role":"authenticated"}';
select ok(
  (select unit_cost = 10 and landed_unit_cost = 12 and cost_visible
   from public.purchase_lines_read where business_id='23000000-0000-4000-8000-000000000001' and product_id='73000000-0000-4000-8000-000000000001'),
  'purchase costs become visible only after costs.read is explicitly granted'
);

select throws_ok(
  $$select public.post_sale(
    '23000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000001',
    '[{"product_id":"73000000-0000-4000-8000-000000000001","quantity":"1","unit_price":"20"}]'::jsonb,
    0, null, '83000000-0000-4000-8000-000000000011', '2026-10-17T04:00:00Z'
  )$$,
  '42501', null,
  'inventory.view does not grant permission to create a sale'
);

select * from finish();
rollback;
