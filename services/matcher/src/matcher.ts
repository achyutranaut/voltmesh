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

export interface BatchMatcherOptions {
  verifySignatures?: boolean;
  chainId?: number;
  verifyingContract?: Hex;
}

export class BatchMatcher {
  private readonly ordersByBatch = new Map<string, Order[]>();
  private readonly submittedOrderIds = new Set<string>();
  private readonly participantNonces = new Map<string, Set<string>>();
  private readonly cancelledNonces = new Map<string, Set<string>>();
  private currentSequenceNumber: number = 0;
  private readonly options: BatchMatcherOptions;

  constructor(options: BatchMatcherOptions = {}) {
    this.options = options;
  }

  private getBatchKey(zoneId: number, intervalIdx: number): string {
    return `${zoneId}:${intervalIdx}`;
  }

  /**
   * Cancels a participant's order by nonce to prevent clearing.
   */
  public cancelOrder(participant: string, nonce: bigint): void {
    const p = participant.toLowerCase();
    const nonceSet = this.cancelledNonces.get(p) ?? new Set<string>();
    nonceSet.add(nonce.toString());
    this.cancelledNonces.set(p, nonceSet);
  }

  public isOrderCancelled(participant: string, nonce: bigint): boolean {
    const p = participant.toLowerCase();
    return this.cancelledNonces.get(p)?.has(nonce.toString()) ?? false;
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

    const p = order.participant.toLowerCase();
    if (this.isOrderCancelled(p, order.nonce)) {
      throw new Error(`Order with nonce ${order.nonce.toString()} has been cancelled by participant`);
    }

    // Replay protection: check duplicate orderId or duplicate participant nonce
    if (this.submittedOrderIds.has(order.orderId)) {
      throw new Error(`Duplicate order submission: orderId ${order.orderId} already exists`);
    }

    const nonces = this.participantNonces.get(p) ?? new Set<string>();
    if (nonces.has(order.nonce.toString())) {
      throw new Error(`Replay detected: participant ${order.participant} already used nonce ${order.nonce.toString()}`);
    }

    const key = this.getBatchKey(order.zoneId, order.intervalIdx);
    const existing = this.ordersByBatch.get(key) ?? [];
    existing.push(order);
    this.ordersByBatch.set(key, existing);

    this.submittedOrderIds.add(order.orderId);
    nonces.add(order.nonce.toString());
    this.participantNonces.set(p, nonces);

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
    const rawOrders = this.ordersByBatch.get(key) ?? [];

    // Filter out orders that were cancelled after submission
    const orders = rawOrders.filter(
      (o) => !this.isOrderCancelled(o.participant.toLowerCase(), o.nonce)
    );

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
