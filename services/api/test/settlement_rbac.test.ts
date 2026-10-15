import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApiServer } from '../src/app.js';
import { AuditLogger } from '../src/governance/auditLogger.js';
import { GovernanceRegistry } from '../src/governance/governanceRegistry.js';

describe('Settlement Execution Role-Based Access Control (RBAC)', () => {
  const REGULATOR_EMAIL = 'regulator@voltmesh.energy';
  const OPERATOR_EMAIL = 'operator@voltmesh.energy';
  const SELLER_WALLET = '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65';
  const BUYER_WALLET = '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc';

  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.REGULATOR_EMAILS = REGULATOR_EMAIL;
    process.env.OPERATOR_EMAILS = OPERATOR_EMAIL;
    process.env.GOOGLE_CLIENT_ID = 'test-voltmesh-google-client-id.apps.googleusercontent.com';
    process.env.ALLOW_DEV_KEYS = 'true';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const mockGoogleVerifier = async (idToken: string) => {
    if (idToken === 'token-regulator') {
      return { email: REGULATOR_EMAIL, email_verified: true, name: 'VoltMesh Regulator' };
    }
    if (idToken === 'token-operator') {
      return { email: OPERATOR_EMAIL, email_verified: true, name: 'VoltMesh Operator' };
    }
    throw new Error('Invalid token');
  };

  const samplePayload = {
    zoneId: 1,
    intervalIdx: 1991137,
    dateEpoch: 19900,
    statementRoot: '0x1111111111111111111111111111111111111111111111111111111111111111',
    totalCreditsPaise: '9000',
    totalDebitsPaise: '9000',
  };

  it('allows Operator and Regulator to execute T+1 batch settlement, but rejects Seller and Buyer with 403 and Anonymous with 401', async () => {
    const logger = new AuditLogger();
    const governance = new GovernanceRegistry();
    const app = buildApiServer({
      auditLogger: logger,
      governanceRegistry: governance,
      allowDevKeys: true,
      googleVerifier: mockGoogleVerifier,
      oraclePrivateKey: '0x0000000000000000000000000000000000000000000000000000000000000101',
      settlementContractAddress: '0x1111111111111111111111111111111111111111',
    });
    await app.ready();

    // 1. Login Operator via Google OAuth
    const opLoginRes = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { credential: 'token-operator', role: 'discom' },
    });
    expect(opLoginRes.statusCode).toBe(200);
    const opToken = JSON.parse(opLoginRes.body).token;

    // 2. Login Regulator via Google OAuth
    const regLoginRes = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { credential: 'token-regulator', role: 'regulator' },
    });
    expect(regLoginRes.statusCode).toBe(200);
    const regToken = JSON.parse(regLoginRes.body).token;

    // 3. Create wallet tokens for Seller and Buyer
    const sellerToken = app.jwt.sign({
      sub: SELLER_WALLET,
      address: SELLER_WALLET,
      role: 'seller',
    });
    const buyerToken = app.jwt.sign({
      sub: BUYER_WALLET,
      address: BUYER_WALLET,
      role: 'buyer',
    });

    // TEST A: Anonymous request -> 401
    const anonRes = await app.inject({
      method: 'POST',
      url: '/api/v1/settlements/execute',
      payload: samplePayload,
    });
    expect(anonRes.statusCode).toBe(401);

    // TEST B: Seller request -> 403 Forbidden
    const sellerRes = await app.inject({
      method: 'POST',
      url: '/api/v1/settlements/execute',
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: samplePayload,
    });
    expect(sellerRes.statusCode).toBe(403);
    expect(JSON.parse(sellerRes.body).error).toBe('INSUFFICIENT_PERMISSIONS');

    // TEST C: Buyer request -> 403 Forbidden
    const buyerRes = await app.inject({
      method: 'POST',
      url: '/api/v1/settlements/execute',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: samplePayload,
    });
    expect(buyerRes.statusCode).toBe(403);
    expect(JSON.parse(buyerRes.body).error).toBe('INSUFFICIENT_PERMISSIONS');

    // TEST D: Operator request -> 200 OK
    const opRes = await app.inject({
      method: 'POST',
      url: '/api/v1/settlements/execute',
      headers: { authorization: `Bearer ${opToken}` },
      payload: samplePayload,
    });
    expect(opRes.statusCode).toBe(200);
    const opData = JSON.parse(opRes.body);
    expect(opData.txHash).toBeDefined();
    expect(opData.status).toBe('success');

    // TEST E: Regulator request -> 200 OK
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/settlements/execute',
      headers: { authorization: `Bearer ${regToken}` },
      payload: samplePayload,
    });
    expect(regRes.statusCode).toBe(200);
    const regData = JSON.parse(regRes.body);
    expect(regData.txHash).toBeDefined();
    expect(regData.status).toBe('success');
  });

  it('enforces economic conservation: rejects when totalDebits < totalCredits', async () => {
    const app = buildApiServer({
      allowDevKeys: true,
      googleVerifier: mockGoogleVerifier,
    });
    await app.ready();

    const opLoginRes = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { credential: 'token-operator', role: 'discom' },
    });
    const opToken = JSON.parse(opLoginRes.body).token;

    const invalidConservationRes = await app.inject({
      method: 'POST',
      url: '/api/v1/settlements/execute',
      headers: { authorization: `Bearer ${opToken}` },
      payload: {
        ...samplePayload,
        totalCreditsPaise: '10000',
        totalDebitsPaise: '5000', // debits do not cover credits
      },
    });
    expect(invalidConservationRes.statusCode).toBe(400);
    expect(JSON.parse(invalidConservationRes.body).error).toBe('ECONOMIC_CONSERVATION_VIOLATION');
  });

  it('allows Regulator and Operator to request oracle statement signature, but rejects Seller and Buyer with 403', async () => {
    const app = buildApiServer({
      allowDevKeys: true,
      googleVerifier: mockGoogleVerifier,
      oraclePrivateKey: '0x0000000000000000000000000000000000000000000000000000000000000101',
      settlementContractAddress: '0x1111111111111111111111111111111111111111',
    });
    await app.ready();

    const regLoginRes = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { credential: 'token-regulator', role: 'regulator' },
    });
    const regToken = JSON.parse(regLoginRes.body).token;

    const sellerToken = app.jwt.sign({
      sub: SELLER_WALLET,
      address: SELLER_WALLET,
      role: 'seller',
    });

    const signPayload = {
      zoneId: 1,
      dateEpoch: 19900,
      statementRoot: '0x1111111111111111111111111111111111111111111111111111111111111111',
      totalCreditsPaise: '9000',
      totalDebitsPaise: '9000',
    };

    // Regulator calling sign-statement -> 200 OK
    const regSignRes = await app.inject({
      method: 'POST',
      url: '/api/v1/oracle/sign-statement',
      headers: { authorization: `Bearer ${regToken}` },
      payload: signPayload,
    });
    expect(regSignRes.statusCode).toBe(200);
    expect(JSON.parse(regSignRes.body).signature).toBeDefined();

    // Seller calling sign-statement -> 403 Forbidden
    const sellerSignRes = await app.inject({
      method: 'POST',
      url: '/api/v1/oracle/sign-statement',
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: signPayload,
    });
    expect(sellerSignRes.statusCode).toBe(403);
  });
});
