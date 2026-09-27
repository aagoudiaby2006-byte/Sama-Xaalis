import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import type { Activity, Goal, Language, OperatorState, Profile, ThemePreference } from '../types';
import { formatDate, useI18n, type TranslationKey } from '../lib/i18n';
import { useTheme } from '../lib/theme';
import { useNav, type Tab } from '../lib/navigation';
import { useSession } from '../lib/session';
import { isBackendConfigured } from '../lib/config';
import { deleteAccount, fetchProfile, listActivities, listGoals, type DataError } from '../lib/data';
import { formatFcfa } from '../lib/money';
import { maskPhone } from '../lib/phone';
import { OPERATOR_BRAND, canDebit, displayState } from '../lib/mobileMoney';
import { isBiometricAvailable, isBiometricEnabled, setBiometricEnabled } from '../zzz/biometrics';
import { openLegalLink, type LegalLink } from '../zzz/legalLinks';
import { Icon, type IconName } from '../zzz/Icon';
import {
  AppText,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
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
// Home
// ---------------------------------------------------------------------------

function HomeScreen({ goTab }: { goTab: (tab: Tab) => void }) {
  const { t } = useI18n();
  const theme = useTheme();
  const nav = useNav();
  const { prefs, updatePrefs } = useSession();
  const profile = useLoad<Profile | null>(fetchProfile);
  const goals = useLoad<Goal[]>(listGoals);
  const activity = useLoad<Activity[]>(() => listActivities(undefined, 5));
  const { states } = useOperatorStates();

  const goalList = goals.state.status === 'ok' ? goals.state.data : [];
  const live = goalList.filter((g) => g.status !== 'cancelled');
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
        <AppText variant="title">{name ? t('hello', { name }) : t('helloAnonymous')}</AppText>
        <IconButton icon="wallet-outline" label={t('mmTitle')} onPress={() => nav.push({ name: 'mobileMoney' })} />
      </Row>

      {!isBackendConfigured() ? <Notice kind="warning">{t('backendMissingBanner')}</Notice> : null}

      <View style={{ backgroundColor: theme.colors.hero, borderRadius: theme.radius.lg, padding: 20, gap: 8 }}>
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
        <AppText variant="display" color={theme.colors.onHero}>
          {goals.state.status === 'ok' ? (prefs.hideAmounts ? '••••••' : formatFcfa(total)) : '—'}
        </AppText>
        <AppText variant="caption" color={theme.colors.onHero}>
          {`${t('activeGoals')} : ${active.length}`}
        </AppText>
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
              <AppText weight="medium">{OPERATOR_BRAND[s.operator].name}</AppText>
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

      <SectionTitle title={t('activeGoals')} action={{ label: t('seeAll'), onPress: () => goTab('goals') }} />
      {goals.state.status === 'loading' ? <Loading /> : null}
      {goals.state.status === 'error' ? <ErrorNotice error={goals.state.error} onRetry={goals.reload} /> : null}
      {goals.state.status === 'ok' && active.length === 0 ? <EmptyState icon="flag-outline" title={t('goalsEmptyTitle')} body={t('goalsEmptyBody')} /> : null}
      {active.slice(0, 3).map((g) => (
        <GoalCard key={g.id} goal={g} hideAmounts={prefs.hideAmounts} onPress={() => nav.push({ name: 'goalDetail', goalId: g.id })} />
      ))}

      <SectionTitle title={t('recentActivity')} action={{ label: t('seeAll'), onPress: () => goTab('activity') }} />
      <Card>
        {activity.state.status === 'loading' ? <Loading /> : null}
        {activity.state.status === 'error' ? <ErrorNotice error={activity.state.error} /> : null}
        {activity.state.status === 'ok' && activity.state.data.length === 0 ? <AppText muted>{t('activityEmpty')}</AppText> : null}
        {activity.state.status === 'ok'
          ? activity.state.data.map((a) => <ActivityRow key={a.id} activity={a} hideAmounts={prefs.hideAmounts} />)
          : null}
      </Card>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

function GoalsScreen() {
  const { t } = useI18n();
  const nav = useNav();
  const { prefs } = useSession();
  const goals = useLoad<Goal[]>(listGoals);
  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <AppText variant="title">{t('goalsTitle')}</AppText>
        <IconButton icon="add-circle-outline" label={t('newGoal')} onPress={() => nav.push({ name: 'goalNew' })} />
      </Row>
      {goals.state.status === 'loading' ? <Loading /> : null}
      {goals.state.status === 'error' ? <ErrorNotice error={goals.state.error} onRetry={goals.reload} /> : null}
      {goals.state.status === 'ok' && goals.state.data.length === 0 ? (
        <>
          <EmptyState icon="flag-outline" title={t('goalsEmptyTitle')} body={t('goalsEmptyBody')} />
          <Button title={t('newGoal')} icon="add" onPress={() => nav.push({ name: 'goalNew' })} />
        </>
      ) : null}
      {goals.state.status === 'ok'
        ? goals.state.data.map((g) => (
            <GoalCard key={g.id} goal={g} hideAmounts={prefs.hideAmounts} onPress={() => nav.push({ name: 'goalDetail', goalId: g.id })} />
          ))
        : null}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

function ActivityScreen() {
  const { t } = useI18n();
  const { prefs } = useSession();
  const activity = useLoad<Activity[]>(() => listActivities(undefined, 100));
  return (
    <Screen>
      <AppText variant="title">{t('activityTitle')}</AppText>
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

function ProfileScreen() {
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
    <Screen>
      <AppText variant="title">{t('profileTitle')}</AppText>

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

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const TABS: { tab: Tab; icon: IconName; iconActive: IconName; label: TranslationKey }[] = [
  { tab: 'home', icon: 'home-outline', iconActive: 'home', label: 'tabHome' },
  { tab: 'goals', icon: 'flag-outline', iconActive: 'flag', label: 'tabGoals' },
  { tab: 'activity', icon: 'list-outline', iconActive: 'list', label: 'tabActivity' },
  { tab: 'profile', icon: 'person-outline', iconActive: 'person', label: 'tabProfile' },
];

export function MainTabs({ tab }: { tab: Tab }) {
  const theme = useTheme();
  const { t } = useI18n();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const goTab = (next: Tab) => nav.reset({ name: 'tabs', tab: next });

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ flex: 1 }}>
        {tab === 'home' ? <HomeScreen goTab={goTab} /> : null}
        {tab === 'goals' ? <GoalsScreen /> : null}
        {tab === 'activity' ? <ActivityScreen /> : null}
        {tab === 'profile' ? <ProfileScreen /> : null}
      </View>
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: 'row',
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        {TABS.map((item) => {
          const selected = item.tab === tab;
          const color = selected ? theme.colors.primary : theme.colors.textMuted;
          return (
            <Pressable
              key={item.tab}
              onPress={() => goTab(item.tab)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={t(item.label)}
              style={{ flex: 1, alignItems: 'center', gap: 2, minHeight: 48, justifyContent: 'center' }}
            >
              <Icon name={selected ? item.iconActive : item.icon} color={color} />
              <AppText variant="caption" weight={selected ? 'semibold' : 'regular'} color={color}>
                {t(item.label)}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
