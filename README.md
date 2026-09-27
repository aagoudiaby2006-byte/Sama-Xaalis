# Sama-Xaalis — « Épargne sans y penser »

Application mobile d’épargne par objectifs pour le Sénégal (Wave, Orange Money). React Native + Expo SDK 57 + TypeScript, backend Supabase.

## Principe

Le prélèvement automatique est le principe même de l’app : l’utilisateur choisit **combien** (minimum 500 FCFA) et **jusqu’à quand** (calendrier), puis l’épargne se fait toute seule sur son compte Wave ou Orange Money. À la fin de la période, il retire son argent (frais de service : 1 %).

Inscription : numéro (+221) → vérification du compte Wave / Orange Money → code SMS → objectif (6 proposés + Autre) → montant et période → code secret. Pas de barre de menu en bas : tout part de l’accueil, flèche de retour en haut à gauche, déconnexion dans le profil.

## Structure

```
App.tsx              racine : polices, thème, langue, routage par phase (onboarding / auth / verrouillé / déverrouillé)
types.ts             types métier (montants = entiers FCFA)
lib/                 logique : phone, money, otp, pin, goals, schedule, data (Supabase), mobileMoney, i18n, theme, session, navigation
components/          UI : ui.tsx, PinPad, Logo, GoalCard, GoalForm, Calendar, Finance (logos, badge, graphique), ActivityRow, StatusBadge
services/paiement.ts placeholders Wave / Orange Money / SMS (verifierNumero, initierPrelevement, envoyerRetrait, envoyerOTP)
screens/             Onboarding, Auth (connexion, inscription en 6 étapes, OTP, PIN), Main (accueil, historique, profil), GoalDetail, MobileMoney, Withdraw, Recovery
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
