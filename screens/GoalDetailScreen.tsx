import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import type { Activity, Goal, Operator } from '../types';
import { formatDate, useI18n, type TranslationKey } from '../lib/i18n';
import { useNav } from '../lib/navigation';
import { useSession } from '../lib/session';
import { cancelGoal, createGoal, listActivities, listGoals, logAudit, pauseGoal, resumeGoal, type DataError, type DataResult } from '../lib/data';
import { allowedActions, canWithdrawFrom, periodEnded } from '../lib/goals';
import { formatFcfa, progressPercent } from '../lib/money';
import { OPERATORS, OPERATOR_BRAND } from '../lib/mobileMoney';
import { AppText, Button, Card, ConfirmDialog, Header, KeyValue, Loading, Notice, Row, Screen, Segmented } from '../components/ui';
import { GOAL_STATUS_TONE, ProgressBar } from '../components/GoalCard';
import { StatusBadge } from '../components/StatusBadge';
import { ActivityRow } from '../components/ActivityRow';
import { GoalAmountPeriod, GoalCategoryPicker, useGoalForm } from '../components/GoalForm';
import { SecureBadge } from '../components/Finance';
import { DebitPreview } from './MainScreens';
import { useOperatorStates } from './MobileMoneyScreen';

export function GoalNewScreen() {
  const { t } = useI18n();
  const nav = useNav();
  const { states } = useOperatorStates();
  const [operator, setOperator] = useState<Operator | null>(null);
  const form = useGoalForm(operator);
  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState<DataError | null>(null);

  // Pre-select the wallet already connected, if any.
  useEffect(() => {
    const connected = states?.find((s) => s.connection === 'connected');
    if (connected && operator === null) setOperator(connected.operator);
  }, [states]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setShowErrors(true);
    const draft = form.submit();
    if (!draft || !operator || !form.categoryDone) return;
    const res = await createGoal(draft);
    if (!res.ok) return setSubmitError(res.error);
    logAudit('goal_created', { frequency: draft.frequency, category: draft.category });
    nav.replace({ name: 'goalDetail', goalId: res.data.id });
  };

  return (
    <Screen header={<Header title={t('newGoal')} onBack={nav.pop} />} footer={<Button testID="goal-submit" title={t('createGoal')} onPress={submit} />}>
      <AppText variant="heading">{t('goalChooseTitle')}</AppText>
      <GoalCategoryPicker form={form} showErrors={showErrors} />
      <AppText variant="heading">{t('amountPeriodTitle')}</AppText>
      <GoalAmountPeriod form={form} />
      <Segmented<Operator>
        label={t('goalOperator')}
        options={OPERATORS.map((o) => ({ value: o, label: OPERATOR_BRAND[o].name }))}
        value={operator}
        onChange={setOperator}
      />
      {showErrors && !operator ? <Notice kind="error">{t('goalOperatorRequired')}</Notice> : null}
      <Notice kind="info">{t('autoDebitPrinciple')}</Notice>
      {submitError ? <Notice kind="error">{t(`err_${submitError}` as TranslationKey)}</Notice> : null}
    </Screen>
  );
}

type Dialog = 'cancel' | null;

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
  const ended = periodEnded(goal);

  return (
    <Screen header={<Header title={goal.name} onBack={nav.pop} />}>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <AppText variant="display" style={{ flex: 1 }} numberOfLines={1}>
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
        {goal.endsOn ? <KeyValue label={t('periodEnd')} value={formatDate(`${goal.endsOn}T00:00:00`, lang)} /> : null}
        <SecureBadge />
      </Card>

      {goal.status === 'active' ? <DebitPreview goal={goal} states={states} /> : null}

      {error ? <Notice kind="error">{error}</Notice> : null}
      {!ended && goal.endsOn ? <Notice kind="info">{t('withdrawOpensOn', { date: formatDate(`${goal.endsOn}T00:00:00`, lang) })}</Notice> : null}

      <View style={{ gap: 10 }}>
        {actions.includes('pause') ? <Button kind="secondary" icon="pause" title={t('pause')} onPress={() => apply('paused', () => pauseGoal(goal.id))} /> : null}
        {actions.includes('resume') ? <Button icon="play" title={t('resume')} onPress={() => apply('resumed', () => resumeGoal(goal.id))} /> : null}
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
