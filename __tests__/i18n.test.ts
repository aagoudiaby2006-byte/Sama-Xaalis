import fs from 'fs';
import path from 'path';
import { dictionaries, translate, type TranslationKey } from '../lib/i18n';

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe('translations', () => {
  const frKeys = Object.keys(dictionaries.fr) as TranslationKey[];

  it('French and English have exactly the same keys, all non-empty', () => {
    expect(Object.keys(dictionaries.en).sort()).toEqual([...frKeys].sort());
    for (const k of frKeys) {
      expect(dictionaries.fr[k].trim()).not.toBe('');
      expect(dictionaries.en[k].trim()).not.toBe('');
    }
  });

  it('placeholders match between languages', () => {
    for (const k of frKeys) expect([k, placeholders(dictionaries.en[k])]).toEqual([k, placeholders(dictionaries.fr[k])]);
  });

  it('English is actually translated (only brand names / formats may be identical)', () => {
    const allowedSame = new Set<TranslationKey>(['appName', 'phonePlaceholder', 'fullNamePlaceholder', 'mmTitle', 'lang_fr', 'lang_en', 'version', 'mmState_connected', 'act_scheduled', 'contributionMin', 'notifications', 'support']);
    const same = frKeys.filter((k) => dictionaries.fr[k] === dictionaries.en[k] && !allowedSame.has(k));
    expect(same).toEqual([]);
  });

  it('interpolates parameters', () => {
    expect(translate('fr', 'pinWrong', { n: 3 })).toBe('Code secret incorrect. Essais restants : 3.');
    expect(translate('en', 'hello', { name: 'Awa' })).toBe('Hello Awa');
  });

  it('every t(`prefix_${x}`) family used in screens exists in both languages', () => {
    const families: Record<string, string[]> = {
      status_: ['active', 'paused', 'locked', 'completed', 'cancelled'],
      freq_: ['daily', 'weekly', 'monthly'],
      kind_: ['debit', 'withdrawal', 'fee', 'refund'],
      act_: ['scheduled', 'pending', 'succeeded', 'failed', 'cancelled', 'refunded'],
      mmState_: ['integration_missing', 'not_connected', 'connecting', 'connected', 'mandate_pending', 'mandate_refused', 'mandate_expired', 'error'],
      otpErr_: ['not_configured', 'sms_not_configured', 'invalid_phone', 'invalid_code', 'expired_or_invalid', 'too_many_attempts', 'resend_cooldown', 'resend_limit', 'rate_limited', 'user_not_found', 'network', 'unknown'],
      err_: ['not_configured', 'not_authenticated', 'network', 'forbidden', 'conflict', 'integration_not_configured', 'invalid_request', 'server'],
      quote_: ['invalid_amount', 'insufficient_funds', 'fee_exceeds_amount', 'fees_not_configured'],
      idType_: ['cni_cedeao', 'passport', 'residence_permit'],
      theme_: ['system', 'light', 'dark'],
      goalCat_: ['urgence', 'fete', 'scolarite', 'sante', 'commerce', 'logement', 'autre'],
    };
    for (const [prefix, values] of Object.entries(families)) {
      for (const v of values) expect(frKeys).toContain(`${prefix}${v}`);
    }
  });

  // JSX text: after a tag's closing '>' (not an arrow '=>') and before the next tag.
  const JSX_TEXT = /(?<![=\-])>\s*([A-Za-zÀ-ÿ][^<>{}();=]*?)\s*<\/?[A-Za-z]/g;

  it('the hard-coded text detector detects hard-coded text (positive control)', () => {
    expect([...'<AppText variant="title">Épargne sans y penser</AppText>'.matchAll(JSX_TEXT)].map((m) => m[1])).toEqual(['Épargne sans y penser']);
    expect([...'<Button title="x" />\n<View>\n  Bonjour\n</View>'.matchAll(JSX_TEXT)].map((m) => m[1])).toEqual(['Bonjour']);
    expect([...'const f = (): void | Promise<unknown> => {}'.matchAll(JSX_TEXT)]).toEqual([]);
  });

  it('no hard-coded visible text in screens and components', () => {
    const dirs = ['screens', 'components'].map((d) => path.join(__dirname, '..', d));
    const offenders: string[] = [];
    for (const dir of dirs) {
      for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
        const src = fs.readFileSync(path.join(dir, file), 'utf8');
        for (const m of src.matchAll(JSX_TEXT)) {
          offenders.push(`${file}: "${m[1].trim()}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
