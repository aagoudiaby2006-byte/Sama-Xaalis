import { useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme';
import { useI18n } from '../lib/i18n';
import { fonts, type FontWeightName } from '../zzz/fonts';
import { Icon, type IconName } from '../zzz/Icon';

// ---------- Text ----------

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption';
const VARIANTS: Record<Variant, { size: number; line: number; weight: FontWeightName }> = {
  display: { size: 32, line: 38, weight: 'bold' },
  title: { size: 24, line: 30, weight: 'bold' },
  heading: { size: 17, line: 22, weight: 'semibold' },
  body: { size: 15, line: 21, weight: 'regular' },
  label: { size: 14, line: 19, weight: 'medium' },
  caption: { size: 12, line: 16, weight: 'regular' },
};

export function AppText({
  children,
  variant = 'body',
  weight,
  color,
  muted,
  center,
  style,
  numberOfLines,
  accessibilityRole,
}: {
  children: ReactNode;
  variant?: Variant;
  weight?: FontWeightName;
  color?: string;
  muted?: boolean;
  center?: boolean;
  style?: TextStyle;
  numberOfLines?: number;
  accessibilityRole?: 'header' | 'text' | 'alert';
}) {
  const theme = useTheme();
  const v = VARIANTS[variant];
  return (
    <Text
      numberOfLines={numberOfLines}
      accessibilityRole={accessibilityRole ?? (variant === 'title' || variant === 'display' ? 'header' : undefined)}
      maxFontSizeMultiplier={1.6}
      style={[
        {
          fontFamily: fonts[weight ?? v.weight],
          fontSize: v.size,
          lineHeight: v.line,
          color: color ?? (muted ? theme.colors.textMuted : theme.colors.text),
          textAlign: center ? 'center' : undefined,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

// ---------- Layout ----------

/** Scrollable page respecting safe areas; never uses a fixed page height/width. */
export function Screen({
  children,
  header,
  footer,
  scroll = true,
  padded = true,
}: {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  padded?: boolean;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const content = { padding: padded ? 20 : 0, paddingBottom: 24, gap: 16, flexGrow: 1 } as const;
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>{header}</View>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[content, { paddingLeft: content.padding + insets.left, paddingRight: content.padding + insets.right }]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[content, { flex: 1, paddingLeft: content.padding + insets.left, paddingRight: content.padding + insets.right }]}>
          {children}
        </View>
      )}
      {footer ? (
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 16),
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

export function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  const { t } = useI18n();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, minHeight: 52, gap: 4 }}>
      {onBack ? (
        <IconButton icon="chevron-back" label={t('back')} onPress={onBack} />
      ) : (
        <View style={{ width: 8 }} />
      )}
      <AppText variant="heading" style={{ flex: 1 }} numberOfLines={1} accessibilityRole="header">
        {title}
      </AppText>
      {right}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          padding: 16,
          gap: 10,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}>{children}</View>;
}

export function KeyValue({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <AppText muted style={{ flexShrink: 1 }}>
        {label}
      </AppText>
      <AppText weight={strong ? 'semibold' : 'medium'} style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </AppText>
    </Row>
  );
}

// ---------- Buttons ----------

type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger';

/**
 * Button with built-in double-tap protection: while an async onPress is running, further presses are ignored.
 */
export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  icon,
  testID,
}: {
  title: string;
  onPress: () => void | Promise<unknown>;
  kind?: ButtonKind;
  disabled?: boolean;
  icon?: IconName;
  testID?: string;
}) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const isDisabled = disabled || busy;
  const bg =
    kind === 'primary' ? theme.colors.primary : kind === 'danger' ? theme.colors.danger : kind === 'secondary' ? theme.colors.surfaceAlt : 'transparent';
  const fg = kind === 'primary' || kind === 'danger' ? theme.colors.onPrimary : kind === 'ghost' ? theme.colors.primary : theme.colors.text;

  const handlePress = async () => {
    if (running.current || isDisabled) return;
    running.current = true;
    setBusy(true);
    try {
      await onPress();
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy }}
      style={({ pressed }) => ({
        minHeight: 52,
        borderRadius: theme.radius.md,
        backgroundColor: bg,
        opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 16,
      })}
    >
      {busy ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} color={fg} size={20} /> : null}
      <AppText weight="semibold" color={fg} center>
        {title}
      </AppText>
    </Pressable>
  );
}

export function LinkButton({ title, onPress, testID }: { title: string; onPress: () => void; testID?: string }) {
  const theme = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="link" hitSlop={10} style={{ paddingVertical: 8, alignSelf: 'center' }}>
      <AppText weight="semibold" color={theme.colors.primary} center>
        {title}
      </AppText>
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress, color }: { icon: IconName; label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => ({ padding: 8, borderRadius: 999, opacity: pressed ? 0.6 : 1 })}
    >
      <Icon name={icon} color={color} />
    </Pressable>
  );
}

// ---------- Inputs ----------

export function TextField({
  label,
  error,
  help,
  prefix,
  ...props
}: TextInputProps & { label: string; error?: string | null; help?: string; prefix?: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="label">{label}</AppText>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: error ? theme.colors.danger : theme.colors.border,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surface,
          paddingHorizontal: 14,
          minHeight: 52,
        }}
      >
        {prefix ? (
          <AppText weight="medium" muted style={{ marginRight: 8 }}>
            {prefix}
          </AppText>
        ) : null}
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={theme.colors.textMuted}
          style={{ flex: 1, fontFamily: fonts.medium, fontSize: 16, color: theme.colors.text, paddingVertical: 12 }}
          maxFontSizeMultiplier={1.6}
          {...props}
        />
      </View>
      {error ? (
        <AppText variant="caption" color={theme.colors.danger} accessibilityRole="alert">
          {error}
        </AppText>
      ) : help ? (
        <AppText variant="caption" muted>
          {help}
        </AppText>
      ) : null}
    </View>
  );
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup">
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                minHeight: 44,
                justifyContent: 'center',
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: selected ? theme.colors.primary : theme.colors.border,
                backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
              }}
            >
              <AppText variant="label" color={selected ? theme.colors.onPrimary : theme.colors.text}>
                {o.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function ToggleRow({
  label,
  help,
  value,
  onChange,
  disabled,
}: {
  label: string;
  help?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Row style={{ justifyContent: 'space-between', minHeight: 44 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight="medium">{label}</AppText>
        {help ? (
          <AppText variant="caption" muted>
            {help}
          </AppText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ true: theme.colors.primary, false: theme.colors.surfaceAlt }}
      />
    </Row>
  );
}

export function Checkbox({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', minHeight: 44 }}
    >
      <Icon name={value ? 'checkbox' : 'square-outline'} color={value ? theme.colors.primary : theme.colors.textMuted} size={24} />
      <AppText style={{ flex: 1 }}>{label}</AppText>
    </Pressable>
  );
}

export function ListItem({ icon, label, value, onPress, danger }: { icon: IconName; label: string; value?: string; onPress?: () => void; danger?: boolean }) {
  const theme = useTheme();
  const color = danger ? theme.colors.danger : theme.colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, opacity: pressed ? 0.6 : 1 })}
    >
      <Icon name={icon} color={color} size={20} />
      <AppText weight="medium" color={color} style={{ flex: 1 }}>
        {label}
      </AppText>
      {value ? (
        <AppText muted numberOfLines={1} style={{ flexShrink: 1 }}>
          {value}
        </AppText>
      ) : null}
      {onPress ? <Icon name="chevron-forward" color={theme.colors.textMuted} size={18} /> : null}
    </Pressable>
  );
}

// ---------- Feedback ----------

export function Notice({ kind = 'info', children, title }: { kind?: 'info' | 'warning' | 'error' | 'success'; children: ReactNode; title?: string }) {
  const theme = useTheme();
  const map = {
    info: { bg: theme.colors.surfaceAlt, fg: theme.colors.text, icon: 'information-circle' as IconName },
    warning: { bg: theme.colors.warningBg, fg: theme.colors.warning, icon: 'warning' as IconName },
    error: { bg: theme.colors.dangerBg, fg: theme.colors.danger, icon: 'alert-circle' as IconName },
    success: { bg: theme.colors.successBg, fg: theme.colors.accent, icon: 'checkmark-circle' as IconName },
  }[kind];
  return (
    <View
      accessibilityRole={kind === 'error' ? 'alert' : undefined}
      style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: theme.radius.md, backgroundColor: map.bg, alignItems: 'flex-start' }}
    >
      <Icon name={map.icon} color={map.fg} size={20} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <AppText weight="semibold">{title}</AppText> : null}
        {typeof children === 'string' ? <AppText variant="label" weight="regular">{children}</AppText> : children}
      </View>
    </View>
  );
}

export function Loading() {
  const theme = useTheme();
  const { t } = useI18n();
  return (
    <View style={{ padding: 24, alignItems: 'center', gap: 8 }} accessibilityLabel={t('loading')}>
      <ActivityIndicator color={theme.colors.primary} />
    </View>
  );
}

export function EmptyState({ icon, title, body }: { icon: IconName; title: string; body?: string }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: 24, gap: 8 }}>
      <Icon name={icon} size={40} color={theme.colors.textMuted} />
      <AppText variant="heading" center>
        {title}
      </AppText>
      {body ? (
        <AppText muted center>
          {body}
        </AppText>
      ) : null}
    </View>
  );
}

/**
 * Confirmation dialog (works on every platform, fully translated).
 * With `requiredWord`, the user must type it before confirming (irreversible actions).
 */
export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  danger,
  requiredWord,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  requiredWord?: string;
  onConfirm: () => void | Promise<unknown>;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const { t } = useI18n();
  const [typed, setTyped] = useState('');
  const canConfirm = !requiredWord || typed.trim().toUpperCase() === requiredWord;
  const close = () => {
    setTyped('');
    onCancel();
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(2,6,23,0.6)', justifyContent: 'center', padding: 20 }}>
        <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 20, gap: 14, maxWidth: 480, width: '100%', alignSelf: 'center' }}>
          <AppText variant="heading" accessibilityRole="header">
            {title}
          </AppText>
          <AppText muted>{body}</AppText>
          {requiredWord ? (
            <TextField label={requiredWord} value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} />
          ) : null}
          <Button
            title={confirmLabel}
            kind={danger ? 'danger' : 'primary'}
            disabled={!canConfirm}
            onPress={async () => {
              await onConfirm();
              setTyped('');
            }}
          />
          <Button title={t('cancel')} kind="secondary" onPress={close} />
        </View>
      </View>
    </Modal>
  );
}
