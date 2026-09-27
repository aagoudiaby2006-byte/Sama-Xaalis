import type { Frequency, Goal, GoalDraft, Operator } from '../types';
import { MIN_CONTRIBUTION_FCFA, isValidAmount, parseAmountInput } from './money';
import { isValidChildBirthDate, parseIsoDate } from './schedule';

export interface GoalFormInput {
  name: string;
  target: string;
  frequency: Frequency;
  contribution: string;
  operator: Operator | null;
  isChildGoal: boolean;
  childBirthDate: string;
}

export type GoalFormErrors = Partial<Record<'name' | 'target' | 'contribution' | 'childBirthDate', 'invalid' | 'min' | 'above_target'>>;

export function validateGoalForm(input: GoalFormInput, now = new Date()): { draft: GoalDraft | null; errors: GoalFormErrors } {
  const errors: GoalFormErrors = {};
  const name = input.name.trim();
  if (name.length < 2 || name.length > 40) errors.name = 'invalid';
  const target = parseAmountInput(input.target);
  if (target === null) errors.target = 'invalid';
  const contribution = parseAmountInput(input.contribution);
  if (contribution === null) errors.contribution = 'invalid';
  else if (contribution < MIN_CONTRIBUTION_FCFA) errors.contribution = 'min';
  else if (target !== null && contribution > target) errors.contribution = 'above_target';
  let birth: Date | null = null;
  if (input.isChildGoal) {
    birth = parseIsoDate(input.childBirthDate);
    if (!birth || !isValidChildBirthDate(birth, now)) errors.childBirthDate = 'invalid';
  }
  if (Object.keys(errors).length > 0 || target === null || contribution === null) return { draft: null, errors };
  return {
    errors,
    draft: {
      name,
      targetAmount: target,
      frequency: input.frequency,
      contributionAmount: contribution,
      operator: input.operator,
      isChildGoal: input.isChildGoal,
      childBirthDate: input.isChildGoal ? input.childBirthDate.trim() : null,
    },
  };
}

/** Allowed status transitions from the app (the database enforces the same rules). */
export function allowedActions(goal: Goal, now = new Date()): ('pause' | 'resume' | 'lock' | 'unlock' | 'cancel')[] {
  const out: ('pause' | 'resume' | 'lock' | 'unlock' | 'cancel')[] = [];
  if (goal.status === 'active') out.push('pause', 'lock', 'cancel');
  if (goal.status === 'paused') out.push('resume', 'lock', 'cancel');
  if (goal.status === 'locked') {
    const childLocked = goal.isChildGoal && goal.lockedUntil !== null && Date.parse(goal.lockedUntil) > now.getTime();
    if (!childLocked) out.push('unlock');
  }
  return out;
}

export function canWithdrawFrom(goal: Goal): boolean {
  return goal.status !== 'locked' && isValidAmount(goal.savedAmount);
}
