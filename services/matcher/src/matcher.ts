import { Order, MatcherReceipt, ClearingResult } from '@energy-dex/types';
import { clearMarket } from '@energy-dex/clearing';
import { keccak256, encodePacked, Hex } from 'viem';

export interface ZoneMarketConfig {
  zoneId: number;
  priceFloorPaiseKWh: bigint;
  priceCapPaiseKWh: bigint;
  zoneCapacityWh: bigint;
  gateClosureLeadSeconds: number; // e.g. 3600 (1 hour before interval delivery)
}

export class BatchMatcher {
  private readonly ordersByBatch = new Map<string, Order[]>();
  private currentSequenceNumber: number = 0;

  private getBatchKey(zoneId: number, intervalIdx: number): string {
    return `${zoneId}:${intervalIdx}`;
  }

  /**
   * Accepts and receipts an incoming order into the zone-interval batch window.
   */
  public submitOrder(
    order: Order,
    gateClosureTimestamp: number,
    currentTimestamp: number
  ): MatcherReceipt {
    if (currentTimestamp >= gateClosureTimestamp) {
      throw new Error(`Gate closure has passed for interval ${order.intervalIdx}`);
    }

    if (order.expiry < gateClosureTimestamp) {
      throw new Error('Order expires before gate closure');
    }

    const key = this.getBatchKey(order.zoneId, order.intervalIdx);
    const existing = this.ordersByBatch.get(key) ?? [];
    existing.push(order);
    this.ordersByBatch.set(key, existing);

    const seq = ++this.currentSequenceNumber;
    const orderHash = keccak256(
      encodePacked(
        ['string', 'address', 'uint64', 'uint64', 'uint256'],
        [order.orderId, order.participant as `0x${string}`, order.quantityWh, order.pricePaisePerKWh, order.nonce]
      )
    );

    const receiptId = `rcpt-${order.zoneId}-${order.intervalIdx}-${seq}`;
    return {
      receiptId,
      orderHash,
      sequenceNumber: seq,
      receivedTimestampUtc: currentTimestamp,
      gatewaySignature: new Uint8Array(65),
    };
  }

  /**
   * Closes the batch auction and executes deterministic clearing.
   */
  public closeAndClear(
    zoneId: number,
    intervalIdx: number,
    config: ZoneMarketConfig,
    epochSeed: string,
    closureTimestamp: number
  ): ClearingResult {
    const key = this.getBatchKey(zoneId, intervalIdx);
    const orders = this.ordersByBatch.get(key) ?? [];

    const result = clearMarket({
      zoneId,
      intervalIdx,
      orders,
      priceFloorPaiseKWh: config.priceFloorPaiseKWh,
      priceCapPaiseKWh: config.priceCapPaiseKWh,
      zoneCapacityWh: config.zoneCapacityWh,
      epochSeed,
      gateClosureTimestamp: closureTimestamp,
    });

    return result;
  }

  public getOrdersCount(zoneId: number, intervalIdx: number): number {
    const key = this.getBatchKey(zoneId, intervalIdx);
    return (this.ordersByBatch.get(key) ?? []).length;
  }
}
