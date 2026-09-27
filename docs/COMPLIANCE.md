# Conformité financière — points non confirmés

Sama-Xaalis manipule de l’épargne et des paiements. Rien ci-dessous n’a été validé juridiquement ; chaque point doit l’être par un conseil qualifié au Sénégal avant toute mise en production des fonctions financières.

| Sujet | Statut | Conséquence dans l’app |
|---|---|---|
| Statut légal de l’éditeur (établissement de paiement, émetteur de monnaie électronique, SFD, ou partenariat avec un établissement agréé BCEAO) | **Non confirmé** | L’app ne se présente jamais comme une banque ; mention affichée dans Profil. |
| Où sont détenus les fonds épargnés (compte de cantonnement, partenaire agréé) | **Non confirmé** | Aucun solde n’est calculé par l’app ; le solde n’évolue que sur confirmation serveur/opérateur. |
| Contrats marchands Wave et Orange Money | **Absents** | « Intégration à configurer » ; aucune connexion ni prélèvement possible. |
| Produit de prélèvement récurrent (mandat) chez chaque opérateur | **Non confirmé** | Aucune autorisation ne peut être simulée ; prélèvements « Non planifié : autorisation requise ». |
| Barèmes de frais | 1 % sur les retraits | Barème inséré par migration ; à valider avec les contrats opérateurs. |
| KYC (pièce d’identité) | Collecte du type et numéro uniquement ; aucune vérification documentaire | À définir avec le partenaire agréé. |
| Protection des données (loi sénégalaise n° 2008-12, déclaration à la CDP) | **À faire** | Politique de confidentialité en brouillon (`legal/`). |
| Rendement | Aucun | L’app ne promet ni rendement ni remboursement automatique. |

Tant que ces points ne sont pas levés, seule l’interface honnête de configuration doit être publiée, ou la publication doit être repoussée.
