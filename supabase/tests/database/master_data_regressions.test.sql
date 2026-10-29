-- Regression tests for preserving unchanged archived product references.
-- All fixtures are synthetic and the transaction is rolled back.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

insert into auth.users (id, email) values
  ('12000000-0000-4000-8000-000000000001',
   'phase2b-regression-owner@example.test');

insert into public.businesses (
  id, name, created_by, onboarding_key
) values (
  '22000000-0000-4000-8000-000000000001',
  'Phase 2B Regression Synthetic',
  '12000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001'
);

insert into public.business_members (business_id, user_id, role)
values (
  '22000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001',
  'OWNER'
);

insert into public.business_settings (business_id)
values ('22000000-0000-4000-8000-000000000001');

insert into public.product_categories (id, business_id, name_bn)
values (
  '52000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000001',
  'Regression Category'
);

insert into public.suppliers (id, business_id, name)
values (
  '62000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000001',
  'Regression Supplier'
);

insert into public.product_units (
  id, business_id, name_bn, name_en
) values (
  '82000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000001',
  'Regression Unit',
  'Regression Unit'
);

insert into public.products (
  id,
  business_id,
  name_bn,
  category_id,
  unit_id,
  preferred_supplier_id,
  default_selling_price
) values (
  '72000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000001',
  'Regression Product',
  '52000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001',
  50
);

set local role authenticated;

set local request.jwt.claims =
  '{"sub":"12000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- Archive the category, then retain the same category during a product edit.
update public.product_categories
set archived_at = now()
where id = '52000000-0000-4000-8000-000000000001';

select lives_ok(
  $$update public.products
      set name_bn = 'Product edited after category archive',
          category_id = '52000000-0000-4000-8000-000000000001'
    where id = '72000000-0000-4000-8000-000000000001'$$,
  'product edit can preserve its unchanged archived category'
);

select throws_ok(
  $$insert into public.products (
      business_id, name_bn, category_id, unit_id, default_selling_price
    ) values (
      '22000000-0000-4000-8000-000000000001',
      'Rejected archived category',
      '52000000-0000-4000-8000-000000000001',
      (select id from public.product_units
       where business_id = '22000000-0000-4000-8000-000000000001'
         and code = 'PCS'),
      50
    )$$,
  '23514',
  null,
  'new product cannot be assigned an archived category'
);

-- Archive the custom unit, then retain the same unit during a product edit.
update public.product_units
set archived_at = now()
where id = '82000000-0000-4000-8000-000000000001';

select lives_ok(
  $$update public.products
      set name_bn = 'Product edited after unit archive',
          unit_id = '82000000-0000-4000-8000-000000000001'
    where id = '72000000-0000-4000-8000-000000000001'$$,
  'product edit can preserve its unchanged archived unit'
);

select throws_ok(
  $$insert into public.products (
      business_id, name_bn, unit_id, default_selling_price
    ) values (
      '22000000-0000-4000-8000-000000000001',
      'Rejected archived unit',
      '82000000-0000-4000-8000-000000000001',
      50
    )$$,
  '23514',
  null,
  'new product cannot be assigned an archived unit'
);

-- Archive the supplier, then retain it during a product edit.
update public.suppliers
set archived_at = now()
where id = '62000000-0000-4000-8000-000000000001';

select lives_ok(
  $$update public.products
      set name_bn = 'Product edited after supplier archive',
          preferred_supplier_id = '62000000-0000-4000-8000-000000000001'
    where id = '72000000-0000-4000-8000-000000000001'$$,
  'product edit can preserve its unchanged archived supplier'
);

select throws_ok(
  $$insert into public.products (
      business_id, name_bn, unit_id,
      preferred_supplier_id, default_selling_price
    ) values (
      '22000000-0000-4000-8000-000000000001',
      'Rejected archived supplier',
      (select id from public.product_units
       where business_id = '22000000-0000-4000-8000-000000000001'
         and code = 'PCS'),
      '62000000-0000-4000-8000-000000000001',
      50
    )$$,
  '23514',
  null,
  'new product cannot be assigned an archived supplier'
);

reset role;

select * from finish();

rollback;