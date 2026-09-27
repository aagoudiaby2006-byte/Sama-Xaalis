import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View, useColorScheme, type AppStateStatus } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fontAssets } from './zzz/fonts';
import { ThemeContext, darkTheme, lightTheme } from './lib/theme';
import { DEFAULT_LANGUAGE, I18nProvider } from './lib/i18n';
import { SessionProvider, useSession } from './lib/session';
import { NavigationProvider, useNav, type Route } from './lib/navigation';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { CreatePinScreen, LoginScreen, OtpLoginScreen, SignUpScreen } from './screens/AuthScreens';
import { ChangePinScreen, RecoveryScreen } from './screens/RecoveryScreen';
import { ActivityScreen, HomeScreen, ProfileScreen } from './screens/MainScreens';
import { GoalDetailScreen, GoalNewScreen } from './screens/GoalDetailScreen';
import { MobileMoneyScreen } from './screens/MobileMoneyScreen';
import { WithdrawScreen } from './screens/WithdrawScreen';
import { LogoMark } from './components/Logo';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function AuthRouter() {
  const { route } = useNav();
  switch (route.name) {
    case 'signup':
      return <SignUpScreen />;
    case 'otpLogin':
      return <OtpLoginScreen phoneE164={route.phoneE164} />;
    case 'recovery':
      return <RecoveryScreen />;
    default:
      return <LoginScreen />;
  }
}

function MainRouter() {
  const { route } = useNav();
  switch (route.name) {
    case 'goalNew':
      return <GoalNewScreen />;
    case 'goalDetail':
      return <GoalDetailScreen goalId={route.goalId} />;
    case 'mobileMoney':
      return <MobileMoneyScreen />;
    case 'withdraw':
      return <WithdrawScreen goalId={route.goalId} />;
    case 'changePin':
      return <ChangePinScreen />;
    case 'activity':
      return <ActivityScreen />;
    case 'profile':
      return <ProfileScreen />;
    default:
      return <HomeScreen />;
  }
}

/** Hides screen content while the app is inactive (app switcher snapshot). */
function PrivacyCover() {
  const theme = lightTheme;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.hero, alignItems: 'center', justifyContent: 'center' }]}>
      <LogoMark size={72} />
    </View>
  );
}

function AppShell() {
  const { phase, prefs, completeOnboarding } = useSession();
  const scheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const [authStart, setAuthStart] = useState<Route>({ name: 'login' });
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  // The main stack stays mounted under the lock screen once unlocked, so unlocking returns to the same place.
  const mainMounted = useRef(false);
  if (phase === 'unlocked') mainMounted.current = true;
  if (phase === 'auth' || phase === 'onboarding' || phase === 'needsPin') mainMounted.current = false;

  useEffect(() => {
    const sub = AppState.addEventListener('change', setAppState);
    return () => sub.remove();
  }, []);

  // If the fonts cannot load (blocked network, restricted web host), show the app with system fonts
  // rather than staying on the splash screen forever.
  const ready = (fontsLoaded || !!fontError) && phase !== 'loading';
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && scheme === 'dark');
  const theme = dark ? darkTheme : lightTheme;
  const lang = prefs.language ?? DEFAULT_LANGUAGE;

  let content: ReactNode = null;
  if (ready) {
    if (phase === 'onboarding') {
      content = (
        <OnboardingScreen
          onDone={(target) => {
            setAuthStart(target === 'signup' ? { name: 'signup' } : { name: 'login' });
            completeOnboarding();
          }}
        />
      );
    } else if (phase === 'auth') {
      content = (
        <NavigationProvider key="auth" initial={authStart}>
          <AuthRouter />
        </NavigationProvider>
      );
    } else if (phase === 'needsPin') {
      content = <CreatePinScreen />;
    } else {
      content = (
        <>
          {mainMounted.current ? (
            <NavigationProvider key="main" initial={{ name: 'home' }}>
              <MainRouter />
            </NavigationProvider>
          ) : null}
          {phase === 'locked' ? (
            <View style={StyleSheet.absoluteFill}>
              <NavigationProvider key="lock" initial={{ name: 'login' }}>
                <AuthRouter />
              </NavigationProvider>
            </View>
          ) : null}
        </>
      );
    }
  }

  return (
    <ThemeContext.Provider value={theme}>
      <I18nProvider lang={lang}>
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
          <StatusBar style={dark ? 'light' : 'dark'} />
          {content}
          {phase === 'unlocked' && appState !== 'active' ? <PrivacyCover /> : null}
        </View>
      </I18nProvider>
    </ThemeContext.Provider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <AppShell />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
