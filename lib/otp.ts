// SMS OTP through Supabase Auth (phone provider). The server generates a random code, sends it through
// the SMS provider configured in the Supabase dashboard (Twilio, Vonage, MessageBird, Textlocal or a
// Send-SMS hook), stores it hashed, expires it and rate-limits it. The app never sees, logs or generates
// the code, and there is no bypass code. When the backend or SMS provider is missing, sending fails
// explicitly — nothing is simulated.
import { AuthError } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import { OTP_LENGTH, OTP_TTL_SECONDS } from './config';
import { normalizeSenegalPhone } from './phone';

export type OtpFailureReason =
  | 'not_configured' // Supabase URL / anon key missing in the app build
  | 'sms_not_configured' // Supabase has no SMS provider, or the provider refused to send
  | 'invalid_phone'
  | 'invalid_code'
  | 'expired_or_invalid'
  | 'too_many_attempts'
  | 'resend_cooldown'
  | 'resend_limit'
  | 'rate_limited'
  | 'user_not_found'
  | 'network'
  | 'unknown';

export type OtpSendResult = { ok: true; expiresAt: string } | { ok: false; reason: OtpFailureReason };
export type OtpVerifyResult = { ok: true; userId: string } | { ok: false; reason: OtpFailureReason };

export function mapAuthError(error: unknown): OtpFailureReason {
  if (error instanceof AuthError) {
    const code = error.code ?? '';
    if (code === 'otp_expired') return 'expired_or_invalid';
    if (code === 'over_sms_send_rate_limit' || code === 'over_request_rate_limit' || error.status === 429)
      return 'rate_limited';
    if (code === 'sms_send_failed' || code === 'phone_provider_disabled' || code === 'otp_disabled')
      return 'sms_not_configured';
    if (/unsupported phone provider|sms provider|error sending/i.test(error.message)) return 'sms_not_configured';
    if (code === 'user_not_found' || code === 'signup_disabled') return 'user_not_found';
    if (/token has expired or is invalid/i.test(error.message)) return 'expired_or_invalid';
    if (error.name === 'AuthRetryableFetchError') return 'network';
    return 'unknown';
  }
  if (error instanceof TypeError) return 'network';
  return 'unknown';
}

/**
 * Asks the backend to generate and send an OTP by SMS.
 * `ok: true` only means the backend accepted and handed the SMS to its provider.
 */
export async function sendOtp(
  phoneE164: string,
  options: { createUser: boolean },
  now: () => number = Date.now,
): Promise<OtpSendResult> {
  if (normalizeSenegalPhone(phoneE164) !== phoneE164) return { ok: false, reason: 'invalid_phone' };
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not_configured' };
  try {
    const { error } = await supabase.auth.signInWithOtp({
      phone: phoneE164,
      options: { shouldCreateUser: options.createUser, channel: 'sms' },
    });
    if (error) return { ok: false, reason: mapAuthError(error) };
    return { ok: true, expiresAt: new Date(now() + OTP_TTL_SECONDS * 1000).toISOString() };
  } catch (e) {
    return { ok: false, reason: mapAuthError(e) };
  }
}

export function isWellFormedOtp(code: string): boolean {
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code);
}

/** Verifies the code on the server. On success the Supabase session is stored in SecureStore. */
export async function verifyOtp(phoneE164: string, code: string): Promise<OtpVerifyResult> {
  if (!isWellFormedOtp(code)) return { ok: false, reason: 'invalid_code' };
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not_configured' };
  try {
    const { data, error } = await supabase.auth.verifyOtp({ phone: phoneE164, token: code, type: 'sms' });
    if (error) return { ok: false, reason: mapAuthError(error) };
    if (!data.user) return { ok: false, reason: 'unknown' };
    return { ok: true, userId: data.user.id };
  } catch (e) {
    return { ok: false, reason: mapAuthError(e) };
  }
}

/**
 * Client-side limits, layered on top of the server's own limits (supabase/config.toml):
 * - at most MAX_ATTEMPTS wrong codes per sent code, then a new code is required;
 * - RESEND_COOLDOWN_MS between two sends;
 * - at most MAX_SENDS sends per SEND_WINDOW_MS.
 */
export class OtpGuard {
  static MAX_ATTEMPTS = 5;
  static RESEND_COOLDOWN_MS = 60_000;
  static MAX_SENDS = 3;
  static SEND_WINDOW_MS = 15 * 60_000;

  private sends: number[] = [];
  private attempts = 0;
  private expiresAt = 0;

  constructor(private readonly now: () => number = Date.now) {}

  /** Why a send is refused right now, or null if allowed. */
  sendBlockedReason(): 'resend_cooldown' | 'resend_limit' | null {
    const t = this.now();
    this.sends = this.sends.filter((s) => t - s < OtpGuard.SEND_WINDOW_MS);
    if (this.sends.length >= OtpGuard.MAX_SENDS) return 'resend_limit';
    const last = this.sends[this.sends.length - 1];
    if (last !== undefined && t - last < OtpGuard.RESEND_COOLDOWN_MS) return 'resend_cooldown';
    return null;
  }

  /** Seconds before the next send is allowed (0 when allowed or when the window limit applies). */
  cooldownRemainingSeconds(): number {
    const last = this.sends[this.sends.length - 1];
    if (last === undefined) return 0;
    return Math.max(0, Math.ceil((last + OtpGuard.RESEND_COOLDOWN_MS - this.now()) / 1000));
  }

  recordSend(expiresAtIso: string): void {
    this.sends.push(this.now());
    this.attempts = 0;
    this.expiresAt = Date.parse(expiresAtIso);
  }

  verifyBlockedReason(): 'too_many_attempts' | 'expired_or_invalid' | null {
    if (this.attempts >= OtpGuard.MAX_ATTEMPTS) return 'too_many_attempts';
    if (this.expiresAt === 0 || this.now() >= this.expiresAt) return 'expired_or_invalid';
    return null;
  }

  recordFailedAttempt(): void {
    this.attempts += 1;
  }

  remainingAttempts(): number {
    return Math.max(0, OtpGuard.MAX_ATTEMPTS - this.attempts);
  }

  secondsUntilExpiry(): number {
    return Math.max(0, Math.ceil((this.expiresAt - this.now()) / 1000));
  }
}
