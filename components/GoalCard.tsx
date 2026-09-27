import { Pressable, View } from 'react-native';
import type { Goal, GoalStatus } from '../types';
import { useTheme } from '../lib/theme';
import { formatDate, useI18n } from '../lib/i18n';
import { formatFcfa, progressPercent } from '../lib/money';
import { categoryIcon } from '../lib/goals';
import { Icon } from '../zzz/Icon';
import { AppText, Row } from './ui';
import { StatusBadge, type BadgeTone } from './StatusBadge';

export const GOAL_STATUS_TONE: Record<GoalStatus, BadgeTone> = {
  active: 'success',
  paused: 'warning',
  locked: 'info',
  completed: 'success',
  cancelled: 'neutral',
};

export function ProgressBar({ percent }: { percent: number }) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={{ height: 8, borderRadius: 4, backgroundColor: theme.colors.surfaceAlt, overflow: 'hidden' }}
    >
      <View style={{ width: `${percent}%`, height: '100%', backgroundColor: theme.colors.accent, borderRadius: 4 }} />
    </View>
  );
}

export function GoalCard({ goal, hideAmounts, onPress }: { goal: Goal; hideAmounts?: boolean; onPress?: () => void }) {
  const theme = useTheme();
  const { t, lang } = useI18n();
  const p = progressPercent(goal.savedAmount, goal.targetAmount);
  const amount = (n: number) => (hideAmounts ? '•••••' : formatFcfa(n));
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${goal.name}, ${t(`status_${goal.status}`)}, ${t('progress', { p })}`}
      style={({ pressed }) => ({
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.lg,
        padding: 16,
        gap: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Row style={{ justifyContent: 'space-between' }}>
        <Row style={{ flex: 1 }}>
          <Icon name={categoryIcon(goal.category)} color={theme.colors.primary} size={22} />
          <AppText variant="heading" numberOfLines={1} style={{ flex: 1 }}>
            {goal.name}
          </AppText>
        </Row>
        <StatusBadge label={t(`status_${goal.status}`)} tone={GOAL_STATUS_TONE[goal.status]} />
      </Row>
      <AppText muted>{t('savedOf', { saved: amount(goal.savedAmount), target: amount(goal.targetAmount) })}</AppText>
      <ProgressBar percent={p} />
      <Row style={{ justifyContent: 'space-between' }}>
        <AppText variant="caption" muted>
          {t('progress', { p })}
        </AppText>
        <AppText variant="caption" muted>
          {goal.status === 'locked' && goal.lockedUntil
            ? t('lockedUntilLabel', { date: formatDate(goal.lockedUntil, lang) })
            : goal.endsOn
              ? t('untilDate', { date: formatDate(`${goal.endsOn}T00:00:00`, lang) })
              : `${formatFcfa(goal.contributionAmount)} · ${t(`freq_${goal.frequency}`)}`}
        </AppText>
      </Row>
    </Pressable>
  );
}
