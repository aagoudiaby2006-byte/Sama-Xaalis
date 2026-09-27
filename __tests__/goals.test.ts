import { allowedActions, canWithdrawFrom, validateGoalForm, type GoalFormInput } from '../lib/goals';
import { majorityDate, nextDebitDate, parseIsoDate, isValidChildBirthDate } from '../lib/schedule';
import type { Goal } from '../types';

const now = new Date(2026, 8, 27);
const base: GoalFormInput = {
  name: 'Tabaski',
  target: '150 000',
  frequency: 'weekly',
  contribution: '5000',
  operator: 'wave',
  isChildGoal: false,
  childBirthDate: '',
};

const goal = (patch: Partial<Goal>): Goal => ({
  id: 'g1',
  name: 'Tabaski',
  targetAmount: 150000,
  savedAmount: 0,
  frequency: 'weekly',
  contributionAmount: 5000,
  status: 'active',
  operator: 'wave',
  lockedUntil: null,
  isChildGoal: false,
  childBirthDate: null,
  nextDebitAt: null,
  createdAt: now.toISOString(),
  ...patch,
});

describe('goal creation', () => {
  it('accepts a valid goal', () => {
    const { draft, errors } = validateGoalForm(base, now);
    expect(errors).toEqual({});
    expect(draft).toMatchObject({ name: 'Tabaski', targetAmount: 150000, contributionAmount: 5000, frequency: 'weekly' });
  });

  it('enforces the 500 FCFA minimum', () => {
    expect(validateGoalForm({ ...base, contribution: '499' }, now).errors.contribution).toBe('min');
    expect(validateGoalForm({ ...base, contribution: '500' }, now).draft).not.toBeNull();
  });

  it('refuses a contribution above the target and bad names', () => {
    expect(validateGoalForm({ ...base, target: '1000', contribution: '2000' }, now).errors.contribution).toBe('above_target');
    expect(validateGoalForm({ ...base, name: ' ' }, now).errors.name).toBe('invalid');
  });

  it('child savings require a minor child', () => {
    expect(validateGoalForm({ ...base, isChildGoal: true, childBirthDate: '2020-02-29' }, now).draft).not.toBeNull();
    expect(validateGoalForm({ ...base, isChildGoal: true, childBirthDate: '2000-01-01' }, now).errors.childBirthDate).toBe('invalid');
    expect(validateGoalForm({ ...base, isChildGoal: true, childBirthDate: '2030-01-01' }, now).errors.childBirthDate).toBe('invalid');
    expect(validateGoalForm({ ...base, isChildGoal: true, childBirthDate: '2020-13-01' }, now).errors.childBirthDate).toBe('invalid');
  });
});

describe('goal status actions', () => {
  it('active -> pause, lock, cancel ; paused -> resume', () => {
    expect(allowedActions(goal({ status: 'active' }), now)).toEqual(['pause', 'lock', 'cancel']);
    expect(allowedActions(goal({ status: 'paused' }), now)).toContain('resume');
  });

  it('a locked goal can be unlocked, but not a child goal before 18', () => {
    expect(allowedActions(goal({ status: 'locked', lockedUntil: '2027-01-01' }), now)).toEqual(['unlock']);
    expect(allowedActions(goal({ status: 'locked', isChildGoal: true, lockedUntil: '2038-01-01' }), now)).toEqual([]);
  });

  it('no withdrawal from a locked goal or an empty goal', () => {
    expect(canWithdrawFrom(goal({ status: 'locked', savedAmount: 1000 }))).toBe(false);
    expect(canWithdrawFrom(goal({ savedAmount: 0 }))).toBe(false);
    expect(canWithdrawFrom(goal({ savedAmount: 1000 }))).toBe(true);
  });
});

describe('schedule', () => {
  it('computes next debit dates', () => {
    expect(nextDebitDate('daily', new Date(2026, 0, 31)).getDate()).toBe(1);
    expect(nextDebitDate('weekly', new Date(2026, 0, 1)).getDate()).toBe(8);
    const m = nextDebitDate('monthly', new Date(2026, 0, 31));
    expect([m.getMonth(), m.getDate()]).toEqual([1, 28]);
  });

  it('majority date is the 18th birthday', () => {
    const d = majorityDate(parseIsoDate('2010-05-12')!);
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2028, 4, 12]);
    expect(isValidChildBirthDate(parseIsoDate('2008-09-28')!, now)).toBe(true);
    expect(isValidChildBirthDate(parseIsoDate('2008-09-27')!, now)).toBe(false);
  });
});
