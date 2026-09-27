// Operator adapters for Wave and Orange Money.
//
// NOTHING HERE IS SIMULATED. Both adapters are intentionally NOT implemented: the official APIs
// (Wave Business API, Orange Money Web Payment / Merchant API) require signed merchant contracts,
// credentials and, for recurring debits, a mandate product that must be confirmed with each operator.
// Until an adapter is implemented against the official documentation AND its credentials are set as
// Edge Function secrets, `isAvailable()` returns false and the app shows "Intégration à configurer".
//
// To implement one: fill in the methods below following the operator's official docs, set
// IMPLEMENTED = true, and add the secrets listed in `requiredEnv` with `supabase secrets set`.

export type Operator = 'wave' | 'orange_money';

export interface ConnectResult {
  /** Official operator page the user must open to authenticate / consent. */
  authUrl: string;
  providerAccountRef: string | null;
}

export interface OperatorAdapter {
  operator: Operator;
  requiredEnv: string[];
  isAvailable(): boolean;
  startConnection(userId: string, phoneE164: string): Promise<ConnectResult>;
  requestMandate(userId: string, providerAccountRef: string | null): Promise<{ authUrl: string; providerReference: string }>;
  revokeMandate(providerReference: string): Promise<void>;
  payout(args: { phoneE164: string; amount: number; idempotencyKey: string }): Promise<{ providerReference: string }>;
}

class NotImplementedError extends Error {
  constructor(operator: Operator) {
    super(`${operator} integration not implemented`);
  }
}

function hasEnv(keys: string[]): boolean {
  return keys.every((k) => (Deno.env.get(k) ?? '').length > 0);
}

function stubAdapter(operator: Operator, requiredEnv: string[]): OperatorAdapter {
  const IMPLEMENTED = false;
  return {
    operator,
    requiredEnv,
    isAvailable: () => IMPLEMENTED && hasEnv(requiredEnv),
    startConnection: () => Promise.reject(new NotImplementedError(operator)),
    requestMandate: () => Promise.reject(new NotImplementedError(operator)),
    revokeMandate: () => Promise.reject(new NotImplementedError(operator)),
    payout: () => Promise.reject(new NotImplementedError(operator)),
  };
}

export const adapters: Record<Operator, OperatorAdapter> = {
  wave: stubAdapter('wave', ['WAVE_API_KEY', 'WAVE_WEBHOOK_SECRET']),
  orange_money: stubAdapter('orange_money', ['ORANGE_MONEY_CLIENT_ID', 'ORANGE_MONEY_CLIENT_SECRET', 'ORANGE_MONEY_MERCHANT_KEY']),
};
