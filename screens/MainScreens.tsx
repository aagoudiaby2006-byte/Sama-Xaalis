import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Constants from 'expo-constants';
import type { Activity, Goal, Language, OperatorState, Profile, ThemePreference } from '../types';
import { formatDate, useI18n, type TranslationKey } from '../lib/i18n';
import { useTheme } from '../lib/theme';
import { useNav } from '../lib/navigation';
import { useSession } from '../lib/session';
import { isBackendConfigured } from '../lib/config';
import { deleteAccount, fetchProfile, listActivities, listGoals, type DataError } from '../lib/data';
import { formatFcfa } from '../lib/money';
import { maskPhone } from '../lib/phone';
import { OPERATOR_BRAND, canDebit, displayState } from '../lib/mobileMoney';
import { isBiometricAvailable, isBiometricEnabled, setBiometricEnabled } from '../zzz/biometrics';
import { openLegalLink, type LegalLink } from '../zzz/legalLinks';
import {
  AppText,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Header,
  IconButton,
  KeyValue,
  ListItem,
  Loading,
  Notice,
  Row,
  Screen,
  Segmented,
  ToggleRow,
} from '../components/ui';
import { GoalCard } from '../components/GoalCard';
import { ActivityRow } from '../components/ActivityRow';
import { StatusBadge } from '../components/StatusBadge';
import { LogoMark } from '../components/Logo';
import { OperatorLogo, SavingsChart, SecureBadge } from '../components/Finance';
import { useOperatorStates } from './MobileMoneyScreen';

type Loaded<T> = { status: 'loading' } | { status: 'ok'; data: T } | { status: 'error'; error: DataError };

function useLoad<T>(loader: () => Promise<{ ok: true; data: T } | { ok: false; error: DataError }>) {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' });
  const reload = useCallback(async () => {
    setState({ status: 'loading' });
    const res = await loader();
    setState(res.ok ? { status: 'ok', data: res.data } : { status: 'error', error: res.error });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { state, reload };
}

function ErrorNotice({ error, onRetry }: { error: DataError; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <View style={{ gap: 8 }}>
      <Notice kind={error === 'not_configured' ? 'warning' : 'error'}>{t(`err_${error}` as TranslationKey)}</Notice>
      {onRetry && error !== 'not_configured' ? <Button kind="secondary" title={t('retry')} onPress={onRetry} /> : null}
    </View>
  );
}

function SectionTitle({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) {
  const theme = useTheme();
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
      <AppText variant="heading" accessibilityRole="header">
        {title}
      </AppText>
      {action ? (
        <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={10}>
          <AppText weight="semibold" color={theme.colors.primary}>
            {action.label}
          </AppText>
        </Pressable>
      ) : null}
    </Row>
  );
}

// ---------------------------------------------------------------------------
// Debit preview: everything the user must see before a debit
// ---------------------------------------------------------------------------

export function DebitPreview({ goal, states }: { goal: Goal; states: OperatorState[] | null }) {
  const { t, lang } = useI18n();
  const opState = goal.operator ? states?.find((s) => s.operator === goal.operator) ?? null : null;
  const authorized = opState ? canDebit(opState) : false;
  return (
    <Card>
      <AppText variant="heading">{t('debitPreviewTitle')}</AppText>
      <KeyValue label={t('debitGoal')} value={goal.name} />
      <KeyValue label={t('debitAmount')} value={formatFcfa(goal.contributionAmount)} strong />
      <KeyValue
        label={t('debitDate')}
        value={authorized && goal.nextDebitAt && goal.status === 'active' ? formatDate(goal.nextDebitAt, lang) : t('debitNotScheduled')}
      />
      <KeyValue label={t('debitFrequency')} value={t(`freq_${goal.frequency}`)} />
      {goal.endsOn ? <KeyValue label={t('periodEnd')} value={formatDate(goal.endsOn, lang)} /> : null}
      <KeyValue label={t('debitOperator')} value={goal.operator ? OPERATOR_BRAND[goal.operator].name : t('goalOperatorNone')} />
      <KeyValue label={t('debitFees')} value={t('debitFeesUnknown')} />
      <KeyValue
        label={t('debitAuthorization')}
        value={opState ? t(`mmState_${displayState(opState)}`) : t('mmState_not_connected')}
      />
      <AppText variant="caption" muted>
        {t('debitCancellable')}
      </AppText>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Home: the only entry point (no bottom menu). Profile is reached from the top-right button.
// ---------------------------------------------------------------------------

export function HomeScreen() {
  const { t } = useI18n();
  const theme = useTheme();
  const nav = useNav();
  const { prefs, updatePrefs } = useSession();
  const profile = useLoad<Profile | null>(fetchProfile);
  const goals = useLoad<Goal[]>(listGoals);
  const activity = useLoad<Activity[]>(() => listActivities(undefined, 200));
  const { states } = useOperatorStates();

  const goalList = goals.state.status === 'ok' ? goals.state.data : [];
  const live = goalList.filter((g) => g.status !== 'cancelled' || g.savedAmount > 0);
  const total = live.reduce((sum, g) => sum + g.savedAmount, 0);
  const active = goalList.filter((g) => g.status === 'active');
  const next = active
    .filter((g) => g.nextDebitAt)
    .sort((a, b) => Date.parse(a.nextDebitAt ?? '') - Date.parse(b.nextDebitAt ?? ''))[0];
  const anyIntegration = states?.some((s) => s.integrationAvailable) ?? false;
  const anyConnected = states?.some((s) => s.connection === 'connected') ?? false;
  const anyDebit = states?.some(canDebit) ?? false;
  const name = profile.state.status === 'ok' && profile.state.data ? profile.state.data.fullName.split(' ')[0] : null;

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row style={{ flex: 1 }}>
          <LogoMark size={36} />
          <AppText variant="title" style={{ flex: 1 }} numberOfLines={1}>
            {name ? t('hello', { name }) : t('helloAnonymous')}
          </AppText>
        </Row>
        <IconButton icon="person-circle-outline" label={t('profileTitle')} onPress={() => nav.push({ name: 'profile' })} />
      </Row>

      {!isBackendConfigured() ? <Notice kind="warning">{t('backendMissingBanner')}</Notice> : null}

      <View style={{ backgroundColor: theme.colors.hero, borderRadius: theme.radius.lg, padding: 22, gap: 10 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <AppText color={theme.colors.onHero} weight="medium">
            {t('totalSaved')}
          </AppText>
          <IconButton
            icon={prefs.hideAmounts ? 'eye-off-outline' : 'eye-outline'}
            label={prefs.hideAmounts ? t('showAmount') : t('hideAmount')}
            color={theme.colors.onHero}
            onPress={() => updatePrefs({ hideAmounts: !prefs.hideAmounts })}
          />
        </Row>
        <AppText variant="display" color={theme.colors.onHero} numberOfLines={1}>
          {goals.state.status === 'ok' ? (prefs.hideAmounts ? '••••••' : formatFcfa(total)) : '—'}
        </AppText>
        <SecureBadge onDark />
        <Row style={{ marginTop: 8 }}>
          <View style={{ flex: 1 }}>
            <Button title={t('newGoal')} icon="add" onPress={() => nav.push({ name: 'goalNew' })} />
          </View>
          <View style={{ flex: 1 }}>
            <Button kind="secondary" title={t('withdraw')} icon="arrow-up" onPress={() => nav.push({ name: 'withdraw' })} />
          </View>
        </Row>
      </View>

      {states && !anyIntegration ? <Notice kind="warning">{t('alertMmIntegration')}</Notice> : null}
      {states && anyIntegration && !anyConnected ? <Notice kind="info">{t('alertNoOperator')}</Notice> : null}

      <SectionTitle title={t('walletStatus')} action={{ label: t('seeAll'), onPress: () => nav.push({ name: 'mobileMoney' }) }} />
      <Card>
        {states ? (
          states.map((s) => (
            <Row key={s.operator} style={{ justifyContent: 'space-between' }}>
              <Row style={{ flex: 1 }}>
                <OperatorLogo operator={s.operator} size={32} />
                <AppText weight="medium">{OPERATOR_BRAND[s.operator].name}</AppText>
              </Row>
              <StatusBadge label={t(`mmState_${displayState(s)}`)} tone={s.connection === 'connected' ? 'success' : 'warning'} />
            </Row>
          ))
        ) : (
          <Loading />
        )}
      </Card>

      <SectionTitle title={t('nextDebit')} />
      {next ? <DebitPreview goal={next} states={states} /> : <AppText muted>{t('noNextDebit')}</AppText>}
      {next && !anyDebit ? <Notice kind="info">{t('nextDebitNeedsMandate')}</Notice> : null}

      <SectionTitle title={t('chartTitle')} />
      <Card>
        {activity.state.status === 'ok' ? <SavingsChart activities={activity.state.data} hideAmounts={prefs.hideAmounts} /> : null}
        {activity.state.status === 'loading' ? <Loading /> : null}
        {activity.state.status === 'error' ? <ErrorNotice error={activity.state.error} /> : null}
      </Card>

      <SectionTitle title={t('goalsTitle')} />
      {goals.state.status === 'loading' ? <Loading /> : null}
      {goals.state.status === 'error' ? <ErrorNotice error={goals.state.error} onRetry={goals.reload} /> : null}
      {goals.state.status === 'ok' && live.length === 0 ? <EmptyState icon="flag-outline" title={t('goalsEmptyTitle')} body={t('goalsEmptyBody')} /> : null}
      {live.map((g) => (
        <GoalCard key={g.id} goal={g} hideAmounts={prefs.hideAmounts} onPress={() => nav.push({ name: 'goalDetail', goalId: g.id })} />
      ))}

      <SectionTitle title={t('recentActivity')} action={{ label: t('seeAll'), onPress: () => nav.push({ name: 'activity' }) }} />
      <Card>
        {activity.state.status === 'loading' ? <Loading /> : null}
        {activity.state.status === 'error' ? <ErrorNotice error={activity.state.error} /> : null}
        {activity.state.status === 'ok' && activity.state.data.length === 0 ? <AppText muted>{t('activityEmpty')}</AppText> : null}
        {activity.state.status === 'ok'
          ? activity.state.data.slice(0, 5).map((a) => <ActivityRow key={a.id} activity={a} hideAmounts={prefs.hideAmounts} />)
          : null}
      </Card>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export function ActivityScreen() {
  const { t } = useI18n();
  const nav = useNav();
  const { prefs } = useSession();
  const activity = useLoad<Activity[]>(() => listActivities(undefined, 100));
  return (
    <Screen header={<Header title={t('activityTitle')} onBack={nav.pop} />}>
      {activity.state.status === 'loading' ? <Loading /> : null}
      {activity.state.status === 'error' ? <ErrorNotice error={activity.state.error} onRetry={activity.reload} /> : null}
      {activity.state.status === 'ok' && activity.state.data.length === 0 ? <EmptyState icon="list-outline" title={t('activityEmpty')} /> : null}
      {activity.state.status === 'ok' && activity.state.data.length > 0 ? (
        <Card>
          {activity.state.data.map((a) => (
            <ActivityRow key={a.id} activity={a} hideAmounts={prefs.hideAmounts} />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Profile & settings
// ---------------------------------------------------------------------------

export function ProfileScreen() {
  const { t } = useI18n();
  const nav = useNav();
  const { prefs, updatePrefs, account, signOut, wipeEverything } = useSession();
  const profile = useLoad<Profile | null>(fetchProfile);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<DataError | null>(null);

  useEffect(() => {
    void (async () => {
      setBioAvailable(await isBiometricAvailable());
      setBioEnabled(await isBiometricEnabled());
    })();
  }, []);

  const open = async (link: LegalLink) => setLinkError(!(await openLegalLink(link)));

  const doDelete = async () => {
    const res = await deleteAccount();
    if (!res.ok) {
      setDeleteError(res.error);
      setConfirmDelete(false);
      return;
    }
    setConfirmDelete(false);
    await wipeEverything();
  };

  const version = Constants.expoConfig?.version ?? '—';

  return (
    <Screen header={<Header title={t('profileTitle')} onBack={nav.pop} />}>

      <Card>
        <AppText variant="heading">{t('account')}</AppText>
        {profile.state.status === 'ok' && profile.state.data ? <KeyValue label={t('fullName')} value={profile.state.data.fullName} /> : null}
        {profile.state.status === 'error' ? <ErrorNotice error={profile.state.error} /> : null}
        {account ? <KeyValue label={t('phone')} value={maskPhone(account.phoneE164)} /> : null}
        <ListItem icon="wallet-outline" label={t('mmTitle')} onPress={() => nav.push({ name: 'mobileMoney' })} />
      </Card>

      <Card>
        <AppText variant="heading">{t('security')}</AppText>
        <ListItem icon="keypad-outline" label={t('changePin')} onPress={() => nav.push({ name: 'changePin' })} />
        <ToggleRow
          label={t('biometrics')}
          help={bioAvailable ? undefined : t('biometricsUnavailable')}
          value={bioEnabled && bioAvailable}
          disabled={!bioAvailable}
          onChange={async (v) => {
            await setBiometricEnabled(v);
            setBioEnabled(v);
          }}
        />
      </Card>

      <Card>
        <AppText variant="heading">{t('preferences')}</AppText>
        <Segmented<Language>
          label={t('language')}
          options={[
            { value: 'fr', label: t('lang_fr') },
            { value: 'en', label: t('lang_en') },
          ]}
          value={prefs.language ?? null}
          onChange={(language) => updatePrefs({ language })}
        />
        <Segmented<ThemePreference>
          label={t('theme')}
          options={(['system', 'light', 'dark'] as const).map((v) => ({ value: v, label: t(`theme_${v}`) }))}
          value={prefs.theme}
          onChange={(theme) => updatePrefs({ theme })}
        />
        <ToggleRow
          label={t('notifications')}
          help={t('notificationsHelp')}
          value={prefs.notifications}
          onChange={(notifications) => updatePrefs({ notifications })}
        />
      </Card>

      <Card>
        <AppText variant="heading">{t('legal')}</AppText>
        <ListItem icon="document-text-outline" label={t('terms')} onPress={() => void open('terms')} />
        <ListItem icon="lock-closed-outline" label={t('privacy')} onPress={() => void open('privacy')} />
        <ListItem icon="help-buoy-outline" label={t('support')} onPress={() => void open('support')} />
        {linkError ? <Notice kind="warning">{t('linkNotConfigured')}</Notice> : null}
        <AppText variant="caption" muted>
          {t('disclaimer')}
        </AppText>
      </Card>

      <Card>
        {deleteError ? <ErrorNotice error={deleteError} /> : null}
        <ListItem icon="log-out-outline" label={t('logout')} onPress={() => setConfirmLogout(true)} />
        <ListItem icon="trash-outline" label={t('deleteAccount')} danger onPress={() => setConfirmDelete(true)} />
      </Card>

      <AppText variant="caption" muted center>
        {t('version', { v: version })}
      </AppText>

      <ConfirmDialog
        visible={confirmLogout}
        title={t('logout')}
        body={t('logoutConfirm')}
        confirmLabel={t('logout')}
        onCancel={() => setConfirmLogout(false)}
        onConfirm={async () => {
          setConfirmLogout(false);
          await signOut();
        }}
      />
      <ConfirmDialog
        visible={confirmDelete}
        title={t('deleteAccountTitle')}
        body={t('deleteAccountBody')}
        confirmLabel={t('deleteAccount')}
        requiredWord={t('deleteAccountWord')}
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={doDelete}
      />
    </Screen>
  );
}
