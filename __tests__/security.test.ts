// Static guarantees over the source tree.
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const SOURCE_DIRS = ['App.tsx', 'index.ts', 'types.ts', 'lib', 'components', 'screens', 'zzz', 'supabase/functions', 'supabase/migrations'];

function walk(p: string): string[] {
  const full = path.join(root, p);
  if (!fs.existsSync(full)) return [];
  if (fs.statSync(full).isFile()) return [full];
  return fs.readdirSync(full).flatMap((f) => walk(path.join(p, f)));
}

const files = SOURCE_DIRS.flatMap(walk).filter((f) => /\.(tsx?|sql)$/.test(f));
const read = (f: string) => fs.readFileSync(f, 'utf8');
/** Source without comments, so explanatory comments do not trigger the checks. */
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/--.*$/gm, '');

describe('security invariants', () => {
  it('scans a meaningful number of source files', () => {
    expect(files.length).toBeGreaterThan(25);
  });

  it('the fixed OTP / PIN code 2468 appears nowhere in the app or backend', () => {
    expect(files.filter((f) => read(f).includes('2468'))).toEqual([]);
  });

  it('expo-sms is not used (it only opens the SMS composer and cannot deliver an OTP)', () => {
    expect(files.filter((f) => /expo-sms|sendSMSAsync/.test(read(f)))).toEqual([]);
    const pkg = JSON.parse(read(path.join(root, 'package.json')));
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })).not.toContain('expo-sms');
  });

  it('no service-role key or provider secret is referenced from app code', () => {
    const appFiles = files.filter((f) => !f.includes(`${path.sep}supabase${path.sep}`));
    const bad = appFiles.filter((f) => /SERVICE_ROLE|service_role|WAVE_API_KEY|ORANGE_MONEY_CLIENT_SECRET|TWILIO|auth_token/i.test(code(f)));
    expect(bad).toEqual([]);
  });

  it('secrets never go to AsyncStorage: only lib/prefs.ts may use it, for UI preferences', () => {
    const users = files.filter((f) => read(f).includes('@react-native-async-storage/async-storage')).map((f) => path.relative(root, f));
    expect(users).toEqual([path.join('lib', 'prefs.ts')]);
    const prefsShape = read(path.join(root, 'lib', 'prefs.ts')).match(/export interface Prefs \{([\s\S]*?)\}/)?.[1] ?? '';
    expect(prefsShape).toContain('onboardingDone');
    expect(prefsShape).not.toMatch(/pin|token|session|otp|phone/i);
  });

  it('no console logging in the app (OTP / PIN / tokens can never leak to logs)', () => {
    const appFiles = files.filter((f) => !f.includes(`${path.sep}supabase${path.sep}`));
    expect(appFiles.filter((f) => /console\.(log|info|debug|warn|error)/.test(code(f)))).toEqual([]);
  });

  it('no WebView', () => {
    expect(files.filter((f) => /react-native-webview|<WebView/.test(read(f)))).toEqual([]);
  });

  it('every table with user data has RLS enabled and a user_id default auth.uid()', () => {
    const sql = files.filter((f) => f.endsWith('.sql')).map(read).join('\n');
    const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);
    for (const t of tables) expect(sql).toContain(`alter table public.${t} enable row level security`);
    for (const t of tables.filter((x) => x !== 'fee_schedules')) {
      const block = sql.slice(sql.indexOf(`create table public.${t}`), sql.indexOf(');', sql.indexOf(`create table public.${t}`)));
      expect([t, /user_id uuid (primary key|not null) default auth\.uid\(\)/.test(block)]).toEqual([t, true]);
    }
  });
});
