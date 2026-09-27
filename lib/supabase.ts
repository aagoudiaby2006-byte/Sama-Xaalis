import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config, isBackendConfigured } from './config';
import { SECURE_KEYS, secureSessionStorage } from '../zzz/secureStore';

let client: SupabaseClient | null = null;

/** Returns the Supabase client, or null when the backend is not configured (no fake fallback). */
export function getSupabase(): SupabaseClient | null {
  if (!isBackendConfigured()) return null;
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        storage: secureSessionStorage,
        storageKey: SECURE_KEYS.supabaseSession,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
