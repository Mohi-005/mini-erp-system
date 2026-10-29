begin;

-- Phase 2E: transactional sales, purchases, collections, expenses and shop directory.
-- Existing visual design is not changed by this migration. Live business data remains
-- in Postgres; all posting RPCs are atomic, tenant scoped and duplicate-safe.

-- Shops are business customers, not authentication accounts. Individual customers
-- continue to work without a shop code. Old rows migrate as INDIVIDUAL.
alter table public.customers
  add column customer_type text not null default 'INDIVIDUAL'
    check (customer_type in ('INDIVIDUAL', 'SHOP')),
  add column owner_name text check (owner_name is null or length(btrim(owner_name)) between 1 and 160),
  add column shop_number text check (shop_number is null or length(btrim(shop_number)) <= 80),
  add column shop_code text check (shop_code is null or length(btrim(shop_code)) between 1 and 40),
  add column email text check (email is null or (length(btrim(email)) between 3 and 254 and btrim(email) !~ '[[:space:]]' and btrim(email) ~ '^[^@]+@[^@]+[.][^@]+$'));
alter table public.businesses add column email text check (email is null or (length(btrim(email)) between 3 and 254 and btrim(email) !~ '[[:space:]]' and btrim(email) ~ '^[^@]+@[^@]+[.][^@]+$'));

create unique index customers_business_shop_code_ci_uq
  on public.customers (business_id, lower(btrim(shop_code)))
  where shop_code is not null;
create index customers_business_type_active_idx
  on public.customers (business_id, customer_type, archived_at);
alter table public.customers add constraint customers_shop_fields_ck check (
  customer_type <> 'SHOP' or (
    owner_name is not null and length(btrim(owner_name)) between 1 and 160
    and shop_code is not null and length(btrim(shop_code)) between 1 and 40
    and phone is not null
    and regexp_replace(phone, '[^0-9]', '', 'g') ~ '^(?:8801[3-9][0-9]{8}|01[3-9][0-9]{8})$'
  )
);
alter table public.customers add column linked_supplier_id uuid;
alter table public.customers add constraint customers_linked_supplier_same_business_fk
  foreign key (business_id, linked_supplier_id) references public.suppliers(business_id, id) on delete restrict;

alter table public.inventory_movements
  add column unit_cost numeric
    check (unit_cost is null or (unit_cost >= 0 and unit_cost < 'Infinity'::numeric)),
  add column value_delta numeric
    check (value_delta is null or (value_delta > '-Infinity'::numeric and value_delta < 'Infinity'::numeric));

-- Revoke the Phase 2C table-wide SELECT grant before cost fields can be read.
-- Only non-cost movement fields remain selectable by inventory.view users.
revoke select on public.inventory_movements from public, anon, authenticated;
grant select (id, business_id, product_id, movement_type, quantity_delta,
  quantity_after, source_kind, source_id, operation_id, reason, created_by, created_at)
  on public.inventory_movements to authenticated;

-- Keep unknown historical/opening stock separate from stock that has a known cost.
-- We never substitute the current reference purchase price for an unknown historic cost.
create table public.inventory_cost_state (
  business_id uuid not null,
  product_id uuid not null,
  priced_quantity numeric not null default 0 check (priced_quantity >= 0 and priced_quantity < 'Infinity'::numeric),
  unpriced_quantity numeric not null default 0 check (unpriced_quantity >= 0 and unpriced_quantity < 'Infinity'::numeric),
  average_unit_cost numeric not null default 0 check (average_unit_cost >= 0 and average_unit_cost < 'Infinity'::numeric),
  updated_at timestamptz not null default now(),
  primary key (business_id, product_id),
  foreign key (business_id, product_id) references public.products(business_id, id) on delete restrict,
  constraint inventory_cost_state_zero_cost_ck check (priced_quantity > 0 or average_unit_cost = 0)
);
insert into public.inventory_cost_state (business_id, product_id, unpriced_quantity)
select p.business_id, p.id, coalesce(b.quantity, 0)
from public.products p
left join public.inventory_balances b on b.business_id = p.business_id and b.product_id = p.id
on conflict (business_id, product_id) do nothing;

create function private.apply_inventory_cost_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.inventory_cost_state%rowtype;
  v_increase numeric;
  v_unknown_out numeric;
  v_priced_out numeric;
  v_new_priced numeric;
begin
  insert into public.inventory_cost_state (business_id, product_id)
  values (new.business_id, new.product_id)
  on conflict (business_id, product_id) do nothing;

  select * into v_state
  from public.inventory_cost_state
  where business_id = new.business_id and product_id = new.product_id
  for update;

  if new.quantity_delta > 0 then
    if new.unit_cost is null then
      update public.inventory_cost_state
        set unpriced_quantity = unpriced_quantity + new.quantity_delta,
            updated_at = now()
        where business_id = new.business_id and product_id = new.product_id;
    else
      v_new_priced := v_state.priced_quantity + new.quantity_delta;
      update public.inventory_cost_state
        set average_unit_cost = case
              when v_new_priced = 0 then 0
              else round(((v_state.priced_quantity * v_state.average_unit_cost)
                + (new.quantity_delta * new.unit_cost)) / v_new_priced, 6)
            end,
            priced_quantity = v_new_priced,
            updated_at = now()
        where business_id = new.business_id and product_id = new.product_id;
    end if;
  elsif new.quantity_delta < 0 then
    v_increase := abs(new.quantity_delta);
    v_unknown_out := least(v_increase, v_state.unpriced_quantity);
    v_priced_out := v_increase - v_unknown_out;
    if v_priced_out > v_state.priced_quantity then
      raise exception 'cost_state_stock_mismatch' using errcode = '23514';
    end if;
    update public.inventory_cost_state
      set unpriced_quantity = v_state.unpriced_quantity - v_unknown_out,
          priced_quantity = v_state.priced_quantity - v_priced_out,
          average_unit_cost = case when v_state.priced_quantity - v_priced_out = 0 then 0 else v_state.average_unit_cost end,
          updated_at = now()
      where business_id = new.business_id and product_id = new.product_id;
  end if;
  return new;
end;
$$;
revoke all on function private.apply_inventory_cost_movement() from public, anon, authenticated;
create trigger inventory_movement_tracks_cost_state
  after insert on public.inventory_movements
  for each row execute function private.apply_inventory_cost_movement();

create table public.sales_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  invoice_no text not null check (length(invoice_no) between 5 and 60),
  operation_id uuid not null,
  request_fingerprint text not null check (length(request_fingerprint) = 32),
  customer_id uuid,
  customer_name_snapshot text not null check (length(btrim(customer_name_snapshot)) between 1 and 160),
  total_amount numeric not null check (total_amount > 0 and total_amount < 'Infinity'::numeric),
  paid_amount_at_sale numeric not null default 0 check (paid_amount_at_sale >= 0 and paid_amount_at_sale <= total_amount),
  payment_method text check (payment_method is null or payment_method in ('CASH','BKASH','NAGAD','BANK')),
  occurred_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, invoice_no),
  unique (business_id, operation_id),
  foreign key (business_id, customer_id) references public.customers(business_id, id) on delete restrict,
  check (paid_amount_at_sale = 0 or payment_method is not null),
  check (paid_amount_at_sale = total_amount or customer_id is not null)
);
create index sales_documents_business_time_idx on public.sales_documents (business_id, occurred_at desc, id desc);
create index sales_documents_business_customer_time_idx on public.sales_documents (business_id, customer_id, occurred_at, id) where customer_id is not null;

create table public.sales_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  sales_document_id uuid not null,
  line_no integer not null check (line_no > 0),
  product_id uuid not null,
  product_name_bn_snapshot text not null,
  product_name_en_snapshot text,
  sku_snapshot text,
  unit_name_bn_snapshot text not null,
  quantity numeric not null check (quantity > 0 and quantity < 'Infinity'::numeric),
  unit_price numeric not null check (unit_price >= 0 and unit_price < 'Infinity'::numeric),
  line_total numeric not null check (line_total >= 0 and line_total < 'Infinity'::numeric),
  unit_cost_at_sale numeric check (unit_cost_at_sale is null or (unit_cost_at_sale >= 0 and unit_cost_at_sale < 'Infinity'::numeric)),
  cogs_amount numeric check (cogs_amount is null or (cogs_amount >= 0 and cogs_amount < 'Infinity'::numeric)),
  costing_status text not null check (costing_status in ('KNOWN','UNKNOWN')),
  created_at timestamptz not null default now(),
  unique (business_id, sales_document_id, line_no),
  foreign key (business_id, sales_document_id) references public.sales_documents(business_id, id) on delete restrict,
  foreign key (business_id, product_id) references public.products(business_id, id) on delete restrict,
  check ((costing_status = 'KNOWN' and unit_cost_at_sale is not null and cogs_amount is not null) or (costing_status = 'UNKNOWN' and unit_cost_at_sale is null and cogs_amount is null))
);
create index sales_lines_business_product_idx on public.sales_lines (business_id, product_id);

-- Cost columns are deliberately not directly selectable from the base table. The
-- read view enforces business permission itself and hides cost fields unless the
-- actor has profit.read; the normal sales view remains useful to sales-only Staff.
create view public.sales_lines_read with (security_barrier = true) as
select sl.id, sl.business_id, sl.sales_document_id, sl.line_no, sl.product_id,
       sl.product_name_bn_snapshot, sl.product_name_en_snapshot, sl.sku_snapshot,
       sl.unit_name_bn_snapshot, sl.quantity, sl.unit_price, sl.line_total, sl.created_at,
       case when private.has_business_permission(sl.business_id, 'profit.read') then sl.unit_cost_at_sale else null end as unit_cost_at_sale,
       case when private.has_business_permission(sl.business_id, 'profit.read') then sl.cogs_amount else null end as cogs_amount,
       case when private.has_business_permission(sl.business_id, 'profit.read') then sl.costing_status else 'UNKNOWN' end as costing_status,
       private.has_business_permission(sl.business_id, 'profit.read') as cost_visible
from public.sales_lines sl
where private.has_business_permission(sl.business_id, 'sales.view')
   or private.has_business_permission(sl.business_id, 'reports.view')
   or private.has_business_permission(sl.business_id, 'invoices.read');
revoke all on public.sales_lines_read from public, anon, authenticated;
grant select on public.sales_lines_read to authenticated;
revoke all on public.sales_lines from public, anon, authenticated;

create table public.purchases_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  invoice_no text not null check (length(invoice_no) between 5 and 60),
  operation_id uuid not null,
  request_fingerprint text not null check (length(request_fingerprint) = 32),
  supplier_id uuid not null,
  supplier_name_snapshot text not null check (length(btrim(supplier_name_snapshot)) between 1 and 160),
  reference_no text check (reference_no is null or length(reference_no) <= 100),
  subtotal_amount numeric not null check (subtotal_amount >= 0 and subtotal_amount < 'Infinity'::numeric),
  other_cost_total numeric not null default 0 check (other_cost_total >= 0 and other_cost_total < 'Infinity'::numeric),
  total_amount numeric not null check (total_amount > 0 and total_amount < 'Infinity'::numeric),
  paid_amount_at_purchase numeric not null default 0 check (paid_amount_at_purchase >= 0 and paid_amount_at_purchase <= total_amount),
  payment_method text check (payment_method is null or payment_method in ('CASH','BKASH','NAGAD','BANK')),
  occurred_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, invoice_no),
  unique (business_id, operation_id),
  foreign key (business_id, supplier_id) references public.suppliers(business_id, id) on delete restrict,
  check (abs(total_amount - (subtotal_amount + other_cost_total)) < 0.01),
  check (paid_amount_at_purchase = 0 or payment_method is not null)
);
create index purchases_documents_business_time_idx on public.purchases_documents (business_id, occurred_at desc, id desc);
create index purchases_documents_business_supplier_idx on public.purchases_documents (business_id, supplier_id, occurred_at, id);

create table public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  purchases_document_id uuid not null,
  line_no integer not null check (line_no > 0),
  product_id uuid not null,
  product_name_bn_snapshot text not null,
  product_name_en_snapshot text,
  sku_snapshot text,
  unit_name_bn_snapshot text not null,
  quantity numeric not null check (quantity > 0 and quantity < 'Infinity'::numeric),
  unit_cost numeric not null check (unit_cost >= 0 and unit_cost < 'Infinity'::numeric),
  line_total numeric not null check (line_total >= 0 and line_total < 'Infinity'::numeric),
  allocated_other_cost numeric not null default 0 check (allocated_other_cost >= 0 and allocated_other_cost < 'Infinity'::numeric),
  landed_unit_cost numeric not null check (landed_unit_cost >= 0 and landed_unit_cost < 'Infinity'::numeric),
  created_at timestamptz not null default now(),
  unique (business_id, purchases_document_id, line_no),
  foreign key (business_id, purchases_document_id) references public.purchases_documents(business_id, id) on delete restrict,
  foreign key (business_id, product_id) references public.products(business_id, id) on delete restrict
);
create index purchase_lines_business_product_idx on public.purchase_lines (business_id, product_id);

-- Read view for purchase details. Raw line-cost columns are never granted to clients;
-- the view decides row access and masks all line-level amounts without cost/profit permission.
create view public.purchase_lines_read with (security_barrier = true) as
select pl.id, pl.business_id, pl.purchases_document_id, pl.line_no, pl.product_id,
       pl.product_name_bn_snapshot, pl.product_name_en_snapshot, pl.sku_snapshot,
       pl.unit_name_bn_snapshot, pl.quantity,
       case when private.has_business_permission(pl.business_id, 'costs.read')
                  or private.has_business_permission(pl.business_id, 'profit.read')
            then pl.unit_cost else null end as unit_cost,
       case when private.has_business_permission(pl.business_id, 'costs.read')
                  or private.has_business_permission(pl.business_id, 'profit.read')
            then pl.line_total else null end as line_total,
       case when private.has_business_permission(pl.business_id, 'costs.read')
                  or private.has_business_permission(pl.business_id, 'profit.read')
            then pl.allocated_other_cost else null end as allocated_other_cost,
       case when private.has_business_permission(pl.business_id, 'costs.read')
                  or private.has_business_permission(pl.business_id, 'profit.read')
            then pl.landed_unit_cost else null end as landed_unit_cost,
       pl.created_at,
       (private.has_business_permission(pl.business_id, 'costs.read')
        or private.has_business_permission(pl.business_id, 'profit.read')) as cost_visible
from public.purchase_lines pl
where private.has_business_permission(pl.business_id, 'purchases.view')
   or private.has_business_permission(pl.business_id, 'reports.view')
   or private.has_business_permission(pl.business_id, 'invoices.read');

create table public.customer_receipts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  receipt_no text not null check (length(receipt_no) between 5 and 60),
  operation_id uuid not null,
  request_fingerprint text not null check (length(request_fingerprint) = 32),
  customer_id uuid not null,
  customer_name_snapshot text not null,
  amount numeric not null check (amount > 0 and amount < 'Infinity'::numeric),
  payment_method text not null check (payment_method in ('CASH','BKASH','NAGAD','BANK')),
  reference_no text check (reference_no is null or length(reference_no) <= 100),
  note text check (note is null or length(note) <= 500),
  received_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (business_id, id), unique (business_id, receipt_no), unique (business_id, operation_id),
  foreign key (business_id, customer_id) references public.customers(business_id, id) on delete restrict
);
create index customer_receipts_business_time_idx on public.customer_receipts (business_id, received_at desc);

create table public.customer_receipt_allocations (
  business_id uuid not null,
  receipt_id uuid not null,
  sales_document_id uuid not null,
  amount numeric not null check (amount > 0 and amount < 'Infinity'::numeric),
  created_at timestamptz not null default now(),
  primary key (business_id, receipt_id, sales_document_id),
  foreign key (business_id, receipt_id) references public.customer_receipts(business_id, id) on delete restrict,
  foreign key (business_id, sales_document_id) references public.sales_documents(business_id, id) on delete restrict
);
create index customer_receipt_allocations_sale_idx on public.customer_receipt_allocations (business_id, sales_document_id);

create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  payment_no text not null check (length(payment_no) between 5 and 60),
  operation_id uuid not null,
  request_fingerprint text not null check (length(request_fingerprint) = 32),
  supplier_id uuid not null,
  supplier_name_snapshot text not null,
  amount numeric not null check (amount > 0 and amount < 'Infinity'::numeric),
  payment_method text not null check (payment_method in ('CASH','BKASH','NAGAD','BANK')),
  reference_no text check (reference_no is null or length(reference_no) <= 100),
  note text check (note is null or length(note) <= 500),
  paid_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (business_id, id), unique (business_id, payment_no), unique (business_id, operation_id),
  foreign key (business_id, supplier_id) references public.suppliers(business_id, id) on delete restrict
);
create index supplier_payments_business_time_idx on public.supplier_payments (business_id, paid_at desc);

create table public.supplier_payment_allocations (
  business_id uuid not null,
  supplier_payment_id uuid not null,
  purchases_document_id uuid not null,
  amount numeric not null check (amount > 0 and amount < 'Infinity'::numeric),
  created_at timestamptz not null default now(),
  primary key (business_id, supplier_payment_id, purchases_document_id),
  foreign key (business_id, supplier_payment_id) references public.supplier_payments(business_id, id) on delete restrict,
  foreign key (business_id, purchases_document_id) references public.purchases_documents(business_id, id) on delete restrict
);
create index supplier_payment_allocations_purchase_idx on public.supplier_payment_allocations (business_id, purchases_document_id);

create table public.business_expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  operation_id uuid not null,
  request_fingerprint text not null check (length(request_fingerprint) = 32),
  category text not null check (length(btrim(category)) between 1 and 100),
  amount numeric not null check (amount > 0 and amount < 'Infinity'::numeric),
  expense_date date not null default (now() at time zone 'Asia/Dhaka')::date,
  payment_method text not null check (payment_method in ('CASH','BKASH','NAGAD','BANK')),
  reference_no text check (reference_no is null or length(reference_no) <= 100),
  note text check (note is null or length(note) <= 1000),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','VOIDED')),
  void_reason text check (void_reason is null or length(btrim(void_reason)) between 1 and 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  voided_by uuid references auth.users(id) on delete restrict,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, id), unique (business_id, operation_id),
  check ((status = 'ACTIVE' and voided_at is null and voided_by is null) or (status = 'VOIDED' and voided_at is not null and voided_by is not null and void_reason is not null))
);
create index business_expenses_business_date_idx on public.business_expenses (business_id, expense_date desc, id desc);

create table public.business_audit_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete restrict,
  action text not null check (length(action) between 1 and 80),
  record_type text not null check (length(record_type) between 1 and 80),
  record_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index business_audit_log_business_time_idx on public.business_audit_log (business_id, created_at desc);

-- Read-only views are SECURITY INVOKER so RLS applies to the underlying rows.
create view public.customer_due_summary with (security_invoker = true) as
select s.business_id, s.customer_id, c.name as customer_name, c.phone,
       coalesce(sum(s.total_amount - s.paid_amount_at_sale - coalesce(a.allocated, 0)), 0)::numeric as outstanding_amount
from public.sales_documents s
join public.customers c on c.business_id = s.business_id and c.id = s.customer_id
left join (
  select business_id, sales_document_id, sum(amount)::numeric as allocated
  from public.customer_receipt_allocations group by business_id, sales_document_id
) a on a.business_id = s.business_id and a.sales_document_id = s.id
where (
  (private.has_business_permission(s.business_id, 'payments.receive')
   and private.has_business_permission(s.business_id, 'sales.view'))
  or private.has_business_permission(s.business_id, 'reports.view')
  or private.has_business_permission(s.business_id, 'invoices.read')
)
group by s.business_id, s.customer_id, c.name, c.phone;
create view public.supplier_due_summary with (security_invoker = true) as
select p.business_id, p.supplier_id, s.name as supplier_name, s.phone,
       coalesce(sum(p.total_amount - p.paid_amount_at_purchase - coalesce(a.allocated, 0)), 0)::numeric as outstanding_amount
from public.purchases_documents p
join public.suppliers s on s.business_id = p.business_id and s.id = p.supplier_id
left join (
  select business_id, purchases_document_id, sum(amount)::numeric as allocated
  from public.supplier_payment_allocations group by business_id, purchases_document_id
) a on a.business_id = p.business_id and a.purchases_document_id = p.id
where (
  (private.has_business_permission(p.business_id, 'payments.pay')
   and private.has_business_permission(p.business_id, 'purchases.view'))
  or private.has_business_permission(p.business_id, 'reports.view')
  or private.has_business_permission(p.business_id, 'invoices.read')
)
group by p.business_id, p.supplier_id, s.name, s.phone;

alter table public.inventory_cost_state enable row level security;
create policy inventory_cost_state_read on public.inventory_cost_state for select to authenticated
  using (private.has_business_permission(business_id, 'inventory.value.read'));
revoke all on public.inventory_cost_state from public, anon, authenticated;
grant select on public.inventory_cost_state to authenticated;

-- Extend STAFF grants with the additional operational permissions used by this phase.
-- Preserve the OWNER/STAFF role model and keep STAFF deny-by-default.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.business_member_permissions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%permission%'
  loop
    execute format('alter table public.business_member_permissions drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.business_member_permissions add constraint business_member_permissions_permission_ck
  check (permission in (
    'sales.view','sales.create','sales.price_override',
    'purchases.view','purchases.create',
    'products.view','products.manage','customers.view','customers.manage',
    'suppliers.view','suppliers.manage','reports.view','prices.change',
    'corrections.create','payments.receive','payments.pay',
    'expenses.view','expenses.create','audit.read','inventory.view',
    'inventory.adjust','inventory.value.read','costs.read','profit.read','invoices.read'
  ));

-- New shop-specific columns remain protected by the existing customers.manage RLS policy.
-- Column grants must be extended explicitly because the Phase 2B grants are column-scoped.
grant insert (business_id, customer_type, owner_name, shop_number, shop_code, email, linked_supplier_id)
  on public.customers to authenticated;
grant update (customer_type, owner_name, shop_number, shop_code, email, linked_supplier_id)
  on public.customers to authenticated;

-- Restrict all financial tables to read-only access via permission-checked RLS.
-- All inserts/updates are performed by fixed-search-path SECURITY DEFINER RPCs.
do $$
declare t text;
begin
  foreach t in array array[
    'sales_documents','sales_lines','purchases_documents','purchase_lines',
    'customer_receipts','customer_receipt_allocations','supplier_payments',
    'supplier_payment_allocations','business_expenses','business_audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- Column-level grants keep retry fingerprints and internal operation IDs private.
-- RLS still scopes every selected column to a tenant and permission.
grant select (id, business_id, invoice_no, customer_id, customer_name_snapshot,
  total_amount, paid_amount_at_sale, payment_method, occurred_at, created_at)
  on public.sales_documents to authenticated;
grant select (id, business_id, invoice_no, supplier_id, supplier_name_snapshot,
  reference_no, subtotal_amount, other_cost_total, total_amount,
  paid_amount_at_purchase, payment_method, occurred_at, created_at)
  on public.purchases_documents to authenticated;
revoke all on public.purchase_lines_read from public, anon, authenticated;
grant select on public.purchase_lines_read to authenticated;
grant select (id, business_id, receipt_no, customer_id, customer_name_snapshot,
  amount, payment_method, reference_no, note, received_at, created_at)
  on public.customer_receipts to authenticated;
grant select (business_id, receipt_id, sales_document_id, amount, created_at)
  on public.customer_receipt_allocations to authenticated;
grant select (id, business_id, payment_no, supplier_id, supplier_name_snapshot,
  amount, payment_method, reference_no, note, paid_at, created_at)
  on public.supplier_payments to authenticated;
grant select (business_id, supplier_payment_id, purchases_document_id, amount, created_at)
  on public.supplier_payment_allocations to authenticated;
grant select (id, business_id, category, amount, expense_date, payment_method,
  reference_no, note, status, void_reason, voided_at, created_at)
  on public.business_expenses to authenticated;
grant select on public.business_audit_log to authenticated;

revoke all on public.customer_due_summary, public.supplier_due_summary from public, anon, authenticated;
grant select on public.customer_due_summary, public.supplier_due_summary to authenticated;

create policy sales_documents_read on public.sales_documents for select to authenticated
  using (private.has_business_permission(business_id, 'sales.view') or private.has_business_permission(business_id, 'reports.view') or private.has_business_permission(business_id, 'invoices.read'));
create policy sales_lines_read on public.sales_lines for select to authenticated
  using (private.has_business_permission(business_id, 'sales.view') or private.has_business_permission(business_id, 'reports.view') or private.has_business_permission(business_id, 'invoices.read'));
create policy purchases_documents_read on public.purchases_documents for select to authenticated
  using (private.has_business_permission(business_id, 'purchases.view') or private.has_business_permission(business_id, 'reports.view') or private.has_business_permission(business_id, 'invoices.read'));
create policy purchase_lines_read on public.purchase_lines for select to authenticated
  using (private.has_business_permission(business_id, 'purchases.view') or private.has_business_permission(business_id, 'reports.view') or private.has_business_permission(business_id, 'invoices.read'));
create policy customer_receipts_read on public.customer_receipts for select to authenticated
  using (private.has_business_permission(business_id, 'payments.receive') or private.has_business_permission(business_id, 'reports.view') or private.has_business_permission(business_id, 'invoices.read'));
create policy customer_receipt_allocations_read on public.customer_receipt_allocations for select to authenticated
  using (private.has_business_permission(business_id, 'payments.receive') or private.has_business_permission(business_id, 'reports.view') or private.has_business_permission(business_id, 'invoices.read'));
create policy supplier_payments_read on public.supplier_payments for select to authenticated
  using (private.has_business_permission(business_id, 'payments.pay') or private.has_business_permission(business_id, 'reports.view') or private.has_business_permission(business_id, 'invoices.read'));
create policy supplier_payment_allocations_read on public.supplier_payment_allocations for select to authenticated
  using (private.has_business_permission(business_id, 'payments.pay') or private.has_business_permission(business_id, 'reports.view') or private.has_business_permission(business_id, 'invoices.read'));
create policy business_expenses_read on public.business_expenses for select to authenticated
  using (private.has_business_permission(business_id, 'expenses.view') or private.has_business_permission(business_id, 'reports.view'));
create policy business_audit_log_read on public.business_audit_log for select to authenticated
  using (private.has_business_permission(business_id, 'audit.read') or private.has_business_permission(business_id, 'reports.view'));

-- The browser cannot insert ledger movements or update any authoritative balance.
-- Sale creation uses current server-side product, customer and stock records.
create function public.post_sale(
  p_business_id uuid,
  p_customer_id uuid,
  p_lines jsonb,
  p_paid_amount numeric,
  p_payment_method text,
  p_operation_id uuid,
  p_occurred_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_item jsonb;
  v_product public.products%rowtype;
  v_unit public.product_units%rowtype;
  v_balance public.inventory_balances%rowtype;
  v_cost public.inventory_cost_state%rowtype;
  v_customer public.customers%rowtype;
  v_doc_id uuid;
  v_invoice text;
  v_fingerprint text := md5(jsonb_build_object('business_id', p_business_id, 'customer_id', p_customer_id, 'lines', p_lines, 'paid_amount', p_paid_amount, 'payment_method', p_payment_method, 'occurred_at', p_occurred_at)::text);
  v_existing_fingerprint text;
  v_total numeric := 0;
  v_line_total numeric;
  v_qty numeric;
  v_price numeric;
  v_current numeric;
  v_known_cogs numeric;
  v_line_no integer := 0;
  v_created boolean := true;
  v_result record;
  v_allow_override boolean;
  v_id uuid;
begin
  if v_actor is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_business_id is null or p_operation_id is null then raise exception 'required_argument_missing' using errcode = '22023'; end if;
  if not private.has_business_permission(p_business_id, 'sales.create') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 100 then raise exception 'invalid_sale_lines' using errcode = '22023'; end if;
  if p_paid_amount is null or p_paid_amount < 0 or p_paid_amount >= 'Infinity'::numeric or p_paid_amount <> round(p_paid_amount, 2) then raise exception 'invalid_paid_amount' using errcode = '22023'; end if;
  if p_payment_method is not null and p_payment_method not in ('CASH','BKASH','NAGAD','BANK') then raise exception 'invalid_payment_method' using errcode = '22023'; end if;
  if p_paid_amount > 0 and p_payment_method is null then raise exception 'payment_method_required' using errcode = '22023'; end if;
  if p_occurred_at is null then raise exception 'occurred_at_required' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || p_operation_id::text, 0));
  select id, invoice_no, request_fingerprint into v_doc_id, v_invoice, v_existing_fingerprint from public.sales_documents where business_id = p_business_id and operation_id = p_operation_id;
  if found then
    if v_existing_fingerprint <> v_fingerprint then raise exception 'operation_id_conflict' using errcode = '22023'; end if;
    return jsonb_build_object('id', v_doc_id, 'invoice_no', v_invoice, 'duplicate', true);
  end if;

  v_allow_override := private.has_business_permission(p_business_id, 'sales.price_override');
  if p_customer_id is not null then
    select * into v_customer from public.customers where business_id = p_business_id and id = p_customer_id and archived_at is null;
    if not found then raise exception 'customer_not_found_or_archived' using errcode = 'P0002'; end if;
  end if;

  -- Lock every product/balance in deterministic order before calculating stock and cost.
  for v_result in
    select distinct (entry->>'product_id')::uuid as product_id
    from jsonb_array_elements(p_lines) as entry
    order by 1
  loop
    select * into v_product from public.products where business_id = p_business_id and id = v_result.product_id for share;
    if not found or v_product.archived_at is not null then raise exception 'product_not_found_or_archived' using errcode = 'P0002'; end if;
    select * into v_balance from public.inventory_balances where business_id = p_business_id and product_id = v_result.product_id for update;
    if not found then raise exception 'inventory_balance_missing' using errcode = '23514'; end if;
    select coalesce(sum((entry->>'quantity')::numeric),0) into v_qty
      from jsonb_array_elements(p_lines) as entry where (entry->>'product_id')::uuid = v_result.product_id;
    if v_qty <= 0 or v_qty >= 'Infinity'::numeric then raise exception 'invalid_quantity' using errcode = '22023'; end if;
    if v_balance.quantity < v_qty then raise exception 'insufficient_stock' using errcode = '23514'; end if;
  end loop;

  -- Calculate totals from the submitted review lines and authoritative price guard.
  for v_item in select value from jsonb_array_elements(p_lines) loop
    v_product := null;
    select * into v_product from public.products where business_id = p_business_id and id = (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'unit_price')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty >= 'Infinity'::numeric or v_price is null or v_price < 0 or v_price >= 'Infinity'::numeric or v_price <> round(v_price, 2) then raise exception 'invalid_sale_line' using errcode = '22023'; end if;
    if not v_allow_override and v_price <> v_product.default_selling_price then raise exception 'price_override_not_authorized' using errcode = '42501'; end if;
    v_total := v_total + round(v_qty * v_price, 2);
  end loop;
  v_total := round(v_total, 2);
  if v_total <= 0 then raise exception 'sale_total_must_be_positive' using errcode = '22023'; end if;
  if p_paid_amount > v_total then raise exception 'paid_exceeds_total' using errcode = '22023'; end if;
  if p_paid_amount < v_total and p_customer_id is null then raise exception 'customer_required_for_credit_sale' using errcode = '22023'; end if;

  v_doc_id := gen_random_uuid();
  v_invoice := 'S-' || to_char(p_occurred_at at time zone 'Asia/Dhaka', 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.sales_documents (id, business_id, invoice_no, operation_id, request_fingerprint, customer_id,
    customer_name_snapshot, total_amount, paid_amount_at_sale, payment_method, occurred_at, created_by)
  values (v_doc_id, p_business_id, v_invoice, p_operation_id, v_fingerprint, p_customer_id,
    coalesce(v_customer.name, 'Walk-in / Cash customer'), v_total, p_paid_amount,
    case when p_paid_amount > 0 then p_payment_method else null end, p_occurred_at, v_actor);

  for v_item in select value from jsonb_array_elements(p_lines) loop
    v_line_no := v_line_no + 1;
    select * into v_product from public.products where business_id = p_business_id and id = (v_item->>'product_id')::uuid;
    select * into v_unit from public.product_units where business_id = p_business_id and id = v_product.unit_id;
    select * into v_balance from public.inventory_balances where business_id = p_business_id and product_id = v_product.id for update;
    select * into v_cost from public.inventory_cost_state where business_id = p_business_id and product_id = v_product.id for update;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'unit_price')::numeric;
    v_line_total := round(v_qty * v_price, 2);
    if v_cost.unpriced_quantity = 0 and v_cost.priced_quantity >= v_qty then
      v_known_cogs := round(v_qty * v_cost.average_unit_cost, 2);
      insert into public.sales_lines (business_id, sales_document_id, line_no, product_id,
        product_name_bn_snapshot, product_name_en_snapshot, sku_snapshot, unit_name_bn_snapshot,
        quantity, unit_price, line_total, unit_cost_at_sale, cogs_amount, costing_status)
      values (p_business_id, v_doc_id, v_line_no, v_product.id, v_product.name_bn, v_product.name_en,
        v_product.sku, v_unit.name_bn, v_qty, v_price, v_line_total, v_cost.average_unit_cost, v_known_cogs, 'KNOWN');
    else
      insert into public.sales_lines (business_id, sales_document_id, line_no, product_id,
        product_name_bn_snapshot, product_name_en_snapshot, sku_snapshot, unit_name_bn_snapshot,
        quantity, unit_price, line_total, unit_cost_at_sale, cogs_amount, costing_status)
      values (p_business_id, v_doc_id, v_line_no, v_product.id, v_product.name_bn, v_product.name_en,
        v_product.sku, v_unit.name_bn, v_qty, v_price, v_line_total, null, null, 'UNKNOWN');
    end if;
    update public.inventory_balances set quantity = quantity - v_qty,
      first_movement_at = coalesce(first_movement_at, now()), updated_at = now()
      where business_id = p_business_id and product_id = v_product.id;
    insert into public.inventory_movements (business_id, product_id, movement_type, quantity_delta,
      quantity_after, source_kind, source_id, operation_id, reason, created_by, unit_cost, value_delta)
    values (p_business_id, v_product.id, 'sale', -v_qty, v_balance.quantity - v_qty,
      'sale', v_doc_id, gen_random_uuid(), 'Sale ' || v_invoice, v_actor,
      case when v_cost.unpriced_quantity = 0 and v_cost.priced_quantity >= v_qty then v_cost.average_unit_cost else null end,
      case when v_cost.unpriced_quantity = 0 and v_cost.priced_quantity >= v_qty then v_known_cogs else null end);
  end loop;

  insert into public.business_audit_log (business_id, actor_id, action, record_type, record_id, details)
  values (p_business_id, v_actor, 'SALE_POSTED', 'sales_document', v_doc_id,
    jsonb_build_object('invoice_no', v_invoice, 'total_amount', v_total, 'paid_amount', p_paid_amount, 'operation_id', p_operation_id));
  return jsonb_build_object('id', v_doc_id, 'invoice_no', v_invoice, 'total_amount', v_total, 'duplicate', false);
end;
$$;

create function public.post_purchase(
  p_business_id uuid,
  p_supplier_id uuid,
  p_lines jsonb,
  p_other_cost_total numeric,
  p_paid_amount numeric,
  p_payment_method text,
  p_reference_no text,
  p_operation_id uuid,
  p_occurred_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_supplier public.suppliers%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_unit public.product_units%rowtype;
  v_balance public.inventory_balances%rowtype;
  v_doc_id uuid;
  v_invoice text;
  v_fingerprint text := md5(jsonb_build_object('business_id', p_business_id, 'supplier_id', p_supplier_id, 'lines', p_lines, 'other_cost_total', p_other_cost_total, 'paid_amount', p_paid_amount, 'payment_method', p_payment_method, 'reference_no', p_reference_no, 'occurred_at', p_occurred_at)::text);
  v_existing_fingerprint text;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_line_total numeric;
  v_qty numeric;
  v_cost numeric;
  v_alloc numeric;
  v_line_no integer := 0;
  v_last_alloc_line integer;
  v_remaining numeric;
  v_result record;
begin
  if v_actor is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_business_id is null or p_supplier_id is null or p_operation_id is null then raise exception 'required_argument_missing' using errcode = '22023'; end if;
  if p_occurred_at is null then raise exception 'occurred_at_required' using errcode = '22023'; end if;
  if not private.has_business_permission(p_business_id, 'purchases.create') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 100 then raise exception 'invalid_purchase_lines' using errcode = '22023'; end if;
  if p_other_cost_total is null or p_other_cost_total < 0 or p_other_cost_total >= 'Infinity'::numeric or p_other_cost_total <> round(p_other_cost_total, 2) then raise exception 'invalid_other_cost' using errcode = '22023'; end if;
  if p_paid_amount is null or p_paid_amount < 0 or p_paid_amount >= 'Infinity'::numeric or p_paid_amount <> round(p_paid_amount, 2) then raise exception 'invalid_paid_amount' using errcode = '22023'; end if;
  if p_payment_method is not null and p_payment_method not in ('CASH','BKASH','NAGAD','BANK') then raise exception 'invalid_payment_method' using errcode = '22023'; end if;
  if p_paid_amount > 0 and p_payment_method is null then raise exception 'payment_method_required' using errcode = '22023'; end if;
  if p_reference_no is not null and length(p_reference_no) > 100 then raise exception 'reference_too_long' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || p_operation_id::text, 0));
  select id, invoice_no, request_fingerprint into v_doc_id, v_invoice, v_existing_fingerprint from public.purchases_documents where business_id = p_business_id and operation_id = p_operation_id;
  if found then
    if v_existing_fingerprint <> v_fingerprint then raise exception 'operation_id_conflict' using errcode = '22023'; end if;
    -- A committed retry must return its first result even if the supplier was archived later.
    return jsonb_build_object('id', v_doc_id, 'invoice_no', v_invoice, 'duplicate', true);
  end if;

  select * into v_supplier from public.suppliers where business_id = p_business_id and id = p_supplier_id and archived_at is null for share;
  if not found then raise exception 'supplier_not_found_or_archived' using errcode = 'P0002'; end if;

  for v_result in
    select distinct (entry->>'product_id')::uuid as product_id
    from jsonb_array_elements(p_lines) as entry order by 1
  loop
    select * into v_product from public.products where business_id = p_business_id and id = v_result.product_id for share;
    if not found or v_product.archived_at is not null then raise exception 'product_not_found_or_archived' using errcode = 'P0002'; end if;
    perform 1 from public.inventory_balances where business_id = p_business_id and product_id = v_result.product_id for update;
  end loop;

  for v_item in select value from jsonb_array_elements(p_lines) loop
    v_qty := (v_item->>'quantity')::numeric;
    v_cost := (v_item->>'unit_cost')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty >= 'Infinity'::numeric or v_cost is null or v_cost < 0 or v_cost >= 'Infinity'::numeric or v_cost <> round(v_cost, 2) then raise exception 'invalid_purchase_line' using errcode = '22023'; end if;
    v_subtotal := v_subtotal + round(v_qty * v_cost, 2);
  end loop;
  v_subtotal := round(v_subtotal, 2);
  if p_other_cost_total > 0 and v_subtotal = 0 then
    raise exception 'other_cost_allocation_requires_positive_subtotal' using errcode = '22023';
  end if;
  v_total := v_subtotal + p_other_cost_total;
  if v_total <= 0 then raise exception 'purchase_total_must_be_positive' using errcode = '22023'; end if;
  if p_paid_amount > v_total then raise exception 'paid_exceeds_total' using errcode = '22023'; end if;

  v_doc_id := gen_random_uuid();
  v_invoice := 'P-' || to_char(p_occurred_at at time zone 'Asia/Dhaka', 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.purchases_documents (id, business_id, invoice_no, operation_id, request_fingerprint, supplier_id,
    supplier_name_snapshot, reference_no, subtotal_amount, other_cost_total, total_amount,
    paid_amount_at_purchase, payment_method, occurred_at, created_by)
  values (v_doc_id, p_business_id, v_invoice, p_operation_id, v_fingerprint, p_supplier_id, v_supplier.name,
    nullif(btrim(p_reference_no), ''), v_subtotal, p_other_cost_total, v_total, p_paid_amount,
    case when p_paid_amount > 0 then p_payment_method else null end, p_occurred_at, v_actor);

  -- Send any cent-rounding remainder to the last line with a positive value;
  -- never allocate freight cents to a zero-value line just because it is last.
  select max(entry.ordinality)::integer into v_last_alloc_line
  from jsonb_array_elements(p_lines) with ordinality as entry(value, ordinality)
  where round((entry.value->>'quantity')::numeric * (entry.value->>'unit_cost')::numeric, 2) > 0;
  v_remaining := p_other_cost_total;
  for v_item in select value from jsonb_array_elements(p_lines) loop
    v_line_no := v_line_no + 1;
    select * into v_product from public.products where business_id = p_business_id and id = (v_item->>'product_id')::uuid;
    select * into v_unit from public.product_units where business_id = p_business_id and id = v_product.unit_id;
    v_qty := (v_item->>'quantity')::numeric;
    v_cost := (v_item->>'unit_cost')::numeric;
    v_line_total := round(v_qty * v_cost, 2);
    if v_subtotal > 0 and v_line_no = v_last_alloc_line then
      v_alloc := v_remaining;
    else
      -- Floor intermediate allocations in cents so they cannot exceed the cost pool.
      v_alloc := case
        when v_subtotal > 0 then floor(p_other_cost_total * v_line_total / v_subtotal * 100) / 100
        else 0
      end;
      v_remaining := v_remaining - v_alloc;
    end if;
    insert into public.purchase_lines (business_id, purchases_document_id, line_no, product_id,
      product_name_bn_snapshot, product_name_en_snapshot, sku_snapshot, unit_name_bn_snapshot,
      quantity, unit_cost, line_total, allocated_other_cost, landed_unit_cost)
    values (p_business_id, v_doc_id, v_line_no, v_product.id, v_product.name_bn, v_product.name_en,
      v_product.sku, v_unit.name_bn, v_qty, v_cost, v_line_total, v_alloc,
      round((v_line_total + v_alloc) / v_qty, 6));
    select * into v_balance from public.inventory_balances where business_id = p_business_id and product_id = v_product.id for update;
    update public.inventory_balances set quantity = quantity + v_qty,
      first_movement_at = coalesce(first_movement_at, now()), updated_at = now()
      where business_id = p_business_id and product_id = v_product.id;
    insert into public.inventory_movements (business_id, product_id, movement_type, quantity_delta,
      quantity_after, source_kind, source_id, operation_id, reason, created_by, unit_cost, value_delta)
    values (p_business_id, v_product.id, 'purchase', v_qty, v_balance.quantity + v_qty,
      'purchase', v_doc_id, gen_random_uuid(), 'Purchase ' || v_invoice, v_actor,
      round((v_line_total + v_alloc) / v_qty, 6), v_line_total + v_alloc);
  end loop;

  insert into public.business_audit_log (business_id, actor_id, action, record_type, record_id, details)
  values (p_business_id, v_actor, 'PURCHASE_POSTED', 'purchases_document', v_doc_id,
    jsonb_build_object('invoice_no', v_invoice, 'total_amount', v_total, 'paid_amount', p_paid_amount, 'operation_id', p_operation_id));
  return jsonb_build_object('id', v_doc_id, 'invoice_no', v_invoice, 'total_amount', v_total, 'duplicate', false);
end;
$$;

create function public.collect_customer_payment(
  p_business_id uuid,
  p_customer_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_reference_no text,
  p_note text,
  p_operation_id uuid,
  p_received_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_customer public.customers%rowtype;
  v_doc public.sales_documents%rowtype;
  v_receipt_id uuid;
  v_receipt_no text;
  v_due numeric;
  v_remaining numeric;
  v_alloc numeric;
  v_old_alloc numeric;
  v_existing_fingerprint text;
  v_fingerprint text := md5(jsonb_build_object('business_id',p_business_id,'customer_id',p_customer_id,'amount',p_amount,'payment_method',p_payment_method,'reference_no',p_reference_no,'note',p_note,'received_at',p_received_at)::text);
begin
  if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not private.has_business_permission(p_business_id, 'payments.receive') or not private.has_business_permission(p_business_id, 'sales.view') then raise exception 'not_authorized' using errcode='42501'; end if;
  if p_business_id is null or p_customer_id is null or p_operation_id is null then raise exception 'required_argument_missing' using errcode='22023'; end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 'Infinity'::numeric or p_amount <> round(p_amount, 2) then raise exception 'invalid_payment_amount' using errcode='22023'; end if;
  if p_payment_method is null or p_payment_method not in ('CASH','BKASH','NAGAD','BANK') then raise exception 'invalid_payment_method' using errcode='22023'; end if;
  if p_received_at is null then raise exception 'received_at_required' using errcode='22023'; end if;
  select * into v_customer from public.customers where business_id=p_business_id and id=p_customer_id for share;
  if not found then raise exception 'customer_not_found_or_archived' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || p_operation_id::text, 0));
  select id, receipt_no, request_fingerprint into v_receipt_id, v_receipt_no, v_existing_fingerprint from public.customer_receipts where business_id=p_business_id and operation_id=p_operation_id;
  if found then
    if v_existing_fingerprint <> v_fingerprint then raise exception 'operation_id_conflict' using errcode='22023'; end if;
    return jsonb_build_object('id',v_receipt_id,'receipt_no',v_receipt_no,'duplicate',true);
  end if;
  perform 1 from public.sales_documents where business_id=p_business_id and customer_id=p_customer_id order by occurred_at, id for update;
  select coalesce(sum(s.total_amount - s.paid_amount_at_sale - coalesce(a.allocated,0)),0)
    into v_due from public.sales_documents s
    left join (select sales_document_id, sum(amount) allocated from public.customer_receipt_allocations where business_id=p_business_id group by sales_document_id) a on a.sales_document_id=s.id
    where s.business_id=p_business_id and s.customer_id=p_customer_id;
  if p_amount > v_due then raise exception 'payment_exceeds_outstanding_due' using errcode='22023'; end if;
  v_receipt_id := gen_random_uuid();
  v_receipt_no := 'R-' || to_char(p_received_at at time zone 'Asia/Dhaka','YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.customer_receipts (id,business_id,receipt_no,operation_id,request_fingerprint,customer_id,customer_name_snapshot,amount,payment_method,reference_no,note,received_at,created_by)
  values (v_receipt_id,p_business_id,v_receipt_no,p_operation_id,v_fingerprint,p_customer_id,v_customer.name,p_amount,p_payment_method,nullif(btrim(p_reference_no),''),nullif(btrim(p_note),''),p_received_at,v_actor);
  v_remaining := p_amount;
  for v_doc in select * from public.sales_documents where business_id=p_business_id and customer_id=p_customer_id order by occurred_at, id for update loop
    exit when v_remaining <= 0;
    select coalesce(sum(amount),0) into v_old_alloc from public.customer_receipt_allocations where business_id=p_business_id and sales_document_id=v_doc.id;
    v_due := greatest(v_doc.total_amount - v_doc.paid_amount_at_sale - v_old_alloc, 0);
    if v_due > 0 then
      v_alloc := least(v_remaining,v_due);
      insert into public.customer_receipt_allocations (business_id,receipt_id,sales_document_id,amount)
      values (p_business_id,v_receipt_id,v_doc.id,v_alloc);
      v_remaining := v_remaining - v_alloc;
    end if;
  end loop;
  if v_remaining <> 0 then raise exception 'payment_allocation_incomplete' using errcode='23514'; end if;
  insert into public.business_audit_log (business_id,actor_id,action,record_type,record_id,details)
  values (p_business_id,v_actor,'CUSTOMER_PAYMENT_RECEIVED','customer_receipt',v_receipt_id,jsonb_build_object('receipt_no',v_receipt_no,'amount',p_amount,'customer_id',p_customer_id));
  return jsonb_build_object('id',v_receipt_id,'receipt_no',v_receipt_no,'amount',p_amount,'duplicate',false);
end $$;

create function public.pay_supplier(
  p_business_id uuid,
  p_supplier_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_reference_no text,
  p_note text,
  p_operation_id uuid,
  p_paid_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_supplier public.suppliers%rowtype;
  v_doc public.purchases_documents%rowtype;
  v_payment_id uuid;
  v_payment_no text;
  v_due numeric;
  v_remaining numeric;
  v_alloc numeric;
  v_old_alloc numeric;
  v_fingerprint text := md5(jsonb_build_object('business_id',p_business_id,'supplier_id',p_supplier_id,'amount',p_amount,'payment_method',p_payment_method,'reference_no',p_reference_no,'note',p_note,'paid_at',p_paid_at)::text);
  v_existing_fingerprint text;
begin
  if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not private.has_business_permission(p_business_id, 'payments.pay') or not private.has_business_permission(p_business_id, 'purchases.view') then raise exception 'not_authorized' using errcode='42501'; end if;
  if p_business_id is null or p_supplier_id is null or p_operation_id is null then raise exception 'required_argument_missing' using errcode='22023'; end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 'Infinity'::numeric or p_amount <> round(p_amount, 2) then raise exception 'invalid_payment_amount' using errcode='22023'; end if;
  if p_payment_method is null or p_payment_method not in ('CASH','BKASH','NAGAD','BANK') then raise exception 'invalid_payment_method' using errcode='22023'; end if;
  if p_paid_at is null then raise exception 'paid_at_required' using errcode='22023'; end if;
  select * into v_supplier from public.suppliers where business_id=p_business_id and id=p_supplier_id for share;
  if not found then raise exception 'supplier_not_found_or_archived' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || p_operation_id::text, 0));
  select id,payment_no,request_fingerprint into v_payment_id,v_payment_no,v_existing_fingerprint from public.supplier_payments where business_id=p_business_id and operation_id=p_operation_id;
  if found then
    if v_existing_fingerprint <> v_fingerprint then raise exception 'operation_id_conflict' using errcode='22023'; end if;
    return jsonb_build_object('id',v_payment_id,'payment_no',v_payment_no,'duplicate',true);
  end if;
  perform 1 from public.purchases_documents where business_id=p_business_id and supplier_id=p_supplier_id order by occurred_at,id for update;
  select coalesce(sum(p.total_amount-p.paid_amount_at_purchase-coalesce(a.allocated,0)),0) into v_due
    from public.purchases_documents p left join
    (select purchases_document_id,sum(amount) allocated from public.supplier_payment_allocations where business_id=p_business_id group by purchases_document_id) a on a.purchases_document_id=p.id
    where p.business_id=p_business_id and p.supplier_id=p_supplier_id;
  if p_amount > v_due then raise exception 'payment_exceeds_outstanding_due' using errcode='22023'; end if;
  v_payment_id:=gen_random_uuid();
  v_payment_no:='SP-'||to_char(p_paid_at at time zone 'Asia/Dhaka','YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.supplier_payments (id,business_id,payment_no,operation_id,request_fingerprint,supplier_id,supplier_name_snapshot,amount,payment_method,reference_no,note,paid_at,created_by)
  values (v_payment_id,p_business_id,v_payment_no,p_operation_id,v_fingerprint,p_supplier_id,v_supplier.name,p_amount,p_payment_method,nullif(btrim(p_reference_no),''),nullif(btrim(p_note),''),p_paid_at,v_actor);
  v_remaining:=p_amount;
  for v_doc in select * from public.purchases_documents where business_id=p_business_id and supplier_id=p_supplier_id order by occurred_at,id for update loop
    exit when v_remaining<=0;
    select coalesce(sum(amount),0) into v_old_alloc from public.supplier_payment_allocations where business_id=p_business_id and purchases_document_id=v_doc.id;
    v_due:=greatest(v_doc.total_amount-v_doc.paid_amount_at_purchase-v_old_alloc,0);
    if v_due>0 then
      v_alloc:=least(v_remaining,v_due);
      insert into public.supplier_payment_allocations (business_id,supplier_payment_id,purchases_document_id,amount) values(p_business_id,v_payment_id,v_doc.id,v_alloc);
      v_remaining:=v_remaining-v_alloc;
    end if;
  end loop;
  if v_remaining<>0 then raise exception 'payment_allocation_incomplete' using errcode='23514'; end if;
  insert into public.business_audit_log (business_id,actor_id,action,record_type,record_id,details)
  values(p_business_id,v_actor,'SUPPLIER_PAYMENT_SENT','supplier_payment',v_payment_id,jsonb_build_object('payment_no',v_payment_no,'amount',p_amount,'supplier_id',p_supplier_id));
  return jsonb_build_object('id',v_payment_id,'payment_no',v_payment_no,'amount',p_amount,'duplicate',false);
end $$;

create function public.create_business_expense(
  p_business_id uuid,
  p_category text,
  p_amount numeric,
  p_expense_date date,
  p_payment_method text,
  p_reference_no text,
  p_note text,
  p_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_fingerprint text := md5(jsonb_build_object('business_id',p_business_id,'category',p_category,'amount',p_amount,'expense_date',p_expense_date,'payment_method',p_payment_method,'reference_no',p_reference_no,'note',p_note)::text);
  v_existing_fingerprint text;
begin
  if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not private.has_business_permission(p_business_id,'expenses.create') then raise exception 'not_authorized' using errcode='42501'; end if;
  if p_business_id is null or p_operation_id is null then raise exception 'required_argument_missing' using errcode='22023'; end if;
  if p_category is null or length(btrim(p_category)) not between 1 and 100 then raise exception 'invalid_expense_category' using errcode='22023'; end if;
  if p_amount is null or p_amount<=0 or p_amount>='Infinity'::numeric or p_amount <> round(p_amount,2) then raise exception 'invalid_expense_amount' using errcode='22023'; end if;
  if p_expense_date is null then raise exception 'expense_date_required' using errcode='22023'; end if;
  if p_payment_method is null or p_payment_method not in ('CASH','BKASH','NAGAD','BANK') then raise exception 'invalid_payment_method' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || p_operation_id::text,0));
  select id,request_fingerprint into v_id,v_existing_fingerprint from public.business_expenses where business_id=p_business_id and operation_id=p_operation_id;
  if found then
    if v_existing_fingerprint <> v_fingerprint then raise exception 'operation_id_conflict' using errcode='22023'; end if;
    return jsonb_build_object('id',v_id,'duplicate',true);
  end if;
  insert into public.business_expenses (business_id,operation_id,request_fingerprint,category,amount,expense_date,payment_method,reference_no,note,created_by)
  values (p_business_id,p_operation_id,v_fingerprint,btrim(p_category),round(p_amount,2),p_expense_date,p_payment_method,nullif(btrim(p_reference_no),''),nullif(btrim(p_note),''),v_actor)
  returning id into v_id;
  insert into public.business_audit_log (business_id,actor_id,action,record_type,record_id,details)
  values (p_business_id,v_actor,'EXPENSE_CREATED','business_expense',v_id,jsonb_build_object('category',p_category,'amount',round(p_amount,2),'expense_date',p_expense_date));
  return jsonb_build_object('id',v_id,'duplicate',false);
end $$;

create function public.void_business_expense(
  p_business_id uuid,
  p_expense_id uuid,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_expense public.business_expenses%rowtype;
begin
  if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not private.has_business_permission(p_business_id,'expenses.create') then raise exception 'not_authorized' using errcode='42501'; end if;
  if length(btrim(coalesce(p_reason,''))) not between 1 and 500 then raise exception 'void_reason_required' using errcode='22023'; end if;
  select * into v_expense from public.business_expenses where business_id=p_business_id and id=p_expense_id for update;
  if not found then raise exception 'expense_not_found' using errcode='P0002'; end if;
  if v_expense.status='VOIDED' then return jsonb_build_object('id',v_expense.id,'duplicate',true); end if;
  update public.business_expenses set status='VOIDED',void_reason=btrim(p_reason),voided_by=v_actor,voided_at=now()
    where business_id=p_business_id and id=p_expense_id;
  insert into public.business_audit_log (business_id,actor_id,action,record_type,record_id,details)
  values (p_business_id,v_actor,'EXPENSE_VOIDED','business_expense',p_expense_id,jsonb_build_object('reason',btrim(p_reason),'amount',v_expense.amount));
  return jsonb_build_object('id',v_expense.id,'duplicate',false);
end $$;

-- Owner-controlled profile update. It avoids client-side direct writes to settings.
create function public.update_business_profile(
  p_business_id uuid,
  p_name text,
  p_phone text,
  p_address text,
  p_email text,
  p_default_language text
) returns public.businesses
language plpgsql security definer set search_path = '' as $$
declare v_business public.businesses%rowtype; v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not private.is_owner(p_business_id) then raise exception 'not_authorized' using errcode='42501'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 160 then raise exception 'invalid_business_name' using errcode='22023'; end if;
  if p_default_language is null or p_default_language not in ('bn','en') then raise exception 'invalid_language' using errcode='22023'; end if;
  if p_email is not null and length(btrim(p_email)) not between 3 and 254 then raise exception 'invalid_business_email' using errcode='22023'; end if;
  update public.businesses set name=btrim(p_name), phone=nullif(btrim(p_phone),''), address=nullif(btrim(p_address),''), email=nullif(btrim(p_email),'')
    where id=p_business_id returning * into v_business;
  update public.business_settings set default_language=p_default_language where business_id=p_business_id;
  insert into public.business_audit_log (business_id,actor_id,action,record_type,record_id,details)
  values(p_business_id,v_actor,'BUSINESS_PROFILE_UPDATED','business',p_business_id,jsonb_build_object('name',v_business.name,'language',p_default_language));
  return v_business;
end $$;

-- Execute privileges are explicitly restricted; no anon/public access.
revoke all on function public.post_sale(uuid,uuid,jsonb,numeric,text,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.post_purchase(uuid,uuid,jsonb,numeric,numeric,text,text,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.collect_customer_payment(uuid,uuid,numeric,text,text,text,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.pay_supplier(uuid,uuid,numeric,text,text,text,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.create_business_expense(uuid,text,numeric,date,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.void_business_expense(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.update_business_profile(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.post_sale(uuid,uuid,jsonb,numeric,text,uuid,timestamptz) to authenticated;
grant execute on function public.post_purchase(uuid,uuid,jsonb,numeric,numeric,text,text,uuid,timestamptz) to authenticated;
grant execute on function public.collect_customer_payment(uuid,uuid,numeric,text,text,text,uuid,timestamptz) to authenticated;
grant execute on function public.pay_supplier(uuid,uuid,numeric,text,text,text,uuid,timestamptz) to authenticated;
grant execute on function public.create_business_expense(uuid,text,numeric,date,text,text,text,uuid) to authenticated;
grant execute on function public.void_business_expense(uuid,uuid,text) to authenticated;
grant execute on function public.update_business_profile(uuid,text,text,text,text,text) to authenticated;

commit;
