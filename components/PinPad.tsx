import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../lib/theme';
import { useI18n } from '../lib/i18n';
import { PIN_LENGTH } from '../lib/pin';
import { Icon, type IconName } from '../zzz/Icon';
import { AppText } from './ui';

/**
 * Secure 4-digit entry with its own numeric keypad (no system keyboard, no clipboard, nothing logged).
 * `onComplete` fires once when the last digit is typed; the pad is cleared after each attempt.
 */
export function PinPad({
  onComplete,
  disabled,
  resetKey,
  extraKey,
}: {
  onComplete: (pin: string) => void;
  disabled?: boolean;
  /** Change this value to clear the entered digits. */
  resetKey?: number;
  extraKey?: { icon: IconName; label: string; onPress: () => void };
}) {
  const theme = useTheme();
  const { t } = useI18n();
  const [digits, setDigits] = useState('');

  useEffect(() => setDigits(''), [resetKey]);

  const press = (d: string) => {
    if (disabled || digits.length >= PIN_LENGTH) return;
    const next = digits + d;
    setDigits(next);
    if (next.length === PIN_LENGTH) onComplete(next);
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const keySize = 72;

  const Key = ({ label, onPress, icon, a11y }: { label?: string; onPress?: () => void; icon?: IconName; a11y: string }) => (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => ({
        width: keySize,
        height: keySize,
        borderRadius: keySize / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent',
        opacity: disabled ? 0.5 : 1,
      })}
    >
      {icon ? <Icon name={icon} size={26} /> : <AppText variant="title" weight="medium">{label}</AppText>}
    </Pressable>
  );

  return (
    <View style={{ alignItems: 'center', gap: 20 }}>
      <View
        style={{ flexDirection: 'row', gap: 18 }}
        accessible
        accessibilityLabel={`${t('pinLabel')}: ${digits.length}/${PIN_LENGTH}`}
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View
            key={i}
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              borderWidth: 2,
              borderColor: theme.colors.primary,
              backgroundColor: i < digits.length ? theme.colors.primary : 'transparent',
            }}
          />
        ))}
      </View>
      <View style={{ gap: 8 }}>
        {[0, 1, 2].map((row) => (
          <View key={row} style={{ flexDirection: 'row', gap: 24 }}>
            {keys.slice(row * 3, row * 3 + 3).map((k) => (
              <Key key={k} label={k} a11y={k} onPress={() => press(k)} />
            ))}
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 24 }}>
          {extraKey ? <Key icon={extraKey.icon} a11y={extraKey.label} onPress={extraKey.onPress} /> : <View style={{ width: keySize }} />}
          <Key label="0" a11y="0" onPress={() => press('0')} />
          <Key icon="backspace-outline" a11y={t('deleteKey')} onPress={() => setDigits((d) => d.slice(0, -1))} />
        </View>
      </View>
    </View>
  );
}
