import { computeFee, formatFcfa, isValidAmount, MIN_CONTRIBUTION_FCFA, parseAmountInput, progressPercent, quoteWithdrawal } from '../lib/money';
import type { FeeSchedule } from '../types';

// Generic schedule to test the fee engine (the app's own withdrawal fee is WITHDRAWAL_FEE_SCHEDULE: 1 %).
const schedule: FeeSchedule = { operator: 'wave', fixedFee: 0, rateBps: 100, minFee: 50, maxFee: 5000 };

describe('money (integer FCFA)', () => {
  it('minimum contribution is 500 FCFA', () => {
    expect(MIN_CONTRIBUTION_FCFA).toBe(500);
  });

  it('parses user input as integers only', () => {
    expect(parseAmountInput('12 500')).toBe(12500);
    expect(parseAmountInput('12 500')).toBe(12500);
    expect(parseAmountInput('12,5')).toBeNull();
    expect(parseAmountInput('-100')).toBeNull();
    expect(parseAmountInput('0')).toBeNull();
    expect(parseAmountInput('abc')).toBeNull();
    expect(parseAmountInput('')).toBeNull();
  });

  it('rejects non-integer and out-of-range amounts', () => {
    expect(isValidAmount(10.5)).toBe(false);
    expect(isValidAmount(Number.NaN)).toBe(false);
    expect(isValidAmount(100_000_001)).toBe(false);
    expect(isValidAmount(1)).toBe(true);
  });

  it('computes fees with integer rounding up and clamps', () => {
    expect(computeFee(10_000, schedule)).toBe(100); // 1 %
    expect(computeFee(10_001, schedule)).toBe(101); // rounded up, never fractional
    expect(computeFee(1_000, schedule)).toBe(50); // min fee
    expect(computeFee(10_000_000, schedule)).toBe(5000); // max fee
    expect(computeFee(12_345, { ...schedule, fixedFee: 25, minFee: 0 })).toBe(25 + 124);
    for (let a = 1; a < 5000; a += 37) expect(Number.isInteger(computeFee(a, schedule))).toBe(true);
  });

  it('quotes a withdrawal: net = amount - fee', () => {
    expect(quoteWithdrawal(10_000, 20_000, schedule)).toEqual({ ok: true, amount: 10_000, fee: 100, net: 9_900 });
  });

  it('refuses invalid withdrawals', () => {
    expect(quoteWithdrawal(null, 20_000, schedule)).toEqual({ ok: false, reason: 'invalid_amount' });
    expect(quoteWithdrawal(30_000, 20_000, schedule)).toEqual({ ok: false, reason: 'insufficient_funds' });
    expect(quoteWithdrawal(50, 20_000, schedule)).toEqual({ ok: false, reason: 'fee_exceeds_amount' });
    expect(quoteWithdrawal(10_000, 20_000, null)).toEqual({ ok: false, reason: 'fees_not_configured' });
  });

  it('formats FCFA without floating point', () => {
    expect(formatFcfa(1234567)).toBe('1 234 567 FCFA');
    expect(formatFcfa(500)).toBe('500 FCFA');
  });

  it('progress is an integer percentage capped at 100', () => {
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(5000, 1000)).toBe(100);
    expect(progressPercent(0, 0)).toBe(0);
  });
});
