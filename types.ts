// Domain types shared by the app. All monetary amounts are integers in FCFA (XOF has no minor unit).

export type Operator = 'wave' | 'orange_money';

export type IdType = 'cni_cedeao' | 'passport' | 'residence_permit';

export type Frequency = 'daily' | 'weekly' | 'monthly';

/** The 6 proposed goals, plus « Autre » (free name). */
export type GoalCategory = 'urgence' | 'fete' | 'scolarite' | 'sante' | 'commerce' | 'logement' | 'autre';

export type GoalStatus = 'active' | 'paused' | 'locked' | 'completed' | 'cancelled';

export interface Profile {
  userId: string;
  fullName: string;
  phoneE164: string;
  idType: IdType;
  idNumber: string;
}

export interface Goal {
  id: string;
  name: string;
  category: GoalCategory | null;
  targetAmount: number;
  savedAmount: number; // written by the backend only, never by the app
  frequency: Frequency;
  contributionAmount: number;
  status: GoalStatus;
  operator: Operator | null;
  lockedUntil: string | null; // ISO date
  isChildGoal: boolean;
  childBirthDate: string | null; // ISO date (YYYY-MM-DD)
  nextDebitAt: string | null; // planned date only; no debit happens without an active authorization
  /** Last day of the saving period (YYYY-MM-DD). Withdrawal opens on this date. */
  endsOn: string | null;
  createdAt: string;
}

export interface GoalDraft {
  name: string;
  category: GoalCategory;
  /** Amount of each automatic debit × number of debits in the period. */
  targetAmount: number;
  frequency: Frequency;
  contributionAmount: number;
  operator: Operator | null;
  endsOn: string; // YYYY-MM-DD
}

export type ActivityKind = 'debit' | 'withdrawal' | 'fee' | 'refund';

export type ActivityStatus = 'scheduled' | 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'refunded';

export interface Activity {
  id: string;
  goalId: string | null;
  kind: ActivityKind;
  status: ActivityStatus;
  amount: number;
  fee: number;
  operator: Operator | null;
  errorCode: string | null;
  createdAt: string;
}

/** Connection state of a Mobile Money wallet, as reported by the backend. */
export type ConnectionStatus =
  | 'not_connected'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'revoked';

/** State of a direct-debit authorization (mandate), as reported by the backend. */
export type MandateStatus = 'none' | 'pending' | 'active' | 'refused' | 'expired' | 'revoked';

export interface OperatorState {
  operator: Operator;
  /** False while no official API credentials are configured on the server. */
  integrationAvailable: boolean;
  connection: ConnectionStatus;
  mandate: MandateStatus;
  phoneE164: string | null;
  updatedAt: string | null;
}

export interface FeeSchedule {
  operator: Operator;
  fixedFee: number;
  rateBps: number; // basis points: 100 = 1 %
  minFee: number;
  maxFee: number | null;
}

export type ThemePreference = 'system' | 'light' | 'dark';

export type Language = 'fr' | 'en';
