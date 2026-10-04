import { describe, it, expect, beforeEach } from 'vitest';
import { buildApiServer, deriveParticipantId } from '../src/app.js';
import { ParticipantRole, OrderSide, SourceType } from '@energy-dex/types';
import { FastifyInstance } from 'fastify';

describe('Step 1: Participant Identity, Authorization & Self-Trade Hardening', () => {
  let app: FastifyInstance;
  const operatorWallet = '0x1234567890123456789012345678901234567890';
  const prosumerWallet = '0x1111111111111111111111111111111111111111';
  const consumerWallet = '0x2222222222222222222222222222222222222222';
  const sybilWallet = '0x9999999999999999999999999999999999999999';

  let operatorToken: string;
  let prosumerToken: string;
  let consumerToken: string;

  beforeEach(async () => {
    app = buildApiServer();
    await app.ready();
    (app as any).setUserRole(operatorWallet, 'OPERATOR');

    operatorToken = app.jwt.sign({ address: operatorWallet, role: 'OPERATOR' });
    prosumerToken = app.jwt.sign({ address: prosumerWallet });
    consumerToken = app.jwt.sign({ address: consumerWallet });
  });

  // ---------------------------------------------------------------------------
  // 1. Participant ID Generation — Collision Resistance
  // ---------------------------------------------------------------------------
  it('test_ParticipantIdCollisionResistance: wallets sharing 8-char prefixes produce distinct 256-bit IDs', () => {
    const walletA = '0x11111111aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const walletB = '0x11111111bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    // The first 10 characters (including 0x) are identical
    expect(walletA.slice(0, 10)).toBe(walletB.slice(0, 10));

    const idA = deriveParticipantId(walletA);
    const idB = deriveParticipantId(walletB);

    // Legacy truncation would produce identical `part-0x111111`
    expect(idA).not.toBe(idB);
    expect(idA.length).toBeGreaterThan(64); // Full 256-bit hash prefix
    expect(idB.length).toBeGreaterThan(64);
  });

  // ---------------------------------------------------------------------------
  // 2. Identity Verification & Role Escalation Prevention
  // ---------------------------------------------------------------------------
  it('test_ArbitraryRoleRegistrationRejected: client cannot escalate role to PROSUMER without utility record', async () => {
    // 1008765432 is a pure consumer in DISCOM database
    const escalateRes = await app.inject({
      method: 'POST',
      url: '/api/v1/participants/register',
      headers: { authorization: `Bearer ${consumerToken}` },
      payload: {
        zoneId: 1,
        discomAccountNumber: '1008765432',
        roleType: ParticipantRole.PROSUMER, // Malicious client claims to be a prosumer
      },
    });

    expect(escalateRes.statusCode).toBe(400);
    const body = JSON.parse(escalateRes.payload);
    expect(body.error).toBe('ROLE_ESCALATION_REJECTED');
  });

  it('test_PureConsumerDefaultAndCannotSell: pure consumer can BUY but cannot submit SELL asks', async () => {
    // Register consumer legitimately
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/participants/register',
      headers: { authorization: `Bearer ${consumerToken}` },
      payload: {
        zoneId: 1,
        discomAccountNumber: '1008765432',
        roleType: ParticipantRole.CONSUMER,
      },
    });
    expect(regRes.statusCode).toBe(201);

    // Refresh token with new version
    const updatedToken = app.jwt.sign({ address: consumerWallet, tokenVersion: 1 });

    // Attempt SELL ask -> 403 Forbidden
    const sellRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${updatedToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: 48,
        side: OrderSide.SELL,
        quantityWh: '2000',
        pricePaisePerKWh: '450',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    expect(sellRes.statusCode).toBe(403);
    const sellErr = JSON.parse(sellRes.payload);
    expect(sellErr.error).toBe('CONSUMER_CANNOT_SELL');

    // Attempt BUY bid -> 201 Created
    const buyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${updatedToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: 48,
        side: OrderSide.BUY,
        quantityWh: '2000',
        pricePaisePerKWh: '500',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    expect(buyRes.statusCode).toBe(201);
  });

  // ---------------------------------------------------------------------------
  // 3. Self-Trade Prevention (STP)
  // ---------------------------------------------------------------------------
  it('test_SameWalletOpposingOrders_RejectedAtEntry: same wallet cannot submit opposing BUY and SELL orders in same interval', async () => {
    // Register prosumer (1002345678 has verified solar in mock DB)
    await app.inject({
      method: 'POST',
      url: '/api/v1/participants/register',
      headers: { authorization: `Bearer ${prosumerToken}` },
      payload: {
        zoneId: 1,
        discomAccountNumber: '1002345678',
        roleType: ParticipantRole.PROSUMER,
      },
    });

    const activeProsumerToken = app.jwt.sign({ address: prosumerWallet, tokenVersion: 1 });

    // Declare energy position so seller capability is fully verified
    await app.inject({
      method: 'POST',
      url: '/api/v1/energy/positions/declare',
      headers: { authorization: `Bearer ${activeProsumerToken}` },
      payload: {
        intervalIdx: 30,
        declaredAvailableWh: '5000',
        installedSolarCapacityW: '20000',
      },
    });

    // 1. Submit SELL order
    const sellRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${activeProsumerToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: 30,
        side: OrderSide.SELL,
        quantityWh: '3000',
        pricePaisePerKWh: '400',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    expect(sellRes.statusCode).toBe(201);

    // 2. Submit opposing BUY order from same wallet for same interval -> 409 Conflict
    const buyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${activeProsumerToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: 30,
        side: OrderSide.BUY,
        quantityWh: '3000',
        pricePaisePerKWh: '450',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    expect(buyRes.statusCode).toBe(409);
    const buyErr = JSON.parse(buyRes.payload);
    expect(buyErr.error).toBe('SELF_TRADE_PROHIBITED');
  });

  // ---------------------------------------------------------------------------
  // 4. Market-Clearing Authorization
  // ---------------------------------------------------------------------------
  it('test_ParticipantCannotClearMarket: regular participant wallet rejected with 403 CLEAR_UNAUTHORIZED', async () => {
    const clearRes = await app.inject({
      method: 'POST',
      url: '/api/v1/markets/zones/1/clear/30',
      headers: { authorization: `Bearer ${prosumerToken}` },
    });
    expect(clearRes.statusCode).toBe(403);
    const clearErr = JSON.parse(clearRes.payload);
    expect(clearErr.error).toBe('CLEAR_UNAUTHORIZED');
  });

  it('test_OperatorCanClearMarket: operator wallet successfully clears market', async () => {
    const clearRes = await app.inject({
      method: 'POST',
      url: '/api/v1/markets/zones/1/clear/30',
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(clearRes.statusCode).toBe(200);
    const clearBody = JSON.parse(clearRes.payload);
    expect(clearBody.zoneId).toBe(1);
    expect(clearBody.intervalIdx).toBe(30);
  });

  // ---------------------------------------------------------------------------
  // 5. Device Registration Authorization & Bounded Capacity
  // ---------------------------------------------------------------------------
  it('test_DeviceRegistrationRequiresCapabilityAndBoundedCapacity', async () => {
    // 1. Unregistered wallet cannot register device
    const unregRes = await app.inject({
      method: 'POST',
      url: '/api/v1/devices/register',
      headers: { authorization: `Bearer ${consumerToken}` },
      payload: {
        deviceId: 'meter-unreg-01',
        meterSerialNumber: 'MTR-999',
        sourceType: SourceType.SOLAR_PV,
        ratedCapacityW: '5000',
      },
    });
    expect(unregRes.statusCode).toBe(403);

    // 2. Issue VC for prosumer with 8 kW capacity
    await app.inject({
      method: 'POST',
      url: '/api/v1/utility/credentials/issue',
      headers: { authorization: `Bearer ${prosumerToken}` },
      payload: { consumerNumber: '1002345678' },
    });

    // Register prosumer
    await app.inject({
      method: 'POST',
      url: '/api/v1/participants/register',
      headers: { authorization: `Bearer ${prosumerToken}` },
      payload: {
        zoneId: 1,
        discomAccountNumber: '1002345678',
        roleType: ParticipantRole.PROSUMER,
      },
    });

    const activeProsumerToken = app.jwt.sign({ address: prosumerWallet, tokenVersion: 2 });

    // 3. Attempt to register device exceeding verified 8 kW (e.g. 50 kW) -> 400 Bad Request
    const exceedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/devices/register',
      headers: { authorization: `Bearer ${activeProsumerToken}` },
      payload: {
        deviceId: 'meter-exceed-01',
        meterSerialNumber: 'MTR-100',
        sourceType: SourceType.SOLAR_PV,
        ratedCapacityW: '50000', // 50 kW > 8 kW verified
      },
    });
    expect(exceedRes.statusCode).toBe(400);
    const exceedErr = JSON.parse(exceedRes.payload);
    expect(exceedErr.error).toBe('CAPACITY_EXCEEDS_CREDENTIAL');

    // 4. Register within bounds (5 kW <= 8 kW) -> 201 Created
    const validRes = await app.inject({
      method: 'POST',
      url: '/api/v1/devices/register',
      headers: { authorization: `Bearer ${activeProsumerToken}` },
      payload: {
        deviceId: 'meter-valid-01',
        meterSerialNumber: 'MTR-101',
        sourceType: SourceType.SOLAR_PV,
        ratedCapacityW: '5000',
      },
    });
    expect(validRes.statusCode).toBe(201);
  });

  // ---------------------------------------------------------------------------
  // 6. Token Invalidation on Role/Credential Revocation
  // ---------------------------------------------------------------------------
  it('test_TokenInvalidationOnRoleOrCredentialChange: stale tokens rejected with 401', async () => {
    // Generate initial token with tokenVersion 0
    const oldToken = app.jwt.sign({ address: prosumerWallet, tokenVersion: 0 });

    // Register participant (increments tokenVersion to 1)
    await app.inject({
      method: 'POST',
      url: '/api/v1/participants/register',
      headers: { authorization: `Bearer ${oldToken}` },
      payload: {
        zoneId: 1,
        discomAccountNumber: '1002345678',
        roleType: ParticipantRole.PROSUMER,
      },
    });

    // Old token with tokenVersion 0 should now be rejected as revoked
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/participants/me',
      headers: { authorization: `Bearer ${oldToken}` },
    });
    expect(meRes.statusCode).toBe(401);
    const meErr = JSON.parse(meRes.payload);
    expect(meErr.error).toBe('TOKEN_REVOKED');
  });

  // ---------------------------------------------------------------------------
  // 7. Legitimate Trade Execution Between Two Distinct Wallets
  // ---------------------------------------------------------------------------
  it('test_TwoDistinctWalletsLegitimateTradeExecution: legitimate trade clears successfully', async () => {
    // Issue credential & register prosumer
    await app.inject({
      method: 'POST',
      url: '/api/v1/utility/credentials/issue',
      headers: { authorization: `Bearer ${prosumerToken}` },
      payload: { consumerNumber: '1002345678' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/participants/register',
      headers: { authorization: `Bearer ${prosumerToken}` },
      payload: {
        zoneId: 1,
        discomAccountNumber: '1002345678',
        roleType: ParticipantRole.PROSUMER,
      },
    });

    const validProsumerToken = app.jwt.sign({ address: prosumerWallet, tokenVersion: 2 });

    // Declare position (20 kW system allows up to 5000 Wh in a 15-min interval)
    await app.inject({
      method: 'POST',
      url: '/api/v1/energy/positions/declare',
      headers: { authorization: `Bearer ${validProsumerToken}` },
      payload: {
        intervalIdx: 40,
        declaredAvailableWh: '4000',
        installedSolarCapacityW: '20000',
      },
    });

    // Prosumer submits SELL order for 4000 Wh @ 400 paise/kWh
    const sellRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${validProsumerToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: 40,
        side: OrderSide.SELL,
        quantityWh: '4000',
        pricePaisePerKWh: '400',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    expect(sellRes.statusCode).toBe(201);

    // Consumer submits BUY order for 4000 Wh @ 450 paise/kWh
    const buyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${consumerToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: 40,
        side: OrderSide.BUY,
        quantityWh: '4000',
        pricePaisePerKWh: '450',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    expect(buyRes.statusCode).toBe(201);

    // Operator clears the market for interval 40
    const clearRes = await app.inject({
      method: 'POST',
      url: '/api/v1/markets/zones/1/clear/40',
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(clearRes.statusCode).toBe(200);
    const clearBody = JSON.parse(clearRes.payload);

    expect(clearBody.clearedVolumeWh).toBe('4000');
    expect(clearBody.obligations.length).toBe(1);
    expect(clearBody.obligations[0].buyer.toLowerCase()).toBe(consumerWallet.toLowerCase());
    expect(clearBody.obligations[0].seller.toLowerCase()).toBe(prosumerWallet.toLowerCase());
    expect(clearBody.obligations[0].quantityWh).toBe('4000');
  });

  // ---------------------------------------------------------------------------
  // 8. Prosumer Interval Flexibility (BUY in off-peak, SELL in solar hours)
  // ---------------------------------------------------------------------------
  it('test_ProsumerBuyAndSellIntervalFlexibility: prosumer can BUY in interval 10 and SELL in interval 48', async () => {
    // Register prosumer
    await app.inject({
      method: 'POST',
      url: '/api/v1/participants/register',
      headers: { authorization: `Bearer ${prosumerToken}` },
      payload: {
        zoneId: 1,
        discomAccountNumber: '1002345678',
        roleType: ParticipantRole.PROSUMER,
      },
    });
    const validToken = app.jwt.sign({ address: prosumerWallet, tokenVersion: 1 });

    // Declare solar position for interval 48 (12:00 PM solar peak)
    await app.inject({
      method: 'POST',
      url: '/api/v1/energy/positions/declare',
      headers: { authorization: `Bearer ${validToken}` },
      payload: {
        intervalIdx: 48,
        declaredAvailableWh: '5000',
        installedSolarCapacityW: '20000',
      },
    });

    // 1. Prosumer BUYS energy in interval 10 (early morning consumption)
    const buyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${validToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: 10,
        side: OrderSide.BUY,
        quantityWh: '2000',
        pricePaisePerKWh: '450',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    expect(buyRes.statusCode).toBe(201);

    // 2. Prosumer SELLS energy in interval 48 (solar generation)
    const sellRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${validToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: 48,
        side: OrderSide.SELL,
        quantityWh: '3000',
        pricePaisePerKWh: '400',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    expect(sellRes.statusCode).toBe(201);
  });
});
