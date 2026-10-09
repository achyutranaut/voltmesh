import { describe, it, expect } from 'vitest';
import { buildApiServer } from '../src/app.js';
import { AuditLogger } from '../src/governance/auditLogger.js';
import { GovernanceRegistry } from '../src/governance/governanceRegistry.js';

describe('Authentication Token Verification & Rejection (Step 4)', () => {
  it('returns 200 with valid JWT and 401 when token is missing or invalid', async () => {
    const logger = new AuditLogger();
    const governance = new GovernanceRegistry();
    const app = buildApiServer({
      auditLogger: logger,
      governanceRegistry: governance,
      allowDevKeys: true,
    });
    await app.ready();

    const regWallet = '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65';
    const validToken = app.jwt.sign({
      sub: regWallet,
      address: regWallet,
      role: 'regulator',
    });

    // 1. Missing token -> 401
    const unauthRes = await app.inject({
      method: 'GET',
      url: '/api/v1/security/metrics',
    });
    expect(unauthRes.statusCode).toBe(401);

    // 2. Invalid/tampered token -> 401
    const invalidRes = await app.inject({
      method: 'GET',
      url: '/api/v1/security/metrics',
      headers: {
        authorization: 'Bearer bad.token.value',
      },
    });
    expect(invalidRes.statusCode).toBe(401);

    // 3. Valid signed token -> 200
    const validRes = await app.inject({
      method: 'GET',
      url: '/api/v1/security/metrics',
      headers: {
        authorization: `Bearer ${validToken}`,
      },
    });
    expect(validRes.statusCode).toBe(200);
    const body = JSON.parse(validRes.body);
    expect(body.systemIntegrity).toBeDefined();
    expect(body.oracleQuorumHealth).toBeDefined();

    // 4. Test authenticated advisor endpoint /api/v1/advisor/ask
    const unauthAdvisor = await app.inject({
      method: 'POST',
      url: '/api/v1/advisor/ask',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        question: 'System health summary?',
      },
    });
    expect(unauthAdvisor.statusCode).toBe(401);

    const validAdvisor = await app.inject({
      method: 'POST',
      url: '/api/v1/advisor/ask',
      headers: {
        authorization: `Bearer ${validToken}`,
        'content-type': 'application/json',
      },
      payload: {
        question: 'System health summary?',
      },
    });
    expect(validAdvisor.statusCode).toBe(200);
    const advBody = JSON.parse(validAdvisor.body);
    expect(advBody.summary).toBeDefined();
  });
});
