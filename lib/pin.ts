// 4-digit login PIN, bound to this device. Only a salted PBKDF2 hash is kept, in SecureStore
// (Keychain / Keystore), never in AsyncStorage and never in logs. After MAX_PIN_ATTEMPTS wrong PINs the
// local session is wiped and the user must verify their phone number again by SMS.
import { pbkdf2Async } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import * as Crypto from 'expo-crypto';
import { SECURE_KEYS, secureDelete, secureGet, secureSet } from '../zzz/secureStore';

export const PIN_LENGTH = 4;
export const MAX_PIN_ATTEMPTS = 5;
// Offline brute force of a 4-digit PIN is always cheap; the real protection is the Keychain/Keystore
// (device-only, unlocked device) plus the attempt limit. PBKDF2 only avoids storing a plain digest.
const ITERATIONS = 20_000;

interface PinRecord {
  v: 1;
  salt: string;
  hash: string;
  failed: number;
}

// Trivial PINs are refused at creation.
const WEAK_PINS = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '0123', '9876']);

export type PinValidation = 'ok' | 'format' | 'weak';

export function validateNewPin(pin: string): PinValidation {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) return 'format';
  if (WEAK_PINS.has(pin)) return 'weak';
  return 'ok';
}

export async function hashPin(pin: string, saltHex: string, iterations = ITERATIONS): Promise<string> {
  return bytesToHex(await pbkdf2Async(sha256, pin, hexToBytes(saltHex), { c: iterations, dkLen: 32 }));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function readRecord(): Promise<PinRecord | null> {
  const raw = await secureGet(SECURE_KEYS.pinRecord);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PinRecord;
  } catch {
    return null;
  }
}

export async function hasPin(): Promise<boolean> {
  return (await readRecord()) !== null;
}

export async function setPin(pin: string): Promise<void> {
  if (validateNewPin(pin) !== 'ok') throw new Error('invalid pin');
  const salt = bytesToHex(Crypto.getRandomBytes(16));
  const record: PinRecord = { v: 1, salt, hash: await hashPin(pin, salt), failed: 0 };
  await secureSet(SECURE_KEYS.pinRecord, JSON.stringify(record));
}

export type PinCheck =
  | { ok: true }
  | { ok: false; reason: 'wrong'; remaining: number }
  | { ok: false; reason: 'locked_out' | 'no_pin' };

export async function checkPin(pin: string): Promise<PinCheck> {
  const record = await readRecord();
  if (!record) return { ok: false, reason: 'no_pin' };
  if (record.failed >= MAX_PIN_ATTEMPTS) return { ok: false, reason: 'locked_out' };
  // Count the attempt before hashing so killing the app mid-check cannot reset the counter.
  const failed = record.failed + 1;
  await secureSet(SECURE_KEYS.pinRecord, JSON.stringify({ ...record, failed }));
  if (constantTimeEqual(await hashPin(pin, record.salt), record.hash)) {
    await secureSet(SECURE_KEYS.pinRecord, JSON.stringify({ ...record, failed: 0 }));
    return { ok: true };
  }
  if (failed >= MAX_PIN_ATTEMPTS) return { ok: false, reason: 'locked_out' };
  return { ok: false, reason: 'wrong', remaining: MAX_PIN_ATTEMPTS - failed };
}

export async function clearPin(): Promise<void> {
  await secureDelete(SECURE_KEYS.pinRecord);
}
