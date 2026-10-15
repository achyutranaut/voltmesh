import { describe, it, expect, beforeEach } from 'vitest';
import { buildApiServer } from '../src/app.js';
import { FastifyInstance } from 'fastify';
import { OrderSide, ParticipantRole } from '@energy-dex/types';

describe('Cross-Client Shared Order Book & Clearing Lifecycle', () => {
  let app: FastifyInstance;
  const sellerWallet = '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65'; // Seller test account
  const buyerWallet = '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc';  // Buyer test account
  const operatorWallet = '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc'; // Operator test account
  const unregisteredWallet = '0x8888888888888888888888888888888888888888';

  let sellerToken: string;
  let buyerToken: string;
  let operatorToken: string;
  let unregisteredToken: string;

  beforeEach(async () => {
    app = buildApiServer();
    await app.ready();
    (app as any).setUserRole(operatorWallet, 'OPERATOR');

    sellerToken = app.jwt.sign({ address: sellerWallet, role: 'seller' });
    buyerToken = app.jwt.sign({ address: buyerWallet, role: 'buyer' });
    operatorToken = app.jwt.sign({ address: operatorWallet, role: 'OPERATOR' });
    unregisteredToken = app.jwt.sign({ address: unregisteredWallet, role: 'UNREGISTERED' });
  });

  it('Task 1 & 2: Orders submitted by separate browser profiles (seller & buyer) are persisted and visible to operator session', async () => {
    const monotonicSlot = Math.floor(Date.now() / 1000 / 900);

    // 1. Client A (Seller) registers as PROSUMER and declares generation position
    const regSeller = await app.inject({
      method: 'POST',
      url: '/api/v1/participants/register',
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: {
        zoneId: 1,
        discomAccountNumber: 'CA-SELLER-001',
        roleType: ParticipantRole.PROSUMER,
      },
    });
    expect([200, 201]).toContain(regSeller.statusCode);

    // Declare energy position for seller
    await app.inject({
      method: 'POST',
      url: '/api/v1/energy/positions/declare',
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: {
        intervalIdx: monotonicSlot,
        declaredAvailableWh: '10000',
        installedSolarCapacityW: '25000',
      },
    });

    // Seller submits ASK
    const sellerSubmit = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: monotonicSlot,
        side: OrderSide.SELL,
        quantityWh: '5000',
        pricePaisePerKWh: '400',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    expect(sellerSubmit.statusCode).toBe(201);
    const sellerOrder = JSON.parse(sellerSubmit.payload);
    expect(sellerOrder.orderId).toBeDefined();

    // 2. Client B (Buyer) registers as CONSUMER and submits BID
    const regBuyer = await app.inject({
      method: 'POST',
      url: '/api/v1/participants/register',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: {
        zoneId: 1,
        discomAccountNumber: 'CA-BUYER-002',
        roleType: ParticipantRole.CONSUMER,
      },
    });
    expect([200, 201]).toContain(regBuyer.statusCode);

    const buyerSubmit = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: monotonicSlot,
        side: OrderSide.BUY,
        quantityWh: '5000',
        pricePaisePerKWh: '500',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    expect(buyerSubmit.statusCode).toBe(201);
    const buyerOrder = JSON.parse(buyerSubmit.payload);
    expect(buyerOrder.orderId).toBeDefined();

    // 3. Client C (Operator session) fetches shared order book for the slot
    const operatorFetch = await app.inject({
      method: 'GET',
      url: `/api/v1/orders?zoneId=1&intervalIdx=${monotonicSlot}`,
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(operatorFetch.statusCode).toBe(200);
    const sharedOrders = JSON.parse(operatorFetch.payload);

    // Operator must see both the bid and the ask!
    expect(sharedOrders.length).toBe(2);
    const bids = sharedOrders.filter((o: any) => o.side === OrderSide.BUY);
    const asks = sharedOrders.filter((o: any) => o.side === OrderSide.SELL);
    expect(bids.length).toBe(1);
    expect(asks.length).toBe(1);
    expect(bids[0].participant.toLowerCase()).toBe(buyerWallet.toLowerCase());
    expect(asks[0].participant.toLowerCase()).toBe(sellerWallet.toLowerCase());
  });

  it('Task 2: Orders persist across page reload simulation (stateless query)', async () => {
    const monotonicSlot = Math.floor(Date.now() / 1000 / 900);

    // Seller registers & submits
    await app.inject({
      method: 'POST',
      url: '/api/v1/participants/register',
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: { zoneId: 1, discomAccountNumber: 'CA-PERSIST-01', roleType: ParticipantRole.PROSUMER },
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: monotonicSlot,
        side: OrderSide.SELL,
        quantityWh: '3000',
        pricePaisePerKWh: '450',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });

    // Simulate complete reload by an unauthenticated public observer querying the slot
    const freshQuery = await app.inject({
      method: 'GET',
      url: `/api/v1/orders?zoneId=1&intervalIdx=${monotonicSlot}`,
    });
    expect(freshQuery.statusCode).toBe(200);
    const ordersList = JSON.parse(freshQuery.payload);
    expect(ordersList.length).toBeGreaterThanOrEqual(1);
    expect(ordersList.some((o: any) => o.quantityWh === '3000' && o.pricePaisePerKWh === '450')).toBe(true);
  });

  it('Task 3: Clearing rejects when crossing orders are missing or bid < ask, and succeeds with volume > 0', async () => {
    const slotIdx = 888888;

    // Register seller & buyer
    await app.inject({
      method: 'POST',
      url: '/api/v1/participants/register',
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: { zoneId: 1, discomAccountNumber: 'CA-CLR-SELL', roleType: ParticipantRole.PROSUMER },
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/participants/register',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: { zoneId: 1, discomAccountNumber: 'CA-CLR-BUY', roleType: ParticipantRole.CONSUMER },
    });

    // 1. Submit only a BUY order (no ask) -> clearing fails with NO_CROSSING_ORDERS
    const bRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: slotIdx,
        side: OrderSide.BUY,
        quantityWh: '4000',
        pricePaisePerKWh: '400',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    expect(bRes.statusCode).toBe(201);

    const clearNoAsks = await app.inject({
      method: 'POST',
      url: `/api/v1/markets/zones/1/clear/${slotIdx}`,
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(clearNoAsks.statusCode).toBe(400);
    expect(JSON.parse(clearNoAsks.payload).error).toBe('NO_CROSSING_ORDERS');

    // 2. Submit an ASK where ask > bid (bid=400, ask=600) -> clearing fails with NO_CROSSING_PRICE
    await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: slotIdx,
        side: OrderSide.SELL,
        quantityWh: '4000',
        pricePaisePerKWh: '600',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });

    const clearNonCrossing = await app.inject({
      method: 'POST',
      url: `/api/v1/markets/zones/1/clear/${slotIdx}`,
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(clearNonCrossing.statusCode).toBe(400);
    expect(JSON.parse(clearNonCrossing.payload).error).toBe('NO_CROSSING_PRICE');

    // 3. Submit a matching crossing slot
    const crossingSlot = 888889;
    await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: crossingSlot,
        side: OrderSide.SELL,
        quantityWh: '4000',
        pricePaisePerKWh: '350',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: crossingSlot,
        side: OrderSide.BUY,
        quantityWh: '4000',
        pricePaisePerKWh: '450',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });

    const clearSuccess = await app.inject({
      method: 'POST',
      url: `/api/v1/markets/zones/1/clear/${crossingSlot}`,
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(clearSuccess.statusCode).toBe(200);
    const clearResult = JSON.parse(clearSuccess.payload);
    expect(BigInt(clearResult.clearedVolumeWh)).toBeGreaterThan(0n);
    expect(clearResult.obligationsCount).toBeGreaterThan(0);
  });

  it('Task 2 & 4: Unregistered participant attempting order submission is rejected with 403', async () => {
    const slotIdx = Math.floor(Date.now() / 1000 / 900);
    const unregSubmit = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${unregisteredToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: slotIdx,
        side: OrderSide.BUY,
        quantityWh: '2000',
        pricePaisePerKWh: '350',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    expect(unregSubmit.statusCode).toBe(403);
    const err = JSON.parse(unregSubmit.payload);
    expect(err.error).toBe('UNREGISTERED_PARTICIPANT');
  });
});
