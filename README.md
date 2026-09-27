# Sama-Xaalis — « Épargne sans y penser »

Application mobile d’épargne par objectifs pour le Sénégal (Wave, Orange Money). React Native + Expo SDK 57 + TypeScript, backend Supabase.

## Structure

```
App.tsx              racine : polices, thème, langue, routage par phase (onboarding / auth / verrouillé / déverrouillé)
types.ts             types métier (montants = entiers FCFA)
lib/                 logique : phone, money, otp, pin, goals, schedule, data (Supabase), mobileMoney, i18n, theme, session, navigation
components/          UI : ui.tsx, PinPad, Logo, GoalCard, ActivityRow, StatusBadge
screens/             Onboarding, Auth (connexion, inscription, OTP, PIN), Main (accueil, objectifs, activité, profil), GoalDetail, MobileMoney, Withdraw, Recovery
zzz/                 Icon, fonts, appAssets, legalLinks, biometrics, secureStore
supabase/            migrations SQL (RLS), Edge Functions, tests SQL
docs/                BACKEND, DEPLOYMENT, COMPLIANCE, captures de QA
store/ legal/        fiches store, déclarations de confidentialité, brouillons CGU / confidentialité
```

## Commandes

```bash
npm install
cp .env.example .env.local     # renseigner l’URL et la clé anon Supabase
npx expo start                 # ou « Tester sur ton téléphone » dans Bloxks
npm run verify                 # typecheck + tests + scan de secrets
npm run test:db                # migrations + RLS sur PostgreSQL local
```

## Ce qui fonctionne / ce qui manque

Voir `docs/DEPLOYMENT.md` (build, credentials, bloquants) et `docs/BACKEND.md` (Supabase, SMS, Wave / Orange Money).
Sans backend configuré, l’app le dit clairement et ne simule rien : pas d’OTP fixe, pas de SMS « envoyé » fictif, pas de portefeuille « connecté » ni de prélèvement simulé.
