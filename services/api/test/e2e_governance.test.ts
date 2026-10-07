import { describe, it, expect, beforeEach } from 'vitest';
import { buildApiServer } from '../src/app.js';
import { FastifyInstance } from 'fastify';
import { OrderSide, ParticipantRole } from '@energy-dex/types';

describe('End-to-End Governance, Role Isolation & Audit Verification (Part 25)', () => {
  let app: FastifyInstance;

  // Distinct wallets as specified in Part 25:
  // Wallet A: REGULATOR
  // Wallet B: MARKET_OPERATOR
  // Wallet C: BUYER
  // Wallet D: SELLER
  const walletA_Regulator = '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65';
  const walletB_Operator = '0x90f79bf6eb2c4f870365e785982e1f101e93b906';
  const walletC_Buyer = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
  const walletD_Seller = '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc';
  const adminWallet = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';

  let tokenA: string;
  let tokenB: string;
  let tokenC: string;
  let tokenD: string;

  beforeEach(async () => {
    app = buildApiServer();
    await app.ready();

    tokenA = app.jwt.sign({ address: walletA_Regulator, role: 'regulator' });
    tokenB = app.jwt.sign({ address: walletB_Operator, role: 'discom' });
    tokenC = app.jwt.sign({ address: walletC_Buyer });
    tokenD = app.jwt.sign({ address: walletD_Seller });
  });

  it('executes full 14-step governance lifecycle with strict role isolation and tamper evidence', async () => {
    // -------------------------------------------------------------------------
    // Step 1: Authoritative Governance Registry Initialization
    // -------------------------------------------------------------------------
    const govStatusRes = await app.inject({
      method: 'GET',
      url: '/api/v1/governance/status',
    });
    expect(govStatusRes.statusCode).toBe(200);
    const govStatus = JSON.parse(govStatusRes.payload);
    expect(govStatus.status).toBe('ACTIVE');

    const memberARes = await app.inject({
      method: 'GET',
      url: `/api/v1/governance/members/${walletA_Regulator}`,
    });
    expect(memberARes.statusCode).toBe(200);
    const memberA = JSON.parse(memberARes.payload);
    expect(memberA.role).toBe('REGULATOR');
    expect(memberA.status).toBe('ACTIVE');

    const memberBRes = await app.inject({
      method: 'GET',
      url: `/api/v1/governance/members/${walletB_Operator}`,
    });
    expect(memberBRes.statusCode).toBe(200);
    const memberB = JSON.parse(memberBRes.payload);
    expect(memberB.role).toBe('MARKET_OPERATOR');
    expect(memberB.jurisdiction).toBe('ZONE-01');

    // -------------------------------------------------------------------------
    // Step 2: Register Wallet C as BUYER and Wallet D as SELLER
    // -------------------------------------------------------------------------
    const regCRes = await app.inject({
      method: 'POST',
      url: '/api/v1/participants/register',
      headers: { authorization: `Bearer ${tokenC}` },
      payload: {
        zoneId: 1,
        discomAccountNumber: 'CA-DELHI-BUYER-01',
        roleType: ParticipantRole.CONSUMER,
      },
    });
    expect(regCRes.statusCode).toBe(201);

    const regDRes = await app.inject({
      method: 'POST',
      url: '/api/v1/participants/register',
      headers: { authorization: `Bearer ${tokenD}` },
      payload: {
        zoneId: 1,
        discomAccountNumber: 'CA-DELHI-SELLER-01',
        roleType: ParticipantRole.PROSUMER,
      },
    });
    expect(regDRes.statusCode).toBe(201);

    // Onboard solar device for seller
    await app.inject({
      method: 'POST',
      url: '/api/v1/devices',
      headers: { authorization: `Bearer ${tokenD}` },
      payload: {
        deviceId: 'dev-solar-001',
        meterSerialNumber: 'MTR-SLR-9988',
        sourceType: 1,
        ratedCapacityW: '10000',
      },
    });

    // -------------------------------------------------------------------------
    // Step 3: Attempt: Wallet A tries to register as participant -> BLOCKED
    // -------------------------------------------------------------------------
    const regABlockedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/participants/register',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        zoneId: 1,
        discomAccountNumber: 'CA-DELHI-REG-01',
        roleType: ParticipantRole.PROSUMER,
      },
    });
    expect(regABlockedRes.statusCode).toBe(403);
    const regABody = JSON.parse(regABlockedRes.payload);
    expect(regABody.error).toBe('GOVERNANCE_WALLET_CANNOT_BE_ECONOMIC_PARTICIPANT');

    // -------------------------------------------------------------------------
    // Step 4: Attempt: Wallet A tries to submit BUY order -> BLOCKED
    // -------------------------------------------------------------------------
    const orderABlockedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        zoneId: 1,
        intervalIdx: 30,
        side: OrderSide.BUY,
        quantityWh: '5000',
        pricePaisePerKWh: '500',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    expect(orderABlockedRes.statusCode).toBe(403);
    const orderABody = JSON.parse(orderABlockedRes.payload);
    expect(orderABody.error).toBe('GOVERNANCE_IDENTITY_CANNOT_TRADE');

    // -------------------------------------------------------------------------
    // Step 5: Attempt: Wallet B tries to submit SELL order -> BLOCKED
    // -------------------------------------------------------------------------
    const orderBBlockedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${tokenB}` },
      payload: {
        zoneId: 1,
        intervalIdx: 30,
        side: OrderSide.SELL,
        quantityWh: '5000',
        pricePaisePerKWh: '400',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    expect(orderBBlockedRes.statusCode).toBe(403);
    const orderBBody = JSON.parse(orderBBlockedRes.payload);
    expect(orderBBody.error).toBe('GOVERNANCE_IDENTITY_CANNOT_TRADE');

    // -------------------------------------------------------------------------
    // Step 6: Wallet C submits legitimate BUY order -> SUCCESS
    // -------------------------------------------------------------------------
    const orderCRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${tokenC}` },
      payload: {
        zoneId: 1,
        intervalIdx: 30,
        side: OrderSide.BUY,
        quantityWh: '4000',
        pricePaisePerKWh: '550',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    expect(orderCRes.statusCode).toBe(201);

    // -------------------------------------------------------------------------
    // Step 7: Wallet D submits legitimate SELL order -> SUCCESS
    // -------------------------------------------------------------------------
    const orderDRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${tokenD}` },
      payload: {
        zoneId: 1,
        intervalIdx: 30,
        side: OrderSide.SELL,
        quantityWh: '4000',
        pricePaisePerKWh: '450',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    expect(orderDRes.statusCode).toBe(201);

    // -------------------------------------------------------------------------
    // Step 8: Wallet C tries to clear market -> BLOCKED
    // -------------------------------------------------------------------------
    const clearCBlockedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/markets/zones/1/clear/30',
      headers: { authorization: `Bearer ${tokenC}` },
    });
    expect(clearCBlockedRes.statusCode).toBe(403);
    const clearCErr = JSON.parse(clearCBlockedRes.payload);
    expect(clearCErr.error).toBe('CLEAR_UNAUTHORIZED');

    // -------------------------------------------------------------------------
    // Step 9: Wallet A (Regulator) tries to clear market -> BLOCKED
    // -------------------------------------------------------------------------
    const clearABlockedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/markets/zones/1/clear/30',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(clearABlockedRes.statusCode).toBe(403);
    const clearAErr = JSON.parse(clearABlockedRes.payload);
    expect(clearAErr.error).toBe('CLEAR_UNAUTHORIZED');

    // -------------------------------------------------------------------------
    // Step 10: Wallet B (Authorized Market Operator) executes authorized market clearing -> SUCCESS
    // -------------------------------------------------------------------------
    const clearBRes = await app.inject({
      method: 'POST',
      url: '/api/v1/markets/zones/1/clear/30',
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(clearBRes.statusCode).toBe(200);
    const clearBBody = JSON.parse(clearBRes.payload);
    expect(clearBBody.clearedVolumeWh).toBe('4000');
    expect(clearBBody.clearingPricePaiseKWh).toBe('500'); // (550 + 450) / 2
    expect(clearBBody.obligationsCount).toBe(1);

    // -------------------------------------------------------------------------
    // Step 11: Wallet B tries to participate economically / receive settlement -> BLOCKED
    // -------------------------------------------------------------------------
    const tradeConflictB = (app as any).governance.checkTradingConflict(walletB_Operator, OrderSide.SELL);
    expect(tradeConflictB.conflict).toBe(true);
    expect(tradeConflictB.failureCode).toBe('GOVERNANCE_IDENTITY_CANNOT_TRADE');

    // -------------------------------------------------------------------------
    // Step 12: Wallet A queries market clearing result, audit logs, security events -> SUCCESS
    // -------------------------------------------------------------------------
    const queryClearRes = await app.inject({
      method: 'GET',
      url: '/api/v1/clearing/1/30',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(queryClearRes.statusCode).toBe(200);

    const auditTrailRes = await app.inject({
      method: 'GET',
      url: '/api/v1/security/audit-trail',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(auditTrailRes.statusCode).toBe(200);
    const auditEvents = JSON.parse(auditTrailRes.payload);
    expect(auditEvents.length).toBeGreaterThan(5);

    const secEventsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/security/events',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(secEventsRes.statusCode).toBe(200);
    const secEvents = JSON.parse(secEventsRes.payload);
    expect(secEvents.some((e: any) => e.action === 'GOVERNANCE_TRADE_ATTEMPT')).toBe(true);
    expect(secEvents.some((e: any) => e.action === 'GOVERNANCE_PARTICIPANT_REGISTRATION_ATTEMPT')).toBe(true);
    expect(secEvents.some((e: any) => e.action === 'UNAUTHORIZED_MARKET_CLEAR')).toBe(true);

    // -------------------------------------------------------------------------
    // Step 13: Wallet A temporarily suspends market session or oracle -> SUCCESS
    // -------------------------------------------------------------------------
    const suspendMarketRes = await app.inject({
      method: 'POST',
      url: '/api/v1/governance/market/suspend',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        zoneId: 1,
        reason: 'Emergency grid frequency fluctuation under regulatory review',
      },
    });
    expect(suspendMarketRes.statusCode).toBe(200);

    // Now clear attempt on suspended zone is blocked
    const clearSuspendedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/markets/zones/1/clear/30',
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(clearSuspendedRes.statusCode).toBe(403);
    const suspErr = JSON.parse(clearSuspendedRes.payload);
    expect(suspErr.error).toBe('MARKET_SUSPENDED_BY_REGULATOR');

    // -------------------------------------------------------------------------
    // Step 14: Verify full audit trail and tamper evidence for entire lifecycle
    // -------------------------------------------------------------------------
    const verifyRes = await app.inject({
      method: 'GET',
      url: '/api/v1/security/audit-trail/verify',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(verifyRes.statusCode).toBe(200);
    const verifyData = JSON.parse(verifyRes.payload);
    expect(verifyData.valid).toBe(true);
    expect(verifyData.verifiedEventsCount).toBeGreaterThan(5);
    expect(verifyData.headHash).toBeDefined();

    // Verify system security metrics
    const metricsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/security/metrics',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(metricsRes.statusCode).toBe(200);
    const metrics = JSON.parse(metricsRes.payload);
    expect(metrics.totalBlockedActions).toBeGreaterThan(0);
    expect(metrics.conflictEventsCount).toBeGreaterThan(0);
    expect(metrics.hashChainValid).toBe(true);
  });
});
