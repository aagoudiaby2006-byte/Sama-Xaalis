// Month calendar used to pick the end of the saving period. Pure JS (no native date picker), so it looks
// and behaves the same on iOS, Android and web.
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../lib/theme';
import { useI18n } from '../lib/i18n';
import { startOfDay, toIsoDate } from '../lib/schedule';
import { AppText, IconButton, Row } from './ui';

const MONTHS = {
  fr: ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
// Weeks start on Monday (Senegal).
const WEEKDAYS = { fr: ['L', 'M', 'M', 'J', 'V', 'S', 'D'], en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'] };

/** Days of the month grid, with leading blanks so the 1st falls on its weekday (Monday first). */
export function monthGrid(year: number, month: number): (number | null)[] {
  const first = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: first }, () => null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function Calendar({
  value,
  onChange,
  min,
  max,
  label,
}: {
  value: string | null; // YYYY-MM-DD
  onChange: (iso: string) => void;
  min: Date;
  max: Date;
  label?: string;
}) {
  const theme = useTheme();
  const { t, lang } = useI18n();
  const initial = value ? new Date(`${value}T00:00:00`) : min;
  const [cursor, setCursor] = useState({ y: initial.getFullYear(), m: initial.getMonth() });
  const cells = monthGrid(cursor.y, cursor.m);
  const minT = startOfDay(min).getTime();
  const maxT = startOfDay(max).getTime();
  const canPrev = new Date(cursor.y, cursor.m, 1).getTime() > minT;
  const canNext = new Date(cursor.y, cursor.m + 1, 1).getTime() <= maxT;
  const move = (delta: number) => {
    const d = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <View style={{ gap: 8 }}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 12, borderWidth: 1, borderColor: theme.colors.border, gap: 6 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ opacity: canPrev ? 1 : 0.3 }}>
            <IconButton icon="chevron-back" label={t('calPrevMonth')} onPress={() => canPrev && move(-1)} />
          </View>
          <AppText variant="heading" accessibilityRole="header">{`${MONTHS[lang][cursor.m]} ${cursor.y}`}</AppText>
          <View style={{ opacity: canNext ? 1 : 0.3 }}>
            <IconButton icon="chevron-forward" label={t('calNextMonth')} onPress={() => canNext && move(1)} />
          </View>
        </Row>
        <View style={{ flexDirection: 'row' }}>
          {WEEKDAYS[lang].map((d, i) => (
            <AppText key={i} variant="caption" muted center style={{ flex: 1 }}>
              {d}
            </AppText>
          ))}
        </View>
        {Array.from({ length: cells.length / 7 }, (_, w) => (
          <View key={w} style={{ flexDirection: 'row' }}>
            {cells.slice(w * 7, w * 7 + 7).map((day, i) => {
              if (day === null) return <View key={i} style={{ flex: 1, height: 44 }} />;
              const date = new Date(cursor.y, cursor.m, day);
              const iso = toIsoDate(date);
              const enabled = date.getTime() >= minT && date.getTime() <= maxT;
              const selected = iso === value;
              return (
                <Pressable
                  key={i}
                  disabled={!enabled}
                  onPress={() => onChange(iso)}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: !enabled }}
                  accessibilityLabel={iso}
                  testID={`cal-${iso}`}
                  style={{ flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: selected ? theme.colors.primary : 'transparent',
                    }}
                  >
                    <AppText
                      weight={selected ? 'bold' : 'regular'}
                      color={selected ? theme.colors.onPrimary : enabled ? theme.colors.text : theme.colors.border}
                    >
                      {String(day)}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
