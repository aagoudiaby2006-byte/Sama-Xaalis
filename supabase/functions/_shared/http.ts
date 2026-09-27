// Shared helpers for Sama-Xaalis Edge Functions (Deno).
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/** Error codes understood by the app (lib/data.ts). Never include secrets, OTPs or PINs in messages. */
export type ErrorCode = 'not_authenticated' | 'forbidden' | 'conflict' | 'invalid_request' | 'integration_not_configured' | 'server';

export function error(code: ErrorCode, status: number): Response {
  return json({ code }, status);
}

/** Service-role client. SUPABASE_SERVICE_ROLE_KEY is injected by Supabase and never leaves the server. */
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Resolves the calling user from the Authorization header (JWT verified by Supabase Auth). */
export async function requireUser(req: Request): Promise<{ userId: string; phone: string | null } | Response> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return error('not_authenticated', 401);
  const { data, error: e } = await adminClient().auth.getUser(token);
  if (e || !data.user) return error('not_authenticated', 401);
  return { userId: data.user.id, phone: data.user.phone ? `+${data.user.phone}` : null };
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function isOperator(v: unknown): v is 'wave' | 'orange_money' {
  return v === 'wave' || v === 'orange_money';
}

export function isSenegalMobile(v: unknown): v is string {
  return typeof v === 'string' && /^\+2217\d{8}$/.test(v);
}
