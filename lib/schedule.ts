import type { Frequency } from '../types';

export const CHILD_MAJORITY_AGE = 18;

/** Next planned debit date after `from`. Monthly clamps to the last day of shorter months. */
export function nextDebitDate(frequency: Frequency, from: Date): Date {
  const d = new Date(from.getTime());
  if (frequency === 'daily') d.setDate(d.getDate() + 1);
  else if (frequency === 'weekly') d.setDate(d.getDate() + 7);
  else {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
  }
  return d;
}

/** Parses a strict YYYY-MM-DD date (local time), or null. */
export function parseIsoDate(text: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const [y, mo, da] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const d = new Date(y, mo, da);
  if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== da) return null;
  return d;
}

export function toIsoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Date on which a child born on `birthDate` turns 18 (Feb 29 -> Mar 1). */
export function majorityDate(birthDate: Date): Date {
  const d = new Date(birthDate.getTime());
  d.setFullYear(d.getFullYear() + CHILD_MAJORITY_AGE);
  return d;
}

/** A child goal is only valid for a child who is still a minor and already born. */
export function isValidChildBirthDate(birthDate: Date, now: Date): boolean {
  return birthDate.getTime() <= now.getTime() && majorityDate(birthDate).getTime() > now.getTime();
}
