// Data access. Every read/write goes to Supabase (RLS-protected). There is no mock or demo data:
// when the backend is not configured, calls return { ok: false, error: 'not_configured' }.
import { FunctionsHttpError } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import type { Activity, Goal, GoalCategory, GoalDraft, GoalStatus, IdType, Operator, Profile } from '../types';
import { nextDebitDate } from './schedule';

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
  category: GoalCategory | null;
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
  ends_on: string | null;
  created_at: string;
}

const GOAL_COLUMNS =
  'id, name, category, target_amount, saved_amount, frequency, contribution_amount, status, operator, locked_until, is_child_goal, child_birth_date, next_debit_at, ends_on, created_at';

function toGoal(r: GoalRow): Goal {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
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
    endsOn: r.ends_on,
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
  const { data, error: e } = await supabase
    .from('goals')
    .insert({
      name: d.name.trim(),
      category: d.category,
      target_amount: d.targetAmount,
      frequency: d.frequency,
      contribution_amount: d.contributionAmount,
      operator: d.operator,
      status: 'active',
      ends_on: d.endsOn,
      // Planned date only: the server debits nothing without an active operator authorization.
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

// ---------- Withdrawals (fee: 1 %, see lib/money.ts) ----------

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
