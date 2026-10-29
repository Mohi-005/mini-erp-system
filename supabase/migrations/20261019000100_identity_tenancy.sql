-- Phase 2A only: identity, membership, settings, and atomic onboarding.
-- No operational/financial tables. All client privileges are explicit.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null default '' check (length(display_name) <= 100),
  phone text check (length(phone) <= 30),
  preferred_language text not null default 'bn' check (preferred_language in ('bn', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  phone text check (length(phone) <= 30),
  address text check (length(address) <= 500),
  country text not null default 'BD' check (country = 'BD'),
  currency text not null default 'BDT' check (currency = 'BDT'),
  timezone text not null default 'Asia/Dhaka' check (timezone = 'Asia/Dhaka'),
  created_by uuid not null references auth.users(id) on delete restrict,
  onboarding_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, onboarding_key)
);

create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null check (role in ('OWNER', 'STAFF')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);
create index business_members_user_active on public.business_members(user_id, status);

create table public.business_member_permissions (
  member_id uuid not null references public.business_members(id) on delete restrict,
  permission text not null check (permission in (
    'sales.create', 'purchases.create', 'products.view', 'products.manage',
    'customers.view', 'customers.manage', 'suppliers.view', 'suppliers.manage',
    'reports.view', 'prices.change', 'corrections.create', 'payments.receive',
    'payments.pay', 'expenses.create', 'inventory.view', 'inventory.adjust',
    'inventory.value.read', 'costs.read', 'profit.read', 'invoices.read'
  )),
  created_at timestamptz not null default now(),
  primary key (member_id, permission)
);

create table public.business_settings (
  business_id uuid primary key references public.businesses(id) on delete restrict,
  default_language text not null default 'bn' check (default_language in ('bn', 'en')),
  currency text not null default 'BDT' check (currency = 'BDT'),
  timezone text not null default 'Asia/Dhaka' check (timezone = 'Asia/Dhaka'),
  negative_stock_allowed boolean not null default false check (negative_stock_allowed = false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
revoke all on function private.touch_updated_at() from public, anon, authenticated;
create trigger profiles_updated before update on public.profiles for each row execute function private.touch_updated_at();
create trigger businesses_updated before update on public.businesses for each row execute function private.touch_updated_at();
create trigger members_updated before update on public.business_members for each row execute function private.touch_updated_at();
create trigger settings_updated before update on public.business_settings for each row execute function private.touch_updated_at();

-- User-editable metadata provides display text only, never authorization.
create function private.create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data->>'display_name', ''), 100));
  return new;
end;
$$;
revoke all on function private.create_profile() from public, anon, authenticated;
create trigger auth_user_profile after insert on auth.users for each row execute function private.create_profile();

-- Definer helpers avoid membership-policy recursion. No caller identity argument.
create function private.is_member(target_business uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.business_members
    where business_id = target_business and user_id = (select auth.uid()) and status = 'ACTIVE');
$$;
create function private.is_owner(target_business uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.business_members
    where business_id = target_business and user_id = (select auth.uid()) and status = 'ACTIVE' and role = 'OWNER');
$$;
create function private.owns_staff(target_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.business_members m
    where m.id = target_member and m.role = 'STAFF' and private.is_owner(m.business_id));
$$;
create function private.reads_permissions(target_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.business_members m
    where m.id = target_member and private.is_member(m.business_id)
      and (m.user_id = (select auth.uid()) or private.is_owner(m.business_id)));
$$;
revoke all on function private.is_member(uuid), private.is_owner(uuid), private.owns_staff(uuid), private.reads_permissions(uuid) from public, anon, authenticated;
grant execute on function private.is_member(uuid), private.is_owner(uuid), private.owns_staff(uuid), private.reads_permissions(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.business_member_permissions enable row level security;
alter table public.business_settings enable row level security;
revoke all on public.profiles, public.businesses, public.business_members, public.business_member_permissions, public.business_settings from public, anon, authenticated;

grant select on public.profiles, public.businesses, public.business_members, public.business_member_permissions, public.business_settings to authenticated;
grant update (display_name, phone, preferred_language) on public.profiles to authenticated;
grant update (name, phone, address) on public.businesses to authenticated;
grant insert (business_id, user_id, role, status) on public.business_members to authenticated;
grant update (status) on public.business_members to authenticated;
grant insert (member_id, permission), delete on public.business_member_permissions to authenticated;
grant update (default_language) on public.business_settings to authenticated;

create policy profiles_read on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy businesses_read on public.businesses for select to authenticated using (private.is_member(id));
create policy businesses_update on public.businesses for update to authenticated using (private.is_owner(id)) with check (private.is_owner(id));
create policy members_read on public.business_members for select to authenticated using (private.is_member(business_id));
-- OWNER rows are immutable through the Data API; ownership transfer is out of scope.
-- Existing Auth UUIDs may be added as STAFF by an Owner. Invitation UI is later work.
create policy members_insert_staff on public.business_members for insert to authenticated
  with check (private.is_owner(business_id) and role = 'STAFF' and user_id <> (select auth.uid()));
create policy members_update_staff on public.business_members for update to authenticated
  using (private.is_owner(business_id) and role = 'STAFF')
  with check (private.is_owner(business_id) and role = 'STAFF');
create policy permissions_read on public.business_member_permissions for select to authenticated using (private.reads_permissions(member_id));
create policy permissions_insert on public.business_member_permissions for insert to authenticated with check (private.owns_staff(member_id));
create policy permissions_delete on public.business_member_permissions for delete to authenticated using (private.owns_staff(member_id));
create policy settings_read on public.business_settings for select to authenticated using (private.is_member(business_id));
create policy settings_update on public.business_settings for update to authenticated using (private.is_owner(business_id)) with check (private.is_owner(business_id));

create function public.create_initial_business(
  p_request_id uuid,
  p_business_name text,
  p_display_name text default '',
  p_phone text default null,
  p_address text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  result uuid;
  existing public.businesses;
  clean_name text := btrim(p_business_name);
  clean_phone text := nullif(btrim(p_phone), '');
  clean_address text := nullif(btrim(p_address), '');
begin
  if actor is null or coalesce(auth.role(), '') <> 'authenticated' then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_request_id is null or clean_name is null or length(clean_name) not between 1 and 120
     or p_display_name is null or length(p_display_name) > 100 then
    raise exception 'Invalid onboarding input' using errcode = '22023';
  end if;
  -- Serialize initial onboarding per user, even if a reload generates a new key.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text, 0));
  select * into existing from public.businesses where created_by = actor and onboarding_key = p_request_id;
  if found then
    if existing.name is distinct from clean_name or existing.phone is distinct from clean_phone
       or existing.address is distinct from clean_address then
      raise exception 'Onboarding request key reused with different input' using errcode = '22023';
    end if;
    if not private.is_owner(existing.id) then
      raise exception 'Membership unavailable' using errcode = '42501';
    end if;
    return existing.id;
  end if;
  if exists(select 1 from public.business_members where user_id = actor and status = 'ACTIVE') then
    raise exception 'Initial onboarding already completed; reload membership' using errcode = '22023';
  end if;
  insert into public.profiles(id, display_name) values (actor, btrim(p_display_name))
    on conflict (id) do update set display_name = excluded.display_name;
  insert into public.businesses(name, phone, address, created_by, onboarding_key)
    values (clean_name, clean_phone, clean_address, actor, p_request_id) returning id into result;
  insert into public.business_members(business_id, user_id, role) values (result, actor, 'OWNER');
  insert into public.business_settings(business_id) values (result);
  return result;
end;
$$;
revoke all on function public.create_initial_business(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_initial_business(uuid, text, text, text, text) to authenticated;
