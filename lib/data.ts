// Data access. Every read/write goes to Supabase (RLS-protected). There is no mock or demo data:
// when the backend is not configured, calls return { ok: false, error: 'not_configured' }.
import { FunctionsHttpError } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import type { Activity, FeeSchedule, Goal, GoalDraft, GoalStatus, IdType, Operator, Profile } from '../types';
import { nextDebitDate, majorityDate, parseIsoDate, toIsoDate } from './schedule';

export type DataError =
  | 'not_configured'
  | 'not_authenticated'
  | 'network'
  | 'forbidden'
  | 'conflict'
  | 'integration_not_configured'
  | 'invalid_request'
  | 'server';

export type DataResult<T> = { ok: true; data: T } | { ok: false; error: DataError };

const ok = <T,>(data: T): DataResult<T> => ({ ok: true, data });
const fail = <T,>(error: DataError): DataResult<T> => ({ ok: false, error });

function mapPgError(e: { code?: string; message?: string } | null): DataError {
  if (!e) return 'server';
  if (e.code === '42501' || e.code === 'PGRST301') return 'forbidden';
  if (e.code === '23505') return 'conflict';
  if (e.code === '23514' || e.code === '22P02' || e.code === 'P0001') return 'invalid_request';
  if (/fetch|network/i.test(e.message ?? '')) return 'network';
  return 'server';
}

async function authed() {
  const supabase = getSupabase();
  if (!supabase) return { supabase: null, userId: null, error: 'not_configured' as const };
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id ?? null;
  if (!userId) return { supabase, userId: null, error: 'not_authenticated' as const };
  return { supabase, userId, error: null };
}

/** Calls an Edge Function and extracts `{ code }` from error bodies. */
export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<DataResult<T>> {
  const { supabase, error } = await authed();
  if (!supabase || error) return fail(error ?? 'not_configured');
  try {
    const { data, error: fnError } = await supabase.functions.invoke<T>(name, { body });
    if (fnError) {
      if (fnError instanceof FunctionsHttpError) {
        const payload = (await fnError.context.json().catch(() => ({}))) as { code?: string };
        const code = payload.code as DataError | undefined;
        if (code && ['integration_not_configured', 'forbidden', 'conflict', 'invalid_request', 'not_authenticated'].includes(code))
          return fail(code);
        return fail('server');
      }
      return fail('network');
    }
    return ok(data as T);
  } catch {
    return fail('network');
  }
}

// ---------- Profile ----------

export async function fetchProfile(): Promise<DataResult<Profile | null>> {
  const { supabase, userId, error } = await authed();
  if (!supabase || !userId) return fail(error ?? 'not_configured');
  const { data, error: e } = await supabase
    .from('profiles')
    .select('user_id, full_name, phone_e164, id_type, id_number')
    .eq('user_id', userId)
    .maybeSingle();
  if (e) return fail(mapPgError(e));
  if (!data) return ok(null);
  return ok({
    userId: data.user_id,
    fullName: data.full_name,
    phoneE164: data.phone_e164,
    idType: data.id_type as IdType,
    idNumber: data.id_number,
  });
}

export async function saveProfile(p: Omit<Profile, 'userId'>): Promise<DataResult<null>> {
  const { supabase, userId, error } = await authed();
  if (!supabase || !userId) return fail(error ?? 'not_configured');
  const { error: e } = await supabase.from('profiles').upsert({
    user_id: userId,
    full_name: p.fullName.trim(),
    phone_e164: p.phoneE164,
    id_type: p.idType,
    id_number: p.idNumber.trim(),
  });
  return e ? fail(mapPgError(e)) : ok(null);
}

// ---------- Goals ----------

interface GoalRow {
  id: string;
  name: string;
  target_amount: number;
  saved_amount: number;
  frequency: Goal['frequency'];
  contribution_amount: number;
  status: GoalStatus;
  operator: Operator | null;
  locked_until: string | null;
  is_child_goal: boolean;
  child_birth_date: string | null;
  next_debit_at: string | null;
  created_at: string;
}

const GOAL_COLUMNS =
  'id, name, target_amount, saved_amount, frequency, contribution_amount, status, operator, locked_until, is_child_goal, child_birth_date, next_debit_at, created_at';

function toGoal(r: GoalRow): Goal {
  return {
    id: r.id,
    name: r.name,
    targetAmount: r.target_amount,
    savedAmount: r.saved_amount,
    frequency: r.frequency,
    contributionAmount: r.contribution_amount,
    status: r.status,
    operator: r.operator,
    lockedUntil: r.locked_until,
    isChildGoal: r.is_child_goal,
    childBirthDate: r.child_birth_date,
    nextDebitAt: r.next_debit_at,
    createdAt: r.created_at,
  };
}

export async function listGoals(): Promise<DataResult<Goal[]>> {
  const { supabase, userId, error } = await authed();
  if (!supabase || !userId) return fail(error ?? 'not_configured');
  const { data, error: e } = await supabase.from('goals').select(GOAL_COLUMNS).order('created_at', { ascending: false });
  if (e) return fail(mapPgError(e));
  return ok((data as GoalRow[]).map(toGoal));
}

export async function createGoal(d: GoalDraft): Promise<DataResult<Goal>> {
  const { supabase, userId, error } = await authed();
  if (!supabase || !userId) return fail(error ?? 'not_configured');
  const birth = d.isChildGoal && d.childBirthDate ? parseIsoDate(d.childBirthDate) : null;
  const { data, error: e } = await supabase
    .from('goals')
    .insert({
      name: d.name.trim(),
      target_amount: d.targetAmount,
      frequency: d.frequency,
      contribution_amount: d.contributionAmount,
      operator: d.operator,
      is_child_goal: d.isChildGoal,
      child_birth_date: birth ? toIsoDate(birth) : null,
      // A child goal stays locked until the child turns 18.
      status: birth ? 'locked' : 'active',
      locked_until: birth ? toIsoDate(majorityDate(birth)) : null,
      next_debit_at: nextDebitDate(d.frequency, new Date()).toISOString(),
    })
    .select(GOAL_COLUMNS)
    .single();
  if (e) return fail(mapPgError(e));
  return ok(toGoal(data as GoalRow));
}

async function patchGoal(id: string, patch: Record<string, unknown>): Promise<DataResult<Goal>> {
  const { supabase, userId, error } = await authed();
  if (!supabase || !userId) return fail(error ?? 'not_configured');
  const { data, error: e } = await supabase.from('goals').update(patch).eq('id', id).select(GOAL_COLUMNS).single();
  if (e) return fail(mapPgError(e));
  return ok(toGoal(data as GoalRow));
}

export const pauseGoal = (id: string) => patchGoal(id, { status: 'paused' });
export const resumeGoal = (id: string) => patchGoal(id, { status: 'active' });
export const cancelGoal = (id: string) => patchGoal(id, { status: 'cancelled' });
export const lockGoal = (id: string, untilIsoDate: string) => patchGoal(id, { status: 'locked', locked_until: untilIsoDate });
/** The database refuses to unlock a child goal before the child turns 18. */
export const unlockGoal = (id: string) => patchGoal(id, { status: 'active', locked_until: null });

// ---------- Activity ----------

interface ActivityRowDb {
  id: string;
  goal_id: string | null;
  kind: Activity['kind'];
  status: Activity['status'];
  amount: number;
  fee: number;
  operator: Operator | null;
  error_code: string | null;
  created_at: string;
}

export async function listActivities(goalId?: string, limit = 50): Promise<DataResult<Activity[]>> {
  const { supabase, userId, error } = await authed();
  if (!supabase || !userId) return fail(error ?? 'not_configured');
  let q = supabase
    .from('activities')
    .select('id, goal_id, kind, status, amount, fee, operator, error_code, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (goalId) q = q.eq('goal_id', goalId);
  const { data, error: e } = await q;
  if (e) return fail(mapPgError(e));
  return ok(
    (data as ActivityRowDb[]).map((r) => ({
      id: r.id,
      goalId: r.goal_id,
      kind: r.kind,
      status: r.status,
      amount: r.amount,
      fee: r.fee,
      operator: r.operator,
      errorCode: r.error_code,
      createdAt: r.created_at,
    })),
  );
}

// ---------- Fees & withdrawals ----------

export async function fetchFeeSchedule(operator: Operator): Promise<DataResult<FeeSchedule | null>> {
  const supabase = getSupabase();
  if (!supabase) return fail('not_configured');
  const { data, error } = await supabase
    .from('fee_schedules')
    .select('operator, fixed_fee, rate_bps, min_fee, max_fee')
    .eq('operator', operator)
    .eq('kind', 'withdrawal')
    .eq('active', true)
    .maybeSingle();
  if (error) return fail(mapPgError(error));
  if (!data) return ok(null);
  return ok({
    operator: data.operator,
    fixedFee: data.fixed_fee,
    rateBps: data.rate_bps,
    minFee: data.min_fee,
    maxFee: data.max_fee,
  });
}

export interface WithdrawalRequest {
  goalId: string;
  operator: Operator;
  amount: number;
  expectedFee: number;
  idempotencyKey: string;
}

/** The server recomputes fees and refuses while the operator integration is not configured. */
export function requestWithdrawal(r: WithdrawalRequest) {
  return invokeFunction<{ activityId: string; status: Activity['status'] }>('withdraw', { ...r });
}

// ---------- Account ----------

export function logAudit(action: string, metadata: Record<string, string | number | boolean> = {}) {
  void (async () => {
    const { supabase, userId } = await authed();
    if (!supabase || !userId) return;
    await supabase.from('audit_logs').insert({ action, metadata });
  })();
}

export async function deleteAccount(): Promise<DataResult<null>> {
  const res = await invokeFunction<{ deleted: boolean }>('delete-account', {});
  if (!res.ok) return res;
  return res.data.deleted ? ok(null) : fail('server');
}
