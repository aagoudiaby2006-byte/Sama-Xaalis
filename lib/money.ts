// Integer-only money helpers (FCFA / XOF has no minor unit). No floating point for amounts.
import type { FeeSchedule } from '../types';

export const MIN_CONTRIBUTION_FCFA = 500;
export const MAX_AMOUNT_FCFA = 100_000_000;

export function isValidAmount(amount: number): boolean {
  return Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_AMOUNT_FCFA;
}

/** Parses user input ("12 500", "12500") into an integer, or null. Decimals are rejected. */
export function parseAmountInput(text: string): number | null {
  const cleaned = text.replace(/[\s  .]/g, '');
  if (!/^\d{1,9}$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return isValidAmount(n) ? n : null;
}

/** 12500 -> "12 500 FCFA" (narrow no-break spaces; independent of Intl support in the JS engine). */
export function formatFcfa(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const digits = String(Math.abs(Math.trunc(amount)));
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${grouped} FCFA`;
}

/** Fee for an amount, rounded up to the next franc, clamped to [minFee, maxFee]. */
export function computeFee(amount: number, schedule: FeeSchedule): number {
  if (!isValidAmount(amount)) throw new RangeError('invalid amount');
  const proportional = Math.floor((amount * schedule.rateBps + 9_999) / 10_000);
  let fee = schedule.fixedFee + proportional;
  if (fee < schedule.minFee) fee = schedule.minFee;
  if (schedule.maxFee !== null && fee > schedule.maxFee) fee = schedule.maxFee;
  return fee;
}

export type WithdrawalQuote =
  | { ok: true; amount: number; fee: number; net: number }
  | { ok: false; reason: 'invalid_amount' | 'insufficient_funds' | 'fee_exceeds_amount' | 'fees_not_configured' };

/** The fee is deducted from the withdrawn amount: the user receives `net = amount - fee`. */
export function quoteWithdrawal(
  amount: number | null,
  available: number,
  schedule: FeeSchedule | null,
): WithdrawalQuote {
  if (amount === null || !isValidAmount(amount)) return { ok: false, reason: 'invalid_amount' };
  if (amount > available) return { ok: false, reason: 'insufficient_funds' };
  if (!schedule) return { ok: false, reason: 'fees_not_configured' };
  const fee = computeFee(amount, schedule);
  if (fee >= amount) return { ok: false, reason: 'fee_exceeds_amount' };
  return { ok: true, amount, fee, net: amount - fee };
}

/** Progress as an integer percentage 0..100. */
export function progressPercent(saved: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.floor((saved * 100) / target));
}
