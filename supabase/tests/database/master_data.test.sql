
-- Phase 2B master-data security tests.
-- Run only after 20261020000100_master_data.sql is applied to a disposable
-- local database or the explicitly authorized mini erp dev project.
-- This file uses synthetic fixtures, preserves BEGIN/ROLLBACK, and never
-- deletes or changes non-fixture business data.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id, email) values
  ('11000000-0000-4000-8000-000000000001', 'phase2b-owner-a@example.test'),
  ('11000000-0000-4000-8000-000000000002', 'phase2b-owner-b@example.test'),
  ('11000000-0000-4000-8000-000000000003', 'phase2b-staff-a@example.test');

insert into public.businesses(id, name, created_by, onboarding_key) values
  ('21000000-0000-4000-8000-000000000001', 'Phase 2B Synthetic A',
   '11000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001'),
  ('21000000-0000-4000-8000-000000000002', 'Phase 2B Synthetic B',
   '11000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000002');

insert into public.business_members(business_id, user_id, role) values
  ('21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'OWNER'),
  ('21000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000002', 'OWNER'),
  ('21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000003', 'STAFF');

insert into public.business_settings(business_id) values
  ('21000000-0000-4000-8000-000000000001'),
  ('21000000-0000-4000-8000-000000000002');

insert into public.product_categories(id, business_id, name_bn) values
  ('51000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Phase 2B Category A'),
  ('51000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002', 'Phase 2B Category B');

insert into public.suppliers(id, business_id, name, phone) values
  ('61000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Phase 2B Supplier A', null),
  ('61000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002', 'Phase 2B Supplier B', null);

insert into public.customers(id, business_id, name, phone) values
  ('62000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Phase 2B Customer A', null),
  ('62000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002', 'Phase 2B Customer B', null);

insert into public.products(
  id, business_id, name_bn, category_id, unit_id, preferred_supplier_id,
  default_selling_price, minimum_stock
) values
  ('71000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001',
   'Phase 2B Product A', '51000000-0000-4000-8000-000000000001',
   (select id from public.product_units where business_id = '21000000-0000-4000-8000-000000000001' and code = 'KG'),
   '61000000-0000-4000-8000-000000000001', 80.50, 2),
  ('71000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002',
   'Phase 2B Product B', '51000000-0000-4000-8000-000000000002',
   (select id from public.product_units where business_id = '21000000-0000-4000-8000-000000000002' and code = 'KG'),
   '61000000-0000-4000-8000-000000000002', 90.00, null);

insert into public.product_purchase_references(business_id, product_id, reference_purchase_price) values
  ('21000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 70.25),
  ('21000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002', 75.00);

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = any(array[
       'product_categories', 'product_units', 'customers', 'suppliers',
       'products', 'product_purchase_references'
     ]) and c.relrowsecurity),
  6,
  'RLS is enabled on every Phase 2B master-data table'
);
select is(
  (select count(*)::int from public.product_units where business_id = '21000000-0000-4000-8000-000000000001' and is_builtin),
  9,
  'new businesses receive nine immutable standard unit definitions'
);
select ok(
  not has_table_privilege('authenticated', 'public.products', 'DELETE'),
  'authenticated clients cannot hard-delete products'
);
select ok(
  not has_table_privilege('authenticated', 'public.customers', 'DELETE'),
  'authenticated clients cannot hard-delete customers'
);
select ok(
  not has_table_privilege('authenticated', 'public.product_categories', 'DELETE')
  and not has_table_privilege('authenticated', 'public.product_units', 'DELETE')
  and not has_table_privilege('authenticated', 'public.suppliers', 'DELETE')
  and not has_table_privilege('authenticated', 'public.product_purchase_references', 'DELETE'),
  'authenticated clients cannot hard-delete other master-data records'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is((select count(*)::int from public.products where business_id = '21000000-0000-4000-8000-000000000001'), 1, 'Owner A reads own products');
select is((select count(*)::int from public.products where business_id = '21000000-0000-4000-8000-000000000002'), 0, 'Owner A cannot read Owner B products');
select is((select count(*)::int from public.customers), 1, 'Owner A reads only own customer records');
select is((select count(*)::int from public.suppliers), 1, 'Owner A reads only own supplier records');
select is((select count(*)::int from public.product_purchase_references), 1, 'Owner can read own purchase reference price');

select throws_ok(
  $$update public.products set category_id = '51000000-0000-4000-8000-000000000002'
    where id = '71000000-0000-4000-8000-000000000001'$$,
  '23503', null,
  'composite foreign keys reject cross-business category references'
);
select throws_ok(
  $$update public.products set preferred_supplier_id = '61000000-0000-4000-8000-000000000002'
    where id = '71000000-0000-4000-8000-000000000001'$$,
  '23503', null,
  'composite foreign keys reject cross-business supplier references'
);

select lives_ok(
  $$update public.product_categories set archived_at = now()
    where id = '51000000-0000-4000-8000-000000000001'$$,
  'Owner can archive a category without deleting existing product references'
);
select throws_ok(
  $$insert into public.products (business_id, name_bn, category_id, unit_id, default_selling_price)
    values ('21000000-0000-4000-8000-000000000001', 'Archived category probe',
      '51000000-0000-4000-8000-000000000001',
      (select id from public.product_units where business_id = '21000000-0000-4000-8000-000000000001' and code = 'KG'), 10)$$,
  '23514', null,
  'a newly inserted product cannot select an archived category'
);
select lives_ok(
  $$update public.product_categories set archived_at = null
    where id = '51000000-0000-4000-8000-000000000001'$$,
  'Owner can restore the category'
);
select throws_ok(
  $$update public.product_units set archived_at = now()
    where business_id = '21000000-0000-4000-8000-000000000001' and code = 'KG'$$,
  '42501', null,
  'built-in unit definitions cannot be archived'
);
select throws_ok(
  $$insert into public.products (business_id, name_bn, unit_id, default_selling_price)
    values ('21000000-0000-4000-8000-000000000001', 'NaN price probe',
      (select id from public.product_units where business_id = '21000000-0000-4000-8000-000000000001' and code = 'KG'), 'NaN'::numeric)$$,
  '23514', null,
  'non-finite price values are rejected'
);
select lives_ok(
  $$insert into public.product_units (business_id, name_bn, name_en)
    values ('21000000-0000-4000-8000-000000000001', 'Phase 2B custom unit', 'Custom unit')$$,
  'Owner can create a business-scoped custom unit'
);
select lives_ok(
  $$update public.product_units set archived_at = now()
    where business_id = '21000000-0000-4000-8000-000000000001' and name_bn = 'Phase 2B custom unit'$$,
  'Owner can archive a custom unit'
);
select lives_ok(
  $$update public.product_units set archived_at = null
    where business_id = '21000000-0000-4000-8000-000000000001' and name_bn = 'Phase 2B custom unit'$$,
  'Owner can restore a custom unit'
);
select lives_ok(
  $$update public.products set archived_at = now()
    where id = '71000000-0000-4000-8000-000000000001'$$,
  'Owner can archive a product without deleting its references'
);
select lives_ok(
  $$update public.products set archived_at = null
    where id = '71000000-0000-4000-8000-000000000001'$$,
  'Owner can restore a product'
);

-- A Staff member with no grants sees no business records and cannot write.
set local request.jwt.claims = '{"sub":"11000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.products), 0, 'Staff defaults deny product reads');
select is((select count(*)::int from public.customers), 0, 'Staff defaults deny customer reads');
select is((select count(*)::int from public.suppliers), 0, 'Staff defaults deny supplier reads');
select is((select count(*)::int from public.product_purchase_references), 0, 'Staff cannot read purchase references without costs.read');
select throws_ok(
  $$insert into public.customers (business_id, name) values ('21000000-0000-4000-8000-000000000001', 'Denied customer')$$,
  '42501', null,
  'Staff cannot create a customer without customers.manage'
);
select throws_ok(
  $$insert into public.products (business_id, name_bn, unit_id, default_selling_price)
    values ('21000000-0000-4000-8000-000000000001', 'Denied product',
      (select id from public.product_units where business_id = '21000000-0000-4000-8000-000000000001' and code = 'KG'), 10)$$,
  '42501', null,
  'Staff cannot create a product without products.manage'
);

-- Owner grants only the capabilities needed for later checks.
set local request.jwt.claims = '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into public.business_member_permissions(member_id, permission)
select id, permission_name
from public.business_members
cross join (values ('products.view'), ('customers.view')) as grant_list(permission_name)
where user_id = '11000000-0000-4000-8000-000000000003'
  and business_id = '21000000-0000-4000-8000-000000000001'
on conflict (member_id, permission) do nothing;

set local request.jwt.claims = '{"sub":"11000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.products), 1, 'products.view grants Staff read access to own business');
select is((select count(*)::int from public.products where business_id = '21000000-0000-4000-8000-000000000002'), 0, 'products.view does not cross tenant boundaries');
select is((select count(*)::int from public.customers), 1, 'customers.view grants only own customer rows');
select is((select count(*)::int from public.suppliers), 0, 'customer grants do not imply supplier access');
select is((select count(*)::int from public.product_purchase_references), 0, 'products.view alone does not expose purchase reference prices');
select results_eq(
  $$update public.products set name_bn = 'Denied update' where id = '71000000-0000-4000-8000-000000000001' returning id$$,
  $$select null::uuid where false$$,
  'products.view does not imply products.manage'
);

set local request.jwt.claims = '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into public.business_member_permissions(member_id, permission)
select id, permission_name
from public.business_members
cross join (values ('products.manage'), ('costs.read'), ('customers.manage')) as grant_list(permission_name)
where user_id = '11000000-0000-4000-8000-000000000003'
  and business_id = '21000000-0000-4000-8000-000000000001'
on conflict (member_id, permission) do nothing;

set local request.jwt.claims = '{"sub":"11000000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok(
  $$insert into public.products (business_id, name_bn, unit_id, default_selling_price)
    values ('21000000-0000-4000-8000-000000000001', 'Staff-managed product',
      (select id from public.product_units where business_id = '21000000-0000-4000-8000-000000000001' and code = 'PCS'), '12.50')$$,
  'Staff can create own products with products.manage'
);
select is((select count(*)::int from public.product_purchase_references), 1, 'costs.read and products.manage do not expose other businesses purchase references');
select lives_ok(
  $$update public.product_purchase_references set reference_purchase_price = '71.25'
    where business_id = '21000000-0000-4000-8000-000000000001'
      and product_id = '71000000-0000-4000-8000-000000000001'$$,
  'Staff can update current reference purchase price only with products.manage and costs.read'
);
select lives_ok(
  $$update public.customers set archived_at = now()
    where id = '62000000-0000-4000-8000-000000000001'$$,
  'Staff with customers.manage can archive an own-business customer'
);
select lives_ok(
  $$update public.customers set archived_at = null
    where id = '62000000-0000-4000-8000-000000000001'$$,
  'Staff with customers.manage can restore an own-business customer'
);

-- Revoking Staff membership takes effect for the next request without changing JWT claims.
set local request.jwt.claims = '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}';
update public.business_members set status = 'INACTIVE'
where user_id = '11000000-0000-4000-8000-000000000003'
  and business_id = '21000000-0000-4000-8000-000000000001';

set local request.jwt.claims = '{"sub":"11000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.products), 0, 'inactive Staff loses product access immediately');
select is((select count(*)::int from public.customers), 0, 'inactive Staff loses customer access immediately');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok('select * from public.products', '42501', null, 'anonymous cannot read products');
select throws_ok('select * from public.product_categories', '42501', null, 'anonymous cannot read categories');
select throws_ok('select * from public.product_units', '42501', null, 'anonymous cannot read units');
select throws_ok('select * from public.customers', '42501', null, 'anonymous cannot read customers');
select throws_ok('select * from public.suppliers', '42501', null, 'anonymous cannot read suppliers');
select throws_ok('select * from public.product_purchase_references', '42501', null, 'anonymous cannot read purchase references');

reset role;
select * from finish();
rollback;
