import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import type { Goal, Operator } from '../types';
import { useI18n, type TranslationKey } from '../lib/i18n';
import { useTheme } from '../lib/theme';
import { useSession } from '../lib/session';
import { useNav } from '../lib/navigation';
import { formatPhoneInput, maskPhone, normalizeSenegalPhone, SENEGAL_DIAL_CODE } from '../lib/phone';
import { OtpGuard, sendOtp, verifyOtp, type OtpFailureReason } from '../lib/otp';
import { OTP_LENGTH, isBackendConfigured } from '../lib/config';
import { checkPin, setPin, validateNewPin } from '../lib/pin';
import { createGoal, logAudit, type DataError } from '../lib/data';
import { OPERATORS, OPERATOR_BRAND } from '../lib/mobileMoney';
import { verifierNumero, type VerificationNumero } from '../services/paiement';
import { authenticateWithBiometrics, isBiometricAvailable, isBiometricEnabled } from '../zzz/biometrics';
import { openLegalLink } from '../zzz/legalLinks';
import { AppText, Button, Card, Checkbox, Header, LinkButton, Notice, Row, Screen, Segmented, TextField, ConfirmDialog } from '../components/ui';
import { Logo } from '../components/Logo';
import { PinPad } from '../components/PinPad';
import { StatusBadge } from '../components/StatusBadge';
import { OperatorLogo, OperatorLogos, SecureBadge } from '../components/Finance';
import { GoalAmountPeriod, GoalCategoryPicker, useGoalForm } from '../components/GoalForm';
import { MandatePanel } from './MobileMoneyScreen';
import { DebitPreview } from './MainScreens';

// ---------------------------------------------------------------------------
// OTP step (shared by sign-up, new-device login and PIN recovery)
// ---------------------------------------------------------------------------

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function OtpStep({
  phoneE164,
  createUser,
  onVerified,
}: {
  phoneE164: string;
  createUser: boolean;
  onVerified: (userId: string) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const guard = useRef(new OtpGuard()).current;
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<OtpFailureReason | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const send = async () => {
    const blocked = guard.sendBlockedReason();
    if (blocked) return setError(blocked);
    setError(null);
    const res = await sendOtp(phoneE164, { createUser });
    if (!res.ok) return setError(res.reason);
    guard.recordSend(res.expiresAt);
    setSent(true);
    setCode('');
  };

  const verify = async () => {
    const blocked = guard.verifyBlockedReason();
    if (blocked) return setError(blocked);
    const res = await verifyOtp(phoneE164, code);
    if (!res.ok) {
      if (res.reason === 'expired_or_invalid' || res.reason === 'invalid_code') guard.recordFailedAttempt();
      setError(guard.verifyBlockedReason() === 'too_many_attempts' ? 'too_many_attempts' : res.reason);
      setCode('');
      return;
    }
    setError(null);
    await onVerified(res.userId);
  };

  const cooldown = guard.cooldownRemainingSeconds();
  const expiresIn = guard.secondsUntilExpiry();
  const smsMissing = error === 'not_configured' || error === 'sms_not_configured';

  return (
    <View style={{ gap: 16 }}>
      <AppText variant="title">{t('otpTitle')}</AppText>
      <AppText muted>{sent ? t('otpSubtitle', { phone: maskPhone(phoneE164) }) : t('otpIntro', { phone: maskPhone(phoneE164) })}</AppText>

      {!isBackendConfigured() && error !== 'not_configured' ? <Notice kind="warning">{t('otpErr_not_configured')}</Notice> : null}

      {sent ? (
        <>
          <Notice kind="info">{t('otpSentByServer')}</Notice>
          <TextField
            testID="otp-input"
            label={t('otpCodeLabel')}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, OTP_LENGTH))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            maxLength={OTP_LENGTH}
            help={expiresIn > 0 ? t('otpExpiresIn', { time: formatSeconds(expiresIn) }) : undefined}
          />
          {error ? (
            <Notice kind={smsMissing ? 'warning' : 'error'}>
              {`${t(`otpErr_${error}` as TranslationKey)}${
                error === 'expired_or_invalid' && guard.remainingAttempts() > 0 ? ` ${t('otpAttemptsLeft', { n: guard.remainingAttempts() })}` : ''
              }`}
            </Notice>
          ) : null}
          <Button testID="otp-verify" title={t('otpVerify')} onPress={verify} disabled={code.length !== OTP_LENGTH} />
          <Button
            kind="ghost"
            title={cooldown > 0 ? t('otpResendIn', { s: cooldown }) : t('otpResend')}
            onPress={send}
            disabled={cooldown > 0}
          />
        </>
      ) : (
        <>
          {error ? <Notice kind={smsMissing ? 'warning' : 'error'}>{t(`otpErr_${error}` as TranslationKey)}</Notice> : null}
          <Button testID="otp-send" title={t('otpSend')} icon="chatbubble-ellipses-outline" onPress={send} />
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// PIN creation (create + confirm)
// ---------------------------------------------------------------------------

export function PinSetupStep({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);

  const onComplete = async (pin: string) => {
    if (busy) return;
    if (first === null) {
      const v = validateNewPin(pin);
      if (v !== 'ok') {
        setError(v === 'weak' ? 'pinWeak' : 'pinMismatch');
        setResetKey((k) => k + 1);
        return;
      }
      setError(null);
      setFirst(pin);
      setResetKey((k) => k + 1);
      return;
    }
    if (pin !== first) {
      setError('pinMismatch');
      setFirst(null);
      setResetKey((k) => k + 1);
      return;
    }
    setBusy(true);
    await setPin(pin);
    logAudit('pin_set');
    setBusy(false);
    onDone();
  };

  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 6 }}>
        <AppText variant="title">{first === null ? t('createPinTitle') : t('confirmPinTitle')}</AppText>
        <AppText muted>{t('createPinSubtitle')}</AppText>
      </View>
      {error ? <Notice kind="error">{t(error)}</Notice> : null}
      <PinPad onComplete={onComplete} resetKey={resetKey} disabled={busy} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Login / unlock
// ---------------------------------------------------------------------------

export function LoginScreen() {
  const { t } = useI18n();
  const theme = useTheme();
  const nav = useNav();
  const { phase, account, unlock, signOut, authNotice, setAuthNotice } = useSession();
  const locked = phase === 'locked' && account !== null;

  const [phoneInput, setPhoneInput] = useState('');
  const [phoneError, setPhoneError] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [confirmSwitch, setConfirmSwitch] = useState(false);

  const tryBiometrics = async () => {
    if (await authenticateWithBiometrics(t('biometricPrompt'), t('cancel'))) unlock();
  };

  useEffect(() => {
    if (!locked) return;
    void (async () => {
      const ok = (await isBiometricAvailable()) && (await isBiometricEnabled());
      setBioAvailable(ok);
      if (ok) await tryBiometrics();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  const onPin = async (pin: string) => {
    if (busy) return;
    setBusy(true);
    const res = await checkPin(pin);
    setBusy(false);
    setResetKey((k) => k + 1);
    if (res.ok) {
      setPinError(null);
      unlock();
      return;
    }
    if (res.reason === 'wrong') {
      setPinError(t('pinWrong', { n: res.remaining }));
      return;
    }
    // Locked out (or PIN missing): wipe the local session; SMS verification is required again.
    setAuthNotice('pinLockedOut');
    await signOut();
  };

  const continueWithPhone = () => {
    const e164 = normalizeSenegalPhone(phoneInput);
    if (!e164) return setPhoneError(true);
    setPhoneError(false);
    setAuthNotice(null);
    nav.push({ name: 'otpLogin', phoneE164: e164 });
  };

  return (
    <Screen>
      <View style={{ alignItems: 'center', marginTop: 12 }}>
        <Logo size={64} />
      </View>
      <View style={{ gap: 4 }}>
        <AppText variant="heading" center>
          {locked ? t('lockedTitle') : t('loginTitle')}
        </AppText>
        <AppText muted center>
          {locked ? t('lockedSubtitle') : t('loginSubtitle')}
        </AppText>
      </View>

      {authNotice ? <Notice kind="warning">{t(authNotice)}</Notice> : null}

      {locked ? (
        <>
          <TextField label={t('phoneLabel')} value={maskPhone(account.phoneE164)} editable={false} />
          {pinError ? <Notice kind="error">{pinError}</Notice> : null}
          <PinPad
            onComplete={onPin}
            resetKey={resetKey}
            disabled={busy}
            extraKey={bioAvailable ? { icon: 'finger-print', label: t('useBiometrics'), onPress: tryBiometrics } : undefined}
          />
          <LinkButton testID="forgot-pin" title={t('forgotPin')} onPress={() => nav.push({ name: 'recovery' })} />
          <LinkButton title={t('switchAccount')} onPress={() => setConfirmSwitch(true)} />
        </>
      ) : (
        <>
          <TextField
            testID="login-phone"
            label={t('phoneLabel')}
            prefix={SENEGAL_DIAL_CODE}
            placeholder={t('phonePlaceholder')}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            value={formatPhoneInput(phoneInput)}
            onChangeText={setPhoneInput}
            error={phoneError ? t('phoneInvalid') : null}
          />
          <Notice kind="info">{t('newDeviceNotice')}</Notice>
          <Button testID="login-continue" title={t('continue')} onPress={continueWithPhone} />
          <LinkButton title={t('forgotPin')} onPress={() => nav.push({ name: 'recovery' })} />
        </>
      )}

      <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 4 }} />
      <LinkButton testID="create-account" title={t('createAccount')} onPress={() => nav.push({ name: 'signup' })} />

      <ConfirmDialog
        visible={confirmSwitch}
        title={t('switchAccount')}
        body={t('switchAccountConfirm')}
        confirmLabel={t('confirm')}
        onCancel={() => setConfirmSwitch(false)}
        onConfirm={async () => {
          setConfirmSwitch(false);
          await signOut();
        }}
      />
    </Screen>
  );
}

/** New device / after lockout: verify the phone by SMS, then create a PIN (phase -> needsPin). */
export function OtpLoginScreen({ phoneE164 }: { phoneE164: string }) {
  const { t } = useI18n();
  const nav = useNav();
  const { onPhoneVerified } = useSession();
  return (
    <Screen header={<Header title={t('loginTitle')} onBack={nav.pop} />}>
      <OtpStep phoneE164={phoneE164} createUser={false} onVerified={(userId) => onPhoneVerified({ userId, phoneE164 })} />
    </Screen>
  );
}

/** Shown when a verified session exists on the device but no PIN has been created yet. */
export function CreatePinScreen() {
  const { onPinCreated } = useSession();
  return (
    <Screen>
      <PinSetupStep onDone={onPinCreated} />
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Sign-up: the 6 steps of Sama-Xaalis
//   1. phone number  2. Wave / Orange Money account check  3. SMS code
//   4. goal (6 proposed + « Autre »)  5. amount + period (calendar) -> automatic debits  6. secret code
// ---------------------------------------------------------------------------

const TOTAL_STEPS = 6;

/** services/paiement uses "orange", the rest of the app "orange_money". */
function operatorsFound(v: VerificationNumero): Operator[] {
  return [...(v.wave ? (['wave'] as const) : []), ...(v.orange ? (['orange_money'] as const) : [])];
}

export function SignUpScreen() {
  const { t } = useI18n();
  const nav = useNav();
  const { onPhoneVerified, onPinCreated } = useSession();

  const [step, setStep] = useState(1);
  const [phoneInput, setPhoneInput] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [verification, setVerification] = useState<VerificationNumero | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [verified, setVerified] = useState(false);
  const [goalError, setGoalError] = useState<DataError | null>(null);
  const [createdGoal, setCreatedGoal] = useState<Goal | null>(null);
  const form = useGoalForm(operator);

  const phoneE164 = useMemo(() => normalizeSenegalPhone(phoneInput), [phoneInput]);

  const openLink = async (link: 'terms' | 'privacy') => setLinkError(!(await openLegalLink(link)));

  const checkNumber = async () => {
    setShowErrors(true);
    if (!phoneE164 || !accepted) return;
    setChecking(true);
    const res = await verifierNumero(phoneE164);
    setChecking(false);
    setVerification(res);
    const found = operatorsFound(res);
    setOperator(found.length === 1 ? found[0] : null);
    setShowErrors(false);
    setStep(2);
  };

  const onVerified = async (userId: string) => {
    if (!phoneE164) return;
    await onPhoneVerified({ userId, phoneE164 }, { stayInFlow: true });
    setVerified(true);
    logAudit('signup_phone_verified');
    setStep(4);
  };

  const saveGoal = async () => {
    setShowErrors(true);
    const draft = form.submit();
    if (!draft) return;
    const res = await createGoal(draft);
    if (!res.ok) return setGoalError(res.error);
    setGoalError(null);
    logAudit('goal_created', { frequency: draft.frequency, category: draft.category });
    setCreatedGoal(res.data);
  };

  // Back arrow: free before the SMS code; after it, only between the goal steps.
  const back =
    step === 1
      ? nav.pop
      : step === 2
        ? () => setStep(1)
        : step === 5 && !createdGoal
          ? () => setStep(4)
          : undefined;

  const found = verification ? operatorsFound(verification) : [];
  const noAccount = verification !== null && verification.source !== 'non_configure' && found.length === 0;
  // Operators the user can pick: the ones found, or both while the check is not configured.
  const choices = verification?.source === 'non_configure' ? OPERATORS : found;

  return (
    <Screen header={<Header title={t('stepOf', { current: step, total: TOTAL_STEPS })} onBack={back} />}>
      {step === 1 ? (
        <>
          <Logo size={56} showSlogan />
          <AppText variant="title">{t('signupPhoneTitle')}</AppText>
          <AppText muted>{t('signupPhoneSubtitle')}</AppText>
          <TextField
            testID="signup-phone"
            label={t('phoneLabel')}
            prefix={SENEGAL_DIAL_CODE}
            placeholder={t('phonePlaceholder')}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            value={formatPhoneInput(phoneInput)}
            onChangeText={setPhoneInput}
            error={showErrors && !phoneE164 ? t('phoneInvalid') : null}
          />
          <OperatorLogos />
          <Checkbox label={t('acceptTerms')} value={accepted} onChange={setAccepted} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 16 }}>
            <LinkButton title={t('readTerms')} onPress={() => void openLink('terms')} />
            <LinkButton title={t('readPrivacy')} onPress={() => void openLink('privacy')} />
          </View>
          {linkError ? <Notice kind="warning">{t('linkNotConfigured')}</Notice> : null}
          {showErrors && !accepted ? <Notice kind="error">{t('mustAcceptTerms')}</Notice> : null}
          <Button testID="signup-next" title={checking ? t('checkingNumber') : t('continue')} onPress={checkNumber} disabled={checking} />
        </>
      ) : null}

      {step === 2 && verification && phoneE164 ? (
        <>
          <AppText variant="title">{t('accountCheckTitle')}</AppText>
          <AppText muted>{t('accountCheckSubtitle', { phone: maskPhone(phoneE164) })}</AppText>
          <Card>
            {OPERATORS.map((op) => {
              const has = found.includes(op);
              return (
                <Row key={op} style={{ justifyContent: 'space-between' }}>
                  <Row style={{ flex: 1 }}>
                    <OperatorLogo operator={op} size={36} />
                    <AppText weight="medium">{OPERATOR_BRAND[op].name}</AppText>
                  </Row>
                  <StatusBadge
                    label={verification.source === 'non_configure' ? t('mmState_integration_missing') : has ? t('accountFound') : t('accountNotFound')}
                    tone={verification.source === 'non_configure' ? 'warning' : has ? 'success' : 'neutral'}
                  />
                </Row>
              );
            })}
          </Card>
          {verification.source === 'placeholder' ? <Notice kind="warning">{t('verifyPlaceholder')}</Notice> : null}
          {verification.source === 'non_configure' ? <Notice kind="warning">{t('verifyNotConfigured')}</Notice> : null}
          {noAccount ? <Notice kind="error">{t('noWalletAccount')}</Notice> : null}
          {choices.length > 1 ? (
            <Segmented<Operator>
              label={t('chooseWallet')}
              options={choices.map((o) => ({ value: o, label: OPERATOR_BRAND[o].name }))}
              value={operator}
              onChange={setOperator}
            />
          ) : null}
          {noAccount ? (
            <Button kind="secondary" title={t('changeNumber')} onPress={() => setStep(1)} />
          ) : (
            <Button testID="account-next" title={t('continue')} onPress={() => setStep(3)} disabled={!operator} />
          )}
        </>
      ) : null}

      {step === 3 && phoneE164 && !verified ? <OtpStep phoneE164={phoneE164} createUser onVerified={onVerified} /> : null}

      {step === 4 ? (
        <>
          <AppText variant="title">{t('goalChooseTitle')}</AppText>
          <AppText muted>{t('goalChooseSubtitle')}</AppText>
          <GoalCategoryPicker form={form} showErrors={showErrors} />
          <Button
            testID="goal-cat-next"
            title={t('continue')}
            onPress={() => {
              setShowErrors(true);
              if (form.categoryDone) {
                setShowErrors(false);
                setStep(5);
              }
            }}
          />
        </>
      ) : null}

      {step === 5 && !createdGoal ? (
        <>
          <AppText variant="title">{t('amountPeriodTitle')}</AppText>
          <AppText muted>{t('autoDebitPrinciple')}</AppText>
          <GoalAmountPeriod form={form} />
          {goalError ? <Notice kind="error">{t(`err_${goalError}` as TranslationKey)}</Notice> : null}
          <Button testID="goal-submit" title={t('startSaving')} icon="checkmark" onPress={saveGoal} />
        </>
      ) : null}

      {step === 5 && createdGoal ? (
        <>
          <AppText variant="title">{t('autoDebitReadyTitle')}</AppText>
          <AppText muted>{t('autoDebitReadyBody')}</AppText>
          <SecureBadge />
          <DebitPreview goal={createdGoal} states={null} />
          <MandatePanel operator={operator} />
          <Button testID="goal-done" title={t('continue')} onPress={() => setStep(6)} />
        </>
      ) : null}

      {step === 6 ? <PinSetupStep onDone={onPinCreated} /> : null}
    </Screen>
  );
}
