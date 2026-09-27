// Secure storage backed by the iOS Keychain / Android Keystore (expo-secure-store).
// Values are chunked because SecureStore values should stay under ~2 KB (Supabase sessions are larger).
// Secrets (auth session, PIN hash) must only ever go through this module — never AsyncStorage.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 1800;
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

// Web has no secure enclave: keep secrets in memory only (lost on reload). Web is for previews, not production.
const memory = new Map<string, string>();
const isWeb = Platform.OS === 'web';

function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

async function rawGet(key: string): Promise<string | null> {
  if (isWeb) return memory.get(key) ?? null;
  return SecureStore.getItemAsync(key, OPTIONS);
}

async function rawSet(key: string, value: string): Promise<void> {
  if (isWeb) {
    memory.set(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value, OPTIONS);
}

async function rawDelete(key: string): Promise<void> {
  if (isWeb) {
    memory.delete(key);
    return;
  }
  await SecureStore.deleteItemAsync(key, OPTIONS);
}

export async function secureGet(key: string): Promise<string | null> {
  const k = safeKey(key);
  const count = await rawGet(`${k}.n`);
  if (count === null) return null;
  const n = Number(count);
  let out = '';
  for (let i = 0; i < n; i++) {
    const part = await rawGet(`${k}.${i}`);
    if (part === null) return null;
    out += part;
  }
  return out;
}

export async function secureSet(key: string, value: string): Promise<void> {
  const k = safeKey(key);
  await secureDelete(key);
  const n = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
  for (let i = 0; i < n; i++) {
    await rawSet(`${k}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
  }
  await rawSet(`${k}.n`, String(n));
}

export async function secureDelete(key: string): Promise<void> {
  const k = safeKey(key);
  const count = await rawGet(`${k}.n`);
  if (count === null) return;
  await rawDelete(`${k}.n`);
  for (let i = 0; i < Number(count); i++) await rawDelete(`${k}.${i}`);
}

/** Storage adapter for supabase-js auth sessions. */
export const secureSessionStorage = {
  getItem: (key: string) => secureGet(key),
  setItem: (key: string, value: string) => secureSet(key, value),
  removeItem: (key: string) => secureDelete(key),
};

/** Every secure key used by the app, so logout / account deletion can wipe them. */
export const SECURE_KEYS = {
  pinRecord: 'sx.pin',
  deviceAccount: 'sx.device_account',
  biometricsEnabled: 'sx.biometrics',
  supabaseSession: 'sx.supabase.auth',
} as const;

export async function wipeSecureStore(): Promise<void> {
  for (const key of Object.values(SECURE_KEYS)) await secureDelete(key);
}
