import { useState } from 'react';
import { useI18n, type TranslationKey } from '../lib/i18n';
import { useNav } from '../lib/navigation';
import { useSession } from '../lib/session';
import { checkPin, clearPin } from '../lib/pin';
import { formatPhoneInput, normalizeSenegalPhone, SENEGAL_DIAL_CODE } from '../lib/phone';
import { logAudit } from '../lib/data';
import { AppText, Button, Header, Notice, Screen, TextField } from '../components/ui';
import { PinPad } from '../components/PinPad';
import { OtpStep, PinSetupStep } from './AuthScreens';

/** "Code secret oublié ?": verify the phone by SMS, then create a new PIN (phase -> needsPin). */
export function RecoveryScreen() {
  const { t } = useI18n();
  const nav = useNav();
  const { account, onPhoneVerified } = useSession();
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneError, setPhoneError] = useState(false);
  const [phoneE164, setPhoneE164] = useState<string | null>(account?.phoneE164 ?? null);

  return (
    <Screen header={<Header title={t('recoveryTitle')} onBack={nav.pop} />}>
      <AppText muted>{t('recoverySubtitle')}</AppText>
      {phoneE164 ? (
        <OtpStep
          phoneE164={phoneE164}
          createUser={false}
          onVerified={async (userId) => {
            await clearPin();
            await onPhoneVerified({ userId, phoneE164 });
            logAudit('pin_recovery');
          }}
        />
      ) : (
        <>
          <TextField
            label={t('phoneLabel')}
            prefix={SENEGAL_DIAL_CODE}
            placeholder={t('phonePlaceholder')}
            keyboardType="phone-pad"
            value={formatPhoneInput(phoneInput)}
            onChangeText={setPhoneInput}
            error={phoneError ? t('phoneInvalid') : null}
          />
          <Button
            title={t('continue')}
            onPress={() => {
              const e164 = normalizeSenegalPhone(phoneInput);
              setPhoneError(!e164);
              if (e164) setPhoneE164(e164);
            }}
          />
        </>
      )}
    </Screen>
  );
}

/** Change PIN from the profile: current PIN first, then new PIN + confirmation. */
export function ChangePinScreen() {
  const { t } = useI18n();
  const nav = useNav();
  const { signOut, setAuthNotice } = useSession();
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [done, setDone] = useState(false);

  const onCurrent = async (pin: string) => {
    const res = await checkPin(pin);
    setResetKey((k) => k + 1);
    if (res.ok) {
      setError(null);
      setVerified(true);
      return;
    }
    if (res.reason === 'wrong') return setError(t('pinWrong', { n: res.remaining }));
    setAuthNotice('pinLockedOut' as TranslationKey);
    await signOut();
  };

  return (
    <Screen header={<Header title={t('changePinTitle')} onBack={nav.pop} />}>
      {done ? (
        <>
          <Notice kind="success">{t('pinSaved')}</Notice>
          <Button title={t('close')} onPress={nav.pop} />
        </>
      ) : verified ? (
        <PinSetupStep
          onDone={() => {
            logAudit('pin_changed');
            setDone(true);
          }}
        />
      ) : (
        <>
          <AppText variant="title">{t('currentPinTitle')}</AppText>
          {error ? <Notice kind="error">{error}</Notice> : null}
          <PinPad onComplete={onCurrent} resetKey={resetKey} />
        </>
      )}
    </Screen>
  );
}
