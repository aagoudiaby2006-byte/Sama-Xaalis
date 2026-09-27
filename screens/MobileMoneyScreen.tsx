import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import type { Activity, Operator, OperatorState } from '../types';
import { useI18n, type TranslationKey } from '../lib/i18n';
import { useTheme } from '../lib/theme';
import { useNav } from '../lib/navigation';
import { useSession } from '../lib/session';
import {
  OPERATORS,
  OPERATOR_BRAND,
  canDebit,
  displayState,
  emptyOperatorState,
  fetchOperatorStates,
  requestMandate,
  revokeMandate,
  startConnection,
  type OperatorDisplayState,
} from '../lib/mobileMoney';
import { listActivities, logAudit, type DataError } from '../lib/data';
import { formatPhoneInput, normalizeSenegalPhone, SENEGAL_DIAL_CODE } from '../lib/phone';
import { AppText, Button, Card, ConfirmDialog, Header, Loading, Notice, Row, Screen, TextField } from '../components/ui';
import { StatusBadge, type BadgeTone } from '../components/StatusBadge';
import { ActivityRow } from '../components/ActivityRow';
import { Icon } from '../zzz/Icon';

const STATE_TONE: Record<OperatorDisplayState, BadgeTone> = {
  integration_missing: 'warning',
  not_connected: 'neutral',
  connecting: 'info',
  connected: 'success',
  mandate_pending: 'warning',
  mandate_refused: 'danger',
  mandate_expired: 'warning',
  error: 'danger',
};

/** Loads operator states from the server. On failure, every operator is shown as not available. */
export function useOperatorStates() {
  const [states, setStates] = useState<OperatorState[] | null>(null);
  const [error, setError] = useState<DataError | null>(null);
  const reload = useCallback(async () => {
    const res = await fetchOperatorStates();
    if (res.ok) {
      setStates(res.data);
      setError(null);
    } else {
      setStates(OPERATORS.map(emptyOperatorState));
      setError(res.error);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { states, error, reload, setStates };
}

function OperatorBadge({ state }: { state: OperatorState }) {
  const { t } = useI18n();
  const d = displayState(state);
  return <StatusBadge label={t(`mmState_${d}`)} tone={STATE_TONE[d]} />;
}

function OperatorChoice({ state, selected, onPress }: { state: OperatorState; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  const brand = OPERATOR_BRAND[state.operator];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={brand.name}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: theme.radius.md,
        borderWidth: 2,
        borderColor: selected ? theme.colors.primary : theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: brand.color, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="wallet-outline" color="#FFFFFF" size={22} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <AppText weight="semibold">{brand.name}</AppText>
        <OperatorBadge state={state} />
      </View>
      <Icon name={selected ? 'radio-button-on' : 'radio-button-off'} color={selected ? theme.colors.primary : theme.colors.textMuted} />
    </Pressable>
  );
}

async function openOperatorPage(url: string | null) {
  if (url && url.startsWith('https://')) await WebBrowser.openBrowserAsync(url);
}

/** Choose Wave / Orange Money and start the official authentication (sign-up step 3 and Mobile Money screen). */
export function OperatorConnectionPanel({
  phoneE164,
  selected,
  onSelect,
}: {
  phoneE164: string;
  selected: Operator | null;
  onSelect: (op: Operator) => void;
}) {
  const { t } = useI18n();
  const { states, error, reload } = useOperatorStates();
  const [phoneInput, setPhoneInput] = useState(phoneE164.replace(SENEGAL_DIAL_CODE, ''));
  const [phoneError, setPhoneError] = useState(false);
  const [actionError, setActionError] = useState<DataError | null>(null);

  if (!states) return <Loading />;
  const current = selected ? states.find((s) => s.operator === selected) ?? null : null;
  const brandName = selected ? OPERATOR_BRAND[selected].name : '';

  const connect = async () => {
    if (!selected) return;
    const e164 = normalizeSenegalPhone(phoneInput);
    if (!e164) return setPhoneError(true);
    setPhoneError(false);
    const res = await startConnection(selected, e164);
    if (!res.ok) return setActionError(res.error);
    setActionError(null);
    logAudit('mm_connect_started', { operator: selected });
    await openOperatorPage(res.data.authUrl);
    await reload();
  };

  return (
    <View style={{ gap: 14 }}>
      <AppText variant="title">{t('mmTitle')}</AppText>
      <AppText muted>{t('mmSubtitle')}</AppText>
      {error && error !== 'integration_not_configured' ? <Notice kind="warning">{t(`err_${error}` as TranslationKey)}</Notice> : null}
      <AppText variant="label">{t('mmChoose')}</AppText>
      {states.map((s) => (
        <OperatorChoice key={s.operator} state={s} selected={s.operator === selected} onPress={() => onSelect(s.operator)} />
      ))}
      {current && !current.integrationAvailable ? (
        <Notice kind="warning" title={t('mmIntegrationMissing')}>
          {t('mmIntegrationMissingBody', { operator: brandName })}
        </Notice>
      ) : null}
      {current && current.integrationAvailable && current.connection !== 'connected' ? (
        <>
          <TextField
            label={t('mmPhoneLabel', { operator: brandName })}
            prefix={SENEGAL_DIAL_CODE}
            keyboardType="phone-pad"
            value={formatPhoneInput(phoneInput)}
            onChangeText={setPhoneInput}
            error={phoneError ? t('phoneInvalid') : null}
            help={t('mmOfficialAuth', { operator: brandName })}
          />
          <Button title={t('mmConnect', { operator: brandName })} icon="open-outline" onPress={connect} />
        </>
      ) : null}
      {actionError ? <Notice kind="error">{t(`err_${actionError}` as TranslationKey)}</Notice> : null}
    </View>
  );
}

/** Debit authorization (mandate). Only the operator's official page can grant it. */
export function MandatePanel({ operator }: { operator: Operator | null }) {
  const { t } = useI18n();
  const { states, reload } = useOperatorStates();
  const [actionError, setActionError] = useState<DataError | null>(null);

  if (!operator) {
    return (
      <View style={{ gap: 14 }}>
        <AppText variant="title">{t('mandateTitle')}</AppText>
        <Notice kind="info">{t('mandateNoOperator')}</Notice>
      </View>
    );
  }
  if (!states) return <Loading />;
  const state = states.find((s) => s.operator === operator) ?? emptyOperatorState(operator);
  const name = OPERATOR_BRAND[operator].name;
  const canRequest = state.integrationAvailable && state.connection === 'connected' && state.mandate !== 'active';

  const request = async () => {
    const res = await requestMandate(operator);
    if (!res.ok) return setActionError(res.error);
    setActionError(null);
    logAudit('mandate_requested', { operator });
    await openOperatorPage(res.data.authUrl);
    await reload();
  };

  return (
    <View style={{ gap: 14 }}>
      <AppText variant="title">{t('mandateTitle')}</AppText>
      <AppText muted>{t('mandateBody', { operator: name })}</AppText>
      <Row>
        <AppText weight="medium">{name}</AppText>
        <OperatorBadge state={state} />
      </Row>
      {canRequest ? (
        <Button title={t('mandateRequest', { operator: name })} icon="open-outline" onPress={request} />
      ) : canDebit(state) ? null : (
        <Notice kind="warning">{t('mandateUnavailable', { operator: name })}</Notice>
      )}
      {actionError ? <Notice kind="error">{t(`err_${actionError}` as TranslationKey)}</Notice> : null}
    </View>
  );
}

export function MobileMoneyScreen() {
  const { t } = useI18n();
  const nav = useNav();
  const { account } = useSession();
  const { states, error, reload } = useOperatorStates();
  const [selected, setSelected] = useState<Operator | null>(null);
  const [changing, setChanging] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<Operator | null>(null);
  const [history, setHistory] = useState<Activity[] | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await listActivities(undefined, 100);
      setHistory(res.ok ? res.data : []);
    })();
  }, []);

  const doRevoke = async () => {
    if (!revokeTarget) return;
    const res = await revokeMandate(revokeTarget);
    setRevokeTarget(null);
    if (!res.ok) return setMessage({ kind: 'error', text: t(`err_${res.error}` as TranslationKey) });
    logAudit('mandate_revoked', { operator: revokeTarget });
    setMessage({ kind: 'success', text: t('mmRevoked') });
    await reload();
  };

  return (
    <Screen header={<Header title={t('mmTitle')} onBack={nav.pop} />}>
      {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}
      {!states ? <Loading /> : null}
      {error ? <Notice kind="warning">{t('mmStatusUnknown')}</Notice> : null}
      {states?.map((s) => {
        const name = OPERATOR_BRAND[s.operator].name;
        const opHistory = (history ?? []).filter((a) => a.operator === s.operator);
        return (
          <Card key={s.operator}>
            <Row style={{ justifyContent: 'space-between' }}>
              <AppText variant="heading">{name}</AppText>
              <OperatorBadge state={s} />
            </Row>
            {!s.integrationAvailable ? (
              <Notice kind="warning" title={t('mmIntegrationMissing')}>
                {t('mmIntegrationMissingBody', { operator: name })}
              </Notice>
            ) : null}
            {s.integrationAvailable ? (
              <>
                <Button
                  kind="secondary"
                  title={s.connection === 'connected' ? t('mmChangeAccount') : t('mmConnect', { operator: name })}
                  onPress={() => {
                    setSelected(s.operator);
                    setChanging(true);
                  }}
                />
                {s.mandate === 'active' || s.mandate === 'pending' ? (
                  <Button kind="danger" title={t('mmRevoke')} onPress={() => setRevokeTarget(s.operator)} />
                ) : null}
              </>
            ) : null}
            <AppText variant="label" style={{ marginTop: 4 }}>
              {t('mmHistory')}
            </AppText>
            {history === null ? <Loading /> : opHistory.length === 0 ? <AppText muted>{t('mmNoHistory')}</AppText> : null}
            {opHistory.slice(0, 5).map((a) => (
              <ActivityRow key={a.id} activity={a} />
            ))}
          </Card>
        );
      })}
      {changing && account ? (
        <Card>
          <OperatorConnectionPanel phoneE164={account.phoneE164} selected={selected} onSelect={setSelected} />
          <MandatePanel operator={selected} />
        </Card>
      ) : null}
      <ConfirmDialog
        visible={revokeTarget !== null}
        title={t('mmRevoke')}
        body={t('mmRevokeConfirm', { operator: revokeTarget ? OPERATOR_BRAND[revokeTarget].name : '' })}
        confirmLabel={t('confirm')}
        danger
        onCancel={() => setRevokeTarget(null)}
        onConfirm={doRevoke}
      />
    </Screen>
  );
}
