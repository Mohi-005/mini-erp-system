-- Phase 2C.1: inventory quantity ledger and opening/manual adjustment RPCs.
-- This phase deliberately excludes purchase/sale posting, valuation and costing.
begin;

create table public.inventory_balances (
  business_id uuid not null,
  product_id uuid not null,
  quantity numeric not null default 0
    check (quantity >= 0 and quantity < 'Infinity'::numeric),
  first_movement_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (business_id, product_id),
  constraint inventory_balances_product_same_business_fk
    foreign key (business_id, product_id)
    references public.products (business_id, id) on delete restrict
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  product_id uuid not null,
  movement_type text not null check (movement_type in (
    'opening', 'adjustment_in', 'adjustment_out',
    'purchase', 'sale', 'purchase_return', 'sale_return', 'reversal'
  )),
  quantity_delta numeric not null
    check (quantity_delta > '-Infinity'::numeric and quantity_delta < 'Infinity'::numeric),
  quantity_after numeric not null
    check (quantity_after >= 0 and quantity_after < 'Infinity'::numeric),
  source_kind text not null check (source_kind in (
    'opening_stock', 'manual_adjustment',
    'purchase', 'sale', 'purchase_return', 'sale_return', 'reversal'
  )),
  source_id uuid,
  operation_id uuid not null,
  reason text check (reason is null or length(reason) <= 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint inventory_movements_product_same_business_fk
    foreign key (business_id, product_id)
    references public.products (business_id, id) on delete restrict,
  constraint inventory_movements_delta_by_kind_ck check (
    (movement_type = 'opening' and quantity_delta >= 0)
    or (movement_type in ('adjustment_in', 'purchase', 'sale_return') and quantity_delta > 0)
    or (movement_type in ('adjustment_out', 'sale', 'purchase_return') and quantity_delta < 0)
    or (movement_type = 'reversal' and quantity_delta <> 0)
  ),
  constraint inventory_movements_opening_source_ck check (
    (movement_type = 'opening' and source_kind = 'opening_stock')
    or (movement_type in ('adjustment_in', 'adjustment_out') and source_kind = 'manual_adjustment')
    or (movement_type = 'purchase' and source_kind = 'purchase')
    or (movement_type = 'sale' and source_kind = 'sale')
    or (movement_type = 'purchase_return' and source_kind = 'purchase_return')
    or (movement_type = 'sale_return' and source_kind = 'sale_return')
    or (movement_type = 'reversal' and source_kind = 'reversal')
  ),
  constraint inventory_movements_operation_reason_ck check (
    (movement_type in ('adjustment_in', 'adjustment_out') and length(btrim(coalesce(reason, ''))) between 1 and 500)
    or (movement_type not in ('adjustment_in', 'adjustment_out'))
  ),
  unique (business_id, operation_id)
);

create unique index inventory_movements_one_opening_per_product_uq
  on public.inventory_movements (business_id, product_id)
  where movement_type = 'opening';
create index inventory_movements_business_product_time_idx
  on public.inventory_movements (business_id, product_id, created_at desc, id desc);
create index inventory_movements_business_time_idx
  on public.inventory_movements (business_id, created_at desc, id desc);

create function private.ensure_inventory_balance_for_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inventory_balances (business_id, product_id, quantity)
  values (new.business_id, new.id, 0)
  on conflict (business_id, product_id) do nothing;
  return new;
end;
$$;
revoke all on function private.ensure_inventory_balance_for_product()
  from public, anon, authenticated;
create trigger products_create_inventory_balance
  after insert on public.products
  for each row execute function private.ensure_inventory_balance_for_product();

-- Install the trigger before backfilling. This closes the race where a product
-- inserted between a backfill and trigger creation would have no balance row.
-- ON CONFLICT safely handles products inserted after the trigger is active.
insert into public.inventory_balances (business_id, product_id, quantity)
select business_id, id, 0 from public.products
on conflict (business_id, product_id) do nothing;

alter table public.inventory_balances enable row level security;
alter table public.inventory_movements enable row level security;
revoke all on public.inventory_balances, public.inventory_movements
  from public, anon, authenticated;
grant select on public.inventory_balances, public.inventory_movements to authenticated;

create policy inventory_balances_read
  on public.inventory_balances for select to authenticated
  using (private.has_business_permission(business_id, 'inventory.view'));
create policy inventory_movements_read
  on public.inventory_movements for select to authenticated
  using (private.has_business_permission(business_id, 'inventory.view'));

-- Opening stock is a one-time opening event. The operation UUID is a persistent
-- idempotency key; repeating the exact request returns its original movement.
create function public.record_inventory_opening_stock(
  p_product_id uuid,
  p_quantity numeric,
  p_operation_id uuid,
  p_note text default null
) returns public.inventory_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_balance public.inventory_balances%rowtype;
  v_existing public.inventory_movements%rowtype;
  v_result public.inventory_movements%rowtype;
  v_note text := nullif(btrim(p_note), '');
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_product_id is null or p_operation_id is null then
    raise exception 'required_argument_missing' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity < 0 or p_quantity >= 'Infinity'::numeric then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;
  if p_note is not null and length(p_note) > 500 then
    raise exception 'note_too_long' using errcode = '22023';
  end if;

  select * into v_product from public.products where id = p_product_id;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  if not private.has_business_permission(v_product.business_id, 'inventory.adjust') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.inventory_balances (business_id, product_id, quantity)
  values (v_product.business_id, v_product.id, 0)
  on conflict (business_id, product_id) do nothing;
  select * into v_balance
  from public.inventory_balances
  where business_id = v_product.business_id and product_id = v_product.id
  for update;

  select * into v_existing
  from public.inventory_movements
  where business_id = v_product.business_id and operation_id = p_operation_id;
  if found then
    if v_existing.product_id = p_product_id
       and v_existing.movement_type = 'opening'
       and v_existing.quantity_delta = p_quantity
       and coalesce(v_existing.reason, '') = coalesce(v_note, '') then
      return v_existing;
    end if;
    raise exception 'operation_id_conflict' using errcode = '22023';
  end if;

  if v_product.archived_at is not null then
    raise exception 'product_archived' using errcode = '22023';
  end if;
  if v_balance.first_movement_at is not null
     or v_balance.quantity <> 0
     or exists (
       select 1 from public.inventory_movements
       where business_id = v_product.business_id and product_id = v_product.id
     ) then
    raise exception 'opening_stock_must_be_first_movement' using errcode = '23505';
  end if;

  update public.inventory_balances
    set quantity = p_quantity,
        first_movement_at = now(),
        updated_at = now()
    where business_id = v_product.business_id and product_id = v_product.id;

  insert into public.inventory_movements (
    business_id, product_id, movement_type, quantity_delta, quantity_after,
    source_kind, operation_id, reason, created_by
  ) values (
    v_product.business_id, v_product.id, 'opening', p_quantity, p_quantity,
    'opening_stock', p_operation_id, v_note, (select auth.uid())
  ) returning * into v_result;
  return v_result;
end;
$$;

-- Manual corrections are signed ledger events, never direct balance overwrites.
-- All checks, row locking, movement append and balance update occur atomically.
create function public.adjust_inventory_stock(
  p_product_id uuid,
  p_direction text,
  p_quantity numeric,
  p_reason text,
  p_operation_id uuid
) returns public.inventory_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_balance public.inventory_balances%rowtype;
  v_existing public.inventory_movements%rowtype;
  v_result public.inventory_movements%rowtype;
  v_delta numeric;
  v_type text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_quantity_after numeric;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_product_id is null or p_operation_id is null then
    raise exception 'required_argument_missing' using errcode = '22023';
  end if;
  if p_direction is null or p_direction not in ('IN', 'OUT') then
    raise exception 'invalid_direction' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity >= 'Infinity'::numeric then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;
  if length(v_reason) not between 1 and 500 then
    raise exception 'reason_required_or_too_long' using errcode = '22023';
  end if;

  select * into v_product from public.products where id = p_product_id;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  if not private.has_business_permission(v_product.business_id, 'inventory.adjust') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.inventory_balances (business_id, product_id, quantity)
  values (v_product.business_id, v_product.id, 0)
  on conflict (business_id, product_id) do nothing;
  select * into v_balance
  from public.inventory_balances
  where business_id = v_product.business_id and product_id = v_product.id
  for update;

  v_type := case when p_direction = 'IN' then 'adjustment_in' else 'adjustment_out' end;
  v_delta := case when p_direction = 'IN' then p_quantity else -p_quantity end;

  select * into v_existing
  from public.inventory_movements
  where business_id = v_product.business_id and operation_id = p_operation_id;
  if found then
    if v_existing.product_id = p_product_id
       and v_existing.movement_type = v_type
       and v_existing.quantity_delta = v_delta
       and v_existing.reason = v_reason then
      return v_existing;
    end if;
    raise exception 'operation_id_conflict' using errcode = '22023';
  end if;

  if v_product.archived_at is not null then
    raise exception 'product_archived' using errcode = '22023';
  end if;
  if p_direction = 'OUT' and v_balance.quantity < p_quantity then
    raise exception 'insufficient_stock' using errcode = '23514';
  end if;

  v_quantity_after := v_balance.quantity + v_delta;
  if v_quantity_after < 0 then
    raise exception 'insufficient_stock' using errcode = '23514';
  end if;

  update public.inventory_balances
    set quantity = v_quantity_after,
        first_movement_at = coalesce(first_movement_at, now()),
        updated_at = now()
    where business_id = v_product.business_id and product_id = v_product.id;

  insert into public.inventory_movements (
    business_id, product_id, movement_type, quantity_delta, quantity_after,
    source_kind, operation_id, reason, created_by
  ) values (
    v_product.business_id, v_product.id, v_type, v_delta, v_quantity_after,
    'manual_adjustment', p_operation_id, v_reason, (select auth.uid())
  ) returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.record_inventory_opening_stock(uuid, numeric, uuid, text)
  from public, anon, authenticated;
revoke all on function public.adjust_inventory_stock(uuid, text, numeric, text, uuid)
  from public, anon, authenticated;
grant execute on function public.record_inventory_opening_stock(uuid, numeric, uuid, text)
  to authenticated;
grant execute on function public.adjust_inventory_stock(uuid, text, numeric, text, uuid)
  to authenticated;

commit;
