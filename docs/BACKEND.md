# Backend Sama-Xaalis (Supabase)

## Architecture

| Élément | Où | Rôle |
|---|---|---|
| Authentification | Supabase Auth, fournisseur **Phone** | Génère l’OTP aléatoire (6 chiffres), l’envoie par SMS, le stocke haché, l’expire, limite les envois et vérifications. |
| Données | Postgres + RLS (`supabase/migrations/`) | Profils, objectifs, activités (registre), connexions Mobile Money, autorisations de prélèvement, barèmes de frais, journaux d’audit. |
| `mobile-money` | Edge Function | État Wave / Orange Money, authentification officielle, mandat de prélèvement, révocation. |
| `withdraw` | Edge Function | Retrait : recalcul des frais côté serveur, idempotence, statut `pending` jusqu’à confirmation opérateur. |
| `delete-account` | Edge Function | Révoque les mandats, supprime les fichiers, supprime l’utilisateur (cascade sur toutes les tables). |

Il n’y a **pas** de table OTP dans `public` : les codes sont gérés par Supabase Auth (schéma `auth`), jamais exposés à l’app ni journalisés.

### Règles de sécurité appliquées par la base (testées par `npm run test:db`)

- RLS activé sur toutes les tables, politiques `user_id = auth.uid()`.
- `goals.saved_amount` n’est **pas** modifiable par l’app (privilèges par colonne) : seul le registre `activities`, écrit par le serveur, fait évoluer le solde, et uniquement quand un mouvement passe à `succeeded`.
- `activities`, `mobile_money_connections`, `debit_authorizations`, `fee_schedules` : lecture seule pour l’app. Un client ne peut jamais marquer un portefeuille « connecté », un mandat « actif » ni une transaction « réussie ».
- Période d’épargne (`goals.ends_on`, migration `20260928000000_goal_period.sql`) : obligatoire à la création (7 jours à ~5 ans), prolongeable mais jamais raccourcie ; `withdraw` refuse tout retrait avant la fin de la période. Le planificateur de prélèvements (à implémenter avec les intégrations) ne doit plus prélever après `ends_on`.
- Catégorie d’objectif (`goals.category`) : 6 objectifs proposés + `autre`.
- Épargne enfant (héritée, plus proposée dans l’app) : verrouillée par la base jusqu’aux 18 ans.
- Le numéro du profil est forcé au numéro vérifié par SMS (`auth.users.phone`).
- Idempotence des retraits : contrainte unique `(user_id, idempotency_key)`.
- Suppression de compte : `ON DELETE CASCADE` depuis `auth.users` sur toutes les tables.

## Mise en place (actions humaines)

1. **Créer le projet Supabase** : https://supabase.com/dashboard → *New project* (région proche du Sénégal, ex. `eu-west`).
2. **Appliquer le schéma** :
   ```bash
   npx supabase login
   npx supabase link --project-ref <REF_DU_PROJET>
   npx supabase db push
   ```
3. **Déployer les fonctions** :
   ```bash
   npx supabase functions deploy mobile-money withdraw delete-account
   ```
   `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont injectés automatiquement par Supabase dans les fonctions ; ne les copiez nulle part.
4. **Activer l’authentification par téléphone** : Dashboard → *Authentication → Sign In / Providers → Phone* :
   - activer *Phone* et *Enable phone confirmations* ;
   - choisir un fournisseur SMS officiel qui livre au Sénégal (+221) : Twilio, Vonage, MessageBird, Textlocal, ou un fournisseur local via un *Send SMS Hook* ;
   - *SMS OTP Expiry* : **300** s ; *SMS OTP Length* : **6** ;
   - modèle : `Sama-Xaalis : votre code est {{ .Code }}. Il expire dans 5 minutes. Ne le communiquez à personne.`
5. **Limites** : *Authentication → Rate Limits* : envois SMS/heure et vérifications OTP (voir `supabase/config.toml`).
6. **Clés publiques de l’app** : *Project Settings → API* → `Project URL` et clé `anon` (publique) → variables `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY` (EAS, environnements *preview* et *production*).

### Vérifier que l’envoi SMS fonctionne

Dans une build *preview* : Création de compte → saisir **votre** numéro → « Recevoir le code par SMS ». Le SMS doit arriver, et un code faux doit être refusé. Côté Supabase : *Authentication → Logs* montre l’envoi. Si le fournisseur n’est pas configuré, l’app affiche « La vérification SMS nécessite la configuration du service SMS » et n’affiche jamais « SMS envoyé ».

## Intégrations Wave et Orange Money — NON IMPLÉMENTÉES

`supabase/functions/_shared/operators.ts` contient deux adaptateurs **volontairement vides** (`IMPLEMENTED = false`). Tant qu’ils ne sont pas implémentés selon la documentation officielle des opérateurs **et** que leurs secrets ne sont pas définis, l’app affiche « Intégration à configurer », aucun compte ne peut être connecté et aucun prélèvement/retrait n’est possible.

Pour les activer, il faut obtenir :

| Opérateur | À obtenir | Secrets (Edge Functions) |
|---|---|---|
| Wave | Compte Wave Business, accès API, contrat marchand, produit de paiement récurrent / mandat si disponible, secret de webhook | `WAVE_API_KEY`, `WAVE_WEBHOOK_SECRET` |
| Orange Money | Contrat marchand Orange Money Sénégal (Sonatel), accès API (portail développeur Orange), clé marchand | `ORANGE_MONEY_CLIENT_ID`, `ORANGE_MONEY_CLIENT_SECRET`, `ORANGE_MONEY_MERCHANT_KEY` |

```bash
npx supabase secrets set WAVE_API_KEY=... WAVE_WEBHOOK_SECRET=...
```

Reste à développer avec les opérateurs : les webhooks de confirmation (passage `connecting → connected`, mandat `pending → active`, transaction `pending → succeeded/failed/refunded`) et l’ordonnanceur des prélèvements. Une question réglementaire est à valider : le prélèvement automatique récurrent sur un portefeuille Mobile Money exige le produit correspondant chez l’opérateur et un cadre légal (BCEAO / UEMOA).

## Barèmes de frais

Règle Sama-Xaalis : **frais de service de 1 % sur les retraits**, arrondis au franc supérieur. La migration `20260928000000_goal_period.sql` insère ce barème (`rate_bps = 100`) pour Wave et Orange Money ; l’app applique la même règle (`lib/money.ts`, `WITHDRAWAL_FEE_BPS`) et le serveur recalcule les frais avant tout retrait. Les frais éventuels des opérateurs sur les prélèvements restent à confirmer contractuellement.

## Tests de la base

```bash
npm run test:db   # nécessite PostgreSQL local ; applique les migrations sur une base jetable
```

## `services/paiement.ts` (placeholders)

`verifierNumero`, `initierPrelevement`, `envoyerRetrait` et `envoyerOTP` sont les points d’entrée prévus pour les API Wave, Orange Money et SMS. Ce sont des **placeholders** :

- en développement (`__DEV__`), ils renvoient des valeurs de test marquées `source: 'placeholder'` (l’app affiche alors « Mode test : résultat fictif ») ;
- dans un build de production, ils renvoient `source: 'non_configure'` et `success: false` : l’app affiche « Intégration à configurer » et ne simule jamais rien.

Seul `verifierNumero` est utilisé par l’app (étape 2 de l’inscription). Les prélèvements, retraits et SMS réels doivent être exécutés côté serveur (Edge Functions / Send SMS hook Supabase) avec des secrets stockés dans `supabase secrets`, jamais dans l’app.
