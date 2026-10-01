import { describe, it, expect } from 'vitest';
import { clearMarket, computeTieBreakScore } from '../src/index.js';
import { Order, OrderSide, OrderStatus } from '@energy-dex/types';

describe('Deterministic Call Market Clearing Engine', () => {
  const defaultZoneId = 1;
  const defaultInterval = 100;
  const priceFloor = 200n; // ₹2.00
  const priceCap = 1200n;  // ₹12.00
  const capacityWh = 1000000n; // 1,000 kWh
  const epochSeed = 'seed-epoch-2026-10-01';
  const gateClosure = 1775000000;

  const createOrder = (
    id: string,
    side: OrderSide,
    quantityWh: bigint,
    pricePaise: bigint,
    participant: string = '0x1111111111111111111111111111111111111111'
  ): Order => ({
    orderId: id,
    participant,
    zoneId: defaultZoneId,
    intervalIdx: defaultInterval,
    side,
    quantityWh,
    pricePaisePerKWh: pricePaise,
    nonce: 1n,
    expiry: gateClosure + 3600,
    signature: new Uint8Array(65),
    createdAt: 1000,
  });

  it('handles empty order book gracefully', () => {
    const result = clearMarket({
      zoneId: defaultZoneId,
      intervalIdx: defaultInterval,
      orders: [],
      priceFloorPaiseKWh: priceFloor,
      priceCapPaiseKWh: priceCap,
      zoneCapacityWh: capacityWh,
      epochSeed,
      gateClosureTimestamp: gateClosure,
    });

    expect(result.clearedVolumeWh).toBe(0n);
    expect(result.clearingPricePaiseKWh).toBe(0n);
    expect(result.obligations.length).toBe(0);
  });

  it('returns 0 volume if highest bid < lowest ask', () => {
    const orders = [
      createOrder('b1', OrderSide.BUY, 1000n, 400n),
      createOrder('s1', OrderSide.SELL, 1000n, 500n),
    ];

    const result = clearMarket({
      zoneId: defaultZoneId,
      intervalIdx: defaultInterval,
      orders,
      priceFloorPaiseKWh: priceFloor,
      priceCapPaiseKWh: priceCap,
      zoneCapacityWh: capacityWh,
      epochSeed,
      gateClosureTimestamp: gateClosure,
    });

    expect(result.clearedVolumeWh).toBe(0n);
    expect(result.clearingPricePaiseKWh).toBe(0n);
    expect(result.obligations.length).toBe(0);
  });

  it('clears matching orders and applies k = 0.5 midpoint pricing', () => {
    // Buyer willing to pay up to 600 paise
    // Seller willing to sell down to 400 paise
    // Midpoint: (600 + 400) / 2 = 500 paise
    const orders = [
      createOrder('b1', OrderSide.BUY, 2000n, 600n, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      createOrder('s1', OrderSide.SELL, 2000n, 400n, '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
    ];

    const result = clearMarket({
      zoneId: defaultZoneId,
      intervalIdx: defaultInterval,
      orders,
      priceFloorPaiseKWh: priceFloor,
      priceCapPaiseKWh: priceCap,
      zoneCapacityWh: capacityWh,
      epochSeed,
      gateClosureTimestamp: gateClosure,
    });

    expect(result.clearedVolumeWh).toBe(2000n);
    expect(result.clearingPricePaiseKWh).toBe(500n);
    expect(result.obligations.length).toBe(1);
    expect(result.obligations[0].quantityWh).toBe(2000n);
    expect(result.obligations[0].pricePaisePerKWh).toBe(500n);
    expect(result.obligationsMerkleRoot.startsWith('0x')).toBe(true);
  });

  it('enforces physical transformer capacity constraint', () => {
    const restrictedCapacity = 1500n;
    const orders = [
      createOrder('b1', OrderSide.BUY, 3000n, 600n),
      createOrder('s1', OrderSide.SELL, 3000n, 400n),
    ];

    const result = clearMarket({
      zoneId: defaultZoneId,
      intervalIdx: defaultInterval,
      orders,
      priceFloorPaiseKWh: priceFloor,
      priceCapPaiseKWh: priceCap,
      zoneCapacityWh: restrictedCapacity,
      epochSeed,
      gateClosureTimestamp: gateClosure,
    });

    expect(result.clearedVolumeWh).toBe(restrictedCapacity);
    expect(result.obligations.reduce((acc, o) => acc + o.quantityWh, 0n)).toBe(restrictedCapacity);
  });

  it('performs deterministic tie-breaking at the marginal price', () => {
    // Two bids at the same marginal price of 500 paise
    // Total sell volume is 1500 Wh, each bid is 1000 Wh -> 500 Wh shortfall at margin
    const orders = [
      createOrder('b-alpha', OrderSide.BUY, 1000n, 500n),
      createOrder('b-beta', OrderSide.BUY, 1000n, 500n),
      createOrder('s1', OrderSide.SELL, 1500n, 400n),
    ];

    const result1 = clearMarket({
      zoneId: defaultZoneId,
      intervalIdx: defaultInterval,
      orders,
      priceFloorPaiseKWh: priceFloor,
      priceCapPaiseKWh: priceCap,
      zoneCapacityWh: capacityWh,
      epochSeed,
      gateClosureTimestamp: gateClosure,
    });

    // Run again with identical inputs -> must produce identical result
    const result2 = clearMarket({
      zoneId: defaultZoneId,
      intervalIdx: defaultInterval,
      orders,
      priceFloorPaiseKWh: priceFloor,
      priceCapPaiseKWh: priceCap,
      zoneCapacityWh: capacityWh,
      epochSeed,
      gateClosureTimestamp: gateClosure,
    });

    expect(result1.clearedVolumeWh).toBe(1500n);
    expect(result1.clearingPricePaiseKWh).toBe(450n); // (500 + 400) / 2 = 450
    expect(result1.obligationsMerkleRoot).toBe(result2.obligationsMerkleRoot);
  });
});
