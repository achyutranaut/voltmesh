import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApiServer } from '../src/app.js';
import { AuditLogger } from '../src/governance/auditLogger.js';
import { GovernanceRegistry } from '../src/governance/governanceRegistry.js';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

describe('Google OAuth & Role-Separated Market Clearing (Part B)', () => {
  const REGULATOR_EMAIL = 'regulator@voltmesh.energy';
  const OPERATOR_EMAIL = 'operator@voltmesh.energy';
  const UNAUTHORIZED_EMAIL = 'hacker@unknown.org';
  const UNVERIFIED_EMAIL = 'unverified@voltmesh.energy';

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
    if (idToken === 'token-unverified') {
      return { email: UNVERIFIED_EMAIL, email_verified: false, name: 'Unverified User' };
    }
    if (idToken === 'token-unauthorized') {
      return { email: UNAUTHORIZED_EMAIL, email_verified: true, name: 'Random User' };
    }
    if (idToken === 'token-wrong-audience') {
      throw new Error('Wrong audience: ID token is not meant for this app.');
    }
    throw new Error('Invalid token format or signature.');
  };

  it('authenticates allowlisted Regulator and Operator with correct roles', async () => {
    const app = buildApiServer({
      allowDevKeys: true,
      googleVerifier: mockGoogleVerifier,
    });
    await app.ready();

    // 1. Regulator Login
    const regRes = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: {
        credential: 'token-regulator',
        role: 'regulator',
      },
    });

    expect(regRes.statusCode).toBe(200);
    const regBody = JSON.parse(regRes.body);
    expect(regBody.role).toBe('regulator');
    expect(regBody.email).toBe(REGULATOR_EMAIL);
    expect(regBody.token).toBeDefined();
    expect(regBody.address).toBeDefined();
    expect(regBody.authMethod).toBe('google');

    // 2. Operator Login
    const opRes = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: {
        credential: 'token-operator',
        role: 'discom',
      },
    });

    expect(opRes.statusCode).toBe(200);
    const opBody = JSON.parse(opRes.body);
    expect(opBody.role).toBe('discom');
    expect(opBody.email).toBe(OPERATOR_EMAIL);
    expect(opBody.token).toBeDefined();
    expect(opBody.address).toBeDefined();
    expect(opBody.authMethod).toBe('google');
  });

  it('rejects unverified email, unauthorized email, and wrong token audience', async () => {
    const app = buildApiServer({
      allowDevKeys: true,
      googleVerifier: mockGoogleVerifier,
    });
    await app.ready();

    // 1. Unverified email -> 403 GOOGLE_EMAIL_NOT_VERIFIED
    const unverRes = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { credential: 'token-unverified' },
    });
    expect(unverRes.statusCode).toBe(403);
    expect(JSON.parse(unverRes.body).error).toBe('GOOGLE_EMAIL_NOT_VERIFIED');

    // 2. Unauthorized email not in allowlist -> 403 GOOGLE_EMAIL_NOT_ALLOWED
    const unauthRes = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { credential: 'token-unauthorized' },
    });
    expect(unauthRes.statusCode).toBe(403);
    expect(JSON.parse(unauthRes.body).error).toBe('GOOGLE_EMAIL_NOT_ALLOWED');

    // 3. Wrong audience / invalid token -> 401 GOOGLE_TOKEN_INVALID
    const wrongAudRes = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { credential: 'token-wrong-audience' },
    });
    expect(wrongAudRes.statusCode).toBe(401);
    expect(JSON.parse(wrongAudRes.body).error).toBe('GOOGLE_TOKEN_INVALID');
  });

  it('rejects role mismatch when an allowlisted user requests unauthorized role', async () => {
    const app = buildApiServer({
      allowDevKeys: true,
      googleVerifier: mockGoogleVerifier,
    });
    await app.ready();

    // Regulator email attempts to sign in as Operator
    const mismatchRes = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: {
        credential: 'token-regulator',
        role: 'operator',
      },
    });

    expect(mismatchRes.statusCode).toBe(403);
    const body = JSON.parse(mismatchRes.body);
    expect(body.error).toBe('ROLE_MISMATCH');
  });

  it('enforces that Regulator is read-only while Operator can clear the market', async () => {
    const testOpPrivateKey = generatePrivateKey();
    const app = buildApiServer({
      allowDevKeys: true,
      googleVerifier: mockGoogleVerifier,
      operatorPrivateKey: testOpPrivateKey,
    });
    await app.ready();

    // 1. Obtain Regulator Token
    const regRes = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { credential: 'token-regulator', role: 'regulator' },
    });
    const regToken = JSON.parse(regRes.body).token;

    // 2. Obtain Operator Token
    const opRes = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { credential: 'token-operator', role: 'discom' },
    });
    const opToken = JSON.parse(opRes.body).token;

    // 3. Regulator can access read-only audit endpoints
    const auditRes = await app.inject({
      method: 'GET',
      url: '/api/v1/security/metrics',
      headers: { authorization: `Bearer ${regToken}` },
    });
    expect(auditRes.statusCode).toBe(200);

    // 4. Regulator attempts to clear market -> 403 FORBIDDEN
    const regClearRes = await app.inject({
      method: 'POST',
      url: '/api/v1/markets/zones/1/clear/0',
      headers: { authorization: `Bearer ${regToken}` },
    });
    expect(regClearRes.statusCode).toBe(403);
    const regClearBody = JSON.parse(regClearRes.body);
    expect(regClearBody.error).toBe('CLEAR_UNAUTHORIZED');

    // 5. Operator attempts to clear market -> succeeds
    const opClearRes = await app.inject({
      method: 'POST',
      url: '/api/v1/markets/zones/1/clear/0',
      headers: { authorization: `Bearer ${opToken}` },
    });
    expect(opClearRes.statusCode).toBe(200);
    const opClearBody = JSON.parse(opClearRes.body);
    expect(opClearBody.zoneId).toBe(1);
    expect(opClearBody.intervalIdx).toBe(0);
    expect(opClearBody.clearingPricePaiseKWh).toBeDefined();

    // 6. Regulator attempts to call commit-clearing -> 403 FORBIDDEN
    const regCommitRes = await app.inject({
      method: 'POST',
      url: '/api/v1/markets/zones/1/commit-clearing/0',
      headers: { authorization: `Bearer ${regToken}` },
    });
    expect(regCommitRes.statusCode).toBe(403);
  });
});
