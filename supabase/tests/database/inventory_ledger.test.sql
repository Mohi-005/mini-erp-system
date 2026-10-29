-- Phase 2C.1 inventory ledger security and transaction tests.
-- Run only after 20261021000200_inventory_ledger.sql is applied to a disposable
-- local database or the explicitly authorized mini erp dev project.
-- All test fixtures are synthetic and the transaction is rolled back.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id, email) values
  ('12000000-0000-4000-8000-000000000001', 'phase2c-owner-a@example.test'),
  ('12000000-0000-4000-8000-000000000002', 'phase2c-owner-b@example.test'),
  ('12000000-0000-4000-8000-000000000003', 'phase2c-staff-a@example.test');

insert into public.businesses(id, name, created_by, onboarding_key) values
  ('22000000-0000-4000-8000-000000000001', 'Phase 2C Synthetic A',
   '12000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001'),
  ('22000000-0000-4000-8000-000000000002', 'Phase 2C Synthetic B',
   '12000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000002');

insert into public.business_members(business_id, user_id, role) values
  ('22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', 'OWNER'),
  ('22000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000002', 'OWNER'),
  ('22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000003', 'STAFF');

insert into public.business_settings(business_id) values
  ('22000000-0000-4000-8000-000000000001'),
  ('22000000-0000-4000-8000-000000000002');

insert into public.products (
  id, business_id, name_bn, unit_id, default_selling_price, minimum_stock
) values
  ('72000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001',
   'Phase 2C Product A',
   (select id from public.product_units where business_id = '22000000-0000-4000-8000-000000000001' and code = 'KG'),
   100, 2),
  ('72000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000002',
   'Phase 2C Product B',
   (select id from public.product_units where business_id = '22000000-0000-4000-8000-000000000002' and code = 'KG'),
   120, 1);

select is(
  (select count(*)::int from public.inventory_balances
   where product_id in (
     '72000000-0000-4000-8000-000000000001',
     '72000000-0000-4000-8000-000000000002'
   )),
  2,
  'new products receive an initial zero inventory balance'
);

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = any(array['inventory_balances', 'inventory_movements'])
     and c.relrowsecurity),
  2,
  'RLS is enabled on both inventory tables'
);

select ok(
  not has_table_privilege('authenticated', 'public.inventory_balances', 'INSERT')
  and not has_table_privilege('authenticated', 'public.inventory_balances','UPDATE')
  and not has_table_privilege('authenticated', 'public.inventory_balances','DELETE'),
  'authenticated clients cannot directly mutate current stock balances'
);

select ok(
  not has_table_privilege('authenticated', 'public.inventory_movements', 'INSERT')
  and not has_table_privilege('authenticated', 'public.inventory_movements', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.inventory_movements', 'DELETE'),
  'authenticated clients cannot directly create, rewrite or delete ledger history'
);

select ok(
  has_function_privilege('authenticated', 'public.record_inventory_opening_stock(uuid,numeric,uuid,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.adjust_inventory_stock(uuid,text,numeric,text,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.record_inventory_opening_stock(uuid,numeric,uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.adjust_inventory_stock(uuid,text,numeric,text,uuid)', 'EXECUTE'),
  'stock-writing RPCs are callable only by authenticated users'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"12000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int from public.inventory_balances),
  1,
  'Owner A reads only their own stock balances'
);

select is(
  (select count(id)::int from public.inventory_movements),
  0,
  'Owner A starts with no movements'
);

select lives_ok(
  $$select public.record_inventory_opening_stock(
    '72000000-0000-4000-8000-000000000001', 10.500, '82000000-0000-4000-8000-000000000001', 'opening count'
  )$$,
  'Owner records an opening quantity with decimal precision'
);

select is(
  (select quantity from public.inventory_balances where product_id = '72000000-0000-4000-8000-000000000001'),
  10.500::numeric,
  'opening quantity becomes the current balance atomically'
);

select lives_ok(
  $$select public.record_inventory_opening_stock(
    '72000000-0000-4000-8000-000000000001', 10.500, '82000000-0000-4000-8000-000000000001', 'opening count'
  )$$,
  'repeating an identical opening request is idempotent'
);

select is(
  (select count(id)::int from public.inventory_movements
   where product_id = '72000000-0000-4000-8000-000000000001' and movement_type = 'opening'),
  1,
  'an idempotent retry does not duplicate the opening movement'
);

select throws_ok(
  $$select public.record_inventory_opening_stock(
    '72000000-0000-4000-8000-000000000001', 11, '82000000-0000-4000-8000-000000000001', 'changed request'
  )$$,
  '22023', null,
  'an idempotency key cannot be reused with different input'
);

select throws_ok(
  $$select public.record_inventory_opening_stock(
    '72000000-0000-4000-8000-000000000001', 3, '82000000-0000-4000-8000-000000000002', 'second opening'
  )$$,
  '23505', null,
  'a product cannot receive a second opening stock record'
);

-- Signature: product_id, direction, quantity, reason, operation_id.
select lives_ok(
  $$select public.adjust_inventory_stock(
    '72000000-0000-4000-8000-000000000001', 'IN', 2.250, 'count found more stock', '82000000-0000-4000-8000-000000000003'
  )$$,
  'Owner can record a positive stock adjustment with a reason'
);

select is(
  (select quantity from public.inventory_balances where product_id = '72000000-0000-4000-8000-000000000001'),
  12.750::numeric,
  'stock-in adjustment increments the balance precisely'
);

select lives_ok(
  $$select public.adjust_inventory_stock(
    '72000000-0000-4000-8000-000000000001', 'IN', 2.250, 'count found more stock', '82000000-0000-4000-8000-000000000003'
  )$$,
  'repeating the same adjustment key and payload is idempotent'
);

select is(
  (select count(id)::int from public.inventory_movements where product_id = '72000000-0000-4000-8000-000000000001'),
  2,
  'idempotent adjustment retry does not append a second movement'
);

select throws_ok(
  $$select public.adjust_inventory_stock(
    '72000000-0000-4000-8000-000000000001', 'OUT', 1, 'changed payload', '82000000-0000-4000-8000-000000000003'
  )$$,
  '22023', null,
  'adjustment idempotency key cannot be reused for another operation'
);

select lives_ok(
  $$select public.adjust_inventory_stock(
    '72000000-0000-4000-8000-000000000001', 'OUT', 3.125, 'physical count correction', '82000000-0000-4000-8000-000000000004'
  )$$,
  'Owner can record a stock-out adjustment with a reason'
);

select is(
  (select quantity from public.inventory_balances where product_id = '72000000-0000-4000-8000-000000000001'),
  9.625::numeric,
  'stock-out adjustment decrements the balance precisely'
);

select throws_ok(
  $$select public.adjust_inventory_stock(
    '72000000-0000-4000-8000-000000000001', 'OUT', 99, 'impossible removal', '82000000-0000-4000-8000-000000000005'
  )$$,
  '23514', null,
  'stock-out cannot create negative inventory'
);

select is(
  (select quantity from public.inventory_balances where product_id = '72000000-0000-4000-8000-000000000001'),
  9.625::numeric,
  'failed stock-out leaves the balance unchanged'
);

select throws_ok(
  $$select public.adjust_inventory_stock(
    '72000000-0000-4000-8000-000000000001', 'IN', 1, '   ', '82000000-0000-4000-8000-000000000006'
  )$$,
  '22023', null,
  'manual adjustment requires a non-empty reason'
);

select throws_ok(
  $$select public.record_inventory_opening_stock(
    '72000000-0000-4000-8000-000000000001', -1, '82000000-0000-4000-8000-000000000007', null
  )$$,
  '22023', null,
  'negative opening quantity is rejected'
);

select is(
  (select count(*)::int from public.inventory_balances where business_id = '22000000-0000-4000-8000-000000000002'),
  0,
  'Owner A cannot read Owner B stock balance'
);

select throws_ok(
  $$select public.adjust_inventory_stock(
    '72000000-0000-4000-8000-000000000002', 'IN', 1, 'cross-tenant attempt', '82000000-0000-4000-8000-000000000008'
  )$$,
  '42501', null,
  'Owner A cannot change stock for Owner B product'
);

select throws_ok(
  $$insert into public.inventory_balances (business_id, product_id, quantity)
    values ('22000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 999)$$,
  '42501', null,
  'direct balance insertion is denied to authenticated client'
);

set local request.jwt.claims = '{"sub":"12000000-0000-4000-8000-000000000003","role":"authenticated"}';

select is(
  (select count(*)::int from public.inventory_balances),
  0,
  'Staff without inventory.view cannot read balances by default'
);

select is(
  (select count(id)::int from public.inventory_movements),
  0,
  'Staff without inventory.view cannot read movement history by default'
);

select throws_ok(
  $$select public.adjust_inventory_stock(
    '72000000-0000-4000-8000-000000000001', 'IN', 1, 'no permission', '82000000-0000-4000-8000-000000000009'
  )$$,
  '42501', null,
  'Staff without inventory.adjust cannot post an adjustment'
);

set local request.jwt.claims = '{"sub":"12000000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.business_member_permissions(member_id, permission)
select id, 'inventory.view' from public.business_members
where user_id = '12000000-0000-4000-8000-000000000003';

set local request.jwt.claims = '{"sub":"12000000-0000-4000-8000-000000000003","role":"authenticated"}';

select is(
  (select count(*)::int from public.inventory_balances),
  1,
  'Staff sees own business stock after inventory.view is granted'
);

select throws_ok(
  $$select public.adjust_inventory_stock(
    '72000000-0000-4000-8000-000000000001', 'IN', 1, 'view only', '82000000-0000-4000-8000-000000000010'
  )$$,
  '42501', null,
  'inventory.view alone does not authorize stock adjustments'
);

set local request.jwt.claims = '{"sub":"12000000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.business_member_permissions(member_id, permission)
select id, 'inventory.adjust' from public.business_members
where user_id = '12000000-0000-4000-8000-000000000003';

set local request.jwt.claims = '{"sub":"12000000-0000-4000-8000-000000000003","role":"authenticated"}';

select lives_ok(
  $$select public.adjust_inventory_stock(
    '72000000-0000-4000-8000-000000000001', 'IN', 0.125, 'approved staff adjustment', '82000000-0000-4000-8000-000000000011'
  )$$,
  'Staff with inventory.adjust can post a reasoned stock adjustment'
);

select is(
  (select quantity from public.inventory_balances where product_id = '72000000-0000-4000-8000-000000000001'),
  9.750::numeric,
  'authorized Staff adjustment updates only the current business balance'
);

select * from finish();
rollback;