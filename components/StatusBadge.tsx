import { View } from 'react-native';
import { useTheme } from '../lib/theme';
import { AppText } from './ui';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const theme = useTheme();
  const map: Record<BadgeTone, { bg: string; fg: string }> = {
    neutral: { bg: theme.colors.surfaceAlt, fg: theme.colors.textMuted },
    success: { bg: theme.colors.successBg, fg: theme.colors.accent },
    warning: { bg: theme.colors.warningBg, fg: theme.colors.warning },
    danger: { bg: theme.colors.dangerBg, fg: theme.colors.danger },
    info: { bg: theme.colors.surfaceAlt, fg: theme.colors.primary },
  };
  return (
    <View style={{ backgroundColor: map[tone].bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' }}>
      <AppText variant="caption" weight="semibold" color={map[tone].fg}>
        {label}
      </AppText>
    </View>
  );
}
