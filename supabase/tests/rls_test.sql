-- Database tests: RLS isolation, column privileges, goal rules, ledger and cascade deletion.
-- Run with scripts/test-db.sh. Every check raises an exception on failure.
\set ON_ERROR_STOP on

insert into auth.users (id, phone) values
  ('11111111-1111-1111-1111-111111111111', '221771234567'),
  ('22222222-2222-2222-2222-222222222222', '221781234567');

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;

create or replace function pg_temp.as_service() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', false);
  execute 'set role service_role';
end $$;

create or replace function pg_temp.expect_error(sql text, label text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'ok (refused): % -> %', label, sqlerrm;
    return;
  end;
  raise exception 'EXPECTED FAILURE BUT SUCCEEDED: %', label;
end $$;

-- ---------- user A creates a profile; the phone is forced to the SMS-verified one ----------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
insert into public.profiles (full_name, phone_e164, id_type, id_number) values ('Awa Diop', '+221700000000', 'cni_cedeao', 'AB12345');
do $$ begin
  if (select phone_e164 from public.profiles) <> '+221771234567' then raise exception 'phone not forced to verified phone'; end if;
  raise notice 'ok: profile phone forced to verified number';
end $$;

-- ---------- goals ----------
insert into public.goals (name, target_amount, frequency, contribution_amount, status) values ('Tabaski', 150000, 'weekly', 5000, 'active');
select pg_temp.expect_error($q$insert into public.goals (name, target_amount, frequency, contribution_amount) values ('Trop petit', 10000, 'daily', 499)$q$, 'contribution below 500 FCFA');
select pg_temp.expect_error($q$insert into public.goals (name, target_amount, frequency, contribution_amount) values ('Sup', 1000, 'daily', 2000)$q$, 'contribution above target');
select pg_temp.expect_error($q$insert into public.goals (name, target_amount, frequency, contribution_amount, saved_amount) values ('Triche', 1000, 'daily', 500, 999)$q$, 'client cannot set saved_amount on insert');
select pg_temp.expect_error($q$update public.goals set saved_amount = 1000000$q$, 'client cannot update saved_amount');
select pg_temp.expect_error($q$update public.goals set status = 'completed'$q$, 'client cannot mark completed');

update public.goals set status = 'paused' where name = 'Tabaski';
update public.goals set status = 'active' where name = 'Tabaski';
select pg_temp.expect_error($q$update public.goals set status = 'locked', locked_until = current_date - 1 where name = 'Tabaski'$q$, 'lock date must be future');
update public.goals set status = 'locked', locked_until = current_date + 30 where name = 'Tabaski';
update public.goals set status = 'active', locked_until = null where name = 'Tabaski';
do $$ begin raise notice 'ok: pause / resume / lock / unlock'; end $$;

-- child goal: forced locked until 18th birthday, cannot be unlocked early
insert into public.goals (name, target_amount, frequency, contribution_amount, status, is_child_goal, child_birth_date)
  values ('Études Fatou', 2000000, 'monthly', 10000, 'active', true, current_date - interval '5 years');
do $$ begin
  if (select status from public.goals where name = 'Études Fatou') <> 'locked' then raise exception 'child goal not locked'; end if;
  if (select locked_until from public.goals where name = 'Études Fatou') <> (current_date - interval '5 years' + interval '18 years')::date then
    raise exception 'child goal locked_until wrong';
  end if;
  raise notice 'ok: child goal locked until 18';
end $$;
select pg_temp.expect_error($q$update public.goals set status = 'active', locked_until = null where name = 'Études Fatou'$q$, 'child goal early unlock');
select pg_temp.expect_error($q$insert into public.goals (name, target_amount, frequency, contribution_amount, is_child_goal, child_birth_date) values ('Adulte', 10000, 'daily', 500, true, current_date - interval '19 years')$q$, 'child goal for an adult');

-- ---------- ledger & connections are server-only ----------
select pg_temp.expect_error($q$insert into public.activities (kind, status, amount) values ('debit', 'succeeded', 1000)$q$, 'client insert into activities');
select pg_temp.expect_error($q$insert into public.mobile_money_connections (operator, status) values ('wave', 'connected')$q$, 'client marks wallet connected');
select pg_temp.expect_error($q$insert into public.debit_authorizations (operator, status) values ('wave', 'active')$q$, 'client marks mandate active');
select pg_temp.expect_error($q$insert into public.fee_schedules (operator, kind, active) values ('wave', 'withdrawal', true)$q$, 'client writes fees');
insert into public.audit_logs (action, metadata) values ('pin_set', '{}');
select pg_temp.expect_error($q$update public.audit_logs set action = 'x'$q$, 'audit log update');

-- ---------- isolation: user B sees nothing of user A ----------
reset role;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
do $$ begin
  if (select count(*) from public.profiles) <> 0 then raise exception 'B sees A profile'; end if;
  if (select count(*) from public.goals) <> 0 then raise exception 'B sees A goals'; end if;
  if (select count(*) from public.audit_logs) <> 0 then raise exception 'B sees A audit logs'; end if;
  raise notice 'ok: RLS isolation between users';
end $$;
update public.goals set name = 'pirate';
select pg_temp.expect_error($q$insert into public.goals (user_id, name, target_amount, frequency, contribution_amount) values ('11111111-1111-1111-1111-111111111111', 'x', 1000, 'daily', 500)$q$, 'insert goal for another user');
reset role;
do $$ begin
  if exists (select 1 from public.goals where name = 'pirate') then raise exception 'B modified A goal'; end if;
end $$;

-- ---------- server confirms a debit, then a withdrawal: balances follow the ledger ----------
select pg_temp.as_service();
insert into public.activities (user_id, goal_id, kind, status, amount, operator, idempotency_key)
  select user_id, id, 'debit', 'pending', 5000, 'wave', 'k1' from public.goals where name = 'Tabaski';
do $$ begin
  if (select saved_amount from public.goals where name = 'Tabaski') <> 0 then raise exception 'pending debit moved balance'; end if;
end $$;
update public.activities set status = 'succeeded' where idempotency_key = 'k1';
update public.activities set status = 'succeeded' where idempotency_key = 'k1'; -- replayed webhook
do $$ begin
  if (select saved_amount from public.goals where name = 'Tabaski') <> 5000 then raise exception 'confirmed debit not applied exactly once'; end if;
  raise notice 'ok: balance moves only on confirmation, once';
end $$;
select pg_temp.expect_error($q$insert into public.activities (user_id, kind, status, amount, idempotency_key) values ('11111111-1111-1111-1111-111111111111', 'withdrawal', 'pending', 100, 'k1')$q$, 'duplicate idempotency key');
insert into public.activities (user_id, goal_id, kind, status, amount, fee, operator, idempotency_key)
  select user_id, id, 'withdrawal', 'succeeded', 2000, 100, 'wave', 'k2' from public.goals where name = 'Tabaski';
do $$ begin
  if (select saved_amount from public.goals where name = 'Tabaski') <> 3000 then raise exception 'withdrawal not applied'; end if;
end $$;
select pg_temp.expect_error($q$insert into public.activities (user_id, goal_id, kind, status, amount, idempotency_key) select user_id, id, 'withdrawal', 'succeeded', 999999, 'k3' from public.goals where name = 'Tabaski'$q$, 'withdrawal above balance');

-- ---------- account deletion cascades ----------
reset role;
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  if exists (select 1 from public.profiles where user_id = '11111111-1111-1111-1111-111111111111')
     or exists (select 1 from public.goals where user_id = '11111111-1111-1111-1111-111111111111')
     or exists (select 1 from public.activities where user_id = '11111111-1111-1111-1111-111111111111')
     or exists (select 1 from public.audit_logs where user_id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'user data left after account deletion';
  end if;
  raise notice 'ok: account deletion removes all user rows';
end $$;

\echo ALL DATABASE TESTS PASSED
