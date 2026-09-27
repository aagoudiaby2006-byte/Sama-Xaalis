import { AuthApiError } from '@supabase/supabase-js';
import { OtpGuard, mapAuthError, sendOtp, verifyOtp } from '../lib/otp';
import { getSupabase } from '../lib/supabase';

jest.mock('../lib/supabase', () => ({ getSupabase: jest.fn() }));
const mockedGetSupabase = getSupabase as jest.Mock;

function fakeSupabase(overrides: { signInWithOtp?: jest.Mock; verifyOtp?: jest.Mock } = {}) {
  const auth = {
    signInWithOtp: overrides.signInWithOtp ?? jest.fn(async () => ({ data: {}, error: null })),
    verifyOtp: overrides.verifyOtp ?? jest.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
  };
  mockedGetSupabase.mockReturnValue({ auth });
  return auth;
}

beforeEach(() => mockedGetSupabase.mockReset());

describe('sendOtp', () => {
  it('refuses honestly when the backend is not configured (nothing simulated)', async () => {
    mockedGetSupabase.mockReturnValue(null);
    await expect(sendOtp('+221771234567', { createUser: true })).resolves.toEqual({ ok: false, reason: 'not_configured' });
  });

  it('asks the server to generate and send the code; the app never sees the code', async () => {
    const auth = fakeSupabase();
    const res = await sendOtp('+221771234567', { createUser: true }, () => 0);
    expect(res).toEqual({ ok: true, expiresAt: new Date(300_000).toISOString() });
    expect(auth.signInWithOtp).toHaveBeenCalledWith({ phone: '+221771234567', options: { shouldCreateUser: true, channel: 'sms' } });
    expect(JSON.stringify(auth.signInWithOtp.mock.calls)).not.toMatch(/token|code/i);
  });

  it('reports a missing SMS provider instead of pretending the SMS was sent', async () => {
    fakeSupabase({
      signInWithOtp: jest.fn(async () => ({ data: {}, error: new AuthApiError('Unsupported phone provider', 400, 'phone_provider_disabled') })),
    });
    await expect(sendOtp('+221771234567', { createUser: true })).resolves.toEqual({ ok: false, reason: 'sms_not_configured' });
  });

  it('rejects invalid phone numbers before calling the server', async () => {
    const auth = fakeSupabase();
    await expect(sendOtp('771234567', { createUser: true })).resolves.toEqual({ ok: false, reason: 'invalid_phone' });
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('maps server rate limiting', () => {
    expect(mapAuthError(new AuthApiError('too many', 429, 'over_sms_send_rate_limit'))).toBe('rate_limited');
    expect(mapAuthError(new AuthApiError('Token has expired or is invalid', 403, 'otp_expired'))).toBe('expired_or_invalid');
  });
});

describe('verifyOtp', () => {
  it('verifies on the server and returns the user id', async () => {
    const auth = fakeSupabase();
    await expect(verifyOtp('+221771234567', '123456')).resolves.toEqual({ ok: true, userId: 'user-1' });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ phone: '+221771234567', token: '123456', type: 'sms' });
  });

  it('the former fixed code 2468 is not accepted by the app', async () => {
    const auth = fakeSupabase({
      verifyOtp: jest.fn(async () => ({ data: { user: null }, error: new AuthApiError('Token has expired or is invalid', 403, 'otp_expired') })),
    });
    await expect(verifyOtp('+221771234567', '2468')).resolves.toEqual({ ok: false, reason: 'invalid_code' });
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    // Even padded to 6 digits, only the server decides — and here it refuses.
    await expect(verifyOtp('+221771234567', '246800')).resolves.toEqual({ ok: false, reason: 'expired_or_invalid' });
  });

  it('refuses when the backend is not configured', async () => {
    mockedGetSupabase.mockReturnValue(null);
    await expect(verifyOtp('+221771234567', '123456')).resolves.toEqual({ ok: false, reason: 'not_configured' });
  });
});

describe('OtpGuard (expiry, attempts, resends)', () => {
  let t = 0;
  const clock = () => t;
  beforeEach(() => {
    t = 1_000_000;
  });

  it('expires the code after its lifetime', () => {
    const g = new OtpGuard(clock);
    g.recordSend(new Date(t + 300_000).toISOString());
    expect(g.verifyBlockedReason()).toBeNull();
    t += 299_000;
    expect(g.secondsUntilExpiry()).toBe(1);
    t += 1_000;
    expect(g.verifyBlockedReason()).toBe('expired_or_invalid');
  });

  it('limits wrong attempts per code, and a new code resets them', () => {
    const g = new OtpGuard(clock);
    g.recordSend(new Date(t + 300_000).toISOString());
    for (let i = 0; i < OtpGuard.MAX_ATTEMPTS; i++) g.recordFailedAttempt();
    expect(g.verifyBlockedReason()).toBe('too_many_attempts');
    expect(g.remainingAttempts()).toBe(0);
    t += OtpGuard.RESEND_COOLDOWN_MS;
    g.recordSend(new Date(t + 300_000).toISOString());
    expect(g.verifyBlockedReason()).toBeNull();
  });

  it('enforces the resend cooldown and the resend limit', () => {
    const g = new OtpGuard(clock);
    expect(g.sendBlockedReason()).toBeNull();
    g.recordSend(new Date(t + 300_000).toISOString());
    expect(g.sendBlockedReason()).toBe('resend_cooldown');
    expect(g.cooldownRemainingSeconds()).toBe(60);
    t += OtpGuard.RESEND_COOLDOWN_MS;
    g.recordSend(new Date(t + 300_000).toISOString());
    t += OtpGuard.RESEND_COOLDOWN_MS;
    g.recordSend(new Date(t + 300_000).toISOString());
    t += OtpGuard.RESEND_COOLDOWN_MS;
    expect(g.sendBlockedReason()).toBe('resend_limit');
    t += OtpGuard.SEND_WINDOW_MS;
    expect(g.sendBlockedReason()).toBeNull();
  });

  it('cannot verify before any code was sent', () => {
    expect(new OtpGuard(clock).verifyBlockedReason()).toBe('expired_or_invalid');
  });
});
