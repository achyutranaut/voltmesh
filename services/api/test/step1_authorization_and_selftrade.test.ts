import { describe, it, expect, beforeEach } from 'vitest';
import { buildApiServer, deriveParticipantId } from '../src/app.js';
import { ParticipantRole, OrderSide, SourceType } from '@energy-dex/types';
import { FastifyInstance } from 'fastify';
import { privateKeyToAccount } from 'viem/accounts';

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

  // ---------------------------------------------------------------------------
  // 9. Challenge / Verify SIWE Flow & Role Resolution
  // ---------------------------------------------------------------------------
  it('test_SIWE_ChallengeVerifyAndRoleResolution: authenticates demo accounts and resolves role authoritative server-side', async () => {
    const sellerAcc = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a');
    const buyerAcc = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
    const discomAcc = privateKeyToAccount('0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6');
    const regulatorAcc = privateKeyToAccount('0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a');

    // 1. Seller challenge & verify
    const sellerChal = await app.inject({
      method: 'POST',
      url: '/auth/challenge',
      payload: { address: sellerAcc.address },
    });
    expect(sellerChal.statusCode).toBe(200);
    const { message: sellerMsg } = JSON.parse(sellerChal.payload);
    const sellerSig = await sellerAcc.signMessage({ message: sellerMsg });

    const sellerVer = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { address: sellerAcc.address, message: sellerMsg, signature: sellerSig },
    });
    expect(sellerVer.statusCode).toBe(200);
    const sellerRes = JSON.parse(sellerVer.payload);
    expect(sellerRes.role).toBe('seller');
    expect(sellerRes.token).toBeDefined();

    // 2. Buyer challenge & verify
    const buyerChal = await app.inject({
      method: 'POST',
      url: '/auth/challenge',
      payload: { address: buyerAcc.address },
    });
    const { message: buyerMsg } = JSON.parse(buyerChal.payload);
    const buyerSig = await buyerAcc.signMessage({ message: buyerMsg });

    const buyerVer = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { address: buyerAcc.address, message: buyerMsg, signature: buyerSig },
    });
    expect(buyerVer.statusCode).toBe(200);
    const buyerRes = JSON.parse(buyerVer.payload);
    expect(buyerRes.role).toBe('buyer');

    // 3. DISCOM challenge & verify
    const discomChal = await app.inject({
      method: 'POST',
      url: '/auth/challenge',
      payload: { address: discomAcc.address },
    });
    const { message: discomMsg } = JSON.parse(discomChal.payload);
    const discomSig = await discomAcc.signMessage({ message: discomMsg });

    const discomVer = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { address: discomAcc.address, message: discomMsg, signature: discomSig },
    });
    expect(discomVer.statusCode).toBe(200);
    const discomRes = JSON.parse(discomVer.payload);
    expect(discomRes.role).toBe('discom');

    // 4. Regulator challenge & verify
    const regChal = await app.inject({
      method: 'POST',
      url: '/auth/challenge',
      payload: { address: regulatorAcc.address },
    });
    const { message: regMsg } = JSON.parse(regChal.payload);
    const regSig = await regulatorAcc.signMessage({ message: regMsg });

    const regVer = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { address: regulatorAcc.address, message: regMsg, signature: regSig },
    });
    expect(regVer.statusCode).toBe(200);
    const regRes = JSON.parse(regVer.payload);
    expect(regRes.role).toBe('regulator');

    // 5. Unregistered wallet returns undefined role
    const unregAcc = privateKeyToAccount('0x0123456789012345678901234567890123456789012345678901234567890123');
    const unregChal = await app.inject({
      method: 'POST',
      url: '/auth/challenge',
      payload: { address: unregAcc.address },
    });
    const { message: unregMsg } = JSON.parse(unregChal.payload);
    const unregSig = await unregAcc.signMessage({ message: unregMsg });

    const unregVer = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { address: unregAcc.address, message: unregMsg, signature: unregSig },
    });
    expect(unregVer.statusCode).toBe(200);
    const unregRes = JSON.parse(unregVer.payload);
    expect(unregRes.role).toBeUndefined();
  });

  it('test_SIWE_SingleUseChallengeReplayPrevention: consumed challenge cannot be replayed', async () => {
    const sellerAcc = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a');

    const chal = await app.inject({
      method: 'POST',
      url: '/auth/challenge',
      payload: { address: sellerAcc.address },
    });
    const { message } = JSON.parse(chal.payload);
    const signature = await sellerAcc.signMessage({ message });

    // First verify succeeds
    const firstVer = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { address: sellerAcc.address, message, signature },
    });
    expect(firstVer.statusCode).toBe(200);

    // Second verify with same challenge message is rejected with 401
    const replayVer = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { address: sellerAcc.address, message, signature },
    });
    expect(replayVer.statusCode).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // 10. Order Participant Mismatch Enforcement
  // ---------------------------------------------------------------------------
  it('test_OrderParticipantMismatchRejected: order participant differing from token subject is rejected', async () => {
    const maliciousClaimRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${consumerToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: 15,
        side: OrderSide.BUY,
        quantityWh: '1000',
        pricePaisePerKWh: '400',
        expiry: Math.floor(Date.now() / 1000) + 3600,
        participant: '0x9999999999999999999999999999999999999999', // Claiming a different wallet
      },
    });

    expect(maliciousClaimRes.statusCode).toBe(403);
    const body = JSON.parse(maliciousClaimRes.payload);
    expect(body.error).toBe('PARTICIPANT_MISMATCH');
  });

  // ---------------------------------------------------------------------------
  // 11. Rapid Succession Orders Monotonic Nonce Collision Prevention
  // ---------------------------------------------------------------------------
  it('test_RapidSuccessionOrdersWithoutNonce: successive orders succeed without timestamp collision', async () => {
    const ordersBatch = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: { authorization: `Bearer ${consumerToken}` },
        payload: {
          zoneId: 1,
          intervalIdx: 21,
          side: OrderSide.BUY,
          quantityWh: '1000',
          pricePaisePerKWh: '400',
          expiry: Math.floor(Date.now() / 1000) + 3600,
        },
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: { authorization: `Bearer ${consumerToken}` },
        payload: {
          zoneId: 1,
          intervalIdx: 22,
          side: OrderSide.BUY,
          quantityWh: '1000',
          pricePaisePerKWh: '400',
          expiry: Math.floor(Date.now() / 1000) + 3600,
        },
      }),
    ]);

    expect(ordersBatch[0].statusCode).toBe(201);
    expect(ordersBatch[1].statusCode).toBe(201);
  });
});
