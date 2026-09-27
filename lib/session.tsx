// Session and lock state machine.
//   onboarding -> auth (no local session) -> [OTP verified] -> needsPin -> unlocked <-> locked
// The Supabase session (refresh token) is kept in SecureStore and only used once the device PIN
// (or biometrics) has unlocked the app. The PIN is device-bound: a new device requires SMS verification.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { getSupabase } from './supabase';
import { clearPin, hasPin } from './pin';
import { clearPrefs, DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from './prefs';
import type { TranslationKey } from './i18n';
import { SECURE_KEYS, secureGet, secureSet, wipeSecureStore } from '../zzz/secureStore';

export type Phase = 'loading' | 'onboarding' | 'auth' | 'needsPin' | 'locked' | 'unlocked';

export interface DeviceAccount {
  userId: string;
  phoneE164: string;
}

interface SessionValue {
  phase: Phase;
  prefs: Prefs;
  account: DeviceAccount | null;
  updatePrefs: (patch: Partial<Prefs>) => void;
  completeOnboarding: () => void;
  /**
   * Called after a successful server-side OTP verification. `stayInFlow` keeps the current screen
   * (sign-up continues with Mobile Money and PIN steps) instead of jumping to PIN creation.
   */
  onPhoneVerified: (account: DeviceAccount, opts?: { stayInFlow?: boolean }) => Promise<void>;
  onPinCreated: () => void;
  unlock: () => void;
  lock: () => void;
  /** Signs out and wipes every local secret (session, PIN, biometrics flag). */
  signOut: () => Promise<void>;
  /** After account deletion: also wipes preferences. */
  wipeEverything: () => Promise<void>;
  /** One-shot message shown on the login screen (e.g. after a PIN lockout). */
  authNotice: TranslationKey | null;
  setAuthNotice: (key: TranslationKey | null) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

async function readAccount(): Promise<DeviceAccount | null> {
  const raw = await secureGet(SECURE_KEYS.deviceAccount);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DeviceAccount;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [account, setAccount] = useState<DeviceAccount | null>(null);
  const [authNotice, setAuthNotice] = useState<TranslationKey | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    void (async () => {
      const p = await loadPrefs();
      setPrefs(p);
      const acc = await readAccount();
      const supabase = getSupabase();
      const session = supabase ? (await supabase.auth.getSession()).data.session : null;
      const sessionValid = !!session && !!acc && session.user.id === acc.userId;
      setAccount(sessionValid ? acc : null);
      if (!p.onboardingDone) setPhase('onboarding');
      else if (!sessionValid) setPhase('auth');
      else setPhase((await hasPin()) ? 'locked' : 'needsPin');
    })();
  }, []);

  // Lock as soon as the app goes to the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' && phaseRef.current === 'unlocked') setPhase('locked');
    });
    return () => sub.remove();
  }, []);

  const updatePrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      void savePrefs(next);
      return next;
    });
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    await clearPin();
    await wipeSecureStore();
    setAccount(null);
    setPhase('auth');
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      phase,
      prefs,
      account,
      updatePrefs,
      completeOnboarding: () => {
        updatePrefs({ onboardingDone: true });
        setPhase('auth');
      },
      onPhoneVerified: async (acc, opts) => {
        // A different account on this device invalidates the previous PIN.
        const previous = await readAccount();
        if (previous && previous.userId !== acc.userId) await clearPin();
        await secureSet(SECURE_KEYS.deviceAccount, JSON.stringify(acc));
        setAccount(acc);
        if (!opts?.stayInFlow) setPhase('needsPin');
      },
      onPinCreated: () => setPhase('unlocked'),
      unlock: () => setPhase('unlocked'),
      lock: () => setPhase((p) => (p === 'unlocked' ? 'locked' : p)),
      signOut,
      wipeEverything: async () => {
        await signOut();
        await clearPrefs();
        setPrefs({ ...DEFAULT_PREFS, onboardingDone: true, language: prefs.language });
        void savePrefs({ ...DEFAULT_PREFS, onboardingDone: true, language: prefs.language });
      },
      authNotice,
      setAuthNotice,
    }),
    [phase, prefs, account, updatePrefs, signOut, authNotice],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}
