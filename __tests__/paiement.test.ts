import { envoyerOTP, envoyerRetrait, initierPrelevement, verifierNumero } from '../services/paiement';
import { monthGrid } from '../components/Calendar';
import { monthlySavings } from '../components/Finance';
import { quoteWithdrawal, WITHDRAWAL_FEE_BPS } from '../lib/money';

describe('services/paiement (placeholders)', () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  afterAll(() => log.mockRestore());

  it('returns test values in development, clearly marked as placeholder', async () => {
    await expect(verifierNumero('+221771234567')).resolves.toEqual({ wave: true, orange: false, source: 'placeholder' });
    const p = await initierPrelevement(500, 'wave', '+221771234567');
    expect(p).toMatchObject({ success: true, source: 'placeholder' });
    expect(p.transactionId).toMatch(/^SIMU-/);
    expect((await envoyerRetrait(990, 'orange', '+221771234567')).transactionId).toMatch(/^RETRAIT-/);
  });

  it('never logs the OTP code', async () => {
    await envoyerOTP('+221771234567', '482913');
    expect(log.mock.calls.flat().join(' ')).not.toContain('482913');
  });

  it('never simulates anything outside development', async () => {
    const g = globalThis as { __DEV__?: boolean };
    const dev = g.__DEV__;
    let prod: typeof import('../services/paiement') | null = null;
    g.__DEV__ = false;
    try {
      jest.isolateModules(() => {
        prod = require('../services/paiement');
      });
    } finally {
      g.__DEV__ = dev;
    }
    const svc = prod as unknown as typeof import('../services/paiement');
    expect(svc.PLACEHOLDER_ACTIF).toBe(false);
    await expect(svc.verifierNumero('+221771234567')).resolves.toEqual({ wave: false, orange: false, source: 'non_configure' });
    expect((await svc.initierPrelevement(500, 'wave', '+221771234567')).success).toBe(false);
    expect((await svc.envoyerRetrait(500, 'wave', '+221771234567')).success).toBe(false);
    expect((await svc.envoyerOTP('+221771234567', '123456')).success).toBe(false);
  });
});

describe('withdrawal fee', () => {
  it('is 1 %, rounded up to the franc', () => {
    expect(WITHDRAWAL_FEE_BPS).toBe(100);
    expect(quoteWithdrawal(10_000, 20_000)).toEqual({ ok: true, amount: 10_000, fee: 100, net: 9_900 });
    expect(quoteWithdrawal(10_050, 20_000)).toEqual({ ok: true, amount: 10_050, fee: 101, net: 9_949 });
    expect(quoteWithdrawal(500, 500)).toEqual({ ok: true, amount: 500, fee: 5, net: 495 });
  });
});

describe('calendar and chart helpers', () => {
  it('lays out a month starting on Monday', () => {
    const grid = monthGrid(2026, 8); // September 2026 starts on a Tuesday
    expect(grid.slice(0, 2)).toEqual([null, 1]);
    expect(grid.filter((d) => d !== null)).toHaveLength(30);
    expect(grid.length % 7).toBe(0);
  });

  it('sums confirmed savings per month', () => {
    const now = new Date(2026, 8, 27);
    const act = (createdAt: string, kind: 'debit' | 'withdrawal', status: 'succeeded' | 'pending', amount: number) => ({
      id: createdAt + kind, goalId: 'g', kind, status, amount, fee: 0, operator: 'wave' as const, errorCode: null, createdAt,
    });
    const data = monthlySavings(
      [act('2026-09-03T10:00:00', 'debit', 'succeeded', 5000), act('2026-09-10T10:00:00', 'debit', 'pending', 5000), act('2026-08-03T10:00:00', 'debit', 'succeeded', 2000)],
      now,
    );
    expect(data.map((d) => d.amount)).toEqual([0, 0, 0, 0, 2000, 5000]);
  });
});
