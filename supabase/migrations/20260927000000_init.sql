-- Sama-Xaalis — initial schema.
-- Rules:
--   * every user table has `user_id uuid not null default auth.uid()` referencing auth.users ON DELETE CASCADE,
--     so deleting the auth user deletes all of their rows;
--   * RLS is enabled on every table, and policies only ever match `user_id = auth.uid()`;
--   * money is stored as bigint FCFA (no floating point);
--   * financial truth (balances, ledger, wallet connections, debit authorizations) is written only by the
--     service role from Edge Functions. For those tables the app gets SELECT, and INSERT / UPDATE / DELETE
--     are deliberately NOT granted to clients (a client must never be able to mark a wallet "connected",
--     a mandate "active" or a transaction "succeeded"). This is stricter than one policy per verb.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_service_role() returns boolean
language sql stable as $$
  select coalesce(current_setting('request.jwt.claim.role', true), (current_setting('request.jwt.claims', true)::jsonb ->> 'role')) = 'service_role'
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 3 and 80),
  phone_e164 text not null check (phone_e164 ~ '^\+2217[0-9]{8}$'),
  id_type text not null check (id_type in ('cni_cedeao', 'passport', 'residence_permit')),
  id_number text not null check (id_number ~ '^[A-Z0-9]{5,20}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The stored phone number is always the one verified by SMS OTP (auth.users.phone), never a client value.
create or replace function public.profiles_force_verified_phone() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare
  verified text;
begin
  select '+' || phone into verified from auth.users where id = new.user_id;
  if verified is null or verified = '+' then
    raise exception 'phone_not_verified' using errcode = 'P0001';
  end if;
  new.phone_e164 := verified;
  return new;
end $$;

create trigger profiles_verified_phone before insert or update on public.profiles
  for each row execute function public.profiles_force_verified_phone();
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated using (user_id = auth.uid());
create policy profiles_insert on public.profiles for insert to authenticated with check (user_id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy profiles_delete on public.profiles for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Goals
-- ---------------------------------------------------------------------------

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 40),
  target_amount bigint not null check (target_amount > 0 and target_amount <= 100000000),
  saved_amount bigint not null default 0 check (saved_amount >= 0),
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  contribution_amount bigint not null check (contribution_amount >= 500),
  status text not null default 'active' check (status in ('active', 'paused', 'locked', 'completed', 'cancelled')),
  operator text check (operator in ('wave', 'orange_money')),
  locked_until date,
  is_child_goal boolean not null default false,
  child_birth_date date,
  next_debit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contribution_le_target check (contribution_amount <= target_amount),
  constraint child_needs_birth_date check (not is_child_goal or child_birth_date is not null),
  constraint locked_needs_date check (status <> 'locked' or locked_until is not null)
);
create index goals_user_idx on public.goals (user_id, created_at desc);

create or replace function public.goals_guard() returns trigger
language plpgsql as $$
begin
  if public.is_service_role() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.is_child_goal then
      if new.child_birth_date > current_date or new.child_birth_date + interval '18 years' <= current_date then
        raise exception 'child_birth_date_invalid' using errcode = 'P0001';
      end if;
      -- Child savings are locked until the 18th birthday, whatever the client sent.
      new.status := 'locked';
      new.locked_until := (new.child_birth_date + interval '18 years')::date;
    elsif new.status not in ('active', 'paused') then
      raise exception 'invalid_initial_status' using errcode = 'P0001';
    end if;
    new.saved_amount := 0;
    return new;
  end if;

  -- UPDATE by the user
  if new.saved_amount is distinct from old.saved_amount or new.is_child_goal is distinct from old.is_child_goal
     or new.child_birth_date is distinct from old.child_birth_date or new.user_id is distinct from old.user_id then
    raise exception 'read_only_field' using errcode = 'P0001';
  end if;
  if old.status in ('cancelled', 'completed') and new.status is distinct from old.status then
    raise exception 'goal_closed' using errcode = 'P0001';
  end if;
  if new.status = 'completed' then
    raise exception 'status_server_only' using errcode = 'P0001';
  end if;
  if old.is_child_goal and old.locked_until > current_date
     and (new.status is distinct from 'locked' or new.locked_until < old.locked_until) then
    raise exception 'child_goal_locked' using errcode = 'P0001';
  end if;
  if new.status = 'locked' and (new.locked_until is null or new.locked_until <= current_date) and not old.is_child_goal then
    raise exception 'lock_date_invalid' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger goals_guard before insert or update on public.goals
  for each row execute function public.goals_guard();
create trigger goals_touch before update on public.goals
  for each row execute function public.touch_updated_at();

alter table public.goals enable row level security;
create policy goals_select on public.goals for select to authenticated using (user_id = auth.uid());
create policy goals_insert on public.goals for insert to authenticated with check (user_id = auth.uid());
create policy goals_update on public.goals for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy goals_delete on public.goals for delete to authenticated using (user_id = auth.uid() and saved_amount = 0);

-- Column-level privileges: the balance can never be written by the app.
revoke insert, update on public.goals from authenticated, anon;
grant insert (name, target_amount, frequency, contribution_amount, status, operator, locked_until, is_child_goal, child_birth_date, next_debit_at)
  on public.goals to authenticated;
grant update (name, target_amount, frequency, contribution_amount, status, operator, locked_until, next_debit_at)
  on public.goals to authenticated;

-- ---------------------------------------------------------------------------
-- Activities (ledger) — written by the service role only
-- ---------------------------------------------------------------------------

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id uuid references public.goals (id) on delete set null,
  kind text not null check (kind in ('debit', 'withdrawal', 'fee', 'refund')),
  status text not null check (status in ('scheduled', 'pending', 'succeeded', 'failed', 'cancelled', 'refunded')),
  amount bigint not null check (amount > 0),
  fee bigint not null default 0 check (fee >= 0),
  operator text check (operator in ('wave', 'orange_money')),
  provider_reference text,
  idempotency_key text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_idempotency unique (user_id, idempotency_key)
);
create index activities_user_idx on public.activities (user_id, created_at desc);
create unique index activities_provider_ref_idx on public.activities (operator, provider_reference) where provider_reference is not null;

-- Balances move only when the operator has confirmed (status -> succeeded / refunded).
create or replace function public.activities_apply_balance() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.goal_id is null then return new; end if;
  if new.status = 'succeeded' and (tg_op = 'INSERT' or old.status <> 'succeeded') then
    if new.kind = 'debit' then
      update public.goals set saved_amount = saved_amount + new.amount where id = new.goal_id;
    elsif new.kind = 'withdrawal' then
      update public.goals set saved_amount = saved_amount - new.amount where id = new.goal_id;
    end if;
  elsif new.status = 'refunded' and tg_op = 'UPDATE' and old.status = 'succeeded' and new.kind = 'debit' then
    update public.goals set saved_amount = saved_amount - new.amount where id = new.goal_id;
  end if;
  return new;
end $$;

create trigger activities_balance after insert or update of status on public.activities
  for each row execute function public.activities_apply_balance();
create trigger activities_touch before update on public.activities
  for each row execute function public.touch_updated_at();

alter table public.activities enable row level security;
create policy activities_select on public.activities for select to authenticated using (user_id = auth.uid());
-- No insert / update / delete policy for clients: the ledger is append-only from the server.
revoke insert, update, delete on public.activities from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Mobile Money connections & debit authorizations — written by the service role only
-- ---------------------------------------------------------------------------

create table public.mobile_money_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  operator text not null check (operator in ('wave', 'orange_money')),
  phone_e164 text check (phone_e164 ~ '^\+2217[0-9]{8}$'),
  status text not null default 'not_connected' check (status in ('not_connected', 'connecting', 'connected', 'error', 'revoked')),
  provider_account_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, operator)
);
create trigger mm_connections_touch before update on public.mobile_money_connections
  for each row execute function public.touch_updated_at();

create table public.debit_authorizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  operator text not null check (operator in ('wave', 'orange_money')),
  status text not null default 'pending' check (status in ('pending', 'active', 'refused', 'expired', 'revoked')),
  max_amount bigint check (max_amount > 0),
  provider_reference text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, operator)
);
create trigger debit_auth_touch before update on public.debit_authorizations
  for each row execute function public.touch_updated_at();

alter table public.mobile_money_connections enable row level security;
alter table public.debit_authorizations enable row level security;
create policy mm_connections_select on public.mobile_money_connections for select to authenticated using (user_id = auth.uid());
create policy debit_auth_select on public.debit_authorizations for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.mobile_money_connections from authenticated, anon;
revoke insert, update, delete on public.debit_authorizations from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Fee schedules (public, read-only). Intentionally left EMPTY: rows must come from the signed
-- operator / partner contracts. While a schedule is missing, the app blocks withdrawals.
-- ---------------------------------------------------------------------------

create table public.fee_schedules (
  id uuid primary key default gen_random_uuid(),
  operator text not null check (operator in ('wave', 'orange_money')),
  kind text not null check (kind in ('withdrawal', 'debit')),
  fixed_fee bigint not null default 0 check (fixed_fee >= 0),
  rate_bps integer not null default 0 check (rate_bps between 0 and 10000),
  min_fee bigint not null default 0 check (min_fee >= 0),
  max_fee bigint check (max_fee is null or max_fee >= min_fee),
  active boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index fee_schedules_one_active on public.fee_schedules (operator, kind) where active;
alter table public.fee_schedules enable row level security;
create policy fee_schedules_read on public.fee_schedules for select to anon, authenticated using (active);
revoke insert, update, delete on public.fee_schedules from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Audit logs (append-only; never contain OTP, PIN, tokens or full ID numbers)
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  action text not null check (action ~ '^[a-z_]{2,64}$'),
  metadata jsonb not null default '{}'::jsonb check (pg_column_size(metadata) < 2048),
  created_at timestamptz not null default now()
);
create index audit_logs_user_idx on public.audit_logs (user_id, created_at desc);
alter table public.audit_logs enable row level security;
create policy audit_logs_select on public.audit_logs for select to authenticated using (user_id = auth.uid());
create policy audit_logs_insert on public.audit_logs for insert to authenticated with check (user_id = auth.uid());
revoke update, delete on public.audit_logs from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Private storage for user documents: <user_id>/<file>. Removed by the delete-account function.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('user-documents', 'user-documents', false)
  on conflict (id) do nothing;

create policy user_documents_select on storage.objects for select to authenticated
  using (bucket_id = 'user-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy user_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'user-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy user_documents_update on storage.objects for update to authenticated
  using (bucket_id = 'user-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy user_documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'user-documents' and (storage.foldername(name))[1] = auth.uid()::text);
