// Senegalese phone number helpers. Stored format is always E.164: +221XXXXXXXXX.
// The mobile operator is never inferred from the prefix (numbers are portable).

export const SENEGAL_DIAL_CODE = '+221';

/** Returns the E.164 form of a Senegalese mobile number, or null if the input is not one. */
export function normalizeSenegalPhone(input: string): string | null {
  let digits = input.replace(/[\s\-.()]/g, '');
  if (digits.startsWith('+')) {
    if (!digits.startsWith('+221')) return null;
    digits = digits.slice(4);
  } else if (digits.startsWith('00221')) {
    digits = digits.slice(5);
  } else if (digits.length === 12 && digits.startsWith('221')) {
    digits = digits.slice(3);
  }
  // Mobile numbers are 9 digits starting with 7 (70, 75, 76, 77, 78...). Landlines (33...) cannot receive SMS OTP.
  if (!/^7\d{8}$/.test(digits)) return null;
  return SENEGAL_DIAL_CODE + digits;
}

export function isValidSenegalPhone(input: string): boolean {
  return normalizeSenegalPhone(input) !== null;
}

/** "+221771234567" -> "77 123 45 67" */
export function formatNational(e164: string): string {
  const d = e164.replace(SENEGAL_DIAL_CODE, '');
  if (d.length !== 9) return e164;
  return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7)}`;
}

/** "+221771234567" -> "+221 77 *** ** 67" — for sensitive screens. */
export function maskPhone(e164: string): string {
  const d = e164.replace(SENEGAL_DIAL_CODE, '');
  if (d.length !== 9) return '•••';
  return `${SENEGAL_DIAL_CODE} ${d.slice(0, 2)} *** ** ${d.slice(7)}`;
}

/** Formats partial user input as the user types: "771234567" -> "77 123 45 67". */
export function formatPhoneInput(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 9);
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
  return parts.join(' ');
}
