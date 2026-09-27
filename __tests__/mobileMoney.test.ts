import { canDebit, displayState, emptyOperatorState, OPERATORS } from '../lib/mobileMoney';
import type { OperatorState } from '../types';

const state = (patch: Partial<OperatorState>): OperatorState => ({ ...emptyOperatorState('wave'), ...patch });

describe('Wave / Orange Money states', () => {
  it('has two separate integrations', () => {
    expect(OPERATORS).toEqual(['wave', 'orange_money']);
  });

  it('defaults to not connected, integration missing, no mandate', () => {
    const s = emptyOperatorState('orange_money');
    expect(s).toMatchObject({ integrationAvailable: false, connection: 'not_connected', mandate: 'none', phoneE164: null });
    expect(displayState(s)).toBe('integration_missing');
    expect(canDebit(s)).toBe(false);
  });

  it('never shows connected while the integration is missing, whatever the stored state', () => {
    const s = state({ integrationAvailable: false, connection: 'connected', mandate: 'active', phoneE164: '+221771234567' });
    expect(displayState(s)).toBe('integration_missing');
    expect(canDebit(s)).toBe(false);
  });

  it('maps every connection and mandate state', () => {
    expect(displayState(state({ integrationAvailable: true }))).toBe('not_connected');
    expect(displayState(state({ integrationAvailable: true, connection: 'connecting' }))).toBe('connecting');
    expect(displayState(state({ integrationAvailable: true, connection: 'error' }))).toBe('error');
    expect(displayState(state({ integrationAvailable: true, connection: 'revoked' }))).toBe('not_connected');
    const connected = { integrationAvailable: true, connection: 'connected' as const };
    expect(displayState(state({ ...connected, mandate: 'none' }))).toBe('connected');
    expect(displayState(state({ ...connected, mandate: 'pending' }))).toBe('mandate_pending');
    expect(displayState(state({ ...connected, mandate: 'refused' }))).toBe('mandate_refused');
    expect(displayState(state({ ...connected, mandate: 'expired' }))).toBe('mandate_expired');
  });

  it('a debit requires integration + connection + active mandate', () => {
    expect(canDebit(state({ integrationAvailable: true, connection: 'connected', mandate: 'active' }))).toBe(true);
    expect(canDebit(state({ integrationAvailable: true, connection: 'connected', mandate: 'pending' }))).toBe(false);
    expect(canDebit(state({ integrationAvailable: true, connection: 'connecting', mandate: 'active' }))).toBe(false);
  });
});
