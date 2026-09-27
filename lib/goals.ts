import type { Frequency, Goal, GoalCategory, GoalDraft, Operator } from '../types';
import type { IconName } from '../zzz/Icon';
import { MAX_AMOUNT_FCFA, MIN_CONTRIBUTION_FCFA, isValidAmount, parseAmountInput } from './money';
import { addDays, countDebits, parseIsoDate, startOfDay, toIsoDate } from './schedule';

/** The 6 proposed goals, then « Autre ». The visible label comes from i18n (`goalCat_<id>`). */
export const GOAL_CATEGORIES: { id: GoalCategory; icon: IconName }[] = [
  { id: 'urgence', icon: 'medkit-outline' },
  { id: 'fete', icon: 'gift-outline' },
  { id: 'scolarite', icon: 'school-outline' },
  { id: 'sante', icon: 'heart-outline' },
  { id: 'commerce', icon: 'storefront-outline' },
  { id: 'logement', icon: 'home-outline' },
  { id: 'autre', icon: 'create-outline' },
];

export function categoryIcon(category: GoalCategory | null): IconName {
  return GOAL_CATEGORIES.find((c) => c.id === category)?.icon ?? 'flag-outline';
}

/** Shortest and longest saving periods offered by the calendar. */
export const MIN_PERIOD_DAYS = 7;
export const MAX_PERIOD_DAYS = 5 * 366;

export function periodBounds(now = new Date()): { min: Date; max: Date } {
  const today = startOfDay(now);
  return { min: addDays(today, MIN_PERIOD_DAYS), max: addDays(today, MAX_PERIOD_DAYS) };
}

export interface GoalFormInput {
  category: GoalCategory;
  /** Goal name: the localized preset label, or what the user typed for « Autre ». */
  name: string;
  contribution: string;
  frequency: Frequency;
  endsOn: string; // YYYY-MM-DD, picked in the calendar
  operator: Operator | null;
}

export type GoalFormErrors = Partial<Record<'name' | 'contribution' | 'endsOn', 'invalid' | 'min' | 'too_short' | 'too_large'>>;

export interface GoalPlan {
  debits: number;
  total: number;
}

/** How many debits fall in the period and the resulting total. */
export function planGoal(contribution: number, frequency: Frequency, endsOn: Date, now = new Date()): GoalPlan {
  const debits = countDebits(frequency, now, endsOn);
  return { debits, total: debits * contribution };
}

export function validateGoalForm(input: GoalFormInput, now = new Date()): { draft: GoalDraft | null; errors: GoalFormErrors; plan: GoalPlan | null } {
  const errors: GoalFormErrors = {};
  const name = input.name.trim();
  if (name.length < 2 || name.length > 40) errors.name = 'invalid';
  const contribution = parseAmountInput(input.contribution);
  if (contribution === null) errors.contribution = 'invalid';
  else if (contribution < MIN_CONTRIBUTION_FCFA) errors.contribution = 'min';
  const end = parseIsoDate(input.endsOn);
  const { min, max } = periodBounds(now);
  if (!end || end.getTime() < min.getTime() || end.getTime() > max.getTime()) errors.endsOn = 'invalid';
  let plan: GoalPlan | null = null;
  if (end && !errors.endsOn && contribution !== null && !errors.contribution) {
    plan = planGoal(contribution, input.frequency, end, now);
    if (plan.debits === 0) errors.endsOn = 'too_short';
    else if (plan.total > MAX_AMOUNT_FCFA) errors.contribution = 'too_large';
  }
  if (Object.keys(errors).length > 0 || !plan || contribution === null || !end) return { draft: null, errors, plan };
  return {
    errors,
    plan,
    draft: {
      name,
      category: input.category,
      targetAmount: plan.total,
      frequency: input.frequency,
      contributionAmount: contribution,
      operator: input.operator,
      endsOn: toIsoDate(end),
    },
  };
}

/** Allowed status changes from the app (the database enforces the same rules). */
export function allowedActions(goal: Goal): ('pause' | 'resume' | 'cancel')[] {
  if (goal.status === 'active') return ['pause', 'cancel'];
  if (goal.status === 'paused') return ['resume', 'cancel'];
  return [];
}

/** True once the saving period is over (withdrawals open on the last day of the period). */
export function periodEnded(goal: Goal, now = new Date()): boolean {
  if (!goal.endsOn) return true;
  const end = parseIsoDate(goal.endsOn);
  return !!end && end.getTime() <= startOfDay(now).getTime();
}

export function canWithdrawFrom(goal: Goal, now = new Date()): boolean {
  return goal.status !== 'locked' && isValidAmount(goal.savedAmount) && periodEnded(goal, now);
}
