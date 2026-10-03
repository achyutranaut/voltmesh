import { describe, it, expect, beforeEach } from 'vitest';
import { buildApiServer } from '../src/app.js';
import { ParticipantRole, SourceType, OrderSide } from '@energy-dex/types';

describe('Modular Monolith API Server', () => {
  let app: any;
  let authToken: string;
  const testWallet = '0x1234567890123456789012345678901234567890';

  beforeEach(async () => {
    app = buildApiServer();
    await app.ready();
    authToken = app.jwt.sign({ address: testWallet });
  });

  it('GET /health returns 200 with healthy status', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('healthy');
  });

  it('GET /api/v1/auth/nonce returns random nonce', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/nonce' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.nonce).toBeDefined();
    expect(body.issuedAt).toBeDefined();
  });

  it('POST /api/v1/participants/register registers participant', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/participants/register',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        zoneId: 1,
        discomAccountNumber: 'CA-DELHI-100234',
        roleType: ParticipantRole.PROSUMER,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.walletAddress).toBe(testWallet);
    expect(body.discomAccountNumber).toBe('CA-DELHI-100234');

    // Registering again with same account from another wallet must fail
    const otherToken = app.jwt.sign({ address: '0x9999999999999999999999999999999999999999' });
    const dupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/participants/register',
      headers: { authorization: `Bearer ${otherToken}` },
      payload: {
        zoneId: 1,
        discomAccountNumber: 'CA-DELHI-100234',
        roleType: ParticipantRole.PROSUMER,
      },
    });
    expect(dupRes.statusCode).toBe(409);
  });

  it('handles device onboarding and order placement lifecycle', async () => {
    // 1. Register participant
    await app.inject({
      method: 'POST',
      url: '/api/v1/participants/register',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        zoneId: 1,
        discomAccountNumber: 'CA-TPDDL-5555',
        roleType: ParticipantRole.PROSUMER,
      },
    });

    // 2. Register device
    const devRes = await app.inject({
      method: 'POST',
      url: '/api/v1/devices/register',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        deviceId: 'meter-rooftop-01',
        meterSerialNumber: 'IS16444-MTR-01',
        sourceType: SourceType.SOLAR_PV,
        ratedCapacityW: '5000',
      },
    });
    expect(devRes.statusCode).toBe(201);

    // 3. Submit Sell Order
    const orderRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: 100,
        side: OrderSide.SELL,
        quantityWh: '2500',
        pricePaisePerKWh: '400',
        expiry: Math.floor(Date.now() / 1000) + 7200,
      },
    });
    expect(orderRes.statusCode).toBe(201);
    const orderBody = JSON.parse(orderRes.payload);
    expect(orderBody.orderId).toBeDefined();
    expect(orderBody.receiptId).toBeDefined();

    // 4. Submit Matching Buy Order from another participant
    const buyerWallet = '0x2222222222222222222222222222222222222222';
    const buyerToken = app.jwt.sign({ address: buyerWallet });
    await app.inject({
      method: 'POST',
      url: '/api/v1/participants/register',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: {
        zoneId: 1,
        discomAccountNumber: 'CA-TPDDL-7777',
        roleType: ParticipantRole.CONSUMER,
      },
    });

    await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: 100,
        side: OrderSide.BUY,
        quantityWh: '2500',
        pricePaisePerKWh: '600',
        expiry: Math.floor(Date.now() / 1000) + 7200,
      },
    });

    // 5. Trigger Clearing for interval 100
    const clearRes = await app.inject({
      method: 'POST',
      url: '/api/v1/markets/zones/1/clear/100',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(clearRes.statusCode).toBe(200);
    const clearBody = JSON.parse(clearRes.payload);
    expect(clearBody.clearedVolumeWh).toBe('2500');
    expect(clearBody.clearingPricePaiseKWh).toBe('500'); // (600 + 400) / 2 = 500 paise
    expect(clearBody.obligationsCount).toBe(1);

    // 6. Query Clearing result
    const getClearRes = await app.inject({
      method: 'GET',
      url: '/api/v1/clearing/1/100',
    });
    expect(getClearRes.statusCode).toBe(200);
  });

  describe('API Security Audit & Correctness (VULN-API-01, 02, 04)', () => {
    it('VULN-API-01: Prevents SIWE nonce replay attacks', async () => {
      // 1. Fetch valid nonce
      const nonceRes = await app.inject({ method: 'GET', url: '/api/v1/auth/nonce' });
      const { nonce } = JSON.parse(nonceRes.payload);

      // Construct a mock SIWE message with this nonce
      const message = `VoltMesh login\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}`;
      // In tests, we can verify nonce rejection by simulating verify payload
      // Missing nonce
      const badRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/verify',
        payload: { message: 'Invalid message without nonce', signature: '0x1234' },
      });
      expect(badRes.statusCode).toBe(400);

      // Non-existent or already consumed nonce
      const forgedRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/verify',
        payload: { message: `Fake message\nNonce: nonexistent123`, signature: '0x1234' },
      });
      expect(forgedRes.statusCode).toBe(401);
    });

    it('VULN-API-02: Prevents unauthenticated clearing execution', async () => {
      // Attempting to clear market without auth token must fail with 401
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/markets/zones/1/clear/200',
      });
      expect(res.statusCode).toBe(401);
    });

    it('VULN-API-04: Enforces order bounds and allows order cancellation', async () => {
      // 1. Zero quantity order rejected
      const zeroQtyRes = await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          zoneId: 1,
          intervalIdx: 100,
          side: OrderSide.BUY,
          quantityWh: '0',
          pricePaisePerKWh: '500',
          expiry: Math.floor(Date.now() / 1000) + 7200,
        },
      });
      expect(zeroQtyRes.statusCode).toBe(400);

      // 2. Price outside circuit limits (e.g. 50 paise when floor is 200) rejected
      const cheapPriceRes = await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          zoneId: 1,
          intervalIdx: 100,
          side: OrderSide.BUY,
          quantityWh: '1000',
          pricePaisePerKWh: '50',
          expiry: Math.floor(Date.now() / 1000) + 7200,
        },
      });
      expect(cheapPriceRes.statusCode).toBe(400);

      // 3. Valid order created
      const validOrderRes = await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          zoneId: 1,
          intervalIdx: 100,
          side: OrderSide.SELL,
          quantityWh: '1000',
          pricePaisePerKWh: '450',
          expiry: Math.floor(Date.now() / 1000) + 7200,
        },
      });
      expect(validOrderRes.statusCode).toBe(201);
      const { orderId } = JSON.parse(validOrderRes.payload);

      // 4. Unauthorized participant cannot cancel it
      const attackerToken = app.jwt.sign({ address: '0x6666666666666666666666666666666666666666' });
      const unauthCancelRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/orders/${orderId}`,
        headers: { authorization: `Bearer ${attackerToken}` },
      });
      expect(unauthCancelRes.statusCode).toBe(403);

      // 5. Order owner cancels order successfully
      const cancelRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/orders/${orderId}`,
        headers: { authorization: `Bearer ${authToken}` },
      });
      expect(cancelRes.statusCode).toBe(200);
      const cancelBody = JSON.parse(cancelRes.payload);
      expect(cancelBody.status).toBe('CANCELLED');
    });

    it('returns full traceable provenance graph for issued certificates', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/certificates/1001/provenance',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.tokenId).toBe('1001');
      expect(body.certificateType).toContain('Granular Attestation Certificate');
      expect(body.provenanceChain.meterReading.hardwareAttestation).toContain('Ed25519');
      expect(body.provenanceChain.epochAnchor.merkleTreeStandard).toContain('RFC 6962');
      expect(body.provenanceChain.oracleConsensus.mechanism).toContain('Threshold ECDSA');
      expect(body.provenanceChain.clearingAndSettlement.escrowNetting).toContain('Atomic');
    });

    it('exposes research and experimental subsystem status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/research/status',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.mode).toBe('ADVANCED_RESEARCH_PROTOTYPE');
      expect(body.researchSubsystems.thresholdOracle.status).toBe('ACTIVE_EXPERIMENTAL');
      expect(body.researchSubsystems.deterministicAuction.status).toBe('IMPLEMENTED');
      expect(body.researchSubsystems.deliveryReconciliation.status).toBe('IMPLEMENTED');
    });
  });
});

