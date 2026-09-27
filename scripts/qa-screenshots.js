// QA ONLY. Usage: node scripts/qa-screenshots.js <web-export-dir> <out-dir> static|flow  (needs `playwright`).
// Visual QA + end-to-end sign-up against an intercepted (fake) Supabase HTTP API.
// Mock data lives ONLY in this QA script, never in the app.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [, , webDir, outDir, mode] = process.argv;
fs.mkdirSync(outDir, { recursive: true });

function serve(dir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
      if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(dir, 'index.html');
      const ext = path.extname(p);
      const type = { '.html': 'text/html', '.js': 'application/javascript', '.ttf': 'font/ttf', '.png': 'image/png', '.json': 'application/json' }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      fs.createReadStream(p).pipe(res);
    });
    server.listen(0, () => resolve(server));
  });
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: 'u1', role: 'authenticated', exp: 4102444800, phone: '221771234567' }) + '.sig';
const user = { id: 'u1', aud: 'authenticated', role: 'authenticated', phone: '221771234567', app_metadata: {}, user_metadata: {}, created_at: '2026-09-27T00:00:00Z' };
const goals = [
  { id: 'g1', name: 'Fêtes (Tabaski, Korité…)', category: 'fete', target_amount: 250000, saved_amount: 87500, frequency: 'weekly', contribution_amount: 5000, status: 'active', operator: 'wave', locked_until: null, is_child_goal: false, child_birth_date: null, next_debit_at: '2026-10-04T08:00:00Z', ends_on: '2027-06-15', created_at: '2026-06-01T00:00:00Z' },
  { id: 'g2', name: 'Scolarité', category: 'scolarite', target_amount: 180000, saved_amount: 60000, frequency: 'monthly', contribution_amount: 15000, status: 'active', operator: 'orange_money', locked_until: null, is_child_goal: false, child_birth_date: null, next_debit_at: '2026-10-27T08:00:00Z', ends_on: '2027-09-30', created_at: '2026-01-10T00:00:00Z' },
  { id: 'g3', name: 'Urgences', category: 'urgence', target_amount: 42000, saved_amount: 42000, frequency: 'daily', contribution_amount: 500, status: 'active', operator: 'wave', locked_until: null, is_child_goal: false, child_birth_date: null, next_debit_at: null, ends_on: '2026-09-20', created_at: '2026-08-01T00:00:00Z' },
];
const activities = [
  ['2026-04-10', 12000], ['2026-05-10', 20000], ['2026-06-10', 25000], ['2026-07-10', 30000], ['2026-08-10', 45000], ['2026-09-10', 57500],
].map(([d, amount], i) => ({ id: `a${i}`, goal_id: 'g1', kind: 'debit', status: 'succeeded', amount, fee: 0, operator: 'wave', error_code: null, created_at: `${d}T08:00:00Z` }));

async function mockSupabase(page) {
  await page.route('https://qa-fake.supabase.co/**', async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (p === '/auth/v1/otp') return json(200, {});
    if (p === '/auth/v1/verify') return json(200, { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r1', user });
    if (p === '/auth/v1/user') return json(200, user);
    if (p === '/rest/v1/profiles' && route.request().method() === 'GET') return json(200, { user_id: 'u1', full_name: 'Awa Diop', phone_e164: '+221771234567', id_type: 'cni_cedeao', id_number: 'AB12345' });
    if (p === '/rest/v1/profiles') return json(201, null);
    if (p === '/rest/v1/goals' && route.request().method() === 'POST') return json(201, { ...goals[1], id: 'g9', saved_amount: 0, ...JSON.parse(route.request().postData() || '{}') });
    if (p === '/rest/v1/goals') return json(200, goals);
    if (p === '/rest/v1/activities') return json(200, activities);
    if (p === '/rest/v1/audit_logs') return json(201, null);
    if (p.startsWith('/functions/v1/mobile-money')) return json(501, { code: 'integration_not_configured' });
    return json(404, {});
  });
}

const DEVICES = {
  se: { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 },
  large: { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3 },
};

(async () => {
  const server = await serve(webDir);
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errors = [];

  async function open(device, prefs, scheme = 'light') {
    const ctx = await browser.newContext({ ...DEVICES[device], colorScheme: scheme, locale: 'fr-SN' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    if (prefs) await page.addInitScript((p) => localStorage.setItem('sx.prefs.v1', JSON.stringify(p)), prefs);
    await mockSupabase(page);
    await page.goto(base);
    await page.waitForTimeout(1500);
    return { ctx, page };
  }
  const shot = async (page, name) => {
    await page.screenshot({ path: path.join(outDir, `${name}.png`) });
    console.log('shot', name);
  };
  const noHScroll = async (page, name) => {
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 0) errors.push(`${name}: horizontal overflow ${over}px`);
  };

  if (mode === 'static') {
    let { ctx, page } = await open('se', null);
    await shot(page, '01-onboarding-se-light'); await noHScroll(page, 'onboarding');
    await ctx.close();
    ({ ctx, page } = await open('se', { onboardingDone: true }));
    await shot(page, '02-login-se-light'); await noHScroll(page, 'login-se');
    await ctx.close();
    ({ ctx, page } = await open('large', { onboardingDone: true, theme: 'dark' }, 'dark'));
    await shot(page, '03-login-large-dark');
    await ctx.close();
    ({ ctx, page } = await open('se', { onboardingDone: true, language: 'en' }));
    await shot(page, '04-login-se-english');
    await ctx.close();
    ({ ctx, page } = await open('se', { onboardingDone: true }));
    await page.getByText('Création de compte').click();
    await page.waitForTimeout(300);
    await shot(page, '05-signup-phone-se'); await noHScroll(page, 'signup');
    await ctx.close();
  } else {
    // Full sign-up flow against the intercepted backend, then the dashboard.
    for (const [device, scheme] of [['se', 'light'], ['large', 'dark']]) {
      const { ctx, page } = await open(device, { onboardingDone: true, theme: scheme }, scheme);
      await page.getByText('Création de compte').click();
      await page.getByLabel('Numéro de téléphone').fill('771234567');
      await page.getByText('J’accepte les conditions générales').click();
      await page.getByText('Continuer').click();
      await page.waitForTimeout(500);
      // Production web build: the account check is not configured, so the user picks the wallet.
      await page.getByRole('radio', { name: 'Wave' }).click();
      await shot(page, `06-account-check-${device}-${scheme}`);
      await page.getByText('Continuer').click();
      await page.getByText('Recevoir le code par SMS').click();
      await page.waitForTimeout(500);
      await shot(page, `07-otp-${device}-${scheme}`);
      await page.getByLabel('Code reçu par SMS').fill('123456');
      await page.getByText('Vérifier', { exact: true }).click();
      await page.waitForTimeout(800);
      await page.getByLabel('Scolarité').click();
      await shot(page, `08-goal-choice-${device}-${scheme}`); await noHScroll(page, `goal-choice-${device}`);
      await page.getByText('Continuer').click();
      await page.getByLabel('Montant de chaque prélèvement (FCFA)').fill('2500');
      await page.getByLabel('Mois suivant').click();
      await page.getByLabel('Mois suivant').click();
      await page.locator('[data-testid$="-15"]').first().click();
      await page.waitForTimeout(300);
      await shot(page, `09-amount-period-${device}-${scheme}`); await noHScroll(page, `amount-${device}`);
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(300);
      await shot(page, `10-plan-${device}-${scheme}`);
      await page.getByText('Lancer mon épargne').click();
      await page.waitForTimeout(800);
      await shot(page, `11-scheduled-${device}-${scheme}`);
      await page.getByText('Continuer').click();
      for (const d of '25802580') {
        await page.getByLabel(d, { exact: true }).click();
        await page.waitForTimeout(40);
      }
      await page.waitForTimeout(1500);
      await shot(page, `13-dashboard-${device}-${scheme}`); await noHScroll(page, `dashboard-${device}`);
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(300);
      await shot(page, `14-dashboard-scrolled-${device}-${scheme}`);
      await page.mouse.wheel(0, -2000);
      await page.getByText('Retirer', { exact: true }).first().click();
      await page.waitForTimeout(800);
      await page.getByLabel('Montant à retirer (FCFA)').fill('42000');
      await page.waitForTimeout(300);
      await shot(page, `15-withdraw-${device}-${scheme}`);
      await page.getByLabel('Retour').click();
      await page.getByLabel('Profil').click();
      await page.waitForTimeout(500);
      await shot(page, `16-profile-${device}-${scheme}`);
      await ctx.close();
    }
  }
  await browser.close();
  server.close();
  console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'NO PAGE ERRORS');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
