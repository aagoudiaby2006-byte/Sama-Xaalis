import * as SecureStore from 'expo-secure-store';
import { checkPin, clearPin, hasPin, MAX_PIN_ATTEMPTS, setPin, validateNewPin } from '../lib/pin';
import AsyncStorage from '@react-native-async-storage/async-storage';

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;

beforeEach(async () => {
  await clearPin();
});

describe('PIN', () => {
  it('refuses malformed and trivial PINs', () => {
    expect(validateNewPin('12a4')).toBe('format');
    expect(validateNewPin('12345')).toBe('format');
    expect(validateNewPin('1234')).toBe('weak');
    expect(validateNewPin('0000')).toBe('weak');
    expect(validateNewPin('2580')).toBe('ok');
  });

  it('stores only a salted hash in SecureStore, never the PIN, never in AsyncStorage', async () => {
    await setPin('2580');
    expect(await hasPin()).toBe(true);
    const dump = [...store.values()].join('|');
    expect(dump).not.toMatch(/"2580"|:2580|2580"/);
    expect(dump).toContain('"salt"');
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });

  it('accepts the right PIN and rejects a wrong one', async () => {
    await setPin('2580');
    await expect(checkPin('2580')).resolves.toEqual({ ok: true });
    await expect(checkPin('1111')).resolves.toEqual({ ok: false, reason: 'wrong', remaining: MAX_PIN_ATTEMPTS - 1 });
  });

  it('locks out after too many wrong PINs, even with the right PIN afterwards', async () => {
    await setPin('2580');
    for (let i = 1; i < MAX_PIN_ATTEMPTS; i++) await checkPin('1111');
    await expect(checkPin('1111')).resolves.toEqual({ ok: false, reason: 'locked_out' });
    await expect(checkPin('2580')).resolves.toEqual({ ok: false, reason: 'locked_out' });
  });

  it('a successful PIN resets the failure counter', async () => {
    await setPin('2580');
    await checkPin('1111');
    await checkPin('2580');
    await expect(checkPin('1111')).resolves.toEqual({ ok: false, reason: 'wrong', remaining: MAX_PIN_ATTEMPTS - 1 });
  });

  it('2468 is not a master PIN', async () => {
    await setPin('2580');
    await expect(checkPin('2468')).resolves.toMatchObject({ ok: false });
  });

  it('no PIN means no unlock', async () => {
    await expect(checkPin('2580')).resolves.toEqual({ ok: false, reason: 'no_pin' });
  });
});
