-- Fix: allow ordinary product edits to preserve unchanged archived references.
-- A reference is validated on INSERT, or on UPDATE only when its value changes.

create or replace function private.reject_archived_product_references()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  referenced_archived_at timestamptz;
  check_category boolean := true;
  check_unit boolean := true;
  check_supplier boolean := true;
begin
  if tg_op = 'UPDATE' then
    check_category :=
      new.category_id is distinct from old.category_id;

    check_unit :=
      new.unit_id is distinct from old.unit_id;

    check_supplier :=
      new.preferred_supplier_id is distinct from old.preferred_supplier_id;
  end if;

  if check_category and new.category_id is not null then
    select category.archived_at
      into referenced_archived_at
    from public.product_categories as category
    where category.business_id = new.business_id
      and category.id = new.category_id;

    if found and referenced_archived_at is not null then
      raise exception 'Archived category cannot be assigned to a product'
        using errcode = '23514';
    end if;
  end if;

  if check_unit then
    select unit_record.archived_at
      into referenced_archived_at
    from public.product_units as unit_record
    where unit_record.business_id = new.business_id
      and unit_record.id = new.unit_id;

    if found and referenced_archived_at is not null then
      raise exception 'Archived unit cannot be assigned to a product'
        using errcode = '23514';
    end if;
  end if;

  if check_supplier and new.preferred_supplier_id is not null then
    select supplier.archived_at
      into referenced_archived_at
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