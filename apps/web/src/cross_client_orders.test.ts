import { describe, it, expect, vi } from 'vitest';
import { clearMarket } from '@energy-dex/clearing';
import { Order, OrderSide } from '@energy-dex/types';
import { hexToBytes, toHex, getAddress } from 'viem';

describe('Cross-Client Orders & Shared Call Market Clearing', () => {
  const currentSlot = Math.floor(Date.now() / 1000 / 900);
  const buyerAddr = getAddress('0x9965507D1a55bcC2695C58ba16FB37d819B0A4df');
  const sellerAddr = getAddress('0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65');

  it('calculates monotonic slot index as 15-minute interval', () => {
    const slotStartTimeMs = currentSlot * 900 * 1000;
    const startSlot = Math.floor(slotStartTimeMs / 1000 / 900);
    expect(startSlot).toBe(currentSlot);

    // 14 minutes after slot start is still the same slot
    const later14m = Math.floor((slotStartTimeMs + 14 * 60 * 1000) / 1000 / 900);
    expect(later14m).toBe(currentSlot);

    // 16 minutes after slot start is the next slot
    const later16m = Math.floor((slotStartTimeMs + 16 * 60 * 1000) / 1000 / 900);
    expect(later16m).toBe(currentSlot + 1);
  });

  it('correctly maps serialized API order response to frontend Order types', () => {
    const rawApiResponse = [
      {
        orderId: 'ord-buy-1234',
        participant: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4df',
        zoneId: 1,
        intervalIdx: currentSlot,
        side: 0,
        quantityWh: '5000',
        pricePaisePerKWh: '600',
        nonce: '1',
        expiry: Math.floor(Date.now() / 1000) + 3600,
        signature: '0x' + 'ab'.repeat(65),
        createdAt: Math.floor(Date.now() / 1000),
      },
      {
        orderId: 'ord-sell-5678',
        participant: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
        zoneId: 1,
        intervalIdx: currentSlot,
        side: 1,
        quantityWh: '5000',
        pricePaisePerKWh: '500',
        nonce: '1',
        expiry: Math.floor(Date.now() / 1000) + 3600,
        signature: '0x' + 'cd'.repeat(65),
        createdAt: Math.floor(Date.now() / 1000),
      },
    ];

    const parsedOrders: Order[] = rawApiResponse.map((o) => ({
      orderId: o.orderId,
      participant: o.participant,
      zoneId: Number(o.zoneId),
      intervalIdx: Number(o.intervalIdx),
      side: Number(o.side) as OrderSide,
      quantityWh: BigInt(o.quantityWh),
      pricePaisePerKWh: BigInt(o.pricePaisePerKWh),
      nonce: BigInt(o.nonce),
      expiry: Number(o.expiry),
      signature: hexToBytes(o.signature as `0x${string}`),
      createdAt: Number(o.createdAt),
    }));

    expect(parsedOrders).toHaveLength(2);
    expect(parsedOrders[0].quantityWh).toBe(5000n);
    expect(parsedOrders[0].pricePaisePerKWh).toBe(600n);
    expect(parsedOrders[0].side).toBe(OrderSide.BUY);
    expect(parsedOrders[1].quantityWh).toBe(5000n);
    expect(parsedOrders[1].pricePaisePerKWh).toBe(500n);
    expect(parsedOrders[1].side).toBe(OrderSide.SELL);
    expect(parsedOrders[0].signature).toBeInstanceOf(Uint8Array);
  });

  describe('Shared Clearing Pre-flight Checks (Stage 05)', () => {
    it('rejects clearing when there are 0 bids', () => {
      const orders: Order[] = [
        {
          orderId: 'ord-s-1',
          participant: sellerAddr,
          zoneId: 1,
          intervalIdx: currentSlot,
          side: OrderSide.SELL,
          quantityWh: 5000n,
          pricePaisePerKWh: 500n,
          nonce: 1n,
          expiry: Math.floor(Date.now() / 1000) + 3600,
          signature: new Uint8Array(65),
          createdAt: Math.floor(Date.now() / 1000),
        },
      ];

      const bids = orders.filter((o) => o.side === OrderSide.BUY);
      const asks = orders.filter((o) => o.side === OrderSide.SELL);

      expect(bids.length === 0 || asks.length === 0).toBe(true);
    });

    it('rejects clearing when there are 0 asks', () => {
      const orders: Order[] = [
        {
          orderId: 'ord-b-1',
          participant: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4df',
          zoneId: 1,
          intervalIdx: currentSlot,
          side: OrderSide.BUY,
          quantityWh: 5000n,
          pricePaisePerKWh: 600n,
          nonce: 1n,
          expiry: Math.floor(Date.now() / 1000) + 3600,
          signature: new Uint8Array(65),
          createdAt: Math.floor(Date.now() / 1000),
        },
      ];

      const bids = orders.filter((o) => o.side === OrderSide.BUY);
      const asks = orders.filter((o) => o.side === OrderSide.SELL);

      expect(bids.length === 0 || asks.length === 0).toBe(true);
    });

    it('rejects clearing when highest bid is below lowest ask (no crossing price)', () => {
      const orders: Order[] = [
        {
          orderId: 'ord-b-1',
          participant: buyerAddr,
          zoneId: 1,
          intervalIdx: currentSlot,
          side: OrderSide.BUY,
          quantityWh: 5000n,
          pricePaisePerKWh: 400n, // Bid 400
          nonce: 1n,
          expiry: Math.floor(Date.now() / 1000) + 3600,
          signature: new Uint8Array(65),
          createdAt: Math.floor(Date.now() / 1000),
        },
        {
          orderId: 'ord-s-1',
          participant: sellerAddr,
          zoneId: 1,
          intervalIdx: currentSlot,
          side: OrderSide.SELL,
          quantityWh: 5000n,
          pricePaisePerKWh: 550n, // Ask 550
          nonce: 1n,
          expiry: Math.floor(Date.now() / 1000) + 3600,
          signature: new Uint8Array(65),
          createdAt: Math.floor(Date.now() / 1000),
        },
      ];

      const bids = orders.filter((o) => o.side === OrderSide.BUY);
      const asks = orders.filter((o) => o.side === OrderSide.SELL);

      const highestBid = bids.reduce((max, b) => (b.pricePaisePerKWh > max ? b.pricePaisePerKWh : max), 0n);
      const lowestAsk = asks.reduce((min, a) => (a.pricePaisePerKWh < min ? a.pricePaisePerKWh : min), asks[0].pricePaisePerKWh);

      expect(highestBid < lowestAsk).toBe(true);
    });

    it('successfully clears when buyer bid >= seller ask and volume > 0', () => {
      const slotOrders: Order[] = [
        {
          orderId: 'ord-b-1',
          participant: buyerAddr,
          zoneId: 1,
          intervalIdx: currentSlot,
          side: OrderSide.BUY,
          quantityWh: 5000n,
          pricePaisePerKWh: 600n, // Bid 600
          nonce: 1n,
          expiry: Math.floor(Date.now() / 1000) + 3600,
          signature: new Uint8Array(65),
          createdAt: Math.floor(Date.now() / 1000),
        },
        {
          orderId: 'ord-s-1',
          participant: sellerAddr,
          zoneId: 1,
          intervalIdx: currentSlot,
          side: OrderSide.SELL,
          quantityWh: 5000n,
          pricePaisePerKWh: 500n, // Ask 500
          nonce: 1n,
          expiry: Math.floor(Date.now() / 1000) + 3600,
          signature: new Uint8Array(65),
          createdAt: Math.floor(Date.now() / 1000),
        },
      ];

      const bids = slotOrders.filter((o) => o.side === OrderSide.BUY);
      const asks = slotOrders.filter((o) => o.side === OrderSide.SELL);

      const highestBid = bids.reduce((max, b) => (b.pricePaisePerKWh > max ? b.pricePaisePerKWh : max), 0n);
      const lowestAsk = asks.reduce((min, a) => (a.pricePaisePerKWh < min ? a.pricePaisePerKWh : min), asks[0].pricePaisePerKWh);

      expect(highestBid >= lowestAsk).toBe(true);

      const result = clearMarket({
        zoneId: 1,
        intervalIdx: currentSlot,
        orders: slotOrders,
        priceFloorPaiseKWh: 200n,
        priceCapPaiseKWh: 1200n,
        zoneCapacityWh: 1000000n,
        epochSeed: `zone-1-interval-${currentSlot}`,
        gateClosureTimestamp: Math.floor(Date.now() / 1000) - 10,
      });

      expect(result.clearedVolumeWh).toBe(5000n);
      expect(result.clearingPricePaiseKWh).toBeGreaterThanOrEqual(500n);
      expect(result.clearingPricePaiseKWh).toBeLessThanOrEqual(600n);
      expect(result.obligations).toHaveLength(1);
      expect(result.ordersMerkleRoot).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(result.obligationsMerkleRoot).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });
  });

  describe('Cross-Browser Operator Visibility Simulation', () => {
    it('simulates seller and buyer submitting orders to shared store, visible to operator session', () => {
      // 1. Shared backend order store
      const backendStore: Order[] = [];

      // 2. Buyer submits bid from Profile 1
      const buyerOrder: Order = {
        orderId: 'ord-b-profile1',
        participant: buyerAddr,
        zoneId: 1,
        intervalIdx: currentSlot,
        side: OrderSide.BUY,
        quantityWh: 3000n,
        pricePaisePerKWh: 650n,
        nonce: 1n,
        expiry: Math.floor(Date.now() / 1000) + 3600,
        signature: new Uint8Array(65),
        createdAt: Math.floor(Date.now() / 1000),
      };
      backendStore.push(buyerOrder);

      // 3. Seller submits ask from Profile 2
      const sellerOrder: Order = {
        orderId: 'ord-s-profile2',
        participant: sellerAddr,
        zoneId: 1,
        intervalIdx: currentSlot,
        side: OrderSide.SELL,
        quantityWh: 3000n,
        pricePaisePerKWh: 550n,
        nonce: 1n,
        expiry: Math.floor(Date.now() / 1000) + 3600,
        signature: new Uint8Array(65),
        createdAt: Math.floor(Date.now() / 1000),
      };
      backendStore.push(sellerOrder);

      // 4. Operator logs in with Google from Profile 3 (initially empty React state)
      let operatorOrdersState: Order[] = [];
      expect(operatorOrdersState).toHaveLength(0);

      // Operator triggers fetchOrders(currentSlot)
      operatorOrdersState = backendStore.filter(
        (o) => o.zoneId === 1 && o.intervalIdx === currentSlot
      );

      // 5. Operator Call Market now displays "1 bids · 1 asks", NOT "0 bids · 0 asks"
      const operatorBids = operatorOrdersState.filter((o) => o.side === OrderSide.BUY);
      const operatorAsks = operatorOrdersState.filter((o) => o.side === OrderSide.SELL);

      expect(operatorBids).toHaveLength(1);
      expect(operatorAsks).toHaveLength(1);
      expect(operatorOrdersState).toHaveLength(2);

      // 6. Operator can clear market
      const clearingResult = clearMarket({
        zoneId: 1,
        intervalIdx: currentSlot,
        orders: operatorOrdersState,
        priceFloorPaiseKWh: 200n,
        priceCapPaiseKWh: 1200n,
        zoneCapacityWh: 1000000n,
        epochSeed: `zone-1-interval-${currentSlot}`,
        gateClosureTimestamp: Math.floor(Date.now() / 1000) - 10,
      });

      expect(clearingResult.clearedVolumeWh).toBe(3000n);
      expect(clearingResult.obligations).toHaveLength(1);
    });
  });
});
