// Wave and Orange Money. Two separate integrations, both handled server-side by the `mobile-money`
// Edge Function, which holds the merchant credentials. The app only displays what the server reports:
// a wallet is never shown as connected because of a phone number, the operator is never inferred from
// the prefix, and no debit authorization is ever simulated.
import type { ConnectionStatus, MandateStatus, Operator, OperatorState } from '../types';
import { invokeFunction, type DataResult } from './data';

export const OPERATORS: Operator[] = ['wave', 'orange_money'];

export const OPERATOR_BRAND: Record<Operator, { color: string; name: string }> = {
  wave: { color: '#1DC8FF', name: 'Wave' },
  orange_money: { color: '#FF7900', name: 'Orange Money' },
};

export function emptyOperatorState(operator: Operator): OperatorState {
  return {
    operator,
    integrationAvailable: false,
    connection: 'not_connected',
    mandate: 'none',
    phoneE164: null,
    updatedAt: null,
  };
}

/** A debit may only ever be scheduled when the server confirms both a connection and an active mandate. */
export function canDebit(s: OperatorState): boolean {
  return s.integrationAvailable && s.connection === 'connected' && s.mandate === 'active';
}

export type OperatorDisplayState =
  | 'integration_missing'
  | 'not_connected'
  | 'connecting'
  | 'connected'
  | 'mandate_pending'
  | 'mandate_refused'
  | 'mandate_expired'
  | 'error';

export function displayState(s: OperatorState): OperatorDisplayState {
  if (!s.integrationAvailable) return 'integration_missing';
  const byConnection: Partial<Record<ConnectionStatus, OperatorDisplayState>> = {
    connecting: 'connecting',
    error: 'error',
    not_connected: 'not_connected',
    revoked: 'not_connected',
  };
  if (s.connection !== 'connected') return byConnection[s.connection] ?? 'not_connected';
  const byMandate: Partial<Record<MandateStatus, OperatorDisplayState>> = {
    pending: 'mandate_pending',
    refused: 'mandate_refused',
    expired: 'mandate_expired',
  };
  return byMandate[s.mandate] ?? 'connected';
}

type StatusResponse = { operators: OperatorState[] };

export async function fetchOperatorStates(): Promise<DataResult<OperatorState[]>> {
  const res = await invokeFunction<StatusResponse>('mobile-money', { action: 'status' });
  if (!res.ok) return res;
  return { ok: true, data: OPERATORS.map((op) => res.data.operators.find((s) => s.operator === op) ?? emptyOperatorState(op)) };
}

/**
 * Starts the official operator authentication. The server answers with the operator's own URL
 * (checkout / consent page) that the app opens in the system browser.
 */
export function startConnection(operator: Operator, phoneE164: string) {
  return invokeFunction<{ state: OperatorState; authUrl: string | null }>('mobile-money', { action: 'connect', operator, phone: phoneE164 });
}

export function requestMandate(operator: Operator) {
  return invokeFunction<{ state: OperatorState; authUrl: string | null }>('mobile-money', { action: 'authorize', operator });
}

export function revokeMandate(operator: Operator) {
  return invokeFunction<{ state: OperatorState }>('mobile-money', { action: 'revoke', operator });
}
