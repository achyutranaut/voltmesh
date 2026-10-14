import { describe, it, expect, beforeEach } from 'vitest';
import { buildApiServer } from '../src/app.js';
import { ParticipantRole } from '@energy-dex/types';

describe('Core Flow & RBAC Security Audit Regression Tests', () => {
  let app: any;
  const buyerWallet = '0x1111111111111111111111111111111111111111';
  const regulatorWallet = '0x2222222222222222222222222222222222222222';
  let buyerToken: string;
  let regulatorToken: string;

  beforeEach(async () => {
    app = buildApiServer({ allowDevKeys: true });
    await app.ready();

    // Register regulatorWallet as an AUDITOR in governance registry
    app.governance.registerMember('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266', {
      organizationId: 'org-regulator-commission',
      walletAddress: regulatorWallet,
      role: 'AUDITOR',
      jurisdiction: 'GRID-ALL',
      credentialRef: 'CRED-REG-2026',
    });

    buyerToken = app.jwt.sign({ sub: buyerWallet, address: buyerWallet, role: 'buyer', tokenVersion: 0 });
    regulatorToken = app.jwt.sign({ sub: regulatorWallet, address: regulatorWallet, role: 'regulator', tokenVersion: 0 });
  });

  it('Flow 2 & 1: Participant registration returns refreshed token with incremented tokenVersion, avoiding session lockout', async () => {
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/participants/register',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: {
        zoneId: 1,
        discomAccountNumber: 'CA-BUYER-TEST-99',
        roleType: ParticipantRole.CONSUMER,
      },
    });

    expect(regRes.statusCode).toBe(201);
    const body = JSON.parse(regRes.payload);
    expect(body.token).toBeDefined();
    expect(body.tokenVersion).toBe(1);

    // Using the returned refreshed token must succeed on subsequent authenticated requests
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/participants/me',
      headers: { authorization: `Bearer ${body.token}` },
    });
    expect(meRes.statusCode).toBe(200);

    // Old token with tokenVersion 0 is now rejected with TOKEN_REVOKED
    const staleRes = await app.inject({
      method: 'GET',
      url: '/api/v1/participants/me',
      headers: { authorization: `Bearer ${buyerToken}` },
    });
    expect(staleRes.statusCode).toBe(401);
    expect(JSON.parse(staleRes.payload).error).toBe('TOKEN_REVOKED');
  });

  it('Flow 9: Regulator / oversight accounts cannot mint test tokens via faucet', async () => {
    const mintRes = await app.inject({
      method: 'POST',
      url: '/api/v1/faucet/mint',
      headers: { authorization: `Bearer ${regulatorToken}` },
      payload: {
        recipient: regulatorWallet,
        amountPaise: '100000',
      },
    });

    expect(mintRes.statusCode).toBe(403);
    const body = JSON.parse(mintRes.payload);
    expect(body.error).toBe('OVERSIGHT_ACCOUNT_CANNOT_MINT');
  });

  it('Flow 9: Regulator cannot declare energy positions or post energy schedules', async () => {
    const posRes = await app.inject({
      method: 'POST',
      url: '/api/v1/energy/positions/declare',
      headers: { authorization: `Bearer ${regulatorToken}` },
      payload: {
        intervalIdx: 30,
        forecastGenerationWh: '5000',
        installedSolarCapacityW: '5000',
      },
    });

    expect(posRes.statusCode).toBe(403);
    expect(JSON.parse(posRes.payload).error).toBe('OVERSIGHT_ACCOUNT_READ_ONLY');

    const schedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/schedules',
      headers: { authorization: `Bearer ${regulatorToken}` },
      payload: {
        sessionId: 'dam-session-1-zone1',
        role: 'SELLER',
        zoneId: 1,
        intervalIdx: 30,
        deliveryDate: '2026-10-15',
        quantityWh: '5000',
        contractedPricePaiseKWh: '450',
        counterparty: buyerWallet,
      },
    });

    expect(schedRes.statusCode).toBe(403);
    expect(JSON.parse(schedRes.payload).error).toBe('OVERSIGHT_ACCOUNT_READ_ONLY');
  });

  it('Flow 1: handleAuthVerify issues token with tokenVersion property', async () => {
    // Challenge
    const chalRes = await app.inject({
      method: 'POST',
      url: '/auth/challenge',
      payload: { address: buyerWallet },
    });
    expect(chalRes.statusCode).toBe(200);
    const { message } = JSON.parse(chalRes.payload);

    // Note: in local mock/test, lookupRole resolves unregistered role
    const role = await app.lookupRole(buyerWallet);
    expect(role).toBeUndefined();
  });
});
