-- Sama-Xaalis: saving period + goal category + 1 % withdrawal fee.
-- The user chooses an amount and a period; debits are automatic during the period and the money can be
-- withdrawn once the period is over (fee: 1 %, rounded up to the franc).

alter table public.goals
  add column category text check (category in ('urgence', 'fete', 'scolarite', 'sante', 'commerce', 'logement', 'autre')),
  add column ends_on date;

create or replace function public.goals_period_guard() returns trigger
language plpgsql as $$
begin
  if public.is_service_role() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- Legacy child goals: the period ends on the 18th birthday (set by goals_guard, which runs first).
    if new.is_child_goal then
      new.ends_on := new.locked_until;
      return new;
    end if;
    -- Every new goal has a period of 7 days to ~5 years.
    if new.ends_on is null or new.ends_on < current_date + 7 or new.ends_on > current_date + 1830 then
      raise exception 'period_invalid' using errcode = 'P0001';
    end if;
    return new;
  end if;
  -- The period is a commitment: it can be extended, never shortened.
  if new.ends_on is distinct from old.ends_on
     and (new.ends_on is null or (old.ends_on is not null and new.ends_on < old.ends_on) or new.ends_on > current_date + 1830) then
    raise exception 'period_locked' using errcode = 'P0001';
  end if;
  if new.category is distinct from old.category then
    raise exception 'read_only_field' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger goals_period_guard before insert or update on public.goals
  for each row execute function public.goals_period_guard();

grant insert (category, ends_on) on public.goals to authenticated;
grant update (ends_on) on public.goals to authenticated;

-- Service fee on withdrawals: 1 % for both operators (same rule as lib/money.ts WITHDRAWAL_FEE_BPS).
insert into public.fee_schedules (operator, kind, fixed_fee, rate_bps, min_fee, max_fee, active)
values ('wave', 'withdrawal', 0, 100, 0, null, true), ('orange_money', 'withdrawal', 0, 100, 0, null, true);
