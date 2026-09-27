// Public runtime configuration. Only EXPO_PUBLIC_* values end up in the app bundle:
// never put a secret here (SMS provider keys, Supabase service_role key, Wave / Orange Money credentials
// stay in Supabase Edge Function secrets). The Supabase anon key is public by design and protected by RLS.

export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  privacyUrl: process.env.EXPO_PUBLIC_PRIVACY_URL ?? '',
  termsUrl: process.env.EXPO_PUBLIC_TERMS_URL ?? '',
  supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '',
  supportUrl: process.env.EXPO_PUBLIC_SUPPORT_URL ?? '',
};

export function isBackendConfigured(): boolean {
  return config.supabaseUrl.startsWith('https://') && config.supabaseAnonKey.length > 20;
}

/** OTP lifetime configured on the server (supabase/config.toml: auth.sms.otp_exp). */
export const OTP_TTL_SECONDS = 300;
export const OTP_LENGTH = 6;
