import { allowedActions, canWithdrawFrom, GOAL_CATEGORIES, periodEnded, planGoal, validateGoalForm, type GoalFormInput } from '../lib/goals';
import { countDebits, nextDebitDate, parseIsoDate } from '../lib/schedule';
import type { Goal } from '../types';

const now = new Date(2026, 8, 27, 10, 0);
const base: GoalFormInput = {
  category: 'fete',
  name: 'Tabaski',
  contribution: '5000',
  frequency: 'weekly',
  endsOn: '2026-12-27', // 13 weeks
  operator: 'wave',
};

const goal = (patch: Partial<Goal>): Goal => ({
  id: 'g1',
  name: 'Tabaski',
  category: 'fete',
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
  endsOn: '2026-12-27',
  createdAt: now.toISOString(),
  ...patch,
});

describe('goal choice', () => {
  it('proposes 6 goals plus « Autre »', () => {
    expect(GOAL_CATEGORIES).toHaveLength(7);
    expect(GOAL_CATEGORIES.at(-1)?.id).toBe('autre');
  });
});

describe('amount and period', () => {
  it('accepts a valid goal and computes the total from the period', () => {
    const { draft, errors, plan } = validateGoalForm(base, now);
    expect(errors).toEqual({});
    expect(plan).toEqual({ debits: 13, total: 65000 });
    expect(draft).toEqual({
      name: 'Tabaski',
      category: 'fete',
      targetAmount: 65000,
      frequency: 'weekly',
      contributionAmount: 5000,
      operator: 'wave',
      endsOn: '2026-12-27',
    });
  });

  it('enforces the 500 FCFA minimum and integer amounts', () => {
    expect(validateGoalForm({ ...base, contribution: '499' }, now).errors.contribution).toBe('min');
    expect(validateGoalForm({ ...base, contribution: '500' }, now).draft).not.toBeNull();
    expect(validateGoalForm({ ...base, contribution: '500,5' }, now).errors.contribution).toBe('invalid');
  });

  it('requires an end date in the calendar range', () => {
    expect(validateGoalForm({ ...base, endsOn: '' }, now).errors.endsOn).toBe('invalid');
    expect(validateGoalForm({ ...base, endsOn: '2026-09-30' }, now).errors.endsOn).toBe('invalid'); // < 7 days
    expect(validateGoalForm({ ...base, endsOn: '2032-01-01' }, now).errors.endsOn).toBe('invalid'); // > 5 years
    expect(validateGoalForm({ ...base, endsOn: '2026-10-04', frequency: 'monthly' }, now).errors.endsOn).toBe('too_short');
  });

  it("« Autre » needs the user's own name", () => {
    expect(validateGoalForm({ ...base, category: 'autre', name: ' ' }, now).errors.name).toBe('invalid');
    expect(validateGoalForm({ ...base, category: 'autre', name: 'Moto' }, now).draft?.name).toBe('Moto');
  });

  it('counts debits per rhythm', () => {
    const end = parseIsoDate('2026-10-27')!;
    expect(countDebits('daily', now, end)).toBe(30);
    expect(countDebits('weekly', now, end)).toBe(4);
    expect(countDebits('monthly', now, end)).toBe(1);
    expect(planGoal(1000, 'daily', end, now)).toEqual({ debits: 30, total: 30000 });
  });
});

describe('goal status and withdrawal', () => {
  it('active -> pause, cancel ; paused -> resume, cancel', () => {
    expect(allowedActions(goal({ status: 'active' }))).toEqual(['pause', 'cancel']);
    expect(allowedActions(goal({ status: 'paused' }))).toEqual(['resume', 'cancel']);
    expect(allowedActions(goal({ status: 'locked', lockedUntil: '2027-01-01' }))).toEqual([]);
  });

  it('money can only be withdrawn at the end of the period', () => {
    expect(periodEnded(goal({}), now)).toBe(false);
    expect(canWithdrawFrom(goal({ savedAmount: 1000 }), now)).toBe(false);
    expect(canWithdrawFrom(goal({ savedAmount: 1000, endsOn: '2026-09-27' }), now)).toBe(true);
    expect(canWithdrawFrom(goal({ savedAmount: 0, endsOn: '2026-09-01' }), now)).toBe(false);
    expect(canWithdrawFrom(goal({ status: 'locked', savedAmount: 1000, endsOn: '2026-09-01' }), now)).toBe(false);
  });
});

describe('schedule', () => {
  it('computes next debit dates', () => {
    expect(nextDebitDate('daily', new Date(2026, 0, 31)).getDate()).toBe(1);
    expect(nextDebitDate('weekly', new Date(2026, 0, 1)).getDate()).toBe(8);
    const m = nextDebitDate('monthly', new Date(2026, 0, 31));
    expect([m.getMonth(), m.getDate()]).toEqual([1, 28]);
  });
});
