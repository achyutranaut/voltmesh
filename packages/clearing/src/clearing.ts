import { keccak256, encodePacked, stringToHex, pad } from 'viem';
import { Order, OrderSide, DeliveryObligation, ClearingResult } from '@energy-dex/types';
import { BinaryMerkleTree, hashObligationLeaf } from '@energy-dex/attestation';

export interface ClearingInput {
  zoneId: number;
  intervalIdx: number;
  orders: Order[];
  priceFloorPaiseKWh: bigint;
  priceCapPaiseKWh: bigint;
  zoneCapacityWh: bigint;
  epochSeed: string;
  gateClosureTimestamp: number;
}

interface InternalOrderAllocation {
  order: Order;
  allocatedWh: bigint;
  tieBreakScore: bigint;
}

/**
 * Deterministic tie-breaking score:
 * keccak256(orderId, epochSeed, intervalIdx) as uint256
 */
export function computeTieBreakScore(orderId: string, epochSeed: string, intervalIdx: number): bigint {
  const seedHex = pad(stringToHex(epochSeed), { size: 32 });
  const hash = keccak256(
    encodePacked(
      ['string', 'bytes32', 'uint32'],
      [orderId, seedHex, intervalIdx]
    )
  );
  return BigInt(hash);
}

/**
 * Pure Deterministic Uniform-Price Call Market Clearing Algorithm
 */
export function clearMarket(input: ClearingInput): ClearingResult {
  const {
    zoneId,
    intervalIdx,
    orders,
    priceFloorPaiseKWh,
    priceCapPaiseKWh,
    zoneCapacityWh,
    epochSeed,
    gateClosureTimestamp,
  } = input;

  // 1. Filter valid orders
  const validOrders = orders.filter((o) => {
    return (
      o.zoneId === zoneId &&
      o.intervalIdx === intervalIdx &&
      o.pricePaisePerKWh >= priceFloorPaiseKWh &&
      o.pricePaisePerKWh <= priceCapPaiseKWh &&
      o.expiry >= gateClosureTimestamp &&
      o.quantityWh > 0n
    );
  });

  // Calculate orders Merkle root
  const orderHashes = validOrders.map((o) =>
    keccak256(encodePacked(['string', 'address', 'uint64', 'uint64'], [o.orderId, o.participant as `0x${string}`, o.quantityWh, o.pricePaisePerKWh]))
  );
  const ordersMerkleRoot = orderHashes.length > 0
    ? new BinaryMerkleTree(orderHashes).getRoot()
    : ('0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`);

  const bids: Order[] = validOrders.filter((o) => o.side === OrderSide.BUY);
  const asks: Order[] = validOrders.filter((o) => o.side === OrderSide.SELL);

  // If no bids or no asks, market does not clear
  if (bids.length === 0 || asks.length === 0) {
    return {
      zoneId,
      intervalIdx,
      clearingPricePaiseKWh: 0n,
      clearedVolumeWh: 0n,
      obligations: [],
      ordersMerkleRoot,
      obligationsMerkleRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
    };
  }

  // 2. Stable sorting
  // Bids: descending price, ascending creation time, ascending ID
  bids.sort((a, b) => {
    if (a.pricePaisePerKWh !== b.pricePaisePerKWh) {
      return a.pricePaisePerKWh > b.pricePaisePerKWh ? -1 : 1;
    }
    if (a.createdAt !== b.createdAt) {
      return a.createdAt - b.createdAt;
    }
    return a.orderId.localeCompare(b.orderId);
  });

  // Asks: ascending price, ascending creation time, ascending ID
  asks.sort((a, b) => {
    if (a.pricePaisePerKWh !== b.pricePaisePerKWh) {
      return a.pricePaisePerKWh < b.pricePaisePerKWh ? -1 : 1;
    }
    if (a.createdAt !== b.createdAt) {
      return a.createdAt - b.createdAt;
    }
    return a.orderId.localeCompare(b.orderId);
  });

  // Check if highest bid can meet lowest ask
  if (bids[0].pricePaisePerKWh < asks[0].pricePaisePerKWh) {
    return {
      zoneId,
      intervalIdx,
      clearingPricePaiseKWh: 0n,
      clearedVolumeWh: 0n,
      obligations: [],
      ordersMerkleRoot,
      obligationsMerkleRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
    };
  }

  // 3. Find intersection of discrete cumulative step curves
  let maxMatchedVolume = 0n;
  let marginalBidPrice = bids[0].pricePaisePerKWh;
  let marginalAskPrice = asks[0].pricePaisePerKWh;

  let bIdx = 0;
  let aIdx = 0;
  let curBidRem = bids[0].quantityWh;
  let curAskRem = asks[0].quantityWh;

  while (bIdx < bids.length && aIdx < asks.length) {
    const curBid = bids[bIdx];
    const curAsk = asks[aIdx];

    if (curBid.pricePaisePerKWh < curAsk.pricePaisePerKWh) {
      break;
    }

    const matchIncrement = curBidRem < curAskRem ? curBidRem : curAskRem;

    maxMatchedVolume += matchIncrement;
    marginalBidPrice = curBid.pricePaisePerKWh;
    marginalAskPrice = curAsk.pricePaisePerKWh;

    curBidRem -= matchIncrement;
    curAskRem -= matchIncrement;

    if (curBidRem === 0n) {
      bIdx++;
      if (bIdx < bids.length) {
        curBidRem = bids[bIdx].quantityWh;
      }
    }
    if (curAskRem === 0n) {
      aIdx++;
      if (aIdx < asks.length) {
        curAskRem = asks[aIdx].quantityWh;
      }
    }
  }

  // Cap cleared volume by zone physical transformer capacity
  const finalClearedVolume = maxMatchedVolume < zoneCapacityWh ? maxMatchedVolume : zoneCapacityWh;

  if (finalClearedVolume === 0n) {
    return {
      zoneId,
      intervalIdx,
      clearingPricePaiseKWh: 0n,
      clearedVolumeWh: 0n,
      obligations: [],
      ordersMerkleRoot,
      obligationsMerkleRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
    };
  }

  // 4. Uniform Clearing Price calculation (k = 0.5 Midpoint rule)
  const clearingPrice = (marginalBidPrice + marginalAskPrice) / 2n;

  // 5. Allocate volume to Bids
  const bidAllocations: InternalOrderAllocation[] = bids.map((b) => ({
    order: b,
    allocatedWh: 0n,
    tieBreakScore: computeTieBreakScore(b.orderId, epochSeed, intervalIdx),
  }));

  let remainingBidTarget = finalClearedVolume;
  // Fill strictly in-the-money bids first (price > clearingPrice)
  for (const alloc of bidAllocations) {
    if (alloc.order.pricePaisePerKWh > clearingPrice && remainingBidTarget > 0n) {
      const take = alloc.order.quantityWh < remainingBidTarget ? alloc.order.quantityWh : remainingBidTarget;
      alloc.allocatedWh = take;
      remainingBidTarget -= take;
    }
  }

  // Fill marginal bids (price == clearingPrice) prioritized by tie-break score
  if (remainingBidTarget > 0n) {
    const marginalBids = bidAllocations.filter((a) => a.order.pricePaisePerKWh === clearingPrice);
    marginalBids.sort((a, b) => (a.tieBreakScore > b.tieBreakScore ? -1 : 1));

    for (const alloc of marginalBids) {
      if (remainingBidTarget <= 0n) break;
      const take = alloc.order.quantityWh < remainingBidTarget ? alloc.order.quantityWh : remainingBidTarget;
      alloc.allocatedWh = take;
      remainingBidTarget -= take;
    }
  }

  // 6. Allocate volume to Asks
  const askAllocations: InternalOrderAllocation[] = asks.map((a) => ({
    order: a,
    allocatedWh: 0n,
    tieBreakScore: computeTieBreakScore(a.orderId, epochSeed, intervalIdx),
  }));

  let remainingAskTarget = finalClearedVolume;
  // Fill strictly in-the-money asks first (price < clearingPrice)
  for (const alloc of askAllocations) {
    if (alloc.order.pricePaisePerKWh < clearingPrice && remainingAskTarget > 0n) {
      const take = alloc.order.quantityWh < remainingAskTarget ? alloc.order.quantityWh : remainingAskTarget;
      alloc.allocatedWh = take;
      remainingAskTarget -= take;
    }
  }

  // Fill marginal asks (price == clearingPrice) prioritized by tie-break score
  if (remainingAskTarget > 0n) {
    const marginalAsks = askAllocations.filter((a) => a.order.pricePaisePerKWh === clearingPrice);
    marginalAsks.sort((a, b) => (a.tieBreakScore > b.tieBreakScore ? -1 : 1));

    for (const alloc of marginalAsks) {
      if (remainingAskTarget <= 0n) break;
      const take = alloc.order.quantityWh < remainingAskTarget ? alloc.order.quantityWh : remainingAskTarget;
      alloc.allocatedWh = take;
      remainingAskTarget -= take;
    }
  }

  // 7. Deterministically pair allocated bids and asks into Delivery Obligations
  const obligations: DeliveryObligation[] = [];
  const activeBids = bidAllocations.filter((a) => a.allocatedWh > 0n);
  const activeAsks = askAllocations.filter((a) => a.allocatedWh > 0n);

  let bCursor = 0;
  let aCursor = 0;
  let bRem = activeBids.length > 0 ? activeBids[0].allocatedWh : 0n;
  let aRem = activeAsks.length > 0 ? activeAsks[0].allocatedWh : 0n;

  while (bCursor < activeBids.length && aCursor < activeAsks.length) {
    const matchWh = bRem < aRem ? bRem : aRem;
    const curB = activeBids[bCursor].order;
    const curA = activeAsks[aCursor].order;

    const obligationId = `obl-${zoneId}-${intervalIdx}-${curB.orderId.slice(0, 8)}-${curA.orderId.slice(0, 8)}-${obligations.length}`;

    obligations.push({
      obligationId,
      epochId: `epoch-${zoneId}-${intervalIdx}`,
      buyOrderId: curB.orderId,
      sellOrderId: curA.orderId,
      buyer: curB.participant,
      seller: curA.participant,
      zoneId,
      intervalIdx,
      quantityWh: matchWh,
      pricePaisePerKWh: clearingPrice,
      deliveredWh: 0n,
      shortfallWh: 0n,
    });

    bRem -= matchWh;
    aRem -= matchWh;

    if (bRem === 0n) {
      bCursor++;
      if (bCursor < activeBids.length) bRem = activeBids[bCursor].allocatedWh;
    }
    if (aRem === 0n) {
      aCursor++;
      if (aCursor < activeAsks.length) aRem = activeAsks[aCursor].allocatedWh;
    }
  }

  // 8. Generate Obligations Merkle Root
  const obligationHashes = obligations.map((o) => hashObligationLeaf(o));
  const obligationsMerkleRoot = obligationHashes.length > 0
    ? new BinaryMerkleTree(obligationHashes).getRoot()
    : ('0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`);

  return {
    zoneId,
    intervalIdx,
    clearingPricePaiseKWh: clearingPrice,
    clearedVolumeWh: finalClearedVolume,
    obligations,
    ordersMerkleRoot,
    obligationsMerkleRoot,
  };
}
