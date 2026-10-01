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
});
