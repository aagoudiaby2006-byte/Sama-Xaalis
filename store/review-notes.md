# Notes pour la revue Apple / Google (brouillon)

Apple exige un compte de démonstration fonctionnel. L’inscription passe par un OTP SMS : il faut donc choisir **une** des options suivantes, décision qui vous revient.

1. **Numéro de test dédié (recommandé)** : un numéro réel que vous contrôlez (SIM dédiée) ; vous transmettez le code au relecteur à sa demande. Aucun contournement.
2. **Numéro de test Supabase** (*Auth → Phone → Test phone numbers*) : associe un numéro fictif à un code fixe côté serveur. C’est un contournement : à limiter à un seul numéro, à ne jamais mettre dans le code ou le dépôt, et à supprimer après la revue.

Texte proposé (à adapter) :

> Sama-Xaalis is a savings-goal app for Senegal. Sign-up requires SMS verification of a Senegalese phone number. Demo number: <à fournir>. Mobile Money debits and withdrawals (Wave, Orange Money) are shown as “Integration to be configured” until official operator agreements are active; no real money moves in this version. Account deletion: Profile → Delete my account.

Attention : une version où aucune fonction financière n’est active peut être rejetée par Apple (2.1 « App Completeness ») ou par Google. Voir `docs/DEPLOYMENT.md` → Bloquants.
