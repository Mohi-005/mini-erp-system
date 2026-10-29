-- Run only against a disposable local stack or explicitly authorized DEV project.
-- Hosted execution must preserve BEGIN/ROLLBACK and capture every TAP result.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id, email) values
 ('10000000-0000-4000-8000-000000000001', 'owner-a@example.test'),
 ('10000000-0000-4000-8000-000000000002', 'owner-b@example.test'),
 ('10000000-0000-4000-8000-000000000003', 'staff-a@example.test'),
 ('10000000-0000-4000-8000-000000000004', 'onboarding@example.test'),
 ('10000000-0000-4000-8000-000000000005', 'rollback@example.test'),
 ('10000000-0000-4000-8000-000000000006', 'staff-b@example.test');
insert into public.businesses(id, name, created_by, onboarding_key) values
 ('20000000-0000-4000-8000-000000000001', 'Synthetic Business A', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002', 'Synthetic Business B', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002');
insert into public.business_members(business_id, user_id, role) values
 ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'OWNER'),
 ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'OWNER');
insert into public.business_settings(business_id) select id from public.businesses
 where id in ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002');
insert into public.business_members(id,business_id,user_id,role) values
 ('40000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000006','STAFF');

select is((select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in ('profiles','businesses','business_members','business_member_permissions','business_settings') and c.relrowsecurity), 5, 'RLS enabled on all five exposed tables');
select ok(not has_function_privilege('anon', 'public.create_initial_business(uuid,text,text,text,text)', 'EXECUTE'), 'anonymous cannot execute onboarding');
select has_function('public', 'create_initial_business', array['uuid','text','text','text','text'], 'onboarding has only request/name/contact inputs');
select hasnt_function('public', 'create_initial_business', array['uuid','uuid','text'], 'no caller-selected owner identity signature');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.businesses where name='Synthetic Business A'), 1, 'Owner A reads own business');
select is((select count(*)::int from public.businesses where name='Synthetic Business B'), 0, 'Owner A cannot read B');
select is((select count(*)::int from public.profiles), 1, 'profiles scoped to current user');
select lives_ok($$update public.profiles set preferred_language='en' where id=auth.uid()$$, 'own language can change');
select results_eq($$update public.profiles set display_name='bad' where id='10000000-0000-4000-8000-000000000002' returning id$$, $$select null::uuid where false$$, 'cannot update another profile');
select lives_ok($$insert into public.business_members(business_id,user_id,role) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','STAFF')$$, 'Owner A adds existing user as Staff in A');
select is((select count(*)::int from public.business_member_permissions), 0, 'Staff starts with no optional grants');
select throws_ok($$insert into public.business_members(business_id,user_id,role) values ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','STAFF')$$, '42501', null, 'Owner A cannot manage B membership');
select throws_ok($$insert into public.business_members(business_id,user_id,role) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','OWNER')$$, '42501', null, 'Data API cannot add another Owner');
select throws_ok($$insert into public.business_member_permissions(member_id,permission) values ('40000000-0000-4000-8000-000000000006','products.manage')$$, '42501', null, 'Owner A cannot grant permissions to B Staff');
select throws_ok($$update public.businesses set created_by='10000000-0000-4000-8000-000000000002'$$, '42501', null, 'creator identity is immutable to clients');
select lives_ok($$insert into public.business_member_permissions(member_id,permission) select id,'products.view' from public.business_members where user_id='10000000-0000-4000-8000-000000000003'$$, 'Owner grants allowed Staff permission');
select lives_ok($$update public.business_settings set default_language='en' where business_id='20000000-0000-4000-8000-000000000001'$$, 'Owner controls own settings');
select results_eq($$update public.business_settings set default_language='en' where business_id='20000000-0000-4000-8000-000000000002' returning business_id$$, $$select null::uuid where false$$, 'Owner A cannot update B settings');
select throws_ok($$update public.business_settings set negative_stock_allowed=true$$, '42501', null, 'negative stock cannot be enabled through client');
select results_eq($$update public.business_members set status='INACTIVE' where user_id=auth.uid() returning id$$, $$select null::uuid where false$$, 'Owner cannot deactivate last/self Owner');
select throws_ok($$insert into public.businesses(name,created_by,onboarding_key) values ('bypass',auth.uid(),gen_random_uuid())$$, '42501', null, 'business creation cannot bypass RPC');

set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.businesses where name='Synthetic Business A'), 0, 'Owner B cannot read A');
select is((select count(*)::int from public.business_settings), 1, 'Owner B settings are tenant scoped');
select is((select count(*)::int from public.business_members where business_id='20000000-0000-4000-8000-000000000001'), 0, 'B cannot read A membership');

set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.businesses where name='Synthetic Business A'), 1, 'active Staff A can read A');
select is((select count(*)::int from public.businesses where name='Synthetic Business B'), 0, 'Staff A cannot read B');
select is((select count(*)::int from public.business_settings), 1, 'Staff settings remain tenant scoped');
select is((select count(*)::int from public.business_member_permissions), 1, 'Staff sees own explicit grant');
select throws_ok($$update public.business_members set role='OWNER' where user_id=auth.uid()$$, '42501', null, 'Staff cannot promote self');
select throws_ok($$insert into public.business_member_permissions(member_id,permission) select id,'products.manage' from public.business_members where user_id=auth.uid()$$, '42501', null, 'Staff cannot grant self permission');
select results_eq($$update public.business_settings set default_language='bn' returning business_id$$, $$select null::uuid where false$$, 'Staff cannot update business settings');
select results_eq($$update public.businesses set name='bad' returning id$$, $$select null::uuid where false$$, 'Staff cannot update business');
select results_eq($$update public.business_members set status='ACTIVE' where user_id=auth.uid() returning id$$, $$select null::uuid where false$$, 'Staff cannot modify membership');

set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$update public.business_members set status='INACTIVE' where user_id='10000000-0000-4000-8000-000000000003'$$, 'Owner revokes Staff membership');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.businesses), 0, 'old Staff identity cannot read after revocation');
select is((select count(*)::int from public.business_member_permissions), 0, 'revoked Staff cannot read grants');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok('select * from public.profiles', '42501', null, 'anon cannot read profiles');
select throws_ok('select * from public.businesses', '42501', null, 'anon cannot read businesses');
select throws_ok('select * from public.business_members', '42501', null, 'anon cannot read members');
select throws_ok('select * from public.business_member_permissions', '42501', null, 'anon cannot read permissions');
select throws_ok('select * from public.business_settings', '42501', null, 'anon cannot read settings');

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok($$select public.create_initial_business('30000000-0000-4000-8000-000000000004','No actor')$$, '42501', null, 'RPC rejects missing auth.uid even with authenticated role');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}';
select lives_ok($$select public.create_initial_business('30000000-0000-4000-8000-000000000004','Synthetic onboard','Test user')$$, 'authenticated onboarding works');
select lives_ok($$select public.create_initial_business('30000000-0000-4000-8000-000000000004','Synthetic onboard','Test user')$$, 'same request can safely retry');
select is((select count(*)::int from public.businesses), 1, 'retry creates only one business');
select is((select count(*)::int from public.business_members where user_id=auth.uid() and role='OWNER'), 1, 'only authenticated actor receives Owner');
select is((select count(*)::int from public.business_settings where default_language='bn' and not negative_stock_allowed), 1, 'onboarding creates defaults atomically');
select throws_ok($$select public.create_initial_business('30000000-0000-4000-8000-000000000004','Changed name')$$, '22023', null, 'key cannot be reused with different business input');
select throws_ok($$select public.create_initial_business('30000000-0000-4000-8000-000000000006','Second accidental business')$$, '22023', null, 'reload/different key cannot duplicate initial onboarding');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$insert into public.business_members(business_id,user_id,role) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','STAFF')$$, 'membership schema permits future multi-business users');

reset role;
delete from public.profiles where id='10000000-0000-4000-8000-000000000005';
create function pg_temp.reject_test_settings() returns trigger language plpgsql as $$
begin raise exception 'test forced settings failure' using errcode='23514'; end;
$$;
create trigger test_failure before insert on public.business_settings for each row execute function pg_temp.reject_test_settings();
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000005","role":"authenticated"}';
select throws_ok($$select public.create_initial_business('30000000-0000-4000-8000-000000000005','Rollback probe')$$, '23514', 'test forced settings failure', 'required settings failure aborts onboarding');
select is((select count(*)::int from public.businesses), 0, 'failed onboarding leaves no business');
select is((select count(*)::int from public.profiles), 0, 'failed onboarding rolls back profile creation');
reset role;
select is((select count(*)::int from public.business_members where user_id='10000000-0000-4000-8000-000000000005'), 0, 'failed onboarding leaves no membership');
select is((select count(*)::int from public.businesses where name='Rollback probe'), 0, 'no orphan business hidden by RLS');
select * from finish();
rollback;
