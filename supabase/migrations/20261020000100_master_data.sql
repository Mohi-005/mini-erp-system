
-- Phase 2B: tenant-scoped master data only.
-- No sales/purchase posting, inventory movements/balances, party balances,
-- payments, invoices, cost history, image storage, or financial RPCs are added.

-- Resolve a business-scoped permission from the authenticated actor's active
-- membership. OWNER authority is inherent; STAFF remains deny-by-default.
create or replace function private.has_business_permission(
  target_business uuid,
  target_permission text
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members as member
    where member.business_id = target_business
      and member.user_id = (select auth.uid())
      and member.status = 'ACTIVE'
      and (
        member.role = 'OWNER'
        or (
          member.role = 'STAFF'
          and exists (
            select 1
            from public.business_member_permissions as permission_grant
            where permission_grant.member_id = member.id
              and permission_grant.permission = target_permission
          )
        )
      )
  );
$$;

revoke all on function private.has_business_permission(uuid, text)
  from public, anon, authenticated;
grant execute on function private.has_business_permission(uuid, text)
  to authenticated;

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  name_bn text not null
    check (length(btrim(name_bn)) between 1 and 100),
  name_en text
    check (name_en is null or length(btrim(name_en)) between 1 and 100),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);

create table public.product_units (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  code text
    check (code is null or code ~ '^[A-Z][A-Z0-9_-]{0,31}$'),
  name_bn text not null
    check (length(btrim(name_bn)) between 1 and 60),
  name_en text
    check (name_en is null or length(btrim(name_en)) between 1 and 60),
  is_builtin boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, code)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  name text not null
    check (length(btrim(name)) between 1 and 160),
  phone text
    check (phone is null or length(btrim(phone)) between 1 and 30),
  address text
    check (address is null or length(address) <= 500),
  notes text
    check (notes is null or length(notes) <= 2000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  name text not null
    check (length(btrim(name)) between 1 and 160),
  phone text
    check (phone is null or length(btrim(phone)) between 1 and 30),
  address text
    check (address is null or length(address) <= 500),
  notes text
    check (notes is null or length(notes) <= 2000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  name_bn text not null
    check (length(btrim(name_bn)) between 1 and 160),
  name_en text
    check (name_en is null or length(btrim(name_en)) between 1 and 160),
  sku text
    check (sku is null or length(btrim(sku)) between 1 and 60),
  category_id uuid,
  unit_id uuid not null,
  preferred_supplier_id uuid,
  default_selling_price numeric not null
    check (
      default_selling_price >= 0
      and default_selling_price < 'Infinity'::numeric
    ),
  minimum_stock numeric
    check (
      minimum_stock is null
      or (minimum_stock >= 0 and minimum_stock < 'Infinity'::numeric)
    ),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  constraint products_category_same_business_fk
    foreign key (business_id, category_id)
    references public.product_categories(business_id, id) on delete restrict,
  constraint products_unit_same_business_fk
    foreign key (business_id, unit_id)
    references public.product_units(business_id, id) on delete restrict,
  constraint products_preferred_supplier_same_business_fk
    foreign key (business_id, preferred_supplier_id)
    references public.suppliers(business_id, id) on delete restrict
);

-- Current master/reference purchase price only, not historical purchase cost.
-- Kept separate so products.view alone cannot disclose it without costs.read.
create table public.product_purchase_references (
  business_id uuid not null,
  product_id uuid not null,
  reference_purchase_price numeric not null
    check (
      reference_purchase_price >= 0
      and reference_purchase_price < 'Infinity'::numeric
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, product_id),
  constraint product_purchase_references_same_business_fk
    foreign key (business_id, product_id)
    references public.products(business_id, id) on delete restrict
);

create index product_categories_business_archive_idx
  on public.product_categories (business_id, archived_at);
create index product_units_business_archive_idx
  on public.product_units (business_id, archived_at);
create index customers_business_archive_idx
  on public.customers (business_id, archived_at);
create index suppliers_business_archive_idx
  on public.suppliers (business_id, archived_at);
create index products_business_archive_idx
  on public.products (business_id, archived_at);
create index products_business_category_idx
  on public.products (business_id, category_id)
  where category_id is not null;
create index products_business_unit_idx
  on public.products (business_id, unit_id);
create index products_business_supplier_idx
  on public.products (business_id, preferred_supplier_id)
  where preferred_supplier_id is not null;

-- Keep updated_at managed by the existing Phase 2A private trigger function.
create trigger product_categories_touch_updated_at
before update on public.product_categories
for each row execute function private.touch_updated_at();
create trigger product_units_touch_updated_at
before update on public.product_units
for each row execute function private.touch_updated_at();
create trigger customers_touch_updated_at
before update on public.customers
for each row execute function private.touch_updated_at();
create trigger suppliers_touch_updated_at
before update on public.suppliers
for each row execute function private.touch_updated_at();
create trigger products_touch_updated_at
before update on public.products
for each row execute function private.touch_updated_at();
create trigger product_purchase_references_touch_updated_at
before update on public.product_purchase_references
for each row execute function private.touch_updated_at();

-- Standard units are per-business. No conversion engine or assumed bag weight.
create function private.seed_default_product_units() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.product_units (business_id, code, name_bn, name_en, is_builtin)
  values
    (new.id, 'PCS', 'পিস', 'Piece', true),
    (new.id, 'KG', 'কেজি', 'Kilogram', true),
    (new.id, 'G', 'গ্রাম', 'Gram', true),
    (new.id, 'L', 'লিটার', 'Litre', true),
    (new.id, 'ML', 'মিলিলিটার', 'Millilitre', true),
    (new.id, 'PACKET', 'প্যাকেট', 'Packet', true),
    (new.id, 'BOX', 'বক্স', 'Box', true),
    (new.id, 'BAG', 'বস্তা', 'Bag', true),
    (new.id, 'DOZEN', 'ডজন', 'Dozen', true)
  on conflict (business_id, code) do nothing;
  return new;
end;
$$;

revoke all on function private.seed_default_product_units()
  from public, anon, authenticated;

create trigger businesses_seed_default_product_units
  after insert on public.businesses
  for each row execute function private.seed_default_product_units();

-- Backfill standard units for businesses created before this migration.
insert into public.product_units (business_id, code, name_bn, name_en, is_builtin)
select business_record.id,
       unit_record.code,
       unit_record.name_bn,
       unit_record.name_en,
       true
from public.businesses as business_record
cross join (
  values
    ('PCS', 'পিস', 'Piece'),
    ('KG', 'কেজি', 'Kilogram'),
    ('G', 'গ্রাম', 'Gram'),
    ('L', 'লিটার', 'Litre'),
    ('ML', 'মিলিলিটার', 'Millilitre'),
    ('PACKET', 'প্যাকেট', 'Packet'),
    ('BOX', 'বক্স', 'Box'),
    ('BAG', 'বস্তা', 'Bag'),
    ('DOZEN', 'ডজন', 'Dozen')
) as unit_record(code, name_bn, name_en)
on conflict (business_id, code) do nothing;

-- Built-in unit definitions cannot be renamed or archived.
create function private.protect_builtin_product_unit() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_builtin and (
    new.code is distinct from old.code
    or new.name_bn is distinct from old.name_bn
    or new.name_en is distinct from old.name_en
    or new.archived_at is distinct from old.archived_at
  ) then
    raise exception 'Built-in product units are immutable'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_builtin_product_unit()
  from public, anon, authenticated;

create trigger product_units_protect_builtin
before update on public.product_units
for each row execute function private.protect_builtin_product_unit();

-- New/changed product references cannot select archived master rows.
-- Existing product references remain intact when a master is archived.
create function private.reject_archived_product_references() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  referenced_archived_at timestamptz;
begin
  if new.category_id is not null then
    select category.archived_at into referenced_archived_at
    from public.product_categories as category
    where category.business_id = new.business_id
      and category.id = new.category_id;

    if found and referenced_archived_at is not null then
      raise exception 'Archived category cannot be assigned to a product'
        using errcode = '23514';
    end if;
  end if;

  select unit_record.archived_at into referenced_archived_at
  from public.product_units as unit_record
  where unit_record.business_id = new.business_id
    and unit_record.id = new.unit_id;

  if found and referenced_archived_at is not null then
    raise exception 'Archived unit cannot be assigned to a product'
      using errcode = '23514';
  end if;

  if new.preferred_supplier_id is not null then
    select supplier.archived_at into referenced_archived_at
    from public.suppliers as supplier
    where supplier.business_id = new.business_id
      and supplier.id = new.preferred_supplier_id;

    if found and referenced_archived_at is not null then
      raise exception 'Archived supplier cannot be assigned to a product'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.reject_archived_product_references()
  from public, anon, authenticated;

create trigger products_reject_archived_references
before insert or update of category_id, unit_id, preferred_supplier_id
on public.products
for each row execute function private.reject_archived_product_references();

-- Explicit least-privilege grants. Clients cannot change IDs, tenant IDs,
-- timestamps, built-in flags, unit codes, or purchase-price row ownership.
alter table public.product_categories enable row level security;
alter table public.product_units enable row level security;
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.product_purchase_references enable row level security;

revoke all on public.product_categories, public.product_units, public.customers,
  public.suppliers, public.products, public.product_purchase_references
  from public, anon, authenticated;

grant select on public.product_categories, public.product_units, public.customers,
  public.suppliers, public.products, public.product_purchase_references
  to authenticated;

grant insert (business_id, name_bn, name_en)
  on public.product_categories to authenticated;
grant update (name_bn, name_en, archived_at)
  on public.product_categories to authenticated;

grant insert (business_id, name_bn, name_en)
  on public.product_units to authenticated;
grant update (name_bn, name_en, archived_at)
  on public.product_units to authenticated;

grant insert (business_id, name, phone, address, notes)
  on public.customers to authenticated;
grant update (name, phone, address, notes, archived_at)
  on public.customers to authenticated;

grant insert (business_id, name, phone, address, notes)
  on public.suppliers to authenticated;
grant update (name, phone, address, notes, archived_at)
  on public.suppliers to authenticated;

grant insert (
  business_id, name_bn, name_en, sku, category_id, unit_id,
  preferred_supplier_id, default_selling_price, minimum_stock
) on public.products to authenticated;

grant update (
  name_bn, name_en, sku, category_id, unit_id,
  preferred_supplier_id, default_selling_price, minimum_stock, archived_at
) on public.products to authenticated;

grant insert (business_id, product_id, reference_purchase_price)
  on public.product_purchase_references to authenticated;
grant update (reference_purchase_price)
  on public.product_purchase_references to authenticated;

create policy product_categories_read on public.product_categories
for select to authenticated
using (private.has_business_permission(business_id, 'products.view'));

create policy product_categories_insert on public.product_categories
for insert to authenticated
with check (private.has_business_permission(business_id, 'products.manage'));

create policy product_categories_update on public.product_categories
for update to authenticated
using (private.has_business_permission(business_id, 'products.manage'))
with check (private.has_business_permission(business_id, 'products.manage'));

create policy product_units_read on public.product_units
for select to authenticated
using (private.has_business_permission(business_id, 'products.view'));

create policy product_units_insert on public.product_units
for insert to authenticated
with check (private.has_business_permission(business_id, 'products.manage'));

create policy product_units_update on public.product_units
for update to authenticated
using (private.has_business_permission(business_id, 'products.manage'))
with check (private.has_business_permission(business_id, 'products.manage'));

create policy customers_read on public.customers
for select to authenticated
using (private.has_business_permission(business_id, 'customers.view'));

create policy customers_insert on public.customers
for insert to authenticated
with check (private.has_business_permission(business_id, 'customers.manage'));

create policy customers_update on public.customers
for update to authenticated
using (private.has_business_permission(business_id, 'customers.manage'))
with check (private.has_business_permission(business_id, 'customers.manage'));

create policy suppliers_read on public.suppliers
for select to authenticated
using (private.has_business_permission(business_id, 'suppliers.view'));

create policy suppliers_insert on public.suppliers
for insert to authenticated
with check (private.has_business_permission(business_id, 'suppliers.manage'));

create policy suppliers_update on public.suppliers
for update to authenticated
using (private.has_business_permission(business_id, 'suppliers.manage'))
with check (private.has_business_permission(business_id, 'suppliers.manage'));

create policy products_read on public.products
for select to authenticated
using (private.has_business_permission(business_id, 'products.view'));

create policy products_insert on public.products
for insert to authenticated
with check (private.has_business_permission(business_id, 'products.manage'));

create policy products_update on public.products
for update to authenticated
using (private.has_business_permission(business_id, 'products.manage'))
with check (private.has_business_permission(business_id, 'products.manage'));

create policy product_purchase_references_read
on public.product_purchase_references
for select to authenticated
using (
  private.has_business_permission(business_id, 'products.view')
  and private.has_business_permission(business_id, 'costs.read')
);

create policy product_purchase_references_insert
on public.product_purchase_references
for insert to authenticated
with check (
  private.has_business_permission(business_id, 'products.manage')
  and private.has_business_permission(business_id, 'costs.read')
);

create policy product_purchase_references_update
on public.product_purchase_references
for update to authenticated
using (
  private.has_business_permission(business_id, 'products.manage')
  and private.has_business_permission(business_id, 'costs.read')
)
with check (
  private.has_business_permission(business_id, 'products.manage')
  and private.has_business_permission(business_id, 'costs.read')
);
