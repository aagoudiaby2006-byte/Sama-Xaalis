// services/paiement.ts
//
// Point d'entrée unique vers les opérateurs de paiement (Wave, Orange Money) et le service SMS.
//
// IMPORTANT : toutes les fonctions de ce fichier sont des PLACEHOLDERS.
// Une fois les clés API Wave et Orange Money obtenues, elles devront être remplacées par les vrais
// appels. Les clés ne doivent JAMAIS être dans l'application : les vrais appels passent par les
// Edge Functions Supabase (supabase/functions/mobile-money, supabase/functions/withdraw), qui gardent
// les secrets côté serveur (`supabase secrets set ...`).
//
// Garde-fou : les valeurs de test ne sont renvoyées qu'en développement (`__DEV__`, Expo Go / dev
// build). Dans un build de production, chaque fonction répond « intégration à configurer » : aucun
// compte, prélèvement, retrait ou SMS n'est jamais simulé chez un vrai utilisateur.

/** Vrai uniquement en développement : autorise les réponses de test ci-dessous. */
export const PLACEHOLDER_ACTIF = typeof __DEV__ !== 'undefined' && __DEV__;

export type OperateurPaiement = 'wave' | 'orange';

/**
 * Origine d'une réponse :
 * - `placeholder` : valeur de test (développement uniquement), à afficher comme telle ;
 * - `non_configure` : l'intégration réelle n'est pas encore branchée ;
 * - `api` : réponse de l'opérateur (quand les vrais appels seront en place).
 */
export type SourceReponse = 'placeholder' | 'non_configure' | 'api';

export interface VerificationNumero {
  wave: boolean;
  orange: boolean;
  source: SourceReponse;
}

export interface ResultatOperation {
  success: boolean;
  transactionId: string;
  source: SourceReponse;
}

/**
 * Vérifie si un numéro a un compte Wave ou Orange Money actif.
 *
 * IMPORTANT : Cette fonction est un placeholder.
 * Une fois que j'aurai mes clés API Wave et Orange Money,
 * elle devra être remplacée par les vrais appels API.
 *
 * @param numero - Numéro de téléphone au format +221XXXXXXXXX
 */
export async function verifierNumero(numero: string): Promise<VerificationNumero> {
  // TODO: Remplacer par l'appel réel à l'API Wave
  // TODO: Remplacer par l'appel réel à l'API Orange Money
  if (!PLACEHOLDER_ACTIF) return { wave: false, orange: false, source: 'non_configure' };

  console.log(`[PLACEHOLDER] Vérification du numéro : ${numero}`);

  // Valeur temporaire pour tester l'interface
  return { wave: true, orange: false, source: 'placeholder' };
}

/**
 * Initie un prélèvement automatique.
 *
 * IMPORTANT : Cette fonction est un placeholder.
 * Les prélèvements réels sont déclenchés par le serveur (planificateur + mandat opérateur),
 * jamais par l'application : ce placeholder sert à préparer l'intégration côté serveur.
 *
 * @param montant - Montant en FCFA (entier)
 * @param operateur - "wave" ou "orange"
 * @param numero - Numéro de téléphone
 */
export async function initierPrelevement(montant: number, operateur: OperateurPaiement, numero: string): Promise<ResultatOperation> {
  // TODO: Remplacer par l'appel réel à l'API de paiement
  if (!PLACEHOLDER_ACTIF) return { success: false, transactionId: '', source: 'non_configure' };

  console.log(`[PLACEHOLDER] Prélèvement de ${montant} FCFA via ${operateur} (${numero})`);

  return {
    success: true,
    transactionId: 'SIMU-' + Date.now(),
    source: 'placeholder',
  };
}

/**
 * Envoie l'argent vers le compte Wave/Orange Money de l'utilisateur.
 *
 * IMPORTANT : Cette fonction est un placeholder.
 * Le retrait réel passe par l'Edge Function `withdraw`, qui recalcule les frais (1 %).
 *
 * @param montant - Montant en FCFA (entier)
 * @param operateur - "wave" ou "orange"
 * @param numero - Numéro de téléphone
 */
export async function envoyerRetrait(montant: number, operateur: OperateurPaiement, numero: string): Promise<ResultatOperation> {
  // TODO: Remplacer par l'appel réel à l'API de payout
  if (!PLACEHOLDER_ACTIF) return { success: false, transactionId: '', source: 'non_configure' };

  console.log(`[PLACEHOLDER] Retrait de ${montant} FCFA via ${operateur} (${numero})`);

  return {
    success: true,
    transactionId: 'RETRAIT-' + Date.now(),
    source: 'placeholder',
  };
}

/**
 * Envoie un code OTP par SMS.
 *
 * IMPORTANT : Cette fonction est un placeholder.
 * Le code doit être généré, envoyé et vérifié CÔTÉ SERVEUR : dans l'application, l'OTP passe par
 * Supabase Auth (lib/otp.ts). Pour utiliser eSMS Africa ou Orange Developer, branchez ce fournisseur
 * dans un « Send SMS hook » Supabase — jamais depuis l'application, qui ne doit pas connaître le code.
 *
 * @param numero - Numéro de téléphone
 * @param code - Code à 6 chiffres
 */
export async function envoyerOTP(numero: string, code: string): Promise<{ success: boolean; source: SourceReponse }> {
  // TODO: Remplacer par l'appel réel au service SMS (eSMS Africa ou Orange Developer), côté serveur
  if (!PLACEHOLDER_ACTIF) return { success: false, source: 'non_configure' };

  // Le code n'est jamais écrit dans les logs.
  console.log(`[PLACEHOLDER] OTP (${code.length} chiffres) envoyé à ${numero}`);

  return { success: true, source: 'placeholder' };
}
