import { describe, it, expect } from 'vitest';
import { BatchMatcher, ZoneMarketConfig } from '../src/index.js';
import { Order, OrderSide } from '@energy-dex/types';

describe('BatchMatcher Service', () => {
  const zoneConfig: ZoneMarketConfig = {
    zoneId: 1,
    priceFloorPaiseKWh: 200n,
    priceCapPaiseKWh: 1200n,
    zoneCapacityWh: 500000n,
    gateClosureLeadSeconds: 3600,
  };

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
    zoneId: 1,
    intervalIdx: 100,
    side,
    quantityWh,
    pricePaisePerKWh: pricePaise,
    nonce: 1n,
    expiry: gateClosure + 1800,
    signature: new Uint8Array(65),
    createdAt: 1000,
  });

  it('accepts orders, issues receipts with sequence numbers, and clears the batch', () => {
    const matcher = new BatchMatcher();

    // Order 1: Buy 2000 Wh at 600 paise
    const buyOrder = createOrder('ord-b1', OrderSide.BUY, 2000n, 600n, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    const rcpt1 = matcher.submitOrder(buyOrder, gateClosure, gateClosure - 500);

    expect(rcpt1.sequenceNumber).toBe(1);
    expect(rcpt1.orderHash.startsWith('0x')).toBe(true);

    // Order 2: Sell 2000 Wh at 400 paise
    const sellOrder = createOrder('ord-s1', OrderSide.SELL, 2000n, 400n, '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    const rcpt2 = matcher.submitOrder(sellOrder, gateClosure, gateClosure - 300);

    expect(rcpt2.sequenceNumber).toBe(2);
    expect(matcher.getOrdersCount(1, 100)).toBe(2);

    // Gate closure -> Clear market
    const result = matcher.closeAndClear(1, 100, zoneConfig, 'epoch-seed-100', gateClosure);

    expect(result.clearedVolumeWh).toBe(2000n);
    expect(result.clearingPricePaiseKWh).toBe(500n);
    expect(result.obligations.length).toBe(1);
    expect(result.ordersMerkleRoot.startsWith('0x')).toBe(true);
    expect(result.obligationsMerkleRoot.startsWith('0x')).toBe(true);
  });

  it('rejects order submitted after gate closure', () => {
    const matcher = new BatchMatcher();
    const lateOrder = createOrder('ord-late', OrderSide.BUY, 1000n, 500n);

    // Current time is 10s past gate closure
    expect(() => matcher.submitOrder(lateOrder, gateClosure, gateClosure + 10)).toThrow(
      'Gate closure has passed'
    );
  });

  it('honors order cancellation and rejects cancelled orders or excludes them from clearing', () => {
    const matcher = new BatchMatcher();
    const buyOrder = createOrder('ord-b2', OrderSide.BUY, 2000n, 600n, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    matcher.submitOrder(buyOrder, gateClosure, gateClosure - 500);

    // Cancel before clearing
    matcher.cancelOrder(buyOrder.participant, buyOrder.nonce);
    expect(matcher.isOrderCancelled(buyOrder.participant, buyOrder.nonce)).toBe(true);

    // Attempting to submit another order with the same cancelled nonce is rejected
    expect(() =>
      matcher.submitOrder(
        { ...buyOrder, orderId: 'ord-b2-alt' },
        gateClosure,
        gateClosure - 400
      )
    ).toThrow('cancelled');

    // Sell order arrives
    const sellOrder = createOrder('ord-s2', OrderSide.SELL, 2000n, 400n, '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    matcher.submitOrder(sellOrder, gateClosure, gateClosure - 300);

    // Clearing does NOT match cancelled buy order
    const result = matcher.closeAndClear(1, 100, zoneConfig, 'epoch-seed-cancel', gateClosure);
    expect(result.clearedVolumeWh).toBe(0n);
    expect(result.obligations.length).toBe(0);
  });

  it('rejects duplicate order ID or duplicate participant nonce (replay protection)', () => {
    const matcher = new BatchMatcher();
    const order1 = createOrder('ord-rep-1', OrderSide.BUY, 1000n, 500n, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    matcher.submitOrder(order1, gateClosure, gateClosure - 500);

    // Duplicate order ID
    expect(() =>
      matcher.submitOrder({ ...order1, nonce: 2n }, gateClosure, gateClosure - 400)
    ).toThrow('Duplicate order submission');

    // Duplicate nonce from same participant
    expect(() =>
      matcher.submitOrder(
        { ...order1, orderId: 'ord-rep-2', nonce: 1n },
        gateClosure,
        gateClosure - 400
      )
    ).toThrow('Replay detected');
  });

  describe('Self-Trade Prevention (STP)', () => {
    it('STP-MATCH-1: rejects opposing BUY and SELL orders for the same interval from the same wallet', () => {
      const matcher = new BatchMatcher();
      const buyOrder = createOrder('ord-stp-b1', OrderSide.BUY, 1000n, 500n, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      buyOrder.nonce = 1n;
      matcher.submitOrder(buyOrder, gateClosure, gateClosure - 500);

      const sellOrder = createOrder('ord-stp-s1', OrderSide.SELL, 1000n, 400n, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      sellOrder.nonce = 2n;

      expect(() =>
        matcher.submitOrder(sellOrder, gateClosure, gateClosure - 400)
      ).toThrow('Self-trade prohibited');
    });

    it('STP-MATCH-2: rejects opposing orders sharing the same participantId across different addresses', () => {
      const matcher = new BatchMatcher();
      const buyOrder = createOrder('ord-stp-b2', OrderSide.BUY, 1000n, 500n, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      buyOrder.participantId = 'part-common-org';
      buyOrder.nonce = 1n;
      matcher.submitOrder(buyOrder, gateClosure, gateClosure - 500);

      const sellOrder = createOrder('ord-stp-s2', OrderSide.SELL, 1000n, 400n, '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
      sellOrder.participantId = 'part-common-org';
      sellOrder.nonce = 1n;

      expect(() =>
        matcher.submitOrder(sellOrder, gateClosure, gateClosure - 400)
      ).toThrow('Self-trade prohibited');
    });

    it('STP-MATCH-3: allows prosumer to submit BUY in interval 100 and SELL in interval 101', () => {
      const matcher = new BatchMatcher();
      const buyInterval100 = createOrder('ord-pros-b', OrderSide.BUY, 1000n, 500n, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      buyInterval100.intervalIdx = 100;
      buyInterval100.nonce = 1n;
      const rcpt1 = matcher.submitOrder(buyInterval100, gateClosure, gateClosure - 500);
      expect(rcpt1.sequenceNumber).toBe(1);

      const sellInterval101 = createOrder('ord-pros-s', OrderSide.SELL, 1000n, 400n, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      sellInterval101.intervalIdx = 101;
      sellInterval101.nonce = 2n;
      const rcpt2 = matcher.submitOrder(sellInterval101, gateClosure, gateClosure - 400);
      expect(rcpt2.sequenceNumber).toBe(2);
    });

    it('STP-MATCH-4: allows multiple non-opposing orders on the same side in the same interval', () => {
      const matcher = new BatchMatcher();
      const buy1 = createOrder('ord-same-b1', OrderSide.BUY, 500n, 500n, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      buy1.nonce = 1n;
      matcher.submitOrder(buy1, gateClosure, gateClosure - 500);

      const buy2 = createOrder('ord-same-b2', OrderSide.BUY, 500n, 520n, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      buy2.nonce = 2n;
      const rcpt2 = matcher.submitOrder(buy2, gateClosure, gateClosure - 400);
      expect(rcpt2.sequenceNumber).toBe(2);
    });
  });
});

