// Account deletion (required by Apple 5.1.1(v) and Google Play).
// 1. revokes active debit authorizations with the operator; 2. deletes the user's files;
// 3. deletes the auth user, which cascades to every table (ON DELETE CASCADE) and revokes refresh tokens.
// The app then signs out and wipes SecureStore and local preferences.
import { adapters } from '../_shared/operators.ts';
import { adminClient, corsHeaders, error, json, requireUser } from '../_shared/http.ts';

const BUCKET = 'user-documents';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return error('invalid_request', 405);
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const db = adminClient();

  try {
    // 1. Debit authorizations must be revoked with the operator before the data disappears.
    const { data: mandates } = await db
      .from('debit_authorizations')
      .select('operator, status, provider_reference')
      .eq('user_id', user.userId)
      .in('status', ['active', 'pending']);
    for (const m of mandates ?? []) {
      const adapter = adapters[m.operator as 'wave' | 'orange_money'];
      if (!m.provider_reference) continue;
      if (!adapter.isAvailable()) return error('integration_not_configured', 501);
      await adapter.revokeMandate(m.provider_reference);
    }

    // 2. Files under <user_id>/ in private storage.
    const { data: files } = await db.storage.from(BUCKET).list(user.userId, { limit: 1000 });
    if (files && files.length > 0) {
      await db.storage.from(BUCKET).remove(files.map((f) => `${user.userId}/${f.name}`));
    }

    // 3. Auth user (cascades to profiles, goals, activities, connections, authorizations, audit logs).
    const { error: delError } = await db.auth.admin.deleteUser(user.userId);
    if (delError) {
      console.error('delete user failure', delError.message);
      return error('server', 500);
    }
    return json({ deleted: true });
  } catch (e) {
    console.error('delete-account failure', (e as Error).message);
    return error('server', 500);
  }
});
