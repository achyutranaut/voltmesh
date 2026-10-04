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
      createOrder('b1', OrderSide.BUY, 3000n, 600n, '0x1111111111111111111111111111111111111111'),
      createOrder('s1', OrderSide.SELL, 3000n, 400n, '0x2222222222222222222222222222222222222222'),
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
      createOrder('b-alpha', OrderSide.BUY, 1000n, 500n, '0x1111111111111111111111111111111111111111'),
      createOrder('b-beta', OrderSide.BUY, 1000n, 500n, '0x2222222222222222222222222222222222222222'),
      createOrder('s1', OrderSide.SELL, 1500n, 400n, '0x3333333333333333333333333333333333333333'),
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

  describe('Self-Trade Prevention (STP)', () => {
    it('STP-1: same wallet address BUY and SELL produces 0 cleared volume and 0 obligations', () => {
      const orders = [
        createOrder('b-self', OrderSide.BUY, 2000n, 600n, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
        createOrder('s-self', OrderSide.SELL, 2000n, 400n, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
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
      expect(result.obligations).toHaveLength(0);
      expect(result.obligationsMerkleRoot).toBe('0x0000000000000000000000000000000000000000000000000000000000000000');
    });

    it('STP-2: same participantId with different wallet addresses produces 0 cleared volume', () => {
      const orderB = createOrder('b-part', OrderSide.BUY, 2000n, 600n, '0x1111111111111111111111111111111111111111');
      orderB.participantId = 'part-common-entity-id';
      const orderS = createOrder('s-part', OrderSide.SELL, 2000n, 400n, '0x2222222222222222222222222222222222222222');
      orderS.participantId = 'part-common-entity-id';

      const result = clearMarket({
        zoneId: defaultZoneId,
        intervalIdx: defaultInterval,
        orders: [orderB, orderS],
        priceFloorPaiseKWh: priceFloor,
        priceCapPaiseKWh: priceCap,
        zoneCapacityWh: capacityWh,
        epochSeed,
        gateClosureTimestamp: gateClosure,
      });

      expect(result.clearedVolumeWh).toBe(0n);
      expect(result.obligations).toHaveLength(0);
    });

    it('STP-3: same identityBindingHash produces 0 cleared volume', () => {
      const orderB = createOrder('b-hash', OrderSide.BUY, 2000n, 600n, '0x1111111111111111111111111111111111111111');
      orderB.identityBindingHash = '0xfeedbeefcafebabe000000000000000000000000000000000000000000000001';
      const orderS = createOrder('s-hash', OrderSide.SELL, 2000n, 400n, '0x2222222222222222222222222222222222222222');
      orderS.identityBindingHash = '0xfeedbeefcafebabe000000000000000000000000000000000000000000000001';

      const result = clearMarket({
        zoneId: defaultZoneId,
        intervalIdx: defaultInterval,
        orders: [orderB, orderS],
        priceFloorPaiseKWh: priceFloor,
        priceCapPaiseKWh: priceCap,
        zoneCapacityWh: capacityWh,
        epochSeed,
        gateClosureTimestamp: gateClosure,
      });

      expect(result.clearedVolumeWh).toBe(0n);
      expect(result.obligations).toHaveLength(0);
    });

    it('STP-4: skips self-orders and pairs strictly with independent counterparties', () => {
      // Alice (0xAA) bids 1000 Wh @ 600
      // Bob (0xBB) bids 1000 Wh @ 600
      // Alice (0xAA) asks 1000 Wh @ 400
      // Charlie (0xCC) asks 1000 Wh @ 400
      const orders = [
        createOrder('b-alice', OrderSide.BUY, 1000n, 600n, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
        createOrder('b-bob', OrderSide.BUY, 1000n, 600n, '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
        createOrder('s-alice', OrderSide.SELL, 1000n, 400n, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
        createOrder('s-charlie', OrderSide.SELL, 1000n, 400n, '0xcccccccccccccccccccccccccccccccccccccccc'),
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
      expect(result.obligations).toHaveLength(2);

      // Verify that NO obligation has buyer === seller
      for (const obl of result.obligations) {
        expect(obl.buyer.toLowerCase()).not.toBe(obl.seller.toLowerCase());
      }
    });
  });
});
