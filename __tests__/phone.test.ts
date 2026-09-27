import { formatNational, formatPhoneInput, isValidSenegalPhone, maskPhone, normalizeSenegalPhone } from '../lib/phone';

describe('Senegalese phone numbers', () => {
  it.each([
    ['77 123 45 67', '+221771234567'],
    ['771234567', '+221771234567'],
    ['+221 77 123 45 67', '+221771234567'],
    ['00221771234567', '+221771234567'],
    ['221781234567', '+221781234567'],
    ['70-123-45-67', '+221701234567'],
    ['(76) 123.45.67', '+221761234567'],
  ])('normalizes %s to E.164', (input, expected) => {
    expect(normalizeSenegalPhone(input)).toBe(expected);
  });

  it.each(['', '77123456', '7712345678', '338211234', '+33612345678', '+2217712345', 'abcdefghi', '87 123 45 67'])(
    'rejects %s',
    (input) => {
      expect(normalizeSenegalPhone(input)).toBeNull();
      expect(isValidSenegalPhone(input)).toBe(false);
    },
  );

  it('masks the number on sensitive screens', () => {
    const masked = maskPhone('+221771234567');
    expect(masked).toBe('+221 77 *** ** 67');
    expect(masked).not.toContain('12345');
  });

  it('formats for display and typing', () => {
    expect(formatNational('+221771234567')).toBe('77 123 45 67');
    expect(formatPhoneInput('7712')).toBe('77 12');
    expect(formatPhoneInput('77123456789999')).toBe('77 123 45 67');
  });
});
