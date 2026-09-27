import { useState } from 'react';
import { View } from 'react-native';
import { useI18n, type TranslationKey } from '../lib/i18n';
import { useTheme } from '../lib/theme';
import { AppText, Button, LinkButton, Screen } from '../components/ui';
import { LogoMark } from '../components/Logo';
import { Icon, type IconName } from '../zzz/Icon';

const SLIDES: { icon: IconName; title: TranslationKey; body: TranslationKey }[] = [
  { icon: 'trending-up', title: 'onb1Title', body: 'onb1Body' },
  { icon: 'calendar-outline', title: 'onb2Title', body: 'onb2Body' },
  { icon: 'shield-checkmark-outline', title: 'onb3Title', body: 'onb3Body' },
];

export function OnboardingScreen({ onDone }: { onDone: (target: 'signup' | 'login') => void }) {
  const { t } = useI18n();
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const last = index === SLIDES.length - 1;

  return (
    <Screen
      footer={
        <View style={{ gap: 8 }}>
          <Button
            testID="onboarding-next"
            title={last ? t('onbStart') : t('next')}
            onPress={() => (last ? onDone('signup') : setIndex(index + 1))}
          />
          <LinkButton title={last ? t('onbHaveAccount') : t('skip')} onPress={() => (last ? onDone('login') : setIndex(SLIDES.length - 1))} />
        </View>
      }
    >
      <View style={{ alignItems: 'center', gap: 6, marginTop: 8 }}>
        <LogoMark size={48} />
        <AppText variant="caption" muted>
          {t('slogan')}
        </AppText>
      </View>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20, paddingVertical: 24 }}>
        <View
          style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            backgroundColor: theme.colors.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={slide.icon} size={56} color={theme.colors.primary} />
        </View>
        <AppText variant="title" center>
          {t(slide.title)}
        </AppText>
        <AppText muted center style={{ maxWidth: 420 }}>
          {t(slide.body)}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }} accessibilityLabel={`${index + 1}/${SLIDES.length}`}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={{ width: i === index ? 24 : 8, height: 8, borderRadius: 4, backgroundColor: i === index ? theme.colors.primary : theme.colors.border }}
          />
        ))}
      </View>
    </Screen>
  );
}
