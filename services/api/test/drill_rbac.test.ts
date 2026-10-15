import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApiServer } from '../src/app.js';
import { AuditLogger } from '../src/governance/auditLogger.js';
import { GovernanceRegistry } from '../src/governance/governanceRegistry.js';

describe('Security Lab Drill RBAC & Isolation Matrix', () => {
  const REGULATOR_EMAIL = 'regulator@voltmesh.energy';
  const OPERATOR_EMAIL = 'operator@voltmesh.energy';
  const SELLER_WALLET = '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65';
  const BUYER_WALLET = '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc';
  const OPERATOR_WALLET = '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc';
  const REGULATOR_WALLET = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';

  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.REGULATOR_EMAILS = REGULATOR_EMAIL;
    process.env.OPERATOR_EMAILS = OPERATOR_EMAIL;
    process.env.GOOGLE_CLIENT_ID = 'test-voltmesh-google-client-id.apps.googleusercontent.com';
    process.env.ALLOW_DEV_KEYS = 'true';
    delete process.env.NODE_ENV;
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

  it('allows BOTH Regulator and Operator to trigger drills, but rejects Buyer and Seller with 403 and unauthenticated with 401', async () => {
    const logger = new AuditLogger();
    const governance = new GovernanceRegistry();
    const app = buildApiServer({
      auditLogger: logger,
      governanceRegistry: governance,
      allowDevKeys: true,
      googleVerifier: mockGoogleVerifier,
    });
    await app.ready();

    // 1. Operator via Google OAuth
    const opLoginRes = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { credential: 'token-operator', role: 'discom' },
    });
    expect(opLoginRes.statusCode).toBe(200);
    const opOAuthToken = JSON.parse(opLoginRes.body).token;

    // 2. Regulator via Google OAuth
    const regLoginRes = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { credential: 'token-regulator', role: 'regulator' },
    });
    expect(regLoginRes.statusCode).toBe(200);
    const regOAuthToken = JSON.parse(regLoginRes.body).token;

    // 3. JWT wallet tokens for Operator, Regulator, Buyer, and Seller
    const opJwtToken = app.jwt.sign({
      sub: OPERATOR_WALLET,
      address: OPERATOR_WALLET,
      role: 'operator',
    });
    const regJwtToken = app.jwt.sign({
      sub: REGULATOR_WALLET,
      address: REGULATOR_WALLET,
      role: 'regulator',
    });
    const buyerToken = app.jwt.sign({
      sub: BUYER_WALLET,
      address: BUYER_WALLET,
      role: 'buyer',
    });
    const sellerToken = app.jwt.sign({
      sub: SELLER_WALLET,
      address: SELLER_WALLET,
      role: 'seller',
    });

    // TEST 1: Unauthenticated request -> 401
    const anonRes = await app.inject({
      method: 'POST',
      url: '/api/v1/security/simulate-attack',
      payload: { attackType: 'FAKE_METER_SIGNATURE', domain: 'DEMO' },
    });
    expect(anonRes.statusCode).toBe(401);

    // TEST 2: Buyer token -> 403 INSUFFICIENT_PERMISSIONS
    const buyerRes = await app.inject({
      method: 'POST',
      url: '/api/v1/security/simulate-attack',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: { attackType: 'FAKE_METER_SIGNATURE', domain: 'DEMO' },
    });
    expect(buyerRes.statusCode).toBe(403);
    const buyerData = JSON.parse(buyerRes.body);
    expect(buyerData.error).toBe('INSUFFICIENT_PERMISSIONS');

    // TEST 3: Seller token -> 403 INSUFFICIENT_PERMISSIONS
    const sellerRes = await app.inject({
      method: 'POST',
      url: '/api/v1/security/simulate-attack',
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: { attackType: 'FAKE_METER_SIGNATURE', domain: 'DEMO' },
    });
    expect(sellerRes.statusCode).toBe(403);
    const sellerData = JSON.parse(sellerRes.body);
    expect(sellerData.error).toBe('INSUFFICIENT_PERMISSIONS');

    // TEST 4: Operator (OAuth) -> Allowed to trigger drill
    const opOAuthRes = await app.inject({
      method: 'POST',
      url: '/api/v1/security/simulate-attack',
      headers: { authorization: `Bearer ${opOAuthToken}` },
      payload: { attackType: 'FAKE_METER_SIGNATURE', domain: 'DEMO' },
    });
    // Not 403 INSUFFICIENT_PERMISSIONS: drill executes!
    expect(opOAuthRes.statusCode).not.toBe(403);
    const opOAuthData = JSON.parse(opOAuthRes.body);
    expect(opOAuthData.attackType).toBe('FAKE_METER_SIGNATURE');
    expect(opOAuthData.result).toBe('REJECTED');

    // TEST 5: Operator (JWT) -> Allowed to trigger drill
    const opJwtRes = await app.inject({
      method: 'POST',
      url: '/api/v1/security/simulate-attack',
      headers: { authorization: `Bearer ${opJwtToken}` },
      payload: { attackType: 'WRONG_DEVICE_KEY', domain: 'DEMO' },
    });
    expect(opJwtRes.statusCode).not.toBe(403);
    const opJwtData = JSON.parse(opJwtRes.body);
    expect(opJwtData.attackType).toBe('WRONG_DEVICE_KEY');
    expect(opJwtData.result).toBe('REJECTED');

    // TEST 6: Regulator (OAuth) -> Allowed to trigger drill
    const regOAuthRes = await app.inject({
      method: 'POST',
      url: '/api/v1/security/simulate-attack',
      headers: { authorization: `Bearer ${regOAuthToken}` },
      payload: { attackType: 'METER_EQUIVOCATION', domain: 'DEMO' },
    });
    expect(regOAuthRes.statusCode).not.toBe(403);
    const regOAuthData = JSON.parse(regOAuthRes.body);
    expect(regOAuthData.attackType).toBe('METER_EQUIVOCATION');
    expect(regOAuthData.result).toBe('QUARANTINED');

    // TEST 7: Regulator (JWT) -> Allowed to trigger drill
    const regJwtRes = await app.inject({
      method: 'POST',
      url: '/api/v1/security/simulate-attack',
      headers: { authorization: `Bearer ${regJwtToken}` },
      payload: { attackType: 'ORACLE_EQUIVOCATION', domain: 'DEMO' },
    });
    expect(regJwtRes.statusCode).not.toBe(403);
    const regJwtData = JSON.parse(regJwtRes.body);
    expect(regJwtData.attackType).toBe('ORACLE_EQUIVOCATION');
    expect(regJwtData.result).toBe('QUARANTINED');

    // TEST 8: DEMO isolation guard: Reject LIVE domain with 400
    const liveRes = await app.inject({
      method: 'POST',
      url: '/api/v1/security/simulate-attack',
      headers: { authorization: `Bearer ${opOAuthToken}` },
      payload: { attackType: 'FAKE_METER_SIGNATURE', domain: 'LIVE' },
    });
    expect(liveRes.statusCode).toBe(400);
    const liveData = JSON.parse(liveRes.body);
    expect(liveData.error).toBe('DRILL_LIVE_DISALLOWED');
  });
});
