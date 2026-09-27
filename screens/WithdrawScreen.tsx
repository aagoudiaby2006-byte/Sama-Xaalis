import { useEffect, useMemo, useState } from 'react';
import * as Crypto from 'expo-crypto';
import type { Goal, Operator } from '../types';
import { formatDate, useI18n, type TranslationKey } from '../lib/i18n';
import { useNav } from '../lib/navigation';
import { listGoals, logAudit, requestWithdrawal, type DataError } from '../lib/data';
import { canWithdrawFrom } from '../lib/goals';
import { formatFcfa, parseAmountInput, quoteWithdrawal } from '../lib/money';
import { OPERATORS, OPERATOR_BRAND } from '../lib/mobileMoney';
import { AppText, Button, Card, ConfirmDialog, Header, KeyValue, Loading, Notice, Screen, Segmented, TextField } from '../components/ui';
import { SecureBadge } from '../components/Finance';

export function WithdrawScreen({ goalId }: { goalId?: string }) {
  const { t, lang } = useI18n();
  const nav = useNav();
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [loadError, setLoadError] = useState<DataError | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<string | null>(goalId ?? null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [waiting, setWaiting] = useState<Goal[]>([]);
  const [amountText, setAmountText] = useState('');
  const [confirming, setConfirming] = useState(false);
  // One idempotency key per reviewed withdrawal: retries and double taps can never create two withdrawals.
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [result, setResult] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await listGoals();
      if (!res.ok) return setLoadError(res.error);
      const eligible = res.data.filter((g) => canWithdrawFrom(g));
      setGoals(eligible);
      setWaiting(res.data.filter((g) => g.savedAmount > 0 && !canWithdrawFrom(g)));
      if (!selectedGoal && eligible.length > 0) setSelectedGoal(eligible[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goal = goals?.find((g) => g.id === selectedGoal) ?? null;
  const amount = parseAmountInput(amountText);
  const quote = useMemo(() => quoteWithdrawal(amount, goal?.savedAmount ?? 0), [amount, goal]);

  const review = () => {
    if (!quote.ok || !operator || !goal) return;
    setIdempotencyKey(Crypto.randomUUID());
    setConfirming(true);
  };

  const submit = async () => {
    if (!quote.ok || !operator || !goal || !idempotencyKey) return;
    const res = await requestWithdrawal({ goalId: goal.id, operator, amount: quote.amount, expectedFee: quote.fee, idempotencyKey });
    setConfirming(false);
    if (!res.ok) {
      setResult({ kind: 'error', text: t(`err_${res.error}` as TranslationKey) });
      return;
    }
    logAudit('withdrawal_requested', { operator });
    // Never shown as succeeded here: only the operator's confirmation (server side) can do that.
    setResult({ kind: 'success', text: t('withdrawSubmitted', { status: t(`act_${res.data.status}`) }) });
    setAmountText('');
  };

  return (
    <Screen header={<Header title={t('withdrawTitle')} onBack={nav.pop} />}>
      {loadError ? <Notice kind="error">{t(`err_${loadError}` as TranslationKey)}</Notice> : null}
      {!goals && !loadError ? <Loading /> : null}
      <SecureBadge />
      <Notice kind="info">{t('withdrawFeeInfo')}</Notice>
      {goals && goals.length === 0 ? <Notice kind="info">{t('withdrawNoGoal')}</Notice> : null}
      {waiting.map((g) =>
        g.endsOn ? (
          <Notice key={g.id} kind="info">
            {t('withdrawWaiting', { name: g.name, date: formatDate(`${g.endsOn}T00:00:00`, lang) })}
          </Notice>
        ) : null,
      )}
      {result ? <Notice kind={result.kind}>{result.text}</Notice> : null}

      {goals && goals.length > 0 ? (
        <>
          <Segmented label={t('withdrawFrom')} options={goals.map((g) => ({ value: g.id, label: g.name }))} value={selectedGoal} onChange={setSelectedGoal} />
          {goal ? <AppText muted>{t('withdrawAvailable', { amount: formatFcfa(goal.savedAmount) })}</AppText> : null}
          <Segmented label={t('withdrawTo')} options={OPERATORS.map((o) => ({ value: o, label: OPERATOR_BRAND[o].name }))} value={operator} onChange={setOperator} />
          <TextField
            testID="withdraw-amount"
            label={t('withdrawAmount')}
            keyboardType="number-pad"
            value={amountText}
            onChangeText={(v) => setAmountText(v.replace(/[^\d\s]/g, ''))}
          />
          {amountText.length > 0 ? (
            quote.ok ? (
              <Card>
                <KeyValue label={t('withdrawAmount')} value={formatFcfa(quote.amount)} />
                <KeyValue label={t('withdrawFee')} value={formatFcfa(quote.fee)} />
                <AppText muted>{t('withdrawNet')}</AppText>
                <AppText variant="display" numberOfLines={1}>
                  {formatFcfa(quote.net)}
                </AppText>
              </Card>
            ) : (
              <Notice kind="error">{t(`quote_${quote.reason}`)}</Notice>
            )
          ) : null}
          <Button testID="withdraw-review" title={t('withdrawReview')} onPress={review} disabled={!quote.ok || !operator || !goal} />
        </>
      ) : null}

      <ConfirmDialog
        visible={confirming && quote.ok}
        title={t('withdrawConfirmTitle')}
        body={
          quote.ok && operator
            ? t('withdrawConfirmBody', {
                amount: formatFcfa(quote.amount),
                fee: formatFcfa(quote.fee),
                net: formatFcfa(quote.net),
                operator: OPERATOR_BRAND[operator].name,
              })
            : ''
        }
        confirmLabel={t('withdrawConfirm')}
        onCancel={() => setConfirming(false)}
        onConfirm={submit}
      />
    </Screen>
  );
}
