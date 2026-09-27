import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { SECURE_KEYS, secureDelete, secureGet, secureSet } from './secureStore';

export async function isBiometricAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  return (await secureGet(SECURE_KEYS.biometricsEnabled)) === '1';
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (enabled) await secureSet(SECURE_KEYS.biometricsEnabled, '1');
  else await secureDelete(SECURE_KEYS.biometricsEnabled);
}

/** Biometric prompt. The PIN pad always stays visible as a fallback. */
export async function authenticateWithBiometrics(promptMessage: string, cancelLabel: string): Promise<boolean> {
  if (!(await isBiometricAvailable())) return false;
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel,
      disableDeviceFallback: true,
    });
    return res.success;
  } catch {
    return false;
  }
}
