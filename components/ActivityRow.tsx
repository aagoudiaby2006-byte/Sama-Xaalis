import { View } from 'react-native';
import type { Activity, ActivityStatus } from '../types';
import { useTheme } from '../lib/theme';
import { formatDate, useI18n } from '../lib/i18n';
import { formatFcfa } from '../lib/money';
import { OPERATOR_BRAND } from '../lib/mobileMoney';
import { Icon, type IconName } from '../zzz/Icon';
import { AppText, Row } from './ui';
import { StatusBadge, type BadgeTone } from './StatusBadge';

const STATUS_TONE: Record<ActivityStatus, BadgeTone> = {
  scheduled: 'info',
  pending: 'warning',
  succeeded: 'success',
  failed: 'danger',
  cancelled: 'neutral',
  refunded: 'info',
};

const KIND_ICON: Record<Activity['kind'], IconName> = {
  debit: 'arrow-down-circle-outline',
  withdrawal: 'arrow-up-circle-outline',
  fee: 'receipt-outline',
  refund: 'return-down-back-outline',
};

export function ActivityRow({ activity, hideAmounts }: { activity: Activity; hideAmounts?: boolean }) {
  const theme = useTheme();
  const { t, lang } = useI18n();
  const outgoing = activity.kind === 'withdrawal' || activity.kind === 'fee';
  const sign = outgoing ? '−' : '+';
  const details = [formatDate(activity.createdAt, lang), activity.operator ? OPERATOR_BRAND[activity.operator].name : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Row style={{ paddingVertical: 10, alignItems: 'flex-start' }}>
      <Icon name={KIND_ICON[activity.kind]} color={theme.colors.primary} />
      <View style={{ flex: 1, gap: 4 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <AppText weight="medium" style={{ flexShrink: 1 }}>
            {t(`kind_${activity.kind}`)}
          </AppText>
          <AppText weight="semibold" color={activity.status === 'succeeded' && !outgoing ? theme.colors.accent : theme.colors.text}>
            {hideAmounts ? '•••••' : `${sign}${formatFcfa(activity.amount)}`}
          </AppText>
        </Row>
        <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <AppText variant="caption" muted>
            {details}
          </AppText>
          <StatusBadge label={t(`act_${activity.status}`)} tone={STATUS_TONE[activity.status]} />
        </Row>
        {activity.fee > 0 ? (
          <AppText variant="caption" muted>
            {t('feeLabel', { fee: formatFcfa(activity.fee) })}
          </AppText>
        ) : null}
        {activity.errorCode ? (
          <AppText variant="caption" color={theme.colors.danger}>
            {t('errorLabel', { code: activity.errorCode })}
          </AppText>
        ) : null}
      </View>
    </Row>
  );
}
