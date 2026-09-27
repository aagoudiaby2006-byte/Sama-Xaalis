// Withdrawal request. Fees are recomputed server-side from `fee_schedules` (integer FCFA, 1 %).
// Money can only be withdrawn once the goal's saving period (`ends_on`) is over.
// The withdrawal is recorded as "pending" and only becomes "succeeded" when the operator confirms it
// (webhook, to be implemented with the operator integration). Idempotency: one row per idempotency key.
import { adapters } from '../_shared/operators.ts';
import { adminClient, corsHeaders, error, isOperator, json, readJson, requireUser } from '../_shared/http.ts';

function computeFee(amount: number, s: { fixed_fee: number; rate_bps: number; min_fee: number; max_fee: number | null }): number {
  let fee = s.fixed_fee + Math.floor((amount * s.rate_bps + 9_999) / 10_000);
  if (fee < s.min_fee) fee = s.min_fee;
  if (s.max_fee !== null && fee > s.max_fee) fee = s.max_fee;
  return fee;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return error('invalid_request', 405);
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const body = await readJson(req);
  if (!body) return error('invalid_request', 400);

  const { goalId, operator, amount, expectedFee, idempotencyKey } = body;
  if (
    typeof goalId !== 'string' ||
    !isOperator(operator) ||
    typeof amount !== 'number' ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    typeof expectedFee !== 'number' ||
    typeof idempotencyKey !== 'string' ||
    !/^[0-9a-f-]{36}$/i.test(idempotencyKey)
  ) {
    return error('invalid_request', 400);
  }

  const adapter = adapters[operator];
  if (!adapter.isAvailable()) return error('integration_not_configured', 501);

  const db = adminClient();
  try {
    // Same key already processed: return the existing request (protects against double taps / retries).
    const { data: existing } = await db
      .from('activities')
      .select('id, status')
      .eq('user_id', user.userId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existing) return json({ activityId: existing.id, status: existing.status });

    const { data: goal } = await db.from('goals').select('id, status, saved_amount, ends_on').eq('id', goalId).eq('user_id', user.userId).maybeSingle();
    if (!goal) return error('forbidden', 403);
    if (goal.status === 'locked') return error('forbidden', 403);
    const today = new Date().toISOString().slice(0, 10); // Senegal is UTC+0 all year
    if (goal.ends_on && goal.ends_on > today) return error('forbidden', 403);

    const { data: pending } = await db
      .from('activities')
      .select('amount')
      .eq('user_id', user.userId)
      .eq('goal_id', goalId)
      .eq('kind', 'withdrawal')
      .eq('status', 'pending');
    const reserved = (pending ?? []).reduce((s, r) => s + Number(r.amount), 0);
    if (amount > Number(goal.saved_amount) - reserved) return error('invalid_request', 400);

    const { data: schedule } = await db
      .from('fee_schedules')
      .select('fixed_fee, rate_bps, min_fee, max_fee')
      .eq('operator', operator)
      .eq('kind', 'withdrawal')
      .eq('active', true)
      .maybeSingle();
    if (!schedule) return error('integration_not_configured', 501);
    const fee = computeFee(amount, schedule);
    if (fee !== expectedFee || fee >= amount) return error('conflict', 409);

    const { data: activity, error: insertError } = await db
      .from('activities')
      .insert({ user_id: user.userId, goal_id: goalId, kind: 'withdrawal', status: 'pending', amount, fee, operator, idempotency_key: idempotencyKey })
      .select('id, status')
      .single();
    if (insertError) return error(insertError.code === '23505' ? 'conflict' : 'server', insertError.code === '23505' ? 409 : 500);

    const { data: conn } = await db
      .from('mobile_money_connections')
      .select('phone_e164, status')
      .eq('user_id', user.userId)
      .eq('operator', operator)
      .maybeSingle();
    if (conn?.status !== 'connected' || !conn.phone_e164) {
      await db.from('activities').update({ status: 'failed', error_code: 'wallet_not_connected' }).eq('id', activity.id);
      return json({ activityId: activity.id, status: 'failed' });
    }

    try {
      const res = await adapter.payout({ phoneE164: conn.phone_e164, amount: amount - fee, idempotencyKey });
      await db.from('activities').update({ provider_reference: res.providerReference }).eq('id', activity.id);
    } catch (e) {
      console.error('payout failure', (e as Error).message);
      await db.from('activities').update({ status: 'failed', error_code: 'payout_failed' }).eq('id', activity.id);
      return json({ activityId: activity.id, status: 'failed' });
    }
    return json({ activityId: activity.id, status: 'pending' });
  } catch (e) {
    console.error('withdraw failure', (e as Error).message);
    return error('server', 500);
  }
});
