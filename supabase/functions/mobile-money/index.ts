// Wave / Orange Money connection state, official authentication and debit authorizations.
// The app can only READ states; every state change happens here, after an official operator response.
import { adapters } from '../_shared/operators.ts';
import { adminClient, corsHeaders, error, isOperator, isSenegalMobile, json, readJson, requireUser } from '../_shared/http.ts';

type Operator = 'wave' | 'orange_money';

async function operatorStates(userId: string) {
  const db = adminClient();
  const [{ data: conns }, { data: mandates }] = await Promise.all([
    db.from('mobile_money_connections').select('operator, status, phone_e164, updated_at').eq('user_id', userId),
    db.from('debit_authorizations').select('operator, status, updated_at').eq('user_id', userId),
  ]);
  return (['wave', 'orange_money'] as Operator[]).map((operator) => {
    const c = conns?.find((r) => r.operator === operator);
    const m = mandates?.find((r) => r.operator === operator);
    return {
      operator,
      integrationAvailable: adapters[operator].isAvailable(),
      connection: c?.status ?? 'not_connected',
      mandate: m?.status ?? 'none',
      phoneE164: c?.phone_e164 ?? null,
      updatedAt: c?.updated_at ?? m?.updated_at ?? null,
    };
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return error('invalid_request', 405);

  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const body = await readJson(req);
  if (!body) return error('invalid_request', 400);
  const db = adminClient();

  try {
    if (body.action === 'status') {
      return json({ operators: await operatorStates(user.userId) });
    }

    const operator = body.operator;
    if (!isOperator(operator)) return error('invalid_request', 400);
    const adapter = adapters[operator];
    const state = async () => (await operatorStates(user.userId)).find((s) => s.operator === operator);

    if (body.action === 'connect') {
      if (!isSenegalMobile(body.phone)) return error('invalid_request', 400);
      if (!adapter.isAvailable()) return error('integration_not_configured', 501);
      const res = await adapter.startConnection(user.userId, body.phone);
      // "connecting" until the operator's official callback/webhook confirms the account.
      await db.from('mobile_money_connections').upsert(
        { user_id: user.userId, operator, phone_e164: body.phone, status: 'connecting', provider_account_ref: res.providerAccountRef },
        { onConflict: 'user_id,operator' },
      );
      return json({ state: await state(), authUrl: res.authUrl });
    }

    if (body.action === 'authorize') {
      if (!adapter.isAvailable()) return error('integration_not_configured', 501);
      const { data: conn } = await db
        .from('mobile_money_connections')
        .select('status, provider_account_ref')
        .eq('user_id', user.userId)
        .eq('operator', operator)
        .maybeSingle();
      if (conn?.status !== 'connected') return error('forbidden', 403);
      const res = await adapter.requestMandate(user.userId, conn.provider_account_ref);
      // "pending" until the operator confirms the mandate through its official webhook.
      await db.from('debit_authorizations').upsert(
        { user_id: user.userId, operator, status: 'pending', provider_reference: res.providerReference },
        { onConflict: 'user_id,operator' },
      );
      return json({ state: await state(), authUrl: res.authUrl });
    }

    if (body.action === 'revoke') {
      const { data: mandate } = await db
        .from('debit_authorizations')
        .select('status, provider_reference')
        .eq('user_id', user.userId)
        .eq('operator', operator)
        .maybeSingle();
      if (mandate && (mandate.status === 'active' || mandate.status === 'pending')) {
        if (!adapter.isAvailable()) return error('integration_not_configured', 501);
        if (mandate.provider_reference) await adapter.revokeMandate(mandate.provider_reference);
        await db.from('debit_authorizations').update({ status: 'revoked' }).eq('user_id', user.userId).eq('operator', operator);
        await db.from('audit_logs').insert({ user_id: user.userId, action: 'mandate_revoked_server', metadata: { operator } });
      }
      return json({ state: await state() });
    }

    return error('invalid_request', 400);
  } catch (e) {
    console.error('mobile-money failure', (e as Error).message);
    return error('server', 500);
  }
});
