// Single icon component for the whole app (vector icons, never emoji).
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { useTheme } from '../lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const theme = useTheme();
  return <Ionicons name={name} size={size} color={color ?? theme.colors.text} accessibilityElementsHidden importantForAccessibility="no" />;
}
