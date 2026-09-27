// Finance visuals: operator logos, "secure transactions" badge and a simple savings chart.
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { Activity, Operator } from '../types';
import { useTheme } from '../lib/theme';
import { useI18n } from '../lib/i18n';
import { formatFcfa } from '../lib/money';
import { OPERATOR_BRAND } from '../lib/mobileMoney';
import { Icon } from '../zzz/Icon';
import { AppText, Row } from './ui';

/**
 * Operator mark in the operator's brand colors. Drawn locally (no downloaded asset): replace with the
 * official logo files from the Wave / Orange Money brand kits once the partnership allows their use.
 */
export function OperatorLogo({ operator, size = 40 }: { operator: Operator; size?: number }) {
  const name = OPERATOR_BRAND[operator].name;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={name}>
      <Svg width={size} height={size} viewBox="0 0 40 40">
        {operator === 'wave' ? (
          <>
            <Rect width={40} height={40} rx={10} fill="#1DC8FF" />
            <Path d="M7 22c3-5 6-5 9 0s6 5 9 0 6-5 9 0" stroke="#FFFFFF" strokeWidth={3.2} fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <Rect width={40} height={40} rx={10} fill="#000000" />
            <Rect x={6} y={26} width={28} height={6} fill="#FF7900" />
            <Circle cx={20} cy={15} r={7} fill="#FF7900" />
          </>
        )}
      </Svg>
    </View>
  );
}

export function OperatorLogos({ size = 32 }: { size?: number }) {
  return (
    <Row style={{ gap: 8 }}>
      <OperatorLogo operator="wave" size={size} />
      <OperatorLogo operator="orange_money" size={size} />
    </Row>
  );
}

/** « Transactions sécurisées » badge. */
export function SecureBadge({ onDark }: { onDark?: boolean }) {
  const theme = useTheme();
  const { t } = useI18n();
  const fg = onDark ? theme.colors.onHero : theme.colors.accent;
  return (
    <View
      accessibilityRole="text"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: onDark ? 'rgba(245,240,230,0.14)' : theme.colors.successBg,
      }}
    >
      <Icon name="shield-checkmark" size={16} color={fg} />
      <AppText variant="caption" weight="semibold" color={fg}>
        {t('secureTransactions')}
      </AppText>
    </View>
  );
}

/** Confirmed savings per month for the last `months` months (withdrawals subtracted). */
export function monthlySavings(activities: Activity[], now = new Date(), months = 6): { key: string; month: number; amount: number }[] {
  const out = Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, month: d.getMonth(), amount: 0 };
  });
  for (const a of activities) {
    if (a.status !== 'succeeded') continue;
    const d = new Date(a.createdAt);
    const bucket = out.find((b) => b.key === `${d.getFullYear()}-${d.getMonth()}`);
    if (!bucket) continue;
    if (a.kind === 'debit') bucket.amount += a.amount;
    else if (a.kind === 'withdrawal') bucket.amount -= a.amount;
  }
  return out;
}

const MONTH_SHORT = {
  fr: ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/** Simple bar chart of monthly savings. */
export function SavingsChart({ activities, hideAmounts }: { activities: Activity[]; hideAmounts?: boolean }) {
  const theme = useTheme();
  const { t, lang } = useI18n();
  const data = monthlySavings(activities);
  const max = Math.max(...data.map((d) => d.amount), 0);
  const total = data.reduce((s, d) => s + d.amount, 0);
  return (
    <View style={{ gap: 10 }} accessible accessibilityLabel={`${t('chartTitle')} : ${hideAmounts ? '•••' : formatFcfa(total)}`}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 10 }}>
        {data.map((d) => {
          const h = max > 0 && d.amount > 0 ? Math.max(6, Math.round((d.amount / max) * 110)) : 4;
          return (
            <View key={d.key} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
              <View style={{ width: '70%', height: h, borderRadius: 6, backgroundColor: d.amount > 0 ? theme.colors.accent : theme.colors.surfaceAlt }} />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {data.map((d) => (
          <AppText key={d.key} variant="caption" muted center style={{ flex: 1 }}>
            {MONTH_SHORT[lang][d.month]}
          </AppText>
        ))}
      </View>
      {max === 0 ? (
        <AppText variant="caption" muted center>
          {t('chartEmpty')}
        </AppText>
      ) : null}
    </View>
  );
}
