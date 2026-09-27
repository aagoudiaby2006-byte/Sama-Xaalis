import { View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { palette, useTheme } from '../lib/theme';
import { useI18n } from '../lib/i18n';
import { AppText } from './ui';

/** Logo mark: growing savings bars and a coin. Same drawing as assets/brand/logo.svg. */
export function LogoMark({ size = 64 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x={0} y={0} width={100} height={100} rx={26} fill={palette.cobalt} />
      <Rect x={22} y={56} width={15} height={22} rx={4} fill={palette.white} />
      <Rect x={42.5} y={44} width={15} height={34} rx={4} fill={palette.white} />
      <Rect x={63} y={32} width={15} height={46} rx={4} fill={palette.white} />
      <Circle cx={70.5} cy={20} r={9} fill={palette.emerald} />
    </Svg>
  );
}

export function Logo({ size = 64, showSlogan = false }: { size?: number; showSlogan?: boolean }) {
  const { t } = useI18n();
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 10 }} accessible accessibilityRole="image" accessibilityLabel={t('a11yLogo')}>
      <LogoMark size={size} />
      <AppText variant="title" color={theme.colors.text}>
        {t('appName')}
      </AppText>
      {showSlogan ? <AppText muted>{t('slogan')}</AppText> : null}
    </View>
  );
}
