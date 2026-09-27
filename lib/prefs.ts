// Non-sensitive UI preferences only. Secrets (session, PIN) live in zzz/secureStore.ts.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Language, ThemePreference } from '../types';

export interface Prefs {
  onboardingDone: boolean;
  language: Language | null; // null = default language (French)
  theme: ThemePreference;
  notifications: boolean;
  hideAmounts: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  onboardingDone: false,
  language: null,
  theme: 'system',
  notifications: true,
  hideAmounts: false,
};

const KEY = 'sx.prefs.v1';

export async function loadPrefs(): Promise<Prefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function savePrefs(p: Prefs): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(p));
}

export async function clearPrefs(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
