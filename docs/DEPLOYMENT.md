# Build et publication (EAS, App Store, Google Play)

> **État actuel : rien n’a été construit ni envoyé aux stores.** Aucun credential Expo, Apple ou Google n’est disponible dans le dépôt ni dans l’environnement de travail. Les étapes ci-dessous exigent votre intervention.

## Identifiants de l’application — à confirmer AVANT la première build

| | Valeur actuelle | Remarque |
|---|---|---|
| Nom | Sama-Xaalis | |
| iOS bundle identifier | `sn.samaxaalis.app` | **Définitif après le premier envoi à Apple.** Si vous possédez un autre domaine, changez-le maintenant dans `app.json`. |
| Android package | `sn.samaxaalis.app` | **Définitif après le premier envoi à Google Play.** |
| Version | 1.0.0 | `app.json` → `expo.version` |
| Build number / versionCode | gérés par EAS (`appVersionSource: remote`, `autoIncrement`) | valeurs initiales 1 |

## Variables d’environnement

| Variable | Où | Contenu | Secret ? |
|---|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | EAS (preview, production) | URL du projet Supabase | Non (public) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | EAS (preview, production) | clé `anon` Supabase | Non (public, protégée par RLS) |
| `EXPO_PUBLIC_PRIVACY_URL` | EAS | URL https de la politique de confidentialité | Non |
| `EXPO_PUBLIC_TERMS_URL` | EAS | URL https des CGU | Non |
| `EXPO_PUBLIC_SUPPORT_URL` / `EXPO_PUBLIC_SUPPORT_EMAIL` | EAS | page ou e-mail de support | Non |
| `EXPO_TOKEN` | CI uniquement | jeton Expo (expo.dev → Account settings → Access tokens) | **Oui** |
| Clé SMS (Twilio / Vonage / …) | Dashboard Supabase → Auth → Phone | credentials du fournisseur | **Oui** |
| `WAVE_API_KEY`, `WAVE_WEBHOOK_SECRET` | `supabase secrets set` | API Wave | **Oui** |
| `ORANGE_MONEY_CLIENT_ID`, `ORANGE_MONEY_CLIENT_SECRET`, `ORANGE_MONEY_MERCHANT_KEY` | `supabase secrets set` | API Orange Money | **Oui** |
| Clé API App Store Connect (.p8, Key ID, Issuer ID) | EAS (`eas credentials`) | soumission iOS | **Oui** |
| Compte de service Google Play (JSON) | EAS (`eas credentials`) | soumission Android | **Oui** |

Aucune de ces valeurs secrètes ne doit être écrite dans le dépôt. `npm run check:secrets` vérifie les fichiers suivis par git.

## Credentials à créer

1. **Compte Expo** : https://expo.dev/signup, puis `npx eas-cli@latest login` et `npx eas-cli@latest init` (ajoute `extra.eas.projectId` à `app.json`).
2. **Apple Developer Program** (99 USD/an) : https://developer.apple.com/programs/ — accepter les accords dans App Store Connect (*Business → Agreements*).
   - Créer l’app dans App Store Connect (*Apps → +*) avec le bundle `sn.samaxaalis.app`.
   - Clé API : App Store Connect → *Users and Access → Integrations → App Store Connect API* → rôle *App Manager* → télécharger le `.p8` (une seule fois), noter **Key ID** et **Issuer ID**. **Team ID** : developer.apple.com → *Membership*.
   - EAS gère certificats et profils : `npx eas-cli@latest credentials -p ios` (ne supprimez aucun certificat existant).
3. **Google Play Console** (25 USD, une fois) : https://play.google.com/console — créer l’app, compléter la vérification d’identité développeur.
   - Compte de service : Google Cloud Console → *IAM → Service accounts* → créer → clé JSON ; puis Play Console → *Users and permissions* → inviter ce compte avec les droits de publication.
   - Téléverser le JSON dans EAS : `npx eas-cli@latest credentials -p android` → *Google Service Account*.
   - **Le tout premier AAB doit être téléversé manuellement** dans Play Console (piste *Internal testing*) : l’API refuse l’envoi tant que l’app n’a jamais reçu de build.

## Commandes

Dans Bloxks : le build et l’envoi se lancent avec le bouton **« Publier »**, et le test sur téléphone avec **« Tester sur ton téléphone »** (QR code). Hors Bloxks, les commandes officielles sont :

```bash
npm run verify                                   # typecheck + tests + scan de secrets
npx eas-cli@latest build -p all --profile preview      # APK + build iOS interne pour tester
npx eas-cli@latest build -p all --profile production   # AAB + IPA de production
npx eas-cli@latest submit -p ios --latest             # → TestFlight
npx eas-cli@latest submit -p android --latest         # → Google Play, piste internal (brouillon)
```

## Ce qui a été vérifié ici (sans credentials)

- `tsc --noEmit` : OK. `jest` : 87 tests OK. `npm run test:db` : migrations + RLS OK sur PostgreSQL 16.
- `expo export -p ios -p android` : bundles Hermes générés sans erreur.
- `expo prebuild` (copie temporaire) : projets natifs générés ; permissions Android finales `INTERNET`, `USE_BIOMETRIC`, `USE_FINGERPRINT`, `VIBRATE` ; SMS, caméra, localisation, contacts explicitement bloqués ; Face ID justifié en français ; `ITSAppUsesNonExemptEncryption=false` ; manifeste de confidentialité iOS généré.
- **Non vérifié** : compilation native Xcode/Gradle (faite par EAS), exécution sur appareil réel, envoi réel d’un SMS, TestFlight, Google Play.

## Bloquants de publication

La publication **ne doit pas** avoir lieu tant que :

1. le backend Supabase et un fournisseur SMS réel ne sont pas configurés (sinon aucune inscription possible — rejet quasi certain par Apple, règle 2.1) ;
2. les pages publiques Politique de confidentialité, CGU et Support ne sont pas en ligne ;
3. le statut réglementaire n’est pas confirmé (voir `docs/COMPLIANCE.md`) ; Apple (règle 3.1.5 / 5.1.1) et Google (règles *Financial services*) exigent une app fintech émise par une entité autorisée ou en partenariat avec une entité agréée ;
4. un compte de démonstration n’est pas prévu pour la revue Apple (voir `store/review-notes.md`).
