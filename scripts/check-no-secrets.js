#!/usr/bin/env node
// Fails if a file tracked by git (or staged) looks like it contains a secret. Run: npm run check:secrets
const { execSync } = require('child_process');
const fs = require('fs');

const PATTERNS = [
  [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key'],
  [/"private_key"\s*:\s*"-----BEGIN/, 'Google service account key'],
  [/"type"\s*:\s*"service_account"/, 'Google service account file'],
  [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, 'JWT (Supabase key?)'],
  [/sb_secret_[A-Za-z0-9_-]{10,}/, 'Supabase secret key'],
  [/\bAC[a-f0-9]{32}\b/, 'Twilio Account SID'],
  [/\bSK[a-f0-9]{32}\b/, 'Twilio API key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key'],
  [/\bsk_(live|test)_[A-Za-z0-9]{16,}/, 'API secret key'],
  [/(SERVICE_ROLE_KEY|AUTH_TOKEN|API_SECRET|CLIENT_SECRET|MERCHANT_KEY|WEBHOOK_SECRET)\s*=\s*['"]?[A-Za-z0-9/+_-]{12,}/, 'assigned secret'],
];
const SKIP = [/^package-lock\.json$/, /\.(png|jpg|jpeg|ttf|otf|ico)$/, /^scripts\/check-no-secrets\.js$/];

const files = execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && !SKIP.some((re) => re.test(f)) && fs.existsSync(f));

const findings = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const [re, label] of PATTERNS) if (re.test(text)) findings.push(`${file}: ${label}`);
}
const forbiddenFiles = files.filter((f) => /(^|\/)\.env($|\.local$|\.production$)|\.p8$|\.p12$|\.jks$|\.keystore$|service-account.*\.json$/.test(f));
for (const f of forbiddenFiles) findings.push(`${f}: secret file must not be committed`);

if (findings.length) {
  console.error('Possible secrets found:\n' + findings.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
console.log(`No secrets found in ${files.length} files.`);
