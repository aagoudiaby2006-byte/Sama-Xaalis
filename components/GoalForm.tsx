// Goal creation pieces shared by sign-up and « Nouvel objectif »:
// 1. choose a goal (6 proposed + « Autre »), 2. choose the amount and the period (calendar).
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { Frequency, GoalCategory, GoalDraft, Operator } from '../types';
import { formatDate, useI18n } from '../lib/i18n';
import { useTheme } from '../lib/theme';
import { GOAL_CATEGORIES, periodBounds, validateGoalForm, type GoalFormErrors } from '../lib/goals';
import { formatFcfa, MIN_CONTRIBUTION_FCFA } from '../lib/money';
import { Icon } from '../zzz/Icon';
import { AppText, Card, KeyValue, Segmented, TextField } from './ui';
import { Calendar } from './Calendar';

const FREQUENCIES: Frequency[] = ['daily', 'weekly', 'monthly'];

export function useGoalForm(operator: Operator | null) {
  const { t } = useI18n();
  const [category, setCategory] = useState<GoalCategory | null>(null);
  const [customName, setCustomName] = useState('');
  const [contribution, setContribution] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('weekly');
  const [endsOn, setEndsOn] = useState<string | null>(null);
  const [errors, setErrors] = useState<GoalFormErrors>({});

  const name = category === 'autre' ? customName : category ? t(`goalCat_${category}`) : '';
  const input = { category: category ?? 'autre', name, contribution, frequency, endsOn: endsOn ?? '', operator };
  // Live preview (errors are only shown after a submit attempt).
  const preview = useMemo(() => validateGoalForm(input), [category, name, contribution, frequency, endsOn, operator]); // eslint-disable-line react-hooks/exhaustive-deps

  const categoryDone = category !== null && (category !== 'autre' || (customName.trim().length >= 2 && customName.trim().length <= 40));

  /** Validates everything; returns the draft or shows the errors. */
  const submit = (): GoalDraft | null => {
    const res = validateGoalForm(input);
    setErrors(res.errors);
    return res.draft;
  };

  return {
    category,
    setCategory,
    customName,
    setCustomName,
    contribution,
    setContribution,
    frequency,
    setFrequency,
    endsOn,
    setEndsOn,
    errors,
    setErrors,
    preview,
    categoryDone,
    submit,
  };
}

export type GoalFormState = ReturnType<typeof useGoalForm>;

/** Step « Choisir un objectif »: big, simple tiles. */
export function GoalCategoryPicker({ form, showErrors }: { form: GoalFormState; showErrors?: boolean }) {
  const { t } = useI18n();
  const theme = useTheme();
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }} accessibilityRole="radiogroup">
        {GOAL_CATEGORIES.map((c) => {
          const selected = form.category === c.id;
          return (
            <Pressable
              key={c.id}
              testID={`goal-cat-${c.id}`}
              onPress={() => form.setCategory(c.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={t(`goalCat_${c.id}`)}
              style={({ pressed }) => ({
                flexBasis: '47%',
                flexGrow: 1,
                minHeight: 96,
                padding: 14,
                gap: 8,
                justifyContent: 'center',
                alignItems: 'center',
                borderRadius: theme.radius.lg,
                borderWidth: 2,
                borderColor: selected ? theme.colors.primary : theme.colors.border,
                backgroundColor: selected ? theme.colors.successBg : theme.colors.surface,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Icon name={c.icon} size={30} color={theme.colors.primary} />
              <AppText weight="semibold" center>
                {t(`goalCat_${c.id}`)}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {form.category === 'autre' ? (
        <TextField
          testID="goal-name"
          label={t('goalName')}
          placeholder={t('goalNamePlaceholder')}
          value={form.customName}
          onChangeText={form.setCustomName}
          maxLength={40}
          error={showErrors && !form.categoryDone ? t('goalNameInvalid') : null}
        />
      ) : null}
      {showErrors && form.category === null ? <AppText color={theme.colors.danger}>{t('goalCategoryRequired')}</AppText> : null}
    </View>
  );
}

/** Step « Combien et jusqu'à quand »: amount, rhythm and end date in a calendar, then a plain summary. */
export function GoalAmountPeriod({ form }: { form: GoalFormState }) {
  const { t, lang } = useI18n();
  const theme = useTheme();
  const { min, max } = periodBounds();
  const contributionError =
    form.errors.contribution === 'min'
      ? t('contributionMin', { min: formatFcfa(MIN_CONTRIBUTION_FCFA) })
      : form.errors.contribution === 'too_large'
        ? t('contributionTooLarge')
        : form.errors.contribution
          ? t('amountInvalid')
          : null;
  const plan = form.preview.plan;
  return (
    <View style={{ gap: 16 }}>
      <TextField
        testID="goal-contribution"
        label={t('contribution')}
        keyboardType="number-pad"
        value={form.contribution}
        onChangeText={(v) => form.setContribution(v.replace(/[^\d\s]/g, ''))}
        help={t('contributionMin', { min: formatFcfa(MIN_CONTRIBUTION_FCFA) })}
        error={contributionError}
      />
      <Segmented label={t('frequency')} options={FREQUENCIES.map((f) => ({ value: f, label: t(`freq_${f}`) }))} value={form.frequency} onChange={form.setFrequency} />
      <Calendar label={t('periodEndPick')} value={form.endsOn} onChange={form.setEndsOn} min={min} max={max} />
      {form.errors.endsOn ? <AppText color={theme.colors.danger}>{form.errors.endsOn === 'too_short' ? t('periodTooShort') : t('periodRequired')}</AppText> : null}
      {plan && form.endsOn && form.preview.draft ? (
        <Card>
          <AppText variant="heading">{t('planTitle')}</AppText>
          <KeyValue label={t('debitAmount')} value={formatFcfa(form.preview.draft.contributionAmount)} />
          <KeyValue label={t('frequency')} value={t(`freq_${form.frequency}`)} />
          <KeyValue label={t('periodEnd')} value={formatDate(`${form.endsOn}T00:00:00`, lang)} />
          <KeyValue label={t('planDebits')} value={String(plan.debits)} />
          <KeyValue label={t('planTotal')} value={formatFcfa(plan.total)} strong />
          <AppText variant="caption" muted>
            {t('planWithdrawInfo')}
          </AppText>
        </Card>
      ) : null}
    </View>
  );
}
