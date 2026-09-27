import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { AppState, type AppStateStatus } from 'react-native';
import App from '../App';
import { setPin } from '../lib/pin';
import { getSupabase } from '../lib/supabase';
import * as data from '../lib/data';
import type { Goal } from '../types';

jest.mock('../lib/supabase', () => ({ getSupabase: jest.fn(() => null) }));
jest.mock('../lib/data', () => {
  const actual = jest.requireActual('../lib/data');
  return {
    ...actual,
    fetchProfile: jest.fn(async () => ({ ok: true, data: { userId: 'u1', fullName: 'Awa Diop', phoneE164: '+221771234567', idType: 'cni_cedeao', idNumber: 'AB12345' } })),
    listGoals: jest.fn(async () => ({ ok: true, data: [] })),
    listActivities: jest.fn(async () => ({ ok: true, data: [] })),
    createGoal: jest.fn(),
    deleteAccount: jest.fn(async () => ({ ok: true, data: null })),
    // Mobile Money: the server reports the integrations as not configured.
    invokeFunction: jest.fn(async () => ({ ok: false, error: 'integration_not_configured' })),
    logAudit: jest.fn(),
  };
});

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;
const mockedData = data as jest.Mocked<typeof data>;

const goal: Goal = {
  id: 'g1',
  name: 'Tabaski',
  category: 'fete',
  targetAmount: 150000,
  savedAmount: 12500,
  frequency: 'weekly',
  contributionAmount: 5000,
  status: 'active',
  operator: 'wave',
  lockedUntil: null,
  isChildGoal: false,
  childBirthDate: null,
  nextDebitAt: '2026-10-04T08:00:00.000Z',
  endsOn: '2027-03-31',
  createdAt: '2026-09-27T08:00:00.000Z',
};

async function setPrefs(p: Record<string, unknown>) {
  await AsyncStorage.setItem('sx.prefs.v1', JSON.stringify({ onboardingDone: true, ...p }));
}

/** A verified session + device account + PIN on this device (app boots locked). */
async function signedInDevice() {
  (getSupabase as jest.Mock).mockReturnValue({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }),
      signOut: jest.fn(async () => ({ error: null })),
    },
  });
  store.set('sx.device_account.n', '1');
  store.set('sx.device_account.0', JSON.stringify({ userId: 'u1', phoneE164: '+221771234567' }));
  await setPin('2580');
  await setPrefs({});
}

async function typePin(pin: string) {
  for (const d of pin) await fireEvent.press(screen.getByLabelText(d));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(async () => {
  store.clear();
  await AsyncStorage.clear();
  (getSupabase as jest.Mock).mockReturnValue(null);
  jest.clearAllMocks();
  mockedData.listGoals.mockResolvedValue({ ok: true, data: [] });
});

describe('onboarding and sign-up', () => {
  it('shows 3 onboarding screens, then the phone step', async () => {
    await render(<App />);
    expect(await screen.findByText('Épargnez sans y penser')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('onboarding-next'));
    expect(screen.getByText('Le prélèvement automatique')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('onboarding-next'));
    expect(screen.getByText('Votre argent à la fin')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('onboarding-next'));
    expect(await screen.findByText('Votre numéro de téléphone')).toBeTruthy();
    expect(screen.getByText('Étape 1 sur 6')).toBeTruthy();
    expect(screen.getByLabelText('Wave')).toBeTruthy();
    expect(screen.getByLabelText('Orange Money')).toBeTruthy();
  });

  it('validates the Senegalese phone number and the terms', async () => {
    await setPrefs({});
    await render(<App />);
    await fireEvent.press(await screen.findByTestId('create-account'));
    await fireEvent.changeText(screen.getByTestId('signup-phone'), '33 821 12 34');
    await fireEvent.press(screen.getByTestId('signup-next'));
    await waitFor(() => expect(screen.getByText(/Saisissez un numéro mobile sénégalais valide/)).toBeTruthy());
    expect(screen.getByText('Vous devez accepter les conditions pour continuer.')).toBeTruthy();
  });

  it('checks the Wave / Orange Money account (test mode is labelled), then never fakes the SMS', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await setPrefs({});
    await render(<App />);
    await fireEvent.press(await screen.findByTestId('create-account'));
    await fireEvent.changeText(screen.getByTestId('signup-phone'), '77 123 45 67');
    await fireEvent.press(screen.getByText('J’accepte les conditions générales et la politique de confidentialité.'));
    await fireEvent.press(screen.getByTestId('signup-next'));
    expect(await screen.findByText('Votre compte')).toBeTruthy();
    expect(screen.getByText('Compte actif')).toBeTruthy(); // Wave, from the placeholder
    expect(screen.getByText('Aucun compte')).toBeTruthy(); // Orange Money
    expect(screen.getByText(/Mode test : résultat fictif/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('account-next'));
    expect(await screen.findByText('Vérification du numéro')).toBeTruthy();
    expect(screen.getByText(/\+221 77 \*\*\* \*\* 67/)).toBeTruthy(); // masked
    await fireEvent.press(screen.getByTestId('otp-send'));
    await waitFor(() => expect(screen.getAllByText(/La vérification SMS nécessite la configuration du service SMS/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/transmis le SMS/)).toBeNull();
    expect(screen.queryByTestId('otp-input')).toBeNull();
  });
});

describe('login, PIN and lock', () => {
  it('shows the login screen with logo, phone, forgot PIN and create account', async () => {
    await setPrefs({});
    await render(<App />);
    expect(await screen.findByLabelText('Logo Sama-Xaalis')).toBeTruthy();
    expect(screen.getByText('Connexion')).toBeTruthy();
    expect(screen.getByTestId('login-phone')).toBeTruthy();
    expect(screen.getByText('Code secret oublié ?')).toBeTruthy();
    expect(screen.getByText('Création de compte')).toBeTruthy();
  });

  it('unlocks with the right PIN, counts wrong attempts, and 2468 is not a master code', async () => {
    await signedInDevice();
    await render(<App />);
    expect(await screen.findByText('Application verrouillée')).toBeTruthy();
    expect(screen.getByDisplayValue('+221 77 *** ** 67')).toBeTruthy();
    await typePin('2468');
    expect(await screen.findByText('Code secret incorrect. Essais restants : 4.')).toBeTruthy();
    await typePin('2580');
    expect(await screen.findByText('Bonjour Awa')).toBeTruthy();
  });

  it('wipes the local session after 5 wrong PINs', async () => {
    await signedInDevice();
    await render(<App />);
    await screen.findByText('Application verrouillée');
    for (let i = 0; i < 5; i++) await typePin('1111');
    expect(await screen.findByText(/Trop d’essais incorrects/)).toBeTruthy();
    expect(screen.getByTestId('login-phone')).toBeTruthy();
    expect(store.has('sx.pin.n')).toBe(false);
  });

  it('locks when the app goes to the background', async () => {
    let listeners: ((s: AppStateStatus) => void)[] = [];
    const original = AppState.addEventListener;
    AppState.addEventListener = ((_type: string, fn: (s: AppStateStatus) => void) => {
      listeners.push(fn);
      return { remove: () => (listeners = listeners.filter((l) => l !== fn)) };
    }) as typeof AppState.addEventListener;
    try {
      await signedInDevice();
      const view = await render(<App />);
      await screen.findByText('Application verrouillée');
      await typePin('2580');
      await screen.findByText('Bonjour Awa');
      await act(async () => listeners.forEach((l) => l('background')));
      await act(async () => listeners.forEach((l) => l('active')));
      expect(await screen.findByText('Application verrouillée')).toBeTruthy();
      await view.unmount();
    } finally {
      AppState.addEventListener = original;
    }
  });

  it('forgot PIN starts an SMS verification', async () => {
    await signedInDevice();
    await render(<App />);
    await fireEvent.press(await screen.findByTestId('forgot-pin'));
    expect(await screen.findByText('Code secret oublié')).toBeTruthy();
    expect(screen.getByTestId('otp-send')).toBeTruthy();
  });
});

describe('main screens', () => {
  async function unlocked() {
    await signedInDevice();
    await render(<App />);
    await screen.findByText('Application verrouillée');
    await typePin('2580');
    await screen.findByText('Bonjour Awa');
  }

  it('dashboard: big total, secure badge, chart, logos, no bottom menu', async () => {
    mockedData.listGoals.mockResolvedValue({ ok: true, data: [goal] });
    await unlocked();
    expect(await screen.findByText('12 500 FCFA')).toBeTruthy();
    expect(screen.getByText('Transactions sécurisées')).toBeTruthy();
    expect(screen.getByText('Mon épargne par mois')).toBeTruthy();
    expect(screen.getAllByText('Intégration à configurer').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByLabelText('Wave').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Orange Money').length).toBeGreaterThan(0);
    expect(screen.queryByText('Connecté')).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByText('Accueil')).toBeNull();
    expect(screen.getAllByText('Non planifié : autorisation requise').length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByLabelText('Masquer le montant'));
    expect(screen.queryByText('12 500 FCFA')).toBeNull();
  });

  it('goal creation: 6 goals + Autre, 500 FCFA minimum, period picked in the calendar', async () => {
    await unlocked();
    mockedData.createGoal.mockResolvedValue({ ok: true, data: { ...goal, id: 'g2' } });
    await fireEvent.press(screen.getAllByText('Nouvel objectif')[0]);
    for (const c of ['Urgences', 'Fêtes (Tabaski, Korité…)', 'Scolarité', 'Santé', 'Commerce', 'Logement', 'Autre']) {
      expect(await screen.findByLabelText(c)).toBeTruthy();
    }
    await fireEvent.press(screen.getByTestId('goal-cat-scolarite'));
    await fireEvent.changeText(screen.getByTestId('goal-contribution'), '400');
    await fireEvent.press(screen.getByText('Wave'));
    await fireEvent.press(screen.getByTestId('goal-submit'));
    expect(await screen.findByText('Minimum 500 FCFA.')).toBeTruthy();
    expect(screen.getByText('Choisissez la date de fin dans le calendrier.')).toBeTruthy();
    expect(mockedData.createGoal).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('goal-contribution'), '2 500');
    await fireEvent.press(screen.getByLabelText('Mois suivant'));
    await fireEvent.press(screen.getByLabelText('Mois suivant'));
    const day = screen.getAllByTestId(/^cal-\d{4}-\d{2}-15$/)[0];
    const endsOn = day.props.testID.slice(4);
    await fireEvent.press(day);
    expect(await screen.findByText('Votre épargne automatique')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('goal-submit'));
    await waitFor(() =>
      expect(mockedData.createGoal).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Scolarité', category: 'scolarite', contributionAmount: 2500, operator: 'wave', endsOn }),
      ),
    );
  });

  it('withdrawal: only after the period, with a 1 % fee', async () => {
    mockedData.listGoals.mockResolvedValue({ ok: true, data: [goal, { ...goal, id: 'g3', name: 'Urgences', endsOn: '2026-01-31' }] });
    await unlocked();
    await fireEvent.press(screen.getByText('Retirer'));
    expect(await screen.findByText(/« Tabaski » : retrait possible à partir du 31\/03\/2027/)).toBeTruthy();
    expect(screen.getByText('Frais de service : 1 % du montant retiré.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Orange Money'));
    await fireEvent.changeText(screen.getByTestId('withdraw-amount'), '10000');
    expect(await screen.findByText('9 900 FCFA')).toBeTruthy();
    expect(screen.getByText('100 FCFA')).toBeTruthy();
  });

  it('account deletion requires typing SUPPRIMER, calls the server and wipes local data', async () => {
    await unlocked();
    await fireEvent.press(screen.getByLabelText('Profil'));
    expect(await screen.findByText('Se déconnecter')).toBeTruthy();
    expect(screen.getByLabelText('Retour')).toBeTruthy();
    await fireEvent.press(await screen.findByText('Supprimer mon compte'));
    const confirm = screen.getAllByText('Supprimer mon compte').at(-1)!;
    await fireEvent.press(confirm);
    expect(mockedData.deleteAccount).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('SUPPRIMER'), 'supprimer');
    await fireEvent.press(screen.getAllByText('Supprimer mon compte').at(-1)!);
    await waitFor(() => expect(mockedData.deleteAccount).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('login-phone')).toBeTruthy();
    expect([...store.keys()].filter((k) => k.startsWith('sx.pin') || k.startsWith('sx.device_account'))).toEqual([]);
  });
});

describe('language and theme', () => {
  it('renders in English', async () => {
    await setPrefs({ language: 'en' });
    await render(<App />);
    expect(await screen.findByText('Sign in')).toBeTruthy();
    expect(screen.getByText('Forgot your secret code?')).toBeTruthy();
    expect(screen.getByText('Create an account')).toBeTruthy();
  });

  it('applies light and dark themes', async () => {
    await setPrefs({ theme: 'dark' });
    const dark = await render(<App />);
    await screen.findByText('Connexion');
    expect(JSON.stringify(dark.toJSON())).toContain('#1A1A1A');
    await dark.unmount();
    await setPrefs({ theme: 'light' });
    const light = await render(<App />);
    await screen.findByText('Connexion');
    const json = JSON.stringify(light.toJSON());
    expect(json).toContain('#F5F0E6');
    expect(json).toContain('#2C2C2C');
    expect(json).not.toContain('#1A1A1A');
  });
});
