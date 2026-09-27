import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import type { Activity, Frequency, Goal, Operator } from '../types';
import { formatDate, useI18n, type TranslationKey } from '../lib/i18n';
import { useNav } from '../lib/navigation';
import { useSession } from '../lib/session';
import {
  cancelGoal,
  createGoal,
  listActivities,
  listGoals,
  lockGoal,
  logAudit,
  pauseGoal,
  resumeGoal,
  unlockGoal,
  type DataError,
  type DataResult,
} from '../lib/data';
import { allowedActions, canWithdrawFrom, validateGoalForm, type GoalFormErrors } from '../lib/goals';
import { formatFcfa, MIN_CONTRIBUTION_FCFA, progressPercent } from '../lib/money';
import { parseIsoDate } from '../lib/schedule';
import { OPERATORS, OPERATOR_BRAND } from '../lib/mobileMoney';
import {
  AppText,
  Button,
  Card,
  ConfirmDialog,
  Header,
  KeyValue,
  Loading,
  Notice,
  Row,
  Screen,
  Segmented,
  TextField,
  ToggleRow,
} from '../components/ui';
import { GOAL_STATUS_TONE, ProgressBar } from '../components/GoalCard';
import { StatusBadge } from '../components/StatusBadge';
import { ActivityRow } from '../components/ActivityRow';
import { DebitPreview } from './MainScreens';
import { useOperatorStates } from './MobileMoneyScreen';

const FREQUENCIES: Frequency[] = ['daily', 'weekly', 'monthly'];

export function GoalNewScreen() {
  const { t } = useI18n();
  const nav = useNav();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('weekly');
  const [contribution, setContribution] = useState('');
  const [operator, setOperator] = useState<Operator | 'none'>('none');
  const [isChildGoal, setIsChildGoal] = useState(false);
  const [childBirthDate, setChildBirthDate] = useState('');
  const [errors, setErrors] = useState<GoalFormErrors>({});
  const [submitError, setSubmitError] = useState<DataError | null>(null);

  const submit = async () => {
    const { draft, errors: e } = validateGoalForm({
      name,
      target,
      frequency,
      contribution,
      operator: operator === 'none' ? null : operator,
      isChildGoal,
      childBirthDate,
    });
    setErrors(e);
    if (!draft) return;
    const res = await createGoal(draft);
    if (!res.ok) return setSubmitError(res.error);
    logAudit('goal_created', { frequency: draft.frequency, child: draft.isChildGoal });
    nav.replace({ name: 'goalDetail', goalId: res.data.id });
  };

  const contributionError =
    errors.contribution === 'min'
      ? t('contributionMin', { min: formatFcfa(MIN_CONTRIBUTION_FCFA) })
      : errors.contribution === 'above_target'
        ? t('contributionAboveTarget')
        : errors.contribution
          ? t('targetInvalid')
          : null;

  return (
    <Screen header={<Header title={t('newGoal')} onBack={nav.pop} />} footer={<Button testID="goal-submit" title={t('createGoal')} onPress={submit} />}>
      <TextField
        testID="goal-name"
        label={t('goalName')}
        placeholder={t('goalNamePlaceholder')}
        value={name}
        onChangeText={setName}
        maxLength={40}
        error={errors.name ? t('goalNameInvalid') : null}
      />
      <TextField
        testID="goal-target"
        label={t('targetAmount')}
        keyboardType="number-pad"
        value={target}
        onChangeText={(v) => setTarget(v.replace(/[^\d\s]/g, ''))}
        error={errors.target ? t('targetInvalid') : null}
      />
      <Segmented label={t('frequency')} options={FREQUENCIES.map((f) => ({ value: f, label: t(`freq_${f}`) }))} value={frequency} onChange={setFrequency} />
      <TextField
        testID="goal-contribution"
        label={t('contribution')}
        keyboardType="number-pad"
        value={contribution}
        onChangeText={(v) => setContribution(v.replace(/[^\d\s]/g, ''))}
        help={t('contributionMin', { min: formatFcfa(MIN_CONTRIBUTION_FCFA) })}
        error={contributionError}
      />
      <Segmented<Operator | 'none'>
        label={t('goalOperator')}
        options={[...OPERATORS.map((o) => ({ value: o, label: OPERATOR_BRAND[o].name })), { value: 'none' as const, label: t('goalOperatorNone') }]}
        value={operator}
        onChange={setOperator}
      />
      <ToggleRow label={t('childGoal')} help={t('childGoalHelp')} value={isChildGoal} onChange={setIsChildGoal} />
      {isChildGoal ? (
        <TextField
          label={t('childBirthDate')}
          placeholder="2015-06-21"
          value={childBirthDate}
          onChangeText={setChildBirthDate}
          keyboardType="numbers-and-punctuation"
          error={errors.childBirthDate ? t('childBirthDateInvalid') : null}
        />
      ) : null}
      <Notice kind="info">{t('debitCancellable')}</Notice>
      {submitError ? <Notice kind="error">{t(`err_${submitError}` as TranslationKey)}</Notice> : null}
    </Screen>
  );
}

type Dialog = 'unlock' | 'cancel' | null;

export function GoalDetailScreen({ goalId }: { goalId: string }) {
  const { t, lang } = useI18n();
  const nav = useNav();
  const { prefs } = useSession();
  const { states } = useOperatorStates();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [loadError, setLoadError] = useState<DataError | null>(null);
  const [history, setHistory] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [lockDate, setLockDate] = useState('');
  const [showLock, setShowLock] = useState(false);

  const load = useCallback(async () => {
    const res = await listGoals();
    if (!res.ok) return setLoadError(res.error);
    setGoal(res.data.find((g) => g.id === goalId) ?? null);
    const acts = await listActivities(goalId, 50);
    setHistory(acts.ok ? acts.data : []);
  }, [goalId]);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = async (action: string, fn: () => Promise<DataResult<Goal>>) => {
    const res = await fn();
    if (!res.ok) {
      setError(t(`err_${res.error}` as TranslationKey));
      return;
    }
    setError(null);
    logAudit(`goal_${action}`);
    setGoal(res.data);
  };

  if (loadError) {
    return (
      <Screen header={<Header title={t('goalDetailTitle')} onBack={nav.pop} />}>
        <Notice kind="error">{t(`err_${loadError}` as TranslationKey)}</Notice>
      </Screen>
    );
  }
  if (!goal) {
    return (
      <Screen header={<Header title={t('goalDetailTitle')} onBack={nav.pop} />}>
        <Loading />
      </Screen>
    );
  }

  const actions = allowedActions(goal);
  const amount = (n: number) => (prefs.hideAmounts ? '•••••' : formatFcfa(n));
  const p = progressPercent(goal.savedAmount, goal.targetAmount);
  const childLocked = goal.isChildGoal && goal.status === 'locked' && goal.lockedUntil;

  return (
    <Screen header={<Header title={goal.name} onBack={nav.pop} />}>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <AppText variant="title" style={{ flex: 1 }}>
            {amount(goal.savedAmount)}
          </AppText>
          <StatusBadge label={t(`status_${goal.status}`)} tone={GOAL_STATUS_TONE[goal.status]} />
        </Row>
        <AppText muted>{t('savedOf', { saved: amount(goal.savedAmount), target: amount(goal.targetAmount) })}</AppText>
        <ProgressBar percent={p} />
        <AppText variant="caption" muted>
          {t('progress', { p })}
        </AppText>
        <KeyValue label={t('contribution')} value={formatFcfa(goal.contributionAmount)} />
        <KeyValue label={t('frequency')} value={t(`freq_${goal.frequency}`)} />
        {goal.lockedUntil && goal.status === 'locked' ? (
          <AppText weight="medium">{t('lockedUntilLabel', { date: formatDate(goal.lockedUntil, lang) })}</AppText>
        ) : null}
      </Card>

      {goal.status === 'active' ? <DebitPreview goal={goal} states={states} /> : null}

      {error ? <Notice kind="error">{error}</Notice> : null}
      {childLocked ? <Notice kind="info">{t('unlockChildRefused', { date: formatDate(goal.lockedUntil ?? '', lang) })}</Notice> : null}

      <View style={{ gap: 10 }}>
        {actions.includes('pause') ? <Button kind="secondary" icon="pause" title={t('pause')} onPress={() => apply('paused', () => pauseGoal(goal.id))} /> : null}
        {actions.includes('resume') ? <Button icon="play" title={t('resume')} onPress={() => apply('resumed', () => resumeGoal(goal.id))} /> : null}
        {actions.includes('lock') && !showLock ? <Button kind="secondary" icon="lock-closed-outline" title={t('lock')} onPress={() => setShowLock(true)} /> : null}
        {showLock ? (
          <Card>
            <TextField label={t('lockUntil')} placeholder="2027-01-31" value={lockDate} onChangeText={setLockDate} keyboardType="numbers-and-punctuation" />
            <Button
              title={t('lock')}
              onPress={async () => {
                const d = parseIsoDate(lockDate);
                if (!d || d.getTime() <= Date.now()) return setError(t('lockDateInvalid'));
                setShowLock(false);
                await apply('locked', () => lockGoal(goal.id, lockDate.trim()));
              }}
            />
          </Card>
        ) : null}
        {actions.includes('unlock') ? <Button kind="secondary" icon="lock-open-outline" title={t('unlock')} onPress={() => setDialog('unlock')} /> : null}
        {canWithdrawFrom(goal) ? (
          <Button kind="secondary" icon="arrow-up" title={t('withdraw')} onPress={() => nav.push({ name: 'withdraw', goalId: goal.id })} />
        ) : null}
        {actions.includes('cancel') ? <Button kind="ghost" title={t('cancelGoal')} onPress={() => setDialog('cancel')} /> : null}
      </View>

      <AppText variant="heading">{t('mmHistory')}</AppText>
      <Card>
        {history === null ? <Loading /> : history.length === 0 ? <AppText muted>{t('activityEmpty')}</AppText> : null}
        {history?.map((a) => <ActivityRow key={a.id} activity={a} hideAmounts={prefs.hideAmounts} />)}
      </Card>

      <ConfirmDialog
        visible={dialog === 'unlock'}
        title={t('unlockConfirmTitle')}
        body={t('unlockConfirmBody')}
        confirmLabel={t('unlock')}
        onCancel={() => setDialog(null)}
        onConfirm={async () => {
          setDialog(null);
          await apply('unlocked', () => unlockGoal(goal.id));
        }}
      />
      <ConfirmDialog
        visible={dialog === 'cancel'}
        title={t('cancelGoal')}
        body={t('cancelGoalConfirm')}
        confirmLabel={t('confirm')}
        danger
        onCancel={() => setDialog(null)}
        onConfirm={async () => {
          setDialog(null);
          await apply('cancelled', () => cancelGoal(goal.id));
        }}
      />
    </Screen>
  );
}
