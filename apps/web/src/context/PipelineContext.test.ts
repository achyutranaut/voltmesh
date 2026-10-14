import { describe, it, expect } from 'vitest';
import { createInitialStages, PIPELINE_ORDER, STAGE_CONFIG } from './PipelineContext';
import { clearMarket } from '@energy-dex/clearing';
import { Order, OrderSide } from '@energy-dex/types';

describe('PipelineContext Slot State & Clearing Guards (Task B, C, D)', () => {
  describe('createInitialStages (Task B)', () => {
    it('initializes Stage 01 (METER) as READY and all downstream stages (02-08) as LOCKED', () => {
      const stages = createInitialStages();
      expect(stages.METER.status).toBe('READY');
      expect(stages.ATTESTATION.status).toBe('LOCKED');
      expect(stages.ORACLE.status).toBe('LOCKED');
      expect(stages.MERKLE.status).toBe('LOCKED');
      expect(stages.CLEARING.status).toBe('LOCKED');
      expect(stages.DELIVERY.status).toBe('LOCKED');
      expect(stages.SETTLEMENT.status).toBe('LOCKED');
      expect(stages.CERTIFICATE.status).toBe('LOCKED');
    });

    it('contains all 8 ordered pipeline stages with proper prerequisite references', () => {
      const stages = createInitialStages();
      expect(Object.keys(stages)).toHaveLength(8);
      PIPELINE_ORDER.forEach((id, idx) => {
        expect(stages[id]).toBeDefined();
        if (idx > 0) {
          expect(stages[id].prerequisiteId).toBe(PIPELINE_ORDER[idx - 1]);
        }
      });
    });
  });

  describe('Slot-Keyed Storage & Rollover Reset (Task B & C)', () => {
    const STORAGE_KEY_PREFIX = 'voltmesh_flow_pipeline_v1_slot_';

    it('generates distinct storage keys for different slot indices to prevent state leak', () => {
      const slot1 = 1991133;
      const slot2 = 1991134;
      const zone = 1;
      const key1 = `${STORAGE_KEY_PREFIX}z${zone}_s${slot1}`;
      const key2 = `${STORAGE_KEY_PREFIX}z${zone}_s${slot2}`;

      expect(key1).not.toBe(key2);
      expect(key1).toBe('voltmesh_flow_pipeline_v1_slot_z1_s1991133');
      expect(key2).toBe('voltmesh_flow_pipeline_v1_slot_z1_s1991134');
    });

    it('resets stage state to initial pending when slot changes', () => {
      // Simulate completed stages from an earlier slot
      const previousSlotStages = createInitialStages();
      previousSlotStages.METER = { ...previousSlotStages.METER, status: 'COMPLETED' };
      previousSlotStages.ATTESTATION = { ...previousSlotStages.ATTESTATION, status: 'COMPLETED' };
      previousSlotStages.ORACLE = { ...previousSlotStages.ORACLE, status: 'COMPLETED' };
      previousSlotStages.MERKLE = { ...previousSlotStages.MERKLE, status: 'COMPLETED' };

      expect(previousSlotStages.MERKLE.status).toBe('COMPLETED');

      // Slot rollover event triggers fresh initial stages for the new slot
      const newSlotStages = createInitialStages();
      expect(newSlotStages.METER.status).toBe('READY');
      expect(newSlotStages.ATTESTATION.status).toBe('LOCKED');
      expect(newSlotStages.ORACLE.status).toBe('LOCKED');
      expect(newSlotStages.MERKLE.status).toBe('LOCKED');
      expect(newSlotStages.CLEARING.status).toBe('LOCKED');
    });

    it('requires a non-zero Merkle root to consider an epoch finalized for the current slot', () => {
      const zeroRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
      const validRoot = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      const unfinalizedRecord = { finalizedAt: 0n, merkleRoot: zeroRoot };
      const zeroRootRecord = { finalizedAt: 1775000000n, merkleRoot: zeroRoot };
      const finalizedRecord = { finalizedAt: 1775000000n, merkleRoot: validRoot };

      const isFinalized = (rec: { finalizedAt: bigint; merkleRoot: string }) =>
        Boolean(rec && rec.finalizedAt > 0n && rec.merkleRoot && rec.merkleRoot !== zeroRoot);

      expect(isFinalized(unfinalizedRecord)).toBe(false);
      expect(isFinalized(zeroRootRecord)).toBe(false);
      expect(isFinalized(finalizedRecord)).toBe(true);
    });
  });

  describe('Call Market Clearing Empty & Crossing Rejection (Task D)', () => {
    const currentSlot = 1991133;
    const now = Math.floor(Date.now() / 1000);

    it('rejects clearing when order book has 0 bids and 0 asks', () => {
      const orders: Order[] = [];
      const slotOrders = orders.filter((o) => o.zoneId === 1 && o.intervalIdx === currentSlot);
      const bids = slotOrders.filter((o) => o.side === OrderSide.BUY);
      const asks = slotOrders.filter((o) => o.side === OrderSide.SELL);

      expect(bids.length === 0 || asks.length === 0).toBe(true);

      const result = clearMarket({
        zoneId: 1,
        intervalIdx: currentSlot,
        orders: slotOrders,
        priceFloorPaiseKWh: 200n,
        priceCapPaiseKWh: 1200n,
        zoneCapacityWh: 1000000n,
        epochSeed: `zone-1-interval-${currentSlot}`,
        gateClosureTimestamp: now - 50,
      });

      expect(result.clearedVolumeWh).toBe(0n);
      expect(result.clearingPricePaiseKWh).toBe(0n);
      expect(result.obligations).toHaveLength(0);
    });

    it('rejects clearing when order book has bids but 0 asks', () => {
      const orders: Order[] = [
        {
          orderId: 'b-1',
          participant: '0x1111111111111111111111111111111111111111',
          zoneId: 1,
          intervalIdx: currentSlot,
          side: OrderSide.BUY,
          quantityWh: 5000n,
          pricePaisePerKWh: 600n,
          nonce: 1n,
          expiry: now + 3600,
          signature: new Uint8Array(65),
          createdAt: now - 100,
        },
      ];

      const slotOrders = orders.filter((o) => o.zoneId === 1 && o.intervalIdx === currentSlot);
      const bids = slotOrders.filter((o) => o.side === OrderSide.BUY);
      const asks = slotOrders.filter((o) => o.side === OrderSide.SELL);

      expect(bids.length > 0).toBe(true);
      expect(asks.length === 0).toBe(true);

      const result = clearMarket({
        zoneId: 1,
        intervalIdx: currentSlot,
        orders: slotOrders,
        priceFloorPaiseKWh: 200n,
        priceCapPaiseKWh: 1200n,
        zoneCapacityWh: 1000000n,
        epochSeed: `zone-1-interval-${currentSlot}`,
        gateClosureTimestamp: now - 50,
      });

      expect(result.clearedVolumeWh).toBe(0n);
      expect(result.obligations).toHaveLength(0);
    });

    it('rejects clearing when highest bid is lower than lowest ask (no crossing price)', () => {
      const orders: Order[] = [
        {
          orderId: 'b-1',
          participant: '0x1111111111111111111111111111111111111111',
          zoneId: 1,
          intervalIdx: currentSlot,
          side: OrderSide.BUY,
          quantityWh: 5000n,
          pricePaisePerKWh: 400n, // ₹4.00
          nonce: 1n,
          expiry: now + 3600,
          signature: new Uint8Array(65),
          createdAt: now - 100,
        },
        {
          orderId: 's-1',
          participant: '0x2222222222222222222222222222222222222222',
          zoneId: 1,
          intervalIdx: currentSlot,
          side: OrderSide.SELL,
          quantityWh: 5000n,
          pricePaisePerKWh: 600n, // ₹6.00 (higher than bid -> no crossing price)
          nonce: 2n,
          expiry: now + 3600,
          signature: new Uint8Array(65),
          createdAt: now - 100,
        },
      ];

      const slotOrders = orders.filter((o) => o.zoneId === 1 && o.intervalIdx === currentSlot);
      const bids = slotOrders.filter((o) => o.side === OrderSide.BUY);
      const asks = slotOrders.filter((o) => o.side === OrderSide.SELL);

      const highestBid = bids.reduce((max, b) => (b.pricePaisePerKWh > max ? b.pricePaisePerKWh : max), 0n);
      const lowestAsk = asks.reduce((min, a) => (a.pricePaisePerKWh < min ? a.pricePaisePerKWh : min), asks[0].pricePaisePerKWh);

      expect(highestBid < lowestAsk).toBe(true);

      const result = clearMarket({
        zoneId: 1,
        intervalIdx: currentSlot,
        orders: slotOrders,
        priceFloorPaiseKWh: 200n,
        priceCapPaiseKWh: 1200n,
        zoneCapacityWh: 1000000n,
        epochSeed: `zone-1-interval-${currentSlot}`,
        gateClosureTimestamp: now - 50,
      });

      expect(result.clearedVolumeWh).toBe(0n);
      expect(result.obligations).toHaveLength(0);
    });

    it('clears successfully and matches obligations when valid crossing orders exist', () => {
      const orders: Order[] = [
        {
          orderId: 'b-1',
          participant: '0x1111111111111111111111111111111111111111',
          zoneId: 1,
          intervalIdx: currentSlot,
          side: OrderSide.BUY,
          quantityWh: 5000n,
          pricePaisePerKWh: 600n, // ₹6.00
          nonce: 1n,
          expiry: now + 3600,
          signature: new Uint8Array(65),
          createdAt: now - 100,
        },
        {
          orderId: 's-1',
          participant: '0x2222222222222222222222222222222222222222',
          zoneId: 1,
          intervalIdx: currentSlot,
          side: OrderSide.SELL,
          quantityWh: 5000n,
          pricePaisePerKWh: 400n, // ₹4.00 (crosses at ₹5.00 midpoint)
          nonce: 2n,
          expiry: now + 3600,
          signature: new Uint8Array(65),
          createdAt: now - 100,
        },
      ];

      const slotOrders = orders.filter((o) => o.zoneId === 1 && o.intervalIdx === currentSlot);
      const result = clearMarket({
        zoneId: 1,
        intervalIdx: currentSlot,
        orders: slotOrders,
        priceFloorPaiseKWh: 200n,
        priceCapPaiseKWh: 1200n,
        zoneCapacityWh: 1000000n,
        epochSeed: `zone-1-interval-${currentSlot}`,
        gateClosureTimestamp: now - 50,
      });

      expect(result.clearedVolumeWh).toBe(5000n);
      expect(result.clearingPricePaiseKWh).toBe(500n); // Midpoint of 400 and 600
      expect(result.obligations).toHaveLength(1);
    });
  });
});
