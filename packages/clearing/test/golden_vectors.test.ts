import { describe, it, expect } from 'vitest';
import { clearMarket, calculateDeliveryReconciliation } from '../src/index.js';
import { Order, OrderSide } from '@energy-dex/types';

describe('Deterministic Clearing Golden Test Vectors & Reconciliation', () => {
  const zoneId = 1;
  const intervalIdx = 48;
  const priceFloorPaiseKWh = 200n;
  const priceCapPaiseKWh = 1200n;
  const zoneCapacityWh = 50000n;
  const epochSeed = 'golden-vector-seed-2026';
  const gateClosureTimestamp = 1775000000;

  const createOrder = (
    orderId: string,
    participant: string,
    side: OrderSide,
    quantityWh: bigint,
    pricePaisePerKWh: bigint,
    nonce: bigint = 1n,
    createdAt: number = 1000
  ): Order => ({
    orderId,
    participant,
    zoneId,
    intervalIdx,
    side,
    quantityWh,
    pricePaisePerKWh,
    nonce,
    expiry: gateClosureTimestamp + 3600,
    signature: new Uint8Array(65),
    createdAt,
  });

  it('GOLDEN VECTOR 1: Exact balance uniform clearing price and deterministic obligations', () => {
    // 3 Bids:
    // b1: 10,000 Wh @ 600 paise
    // b2: 15,000 Wh @ 550 paise
    // b3: 20,000 Wh @ 400 paise
    // 3 Asks:
    // a1: 12,000 Wh @ 350 paise
    // a2: 13,000 Wh @ 450 paise
    // a3: 15,000 Wh @ 580 paise

    const orders: Order[] = [
      createOrder('ord-b1', '0x1111111111111111111111111111111111111101', OrderSide.BUY, 10000n, 600n, 1n, 100),
      createOrder('ord-b2', '0x1111111111111111111111111111111111111102', OrderSide.BUY, 15000n, 550n, 1n, 110),
      createOrder('ord-b3', '0x1111111111111111111111111111111111111103', OrderSide.BUY, 20000n, 400n, 1n, 120),
      createOrder('ord-s1', '0x2222222222222222222222222222222222222201', OrderSide.SELL, 12000n, 350n, 1n, 100),
      createOrder('ord-s2', '0x2222222222222222222222222222222222222202', OrderSide.SELL, 13000n, 450n, 1n, 110),
      createOrder('ord-s3', '0x2222222222222222222222222222222222222203', OrderSide.SELL, 15000n, 580n, 1n, 120),
    ];

    const result1 = clearMarket({
      zoneId,
      intervalIdx,
      orders,
      priceFloorPaiseKWh,
      priceCapPaiseKWh,
      zoneCapacityWh,
      epochSeed,
      gateClosureTimestamp,
    });

    // In-the-money cumulative match:
    // b1 (10k @ 600) + b2 (15k @ 550) = 25,000 Wh demanded >= 450
    // s1 (12k @ 350) + s2 (13k @ 450) = 25,000 Wh supplied <= 550
    // Marginal bid = 550, Marginal ask = 450 -> Clearing price = (550 + 450) / 2 = 500 paise (₹5.00/kWh)
    // Matched volume = 25,000 Wh

    expect(result1.clearedVolumeWh).toBe(25000n);
    expect(result1.clearingPricePaiseKWh).toBe(500n);
    expect(result1.obligations.length).toBeGreaterThan(0);

    // Verify 100% determinism over 50 consecutive runs
    for (let i = 0; i < 50; i++) {
      const resultN = clearMarket({
        zoneId,
        intervalIdx,
        orders,
        priceFloorPaiseKWh,
        priceCapPaiseKWh,
        zoneCapacityWh,
        epochSeed,
        gateClosureTimestamp,
      });

      expect(resultN.clearedVolumeWh).toBe(result1.clearedVolumeWh);
      expect(resultN.clearingPricePaiseKWh).toBe(result1.clearingPricePaiseKWh);
      expect(resultN.ordersMerkleRoot).toBe(result1.ordersMerkleRoot);
      expect(resultN.obligationsMerkleRoot).toBe(result1.obligationsMerkleRoot);
      expect(resultN.obligations.length).toBe(result1.obligations.length);
    }
  });

  it('GOLDEN VECTOR 2: Transformer physical capacity limit capping', () => {
    const limitedCapacity = 10000n; // 10 kWh cap
    const orders: Order[] = [
      createOrder('ord-b-big', '0x1111111111111111111111111111111111111101', OrderSide.BUY, 30000n, 600n),
      createOrder('ord-s-big', '0x2222222222222222222222222222222222222201', OrderSide.SELL, 30000n, 300n),
    ];

    const result = clearMarket({
      zoneId,
      intervalIdx,
      orders,
      priceFloorPaiseKWh,
      priceCapPaiseKWh,
      zoneCapacityWh: limitedCapacity,
      epochSeed,
      gateClosureTimestamp,
    });

    // Volume capped at transformer limit
    expect(result.clearedVolumeWh).toBe(limitedCapacity);
    expect(result.obligations.reduce((sum, o) => sum + o.quantityWh, 0n)).toBe(limitedCapacity);
  });

  it('GOLDEN VECTOR 3: Delivery reconciliation calculation (Full, Partial, Shortfall penalty)', () => {
    // Full delivery scenario: 5000 Wh contracted, 5200 Wh seller injection, 5100 Wh buyer load
    const fullDelivery = calculateDeliveryReconciliation({
      contractedWh: 5000n,
      sellerVerifiedDeliveredWh: 5200n,
      buyerVerifiedConsumedWh: 5100n,
      clearingPricePaiseKWh: 400n, // ₹4.00/kWh
    });

    expect(fullDelivery.deliveredWh).toBe(5000n);
    expect(fullDelivery.shortfallWh).toBe(0n);
    expect(fullDelivery.netDeliveredAmountPaise).toBe(2000n); // 5 kWh * 400 paise = 2000 paise (₹20.00)
    expect(fullDelivery.shortfallPenaltyPaise).toBe(0n);
    expect(fullDelivery.finalSellerCreditPaise).toBe(2000n);
    expect(fullDelivery.status).toBe('FULL_DELIVERY');

    // Partial delivery scenario with seller shortfall: 5000 Wh contracted, 3000 Wh seller injection
    const partialDelivery = calculateDeliveryReconciliation({
      contractedWh: 5000n,
      sellerVerifiedDeliveredWh: 3000n,
      buyerVerifiedConsumedWh: 5000n,
      clearingPricePaiseKWh: 500n, // ₹5.00/kWh
      shortfallPenaltyBps: 2000, // 20%
    });

    // Delivered = 3000 Wh, Shortfall = 2000 Wh
    expect(partialDelivery.deliveredWh).toBe(3000n);
    expect(partialDelivery.shortfallWh).toBe(2000n);
    // Net delivered payment = 3 kWh * 500 = 1500 paise
    expect(partialDelivery.netDeliveredAmountPaise).toBe(1500n);
    // Penalty on shortfall: (2000 Wh * 500 paise * 2000) / 10000000 = 200 paise
    expect(partialDelivery.shortfallPenaltyPaise).toBe(200n);
    // Final seller credit = 1500 - 200 = 1300 paise
    expect(partialDelivery.finalSellerCreditPaise).toBe(1300n);
    expect(partialDelivery.status).toBe('PARTIAL_DELIVERY');
  });
});
