# Déclarations de confidentialité

Basées sur ce que le code collecte réellement. À revoir si des intégrations (Wave, Orange Money, notifications, analytics) sont ajoutées. Aucun SDK publicitaire ni analytics n’est inclus ; aucun suivi (tracking).

## Apple — App Privacy (App Store Connect → App Privacy)

| Type de données | Collecté | Lié à l’identité | Suivi | Finalité |
|---|---|---|---|---|
| Contact Info → Name | Oui | Oui | Non | App Functionality |
| Contact Info → Phone Number | Oui | Oui | Non | App Functionality (authentification SMS) |
| Financial Info → Other Financial Info (objectifs, montants, historique) | Oui | Oui | Non | App Functionality |
| Identifiers → User ID | Oui | Oui | Non | App Functionality |
| Other Data (type et numéro de pièce d’identité) | Oui | Oui | Non | App Functionality (conformité) |
| Location, Contacts, Photos, Health, Browsing, Usage data, Diagnostics | Non | | | |

- Suppression du compte : dans l’app, Profil → Supprimer mon compte (règle 5.1.1(v)).
- Chiffrement : HTTPS uniquement (exempté) → `ITSAppUsesNonExemptEncryption = false`.
- Biométrie : traitée par le système (Face ID / Touch ID) ; aucune donnée biométrique n’est collectée.

## Google Play — Data safety

- Données chiffrées en transit : **Oui** (HTTPS).
- Possibilité de demander la suppression : **Oui**, dans l’app + URL web de suppression à fournir (obligatoire dans la fiche).
- Partage avec des tiers : **Non** (Supabase est un sous-traitant ; Wave / Orange Money ne recevront des données qu’une fois les intégrations actives — mettre à jour à ce moment).

| Catégorie | Type | Collecté | Partagé | Facultatif | Finalité |
|---|---|---|---|---|---|
| Informations personnelles | Nom | Oui | Non | Non | Fonctionnement de l’app, gestion du compte |
| Informations personnelles | Numéro de téléphone | Oui | Non | Non | Gestion du compte, prévention de la fraude |
| Informations personnelles | Autres (pièce d’identité) | Oui | Non | Non | Prévention de la fraude, conformité |
| Informations financières | Autres informations financières | Oui | Non | Non | Fonctionnement de l’app |
| Identifiants | Identifiant utilisateur | Oui | Non | Non | Gestion du compte |

- **Déclaration « Services financiers »** (Play Console → Contenu de l’application) : à compléter avec le statut réglementaire réel (voir `docs/COMPLIANCE.md`).

## Permissions et justifications

| Plateforme | Permission | Justification |
|---|---|---|
| iOS | `NSFaceIDUsageDescription` | « Sama-Xaalis utilise Face ID pour déverrouiller l’application de façon sécurisée. » |
| Android | `USE_BIOMETRIC`, `USE_FINGERPRINT` | Déverrouillage biométrique facultatif. |
| Android | `INTERNET` | Communication avec le serveur. |
| Android | `VIBRATE` | Ajoutée par React Native (retour haptique). |
| Bloquées | SMS (lecture/envoi), caméra, micro, localisation, contacts, stockage, superposition | Non nécessaires. |
