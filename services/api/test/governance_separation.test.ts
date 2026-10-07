import { describe, it, expect, beforeEach } from 'vitest';
import { buildApiServer } from '../src/app.js';
import { FastifyInstance } from 'fastify';
import { OrderSide, ParticipantRole } from '@energy-dex/types';

describe('Governance Role Isolation & Separation (GOV-01 to GOV-20)', () => {
  let app: FastifyInstance;

  // Key identities
  const adminWallet = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
  const regulatorWallet = '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65';
  const operatorWallet = '0x90f79bf6eb2c4f870365e785982e1f101e93b906'; // Authorized for ZONE-01
  const auditorWallet = '0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f';
  const buyerWallet = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
  const sellerWallet = '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc';
  const unregisteredWallet = '0x9999999999999999999999999999999999999999';

  let adminToken: string;
  let regulatorToken: string;
  let operatorToken: string;
  let auditorToken: string;
  let buyerToken: string;
  let sellerToken: string;
  let unregToken: string;

  beforeEach(async () => {
    app = buildApiServer();
    await app.ready();

    adminToken = app.jwt.sign({ address: adminWallet, role: 'ADMIN' });
    regulatorToken = app.jwt.sign({ address: regulatorWallet, role: 'regulator' });
    operatorToken = app.jwt.sign({ address: operatorWallet, role: 'discom' });
    auditorToken = app.jwt.sign({ address: auditorWallet, role: 'regulator' });
    buyerToken = app.jwt.sign({ address: buyerWallet });
    sellerToken = app.jwt.sign({ address: sellerWallet });
    unregToken = app.jwt.sign({ address: unregisteredWallet });

    // Register buyer and seller in participant store
    await app.inject({
      method: 'POST',
      url: '/api/v1/participants/register',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: { zoneId: 1, discomAccountNumber: 'CA-DELHI-100876', roleType: ParticipantRole.CONSUMER },
    });

    await app.inject({
      method: 'POST',
      url: '/api/v1/participants/register',
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: { zoneId: 1, discomAccountNumber: 'CA-DELHI-100234', roleType: ParticipantRole.PROSUMER },
    });
  });

  // GOV-01: Unregistered wallet cannot become regulator
  it('GOV-01: Unregistered wallet cannot become regulator via self-asserted token or header', async () => {
    const maliciousToken = app.jwt.sign({ address: unregisteredWallet, role: 'REGULATOR' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/governance/investigate',
      headers: { authorization: `Bearer ${maliciousToken}` },
      payload: { targetWallet: sellerWallet, reason: 'Unauthorized inquiry' },
    });
    // Unregistered wallet asserting regulator role is downgraded to participant and blocked
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('INSUFFICIENT_PERMISSIONS');
  });

  // GOV-02: Unregistered wallet cannot become market operator
  it('GOV-02: Unregistered wallet cannot become market operator', async () => {
    const maliciousToken = app.jwt.sign({ address: unregisteredWallet, role: 'MARKET_OPERATOR' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/markets/zones/1/clear/30',
      headers: { authorization: `Bearer ${maliciousToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  // GOV-03: Governance member with REGULATOR role cannot BUY
  it('GOV-03: Governance member with REGULATOR role cannot BUY', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${regulatorToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: 30,
        side: OrderSide.BUY,
        quantityWh: '5000',
        pricePaisePerKWh: '450',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('GOVERNANCE_IDENTITY_CANNOT_TRADE');
  });

  // GOV-04: Governance member with REGULATOR role cannot SELL
  it('GOV-04: Governance member with REGULATOR role cannot SELL', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${regulatorToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: 30,
        side: OrderSide.SELL,
        quantityWh: '5000',
        pricePaisePerKWh: '450',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('GOVERNANCE_IDENTITY_CANNOT_TRADE');
  });

  // GOV-05: MARKET_OPERATOR cannot BUY
  it('GOV-05: MARKET_OPERATOR cannot BUY', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${operatorToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: 30,
        side: OrderSide.BUY,
        quantityWh: '5000',
        pricePaisePerKWh: '450',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('GOVERNANCE_IDENTITY_CANNOT_TRADE');
  });

  // GOV-06: MARKET_OPERATOR cannot SELL
  it('GOV-06: MARKET_OPERATOR cannot SELL', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${operatorToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: 30,
        side: OrderSide.SELL,
        quantityWh: '5000',
        pricePaisePerKWh: '450',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('GOVERNANCE_IDENTITY_CANNOT_TRADE');
  });

  // GOV-07: AUDITOR cannot BUY
  it('GOV-07: AUDITOR cannot BUY', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${auditorToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: 30,
        side: OrderSide.BUY,
        quantityWh: '5000',
        pricePaisePerKWh: '450',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('GOVERNANCE_IDENTITY_CANNOT_TRADE');
  });

  // GOV-08: AUDITOR cannot SELL
  it('GOV-08: AUDITOR cannot SELL', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${auditorToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: 30,
        side: OrderSide.SELL,
        quantityWh: '5000',
        pricePaisePerKWh: '450',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('GOVERNANCE_IDENTITY_CANNOT_TRADE');
  });

  // GOV-09: Role tampering through sessionStorage fails
  it('GOV-09: Role tampering via client headers/sessionStorage fails (server ignores client claims)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/governance/investigate',
      headers: {
        authorization: `Bearer ${buyerToken}`,
        'x-simulated-role': 'REGULATOR',
        'x-client-role': 'REGULATOR',
      },
      payload: { targetWallet: sellerWallet, reason: 'Fake inquiry' },
    });
    expect(res.statusCode).toBe(403);
  });

  // GOV-10: JWT role tampering fails
  it('GOV-10: JWT role tampering fails (server verifies against authoritative GovernanceRegistry)', async () => {
    const tamperedToken = app.jwt.sign({ address: buyerWallet, role: 'regulator' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/governance/investigate',
      headers: { authorization: `Bearer ${tamperedToken}` },
      payload: { targetWallet: sellerWallet, reason: 'Fake inquiry' },
    });
    expect(res.statusCode).toBe(403);
  });

  // GOV-11: Expired governance credential fails
  it('GOV-11: Expired governance credential fails clearing authorization', async () => {
    const expiredWallet = '0x71c56538b1a51e719772560ec83da2300a0be366';
    const gov = (app as any).governanceRegistry;
    gov.registerMember(adminWallet, {
      organizationId: 'org-expired-utility',
      walletAddress: expiredWallet,
      role: 'MARKET_OPERATOR',
      jurisdiction: 'ZONE-01',
      expiresInSeconds: -10, // already expired
      credentialRef: 'CRED-EXPIRED-01',
    });

    const expToken = app.jwt.sign({ address: expiredWallet, role: 'OPERATOR' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/markets/zones/1/clear/30',
      headers: { authorization: `Bearer ${expToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('CREDENTIAL_EXPIRED');
  });

  // GOV-12: Suspended governance member fails
  it('GOV-12: Suspended governance member fails all privileged operations', async () => {
    // Admin suspends operator
    await app.inject({
      method: 'POST',
      url: `/api/v1/governance/members/${operatorWallet}/suspend`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { reason: 'Regulatory investigation pending' },
    });

    // Suspended operator tries to clear
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/markets/zones/1/clear/30',
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('MEMBER_SUSPENDED');
  });

  // GOV-13: Operator outside authorized zone cannot clear
  it('GOV-13: Operator outside authorized zone cannot clear market', async () => {
    // operatorWallet has jurisdiction ZONE-01 only
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/markets/zones/2/clear/30',
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('OPERATOR_ZONE_UNAUTHORIZED');
  });

  // GOV-14: Operator with conflict of interest cannot clear
  it('GOV-14: Operator with active economic orders in clearing batch cannot clear', async () => {
    // Register an operator that was manually injected orders
    const gov = (app as any).governanceRegistry;
    const sneakyOp = '0x8888888888888888888888888888888888888888';
    gov.registerMember(adminWallet, {
      organizationId: 'org-tpddl-utility',
      walletAddress: sneakyOp,
      role: 'MARKET_OPERATOR',
      jurisdiction: 'ZONE-01',
      credentialRef: 'CRED-MO-SNEAKY',
    });
    const sneakyToken = app.jwt.sign({ address: sneakyOp, role: 'OPERATOR' });

    // Directly seed an order under sneakyOp into the order book
    const check = gov.canClearMarket({
      actorWallet: sneakyOp,
      zoneId: 1,
      intervalIdx: 30,
      batchOrders: [{ participant: sneakyOp }],
      oracleQuorumHealthy: true,
    });
    expect(check.allowed).toBe(false);
    expect(check.failureCode).toBe('CONFLICT_OF_INTEREST');
  });

  // GOV-15: Unauthorized clear attempt creates audit event
  it('GOV-15: Unauthorized clear attempt creates attributable audit and security event', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/markets/zones/1/clear/30',
      headers: { authorization: `Bearer ${buyerToken}` },
    });

    const secRes = await app.inject({
      method: 'GET',
      url: '/api/v1/security/events',
      headers: { authorization: `Bearer ${regulatorToken}` },
    });
    expect(secRes.statusCode).toBe(200);
    const events = JSON.parse(secRes.payload);
    const unauthorizedEvent = events.find(
      (e: any) => e.actorWallet.toLowerCase() === buyerWallet.toLowerCase() && e.action === 'UNAUTHORIZED_MARKET_CLEAR'
    );
    expect(unauthorizedEvent).toBeDefined();
    expect(unauthorizedEvent.result).toBe('BLOCKED');
  });

  // GOV-16: Blocked trade attempt creates security event
  it('GOV-16: Blocked governance trade attempt creates critical security event', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${regulatorToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: 30,
        side: OrderSide.BUY,
        quantityWh: '5000',
        pricePaisePerKWh: '450',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });

    const secRes = await app.inject({
      method: 'GET',
      url: '/api/v1/security/events',
      headers: { authorization: `Bearer ${regulatorToken}` },
    });
    const events = JSON.parse(secRes.payload);
    const tradeEvent = events.find(
      (e: any) => e.actorWallet.toLowerCase() === regulatorWallet.toLowerCase() && e.action === 'GOVERNANCE_TRADE_ATTEMPT'
    );
    expect(tradeEvent).toBeDefined();
    expect(tradeEvent.severity).toBe('CRITICAL');
    expect(tradeEvent.result).toBe('BLOCKED');
  });

  // GOV-17: Governance wallet cannot register economic participant
  it('GOV-17: Governance wallet cannot register as economic participant', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/participants/register',
      headers: { authorization: `Bearer ${regulatorToken}` },
      payload: {
        zoneId: 1,
        discomAccountNumber: 'CA-DELHI-REG-999',
        roleType: ParticipantRole.PROSUMER,
      },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('GOVERNANCE_WALLET_CANNOT_BE_ECONOMIC_PARTICIPANT');
  });

  // GOV-18: Economic participant cannot grant itself governance role
  it('GOV-18: Economic participant cannot grant itself or others governance role', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/governance/members',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: {
        organizationId: 'org-fake',
        walletAddress: unregisteredWallet,
        role: 'REGULATOR',
        jurisdiction: 'DELHI-NCT',
        credentialRef: 'FAKE-CRED',
      },
    });
    expect(res.statusCode).toBe(403);
  });

  // GOV-19: Governance role cannot be switched from frontend
  it('GOV-19: Governance member attempting to switch role to buyer/seller is blocked with security audit', async () => {
    const switchToken = app.jwt.sign({ address: operatorWallet, role: 'seller' });
    await app.inject({
      method: 'GET',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${switchToken}` },
    });

    const secRes = await app.inject({
      method: 'GET',
      url: '/api/v1/security/events',
      headers: { authorization: `Bearer ${regulatorToken}` },
    });
    const events = JSON.parse(secRes.payload);
    const switchEvent = events.find((e: any) => e.action === 'GOVERNANCE_ROLE_SWITCH_ATTEMPT');
    expect(switchEvent).toBeDefined();
    expect(switchEvent.result).toBe('BLOCKED');
  });

  // GOV-20: Audit records cannot be deleted by normal users and verify hash chain integrity
  it('GOV-20: Audit hash chain is cryptographically verifiable and tamper-evident', async () => {
    // Normal user cannot delete or tamper audit events (no delete endpoints exist)
    const delRes = await app.inject({
      method: 'DELETE',
      url: '/api/v1/security/audit-trail',
      headers: { authorization: `Bearer ${buyerToken}` },
    });
    expect(delRes.statusCode).toBe(404);

    // Cryptographic audit chain verification
    const verifyRes = await app.inject({
      method: 'GET',
      url: '/api/v1/security/audit-trail/verify',
      headers: { authorization: `Bearer ${regulatorToken}` },
    });
    expect(verifyRes.statusCode).toBe(200);
    const verifyBody = JSON.parse(verifyRes.payload);
    expect(verifyBody.valid).toBe(true);
    expect(verifyBody.verifiedEventsCount).toBeGreaterThan(0);
    expect(verifyBody.headHash).toBeDefined();
  });
});
