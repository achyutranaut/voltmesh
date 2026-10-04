import { describe, it, expect, beforeEach } from 'vitest';
import { buildApiServer } from '../src/app.js';
import { FastifyInstance } from 'fastify';

describe('Real-World DISCOM P2P Market API Integration', () => {
  let app: FastifyInstance;
  const sellerWallet = '0x1111111111111111111111111111111111111111';
  const buyerWallet = '0x2222222222222222222222222222222222222222';
  const operatorWallet = '0x3333333333333333333333333333333333333333';
  let sellerToken: string;
  let buyerToken: string;
  let operatorToken: string;

  beforeEach(async () => {
    app = buildApiServer();
    await app.ready();
    (app as any).setUserRole(operatorWallet, 'OPERATOR');
    sellerToken = app.jwt.sign({ address: sellerWallet });
    buyerToken = app.jwt.sign({ address: buyerWallet });
    operatorToken = app.jwt.sign({ address: operatorWallet, role: 'OPERATOR' });
  });

  it('1. Utility Identity Verification & Eligibility Evaluation', async () => {
    // Prosumer verification
    const resProsumer = await app.inject({
      method: 'POST',
      url: '/api/v1/utility/verify',
      payload: { consumerNumber: '1002345678' },
    });
    expect(resProsumer.statusCode).toBe(200);
    const bodyProsumer = JSON.parse(resProsumer.payload);
    expect(bodyProsumer.identity.consumerType).toBe('PROSUMER');
    expect(bodyProsumer.identity.solarCapacityKw).toBe(8);
    expect(bodyProsumer.eligibility.isEligible).toBe(true);
    expect(bodyProsumer.eligibility.maxSellPowerKw).toBe(8);

    // Pure consumer verification
    const resConsumer = await app.inject({
      method: 'POST',
      url: '/api/v1/utility/verify',
      payload: { consumerNumber: '1008765432' },
    });
    expect(resConsumer.statusCode).toBe(200);
    const bodyConsumer = JSON.parse(resConsumer.payload);
    expect(bodyConsumer.identity.consumerType).toBe('CONSUMER');
    expect(bodyConsumer.identity.solarCapacityKw).toBe(0);
    expect(bodyConsumer.eligibility.isEligible).toBe(true);
    expect(bodyConsumer.eligibility.maxSellPowerKw).toBe(0);
    expect(bodyConsumer.eligibility.maxBuyPowerKw).toBe(5);
  });

  it('2. Verifiable Credential Issuance and Wallet Binding', async () => {
    const issueRes = await app.inject({
      method: 'POST',
      url: '/api/v1/utility/credentials/issue',
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: { consumerNumber: '1002345678' },
    });
    expect(issueRes.statusCode).toBe(201);
    const vc = JSON.parse(issueRes.payload);
    expect(vc.credentialId).toMatch(/^urn:uuid:ies-vc-/);
    expect(vc.issuer).toBe('did:discom:tpddl');
    expect(vc.subject).toBe(`did:ethr:${sellerWallet}`);
    expect(vc.claims.consumerNumber).toBe('1002345678');
    expect(vc.status).toBe('ACTIVE');

    // Retrieve active VC
    const getRes = await app.inject({
      method: 'GET',
      url: '/api/v1/utility/credentials/me',
      headers: { authorization: `Bearer ${sellerToken}` },
    });
    expect(getRes.statusCode).toBe(200);
    const activeVc = JSON.parse(getRes.payload);
    expect(activeVc.credentialId).toBe(vc.credentialId);
  });

  it('3. Day-Ahead Market Session & Gate Closure Queries', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/market/sessions',
    });
    expect(res.statusCode).toBe(200);
    const sessions = JSON.parse(res.payload);
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions[0].marketType).toBe('DAY_AHEAD');
    expect(sessions[0].mechanism).toBe('UNIFORM_PRICE_CALL_MARKET');
    expect(sessions[0].intervals.length).toBe(96);
    expect(sessions[0].state).toBe('OPEN');
  });

  it('4. Energy Position Declaration and Capacity Reservation', async () => {
    // Prosumer declares available generation for interval 48
    const declareRes = await app.inject({
      method: 'POST',
      url: '/api/v1/energy/positions/declare',
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: {
        intervalIdx: 48,
        declaredAvailableWh: '3000',
        installedSolarCapacityW: '10000',
      },
    });
    expect(declareRes.statusCode).toBe(200);
    const pos = JSON.parse(declareRes.payload);
    expect(pos.declaredAvailableWh).toBe('2500'); // Capped by physical 10kW system 15-min limit (2500 Wh)

    // Prosumer queries positions
    const getPosRes = await app.inject({
      method: 'GET',
      url: '/api/v1/energy/positions',
      headers: { authorization: `Bearer ${sellerToken}` },
    });
    expect(getPosRes.statusCode).toBe(200);
    const positions = JSON.parse(getPosRes.payload);
    expect(positions.length).toBeGreaterThan(0);
  });

  it('5. Regulatory Tariffs and Fee Schedules', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tariffs/current',
    });
    expect(res.statusCode).toBe(200);
    const tariffs = JSON.parse(res.payload);
    expect(tariffs.derc.wheelingChargePaiseKWh).toBe('35');
    expect(tariffs.derc.platformFeePaiseKWh).toBe('10');
    expect(tariffs.derc.taxGstBps).toBe(1800);
    expect(tariffs.shortfallPolicy.replacementPenaltyBps).toBe(2000);
    expect(tariffs.underDrawPolicy.takeOrPayBps).toBe(10000);
  });

  it('6. Asymmetric Reconciliation: Seller Shortfall & Wheeling Charges', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/settlements/reconcile',
      payload: {
        obligationId: 'obl-test-001',
        contractedWh: '10000',
        actualSellerInjectionWh: '7000', // Shortfall of 3000 Wh
        actualBuyerConsumptionWh: '10000',
        energyPricePaiseKWh: '450',
        jurisdiction: 'DERC',
        buyerAddress: buyerWallet,
        sellerAddress: sellerWallet,
      },
    });
    expect(res.statusCode).toBe(200);
    const recon = JSON.parse(res.payload);
    expect(recon.contractedWh).toBe('10000');
    expect(recon.deliveredEnergyWh).toBe('7000');
    expect(recon.sellerShortfallWh).toBe('3000');
    expect(recon.buyerUnderDrawWh).toBe('0');
    expect(recon.status).toBe('SELLER_SHORTFALL');
    expect(recon.sellerShortfallPenaltyPaise).toBe('420'); // 3 kWh * 700 paise * 20%
    expect(recon.totalWheelingChargesPaise).toBe('245'); // 7 kWh * 35 paise
    expect(recon.reconciliationHash).toBeDefined();
    expect(recon.charges.length).toBeGreaterThanOrEqual(4);
  });

  it('7. Asymmetric Reconciliation: Buyer Under-Draw & Take-Or-Pay', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/settlements/reconcile',
      payload: {
        obligationId: 'obl-test-002',
        contractedWh: '10000',
        actualSellerInjectionWh: '10000', // Seller injected full amount
        actualBuyerConsumptionWh: '7000',  // Buyer only consumed 7000 Wh
        energyPricePaiseKWh: '500',
        jurisdiction: 'DERC',
        buyerAddress: buyerWallet,
        sellerAddress: sellerWallet,
      },
    });
    expect(res.statusCode).toBe(200);
    const recon = JSON.parse(res.payload);
    expect(recon.deliveredEnergyWh).toBe('7000');
    expect(recon.sellerShortfallWh).toBe('0');
    expect(recon.buyerUnderDrawWh).toBe('3000');
    expect(recon.status).toBe('BUYER_UNDERDRAW');
    // Under 100% take-or-pay, buyer owes for the 3000 Wh injected by seller
    expect(recon.buyerUnderDrawPenaltyPaise).toBe('1500'); // 3 kWh * 500 paise
  });

  it('8. DISCOM Billing Adjustment Lifecycle (SUBMITTED -> ACCEPTED -> ADJUSTED)', async () => {
    // Submit adjustment
    const subRes = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/adjustments',
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: {
        consumerNumber: '1008765432',
        prosumerNumber: '1002345678',
        discomId: 'TPDDL',
        transactionId: 'tx-p2p-001',
        deliveryDate: '2026-10-04',
        scheduledWh: '10000',
        settledWh: '9500',
        p2pEnergyAmountPaise: '4275',
        wheelingChargesPaise: '332',
        transactionChargesPaise: '95',
        taxPaise: '76',
        netAdjustmentAmountPaise: '4275',
        direction: 'CREDIT',
      },
    });
    expect(subRes.statusCode).toBe(201);
    const adj = JSON.parse(subRes.payload);
    expect(adj.status).toBe('ACCEPTED');
    expect(adj.ackId).toBeDefined();

    // Query adjustments
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/billing/adjustments',
      headers: { authorization: `Bearer ${sellerToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    const adjustments = JSON.parse(listRes.payload);
    expect(adjustments.length).toBeGreaterThan(0);

    // Update status to ADJUSTED
    const statusRes = await app.inject({
      method: 'POST',
      url: `/api/v1/billing/adjustments/${adj.adjustmentId}/status`,
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: { status: 'ADJUSTED' },
    });
    expect(statusRes.statusCode).toBe(200);
    const updatedAdj = JSON.parse(statusRes.payload);
    expect(updatedAdj.status).toBe('ADJUSTED');
    expect(updatedAdj.adjustedAt).toBeDefined();
  });

  it('9. Audit Double-Selling Prevention Lifecycle (Capacity = 10 kWh)', async () => {
    // Prosumer declares 10 kWh capacity for interval 50
    const declareRes = await app.inject({
      method: 'POST',
      url: '/api/v1/energy/positions/declare',
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: {
        intervalIdx: 50,
        declaredAvailableWh: '10000',
        installedSolarCapacityW: '40000',
      },
    });
    expect(declareRes.statusCode).toBe(200);

    // 1. Order A = 7 kWh -> ACCEPTED
    const orderARes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: 50,
        side: 1, // SELL
        quantityWh: '7000',
        pricePaisePerKWh: '400',
        expiry: Math.floor(Date.now() / 1000) + 7200,
      },
    });
    expect(orderARes.statusCode).toBe(201);
    const orderA = JSON.parse(orderARes.payload);

    // 2. Order B = 7 kWh -> REJECTED (only 3 kWh available)
    const orderBRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: 50,
        side: 1, // SELL
        quantityWh: '7000',
        pricePaisePerKWh: '400',
        expiry: Math.floor(Date.now() / 1000) + 7200,
      },
    });
    expect(orderBRes.statusCode).toBe(400);
    const errB = JSON.parse(orderBRes.payload);
    expect(errB.error).toContain('exceeds available position');

    // 3. Order A cancelled -> 7 kWh becomes available again
    const cancelRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/orders/${orderA.orderId}`,
      headers: { authorization: `Bearer ${sellerToken}` },
    });
    expect(cancelRes.statusCode).toBe(200);

    // 4. Order C = 7 kWh -> Now ACCEPTED because Order A was cancelled
    const orderCRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: 50,
        side: 1, // SELL
        quantityWh: '7000',
        pricePaisePerKWh: '400',
        expiry: Math.floor(Date.now() / 1000) + 7200,
      },
    });
    expect(orderCRes.statusCode).toBe(201);
    const orderC = JSON.parse(orderCRes.payload);

    // 5. Buyer submits matching BUY order for 7 kWh
    const buyerOrderRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: 50,
        side: 0, // BUY
        quantityWh: '7000',
        pricePaisePerKWh: '500',
        expiry: Math.floor(Date.now() / 1000) + 7200,
      },
    });
    expect(buyerOrderRes.statusCode).toBe(201);

    // 6. Market clears interval 50 -> Order C is matched and committed
    const clearRes = await app.inject({
      method: 'POST',
      url: '/api/v1/markets/zones/1/clear/50',
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(clearRes.statusCode).toBe(200);
    const clearBody = JSON.parse(clearRes.payload);
    expect(clearBody.clearedVolumeWh).toBe('7000');

    // 7. Verify capacity remains committed: attempting another 7 kWh order is REJECTED
    const postClearOrderRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: 50,
        side: 1, // SELL
        quantityWh: '7000',
        pricePaisePerKWh: '400',
        expiry: Math.floor(Date.now() / 1000) + 7200,
      },
    });
    expect(postClearOrderRes.statusCode).toBe(400);
    const postClearErr = JSON.parse(postClearOrderRes.payload);
    expect(postClearErr.error).toContain('exceeds available position');
  });

  it('10. Audit Billing Adjustment Deduplication (Idempotency)', async () => {
    const payload = {
      consumerNumber: '1008765432',
      prosumerNumber: '1002345678',
      discomId: 'TPDDL',
      transactionId: 'tx-unique-id-999',
      deliveryDate: '2026-10-04',
      scheduledWh: '5000',
      settledWh: '5000',
      p2pEnergyAmountPaise: '2250',
      wheelingChargesPaise: '175',
      transactionChargesPaise: '50',
      taxPaise: '40',
      netAdjustmentAmountPaise: '2250',
      direction: 'CREDIT' as const,
    };

    // First submission: Success (201)
    const firstRes = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/adjustments',
      headers: { authorization: `Bearer ${sellerToken}` },
      payload,
    });
    expect(firstRes.statusCode).toBe(201);

    // Duplicate submission: Rejected with 409 Conflict
    const dupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/adjustments',
      headers: { authorization: `Bearer ${sellerToken}` },
      payload,
    });
    expect(dupRes.statusCode).toBe(409);
    const dupBody = JSON.parse(dupRes.payload);
    expect(dupBody.error).toContain('Duplicate billing adjustment');
  });

  it('11. Audit Billing Lifecycle State Transition Guards', async () => {
    // Create adjustment
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/adjustments',
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: {
        consumerNumber: '1008765432',
        prosumerNumber: '1002345678',
        discomId: 'TPDDL',
        transactionId: 'tx-guard-test-888',
        deliveryDate: '2026-10-04',
        scheduledWh: '5000',
        settledWh: '5000',
        p2pEnergyAmountPaise: '2250',
        wheelingChargesPaise: '175',
        transactionChargesPaise: '50',
        taxPaise: '40',
        netAdjustmentAmountPaise: '2250',
        direction: 'CREDIT',
      },
    });
    const adj = JSON.parse(createRes.payload);
    expect(adj.status).toBe('ACCEPTED');

    // 1. Valid transition: ACCEPTED -> DISPUTED
    const disputeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/billing/adjustments/${adj.adjustmentId}/status`,
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: { status: 'DISPUTED' },
    });
    expect(disputeRes.statusCode).toBe(200);

    // 2. Illegal transition: DISPUTED -> ADJUSTED (must be resolved first)
    const illegalRes = await app.inject({
      method: 'POST',
      url: `/api/v1/billing/adjustments/${adj.adjustmentId}/status`,
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: { status: 'ADJUSTED' },
    });
    expect(illegalRes.statusCode).toBe(400);
    const errBody = JSON.parse(illegalRes.payload);
    expect(errBody.error).toContain('Illegal state transition');

    // 3. Valid transition: DISPUTED -> REJECTED (terminal)
    const rejectRes = await app.inject({
      method: 'POST',
      url: `/api/v1/billing/adjustments/${adj.adjustmentId}/status`,
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: { status: 'REJECTED' },
    });
    expect(rejectRes.statusCode).toBe(200);

    // 4. Illegal transition: REJECTED -> ADJUSTED
    const postRejectRes = await app.inject({
      method: 'POST',
      url: `/api/v1/billing/adjustments/${adj.adjustmentId}/status`,
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: { status: 'ADJUSTED' },
    });
    expect(postRejectRes.statusCode).toBe(400);
  });

  it('12. Audit Participant Role Authorization (Pure Consumer cannot submit SELL ask)', async () => {
    // Issue VC for Pure Consumer (solarCapacityKw = 0)
    await app.inject({
      method: 'POST',
      url: '/api/v1/utility/credentials/issue',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: { consumerNumber: '1008765432' }, // Consumer account
    });

    // Attempt to submit a SELL ask from Pure Consumer
    const sellRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: {
        zoneId: 1,
        intervalIdx: 48,
        side: 1, // SELL
        quantityWh: '2500',
        pricePaisePerKWh: '450',
        expiry: Math.floor(Date.now() / 1000) + 7200,
      },
    });
    expect(sellRes.statusCode).toBe(403);
    const body = JSON.parse(sellRes.payload);
    expect(body.error).toContain('CONSUMER');
  });
});
