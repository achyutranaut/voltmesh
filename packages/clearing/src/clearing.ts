import { keccak256, encodePacked, stringToHex, pad } from 'viem';
import {
  Order,
  OrderSide,
  DeliveryObligation,
  ClearingResult,
  EnergyPosition,
  TariffSchedule,
  ShortfallPolicy,
  UnderDrawPolicy,
  ChargeItem,
  DetailedReconciliationResult,
} from '@energy-dex/types';
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

export interface DeliveryReconciliationInput {
  contractedWh: bigint;
  sellerVerifiedDeliveredWh: bigint;
  buyerVerifiedConsumedWh: bigint;
  clearingPricePaiseKWh: bigint;
  shortfallPenaltyBps?: number;
}

export interface DeliveryReconciliationResult {
  contractedWh: bigint;
  deliveredWh: bigint;
  shortfallWh: bigint;
  clearingPricePaiseKWh: bigint;
  netDeliveredAmountPaise: bigint;
  shortfallPenaltyPaise: bigint;
  finalSellerCreditPaise: bigint;
  finalBuyerDebitPaise: bigint;
  fulfillmentRatePct: number;
  status: 'FULL_DELIVERY' | 'PARTIAL_DELIVERY' | 'COMPLETE_SHORTFALL';
}

/**
 * Calculates delivery reconciliation between contracted obligations and verified physical telemetry.
 * Formally enforces: Delivered = min(Contracted, Seller Injection, Buyer Consumption).
 */
export function calculateDeliveryReconciliation(
  input: DeliveryReconciliationInput
): DeliveryReconciliationResult {
  const {
    contractedWh,
    sellerVerifiedDeliveredWh,
    buyerVerifiedConsumedWh,
    clearingPricePaiseKWh,
    shortfallPenaltyBps = 2000,
  } = input;

  if (contractedWh <= 0n) {
    throw new Error('Contracted volume must be strictly positive');
  }

  let deliveredWh = contractedWh;
  if (sellerVerifiedDeliveredWh < deliveredWh) {
    deliveredWh = sellerVerifiedDeliveredWh;
  }
  if (buyerVerifiedConsumedWh < deliveredWh) {
    deliveredWh = buyerVerifiedConsumedWh;
  }
  if (deliveredWh < 0n) {
    deliveredWh = 0n;
  }

  const shortfallWh = contractedWh - deliveredWh;
  const netDeliveredAmountPaise = (deliveredWh * clearingPricePaiseKWh) / 1000n;
  const shortfallPenaltyPaise = (shortfallWh * clearingPricePaiseKWh * BigInt(shortfallPenaltyBps)) / 10000000n;

  const sellerUnderdelivered = sellerVerifiedDeliveredWh < contractedWh;
  const finalSellerCreditPaise = sellerUnderdelivered && netDeliveredAmountPaise >= shortfallPenaltyPaise
    ? netDeliveredAmountPaise - shortfallPenaltyPaise
    : netDeliveredAmountPaise;

  const finalBuyerDebitPaise = netDeliveredAmountPaise;
  const fulfillmentRatePct = Number((deliveredWh * 10000n) / contractedWh) / 100;

  let status: 'FULL_DELIVERY' | 'PARTIAL_DELIVERY' | 'COMPLETE_SHORTFALL' = 'PARTIAL_DELIVERY';
  if (deliveredWh === contractedWh) {
    status = 'FULL_DELIVERY';
  } else if (deliveredWh === 0n) {
    status = 'COMPLETE_SHORTFALL';
  }

  return {
    contractedWh,
    deliveredWh,
    shortfallWh,
    clearingPricePaiseKWh,
    netDeliveredAmountPaise,
    shortfallPenaltyPaise,
    finalSellerCreditPaise,
    finalBuyerDebitPaise,
    fulfillmentRatePct,
    status,
  };
}

// ---------------------------------------------------------------------------
// 9. Standard Regulatory Schedules (DERC / UPERC Benchmarks)
// ---------------------------------------------------------------------------

export const DEFAULT_DERC_TARIFF_SCHEDULE: TariffSchedule = {
  tariffId: 'tariff-derc-2026-v1',
  discomId: 'TPDDL',
  jurisdiction: 'DERC',
  effectiveFrom: 1735689600, // 2025-01-01
  effectiveTo: 1798761600,   // 2027-01-01
  wheelingChargePaiseKWh: 35n, // 35 paise / kWh wheeling
  platformFeePaiseKWh: 10n,   // 10 paise / kWh trading platform fee
  regulatorySurchargePaiseKWh: 0n,
  taxGstBps: 1800,           // 18% GST on services
};

export const DEFAULT_UPERC_TARIFF_SCHEDULE: TariffSchedule = {
  tariffId: 'tariff-uperc-2026-v1',
  discomId: 'PVVNL',
  jurisdiction: 'UPERC',
  effectiveFrom: 1735689600,
  effectiveTo: 1798761600,
  wheelingChargePaiseKWh: 40n, // 40 paise / kWh wheeling
  platformFeePaiseKWh: 15n,   // 15 paise / kWh trading platform fee
  regulatorySurchargePaiseKWh: 0n,
  taxGstBps: 1800,
};

export const DEFAULT_SHORTFALL_POLICY: ShortfallPolicy = {
  policyId: 'policy-shortfall-standard-v1',
  jurisdiction: 'DERC',
  referenceTariffPaiseKWh: 700n, // ₹7.00/kWh retail reference tariff
  replacementPenaltyBps: 2000,   // 20% penalty
  maxPenaltyBps: 5000,
  buyerRefundRule: 'FULL_REFUND_PLUS_PENALTY',
  sellerPenaltyRule: 'APPC_DEDUCTION',
};

export const DEFAULT_UNDER_DRAW_POLICY: UnderDrawPolicy = {
  policyId: 'policy-underdraw-standard-v1',
  jurisdiction: 'DERC',
  takeOrPayBps: 10000,           // 100% take-or-pay for scheduled and injected energy
  gridBankingCreditRateBps: 5000,// 50% value credited if energy is absorbed into DISCOM banking
  discomInterchangeTreatment: 'GRID_BANKING',
};

// ---------------------------------------------------------------------------
// 10. Energy Position & Capacity Reservation Checks
// ---------------------------------------------------------------------------

/**
 * Validates whether an incoming order can be accepted against the participant's
 * real energy position without exceeding solar capacity or double-selling.
 */
export function checkEnergyPositionReservation(
  position: EnergyPosition,
  orderWh: bigint
): { valid: boolean; reason?: string } {
  if (orderWh <= 0n) {
    return { valid: false, reason: 'Order quantity must be positive' };
  }

  // Check 1: Invariant committedWh + reservedWh + orderWh <= declaredAvailableWh
  const newCommitment = position.committedWh + position.reservedWh + orderWh;
  if (newCommitment > position.declaredAvailableWh) {
    return {
      valid: false,
      reason: `Order quantity (${orderWh} Wh) exceeds available position (${position.declaredAvailableWh - (position.committedWh + position.reservedWh)} Wh remaining)`,
    };
  }

  // Check 2: Physical generation and storage discharge ceiling
  const physicalCapacityWh = position.installedSolarCapacityW;
  if (physicalCapacityWh > 0n && newCommitment > physicalCapacityWh) {
    return {
      valid: false,
      reason: `Order quantity exceeds physical inverter capacity ceiling (${physicalCapacityWh} Wh)`,
    };
  }

  return { valid: true };
}

/**
 * Calculates allowable offer capacity taking into account declared availability,
 * solar forecast, physical inverter rating, and regulatory policy caps.
 */
export function calculateAvailableOfferLimit(
  installedSolarCapacityW: bigint,
  forecastWh: bigint,
  declaredWh: bigint,
  policyLimitWh?: bigint
): bigint {
  const physicalLimit = installedSolarCapacityW > 0n ? installedSolarCapacityW / 4n : 0n;
  let limit = declaredWh;

  if (forecastWh > 0n && forecastWh < limit) {
    limit = forecastWh;
  }
  if (physicalLimit > 0n && physicalLimit < limit) {
    limit = physicalLimit;
  }
  if (policyLimitWh !== undefined && policyLimitWh < limit) {
    limit = policyLimitWh;
  }

  return limit > 0n ? limit : 0n;
}

// ---------------------------------------------------------------------------
// 11. Detailed Asymmetric Delivery Reconciliation
// ---------------------------------------------------------------------------

export interface DetailedReconciliationInput {
  obligationId: string;
  contractedWh: bigint;
  scheduledInjectionWh?: bigint;
  scheduledConsumptionWh?: bigint;
  actualSellerInjectionWh: bigint;
  actualBuyerConsumptionWh: bigint;
  energyPricePaiseKWh: bigint;
  tariffSchedule?: TariffSchedule;
  shortfallPolicy?: ShortfallPolicy;
  underDrawPolicy?: UnderDrawPolicy;
  buyerAddress?: string;
  sellerAddress?: string;
}

/**
 * Performs full real-world energy reconciliation separating:
 * - Contractual commitment vs physical meter telemetry
 * - Seller under-injection shortfall vs buyer under-draw deviations
 * - Detailed transaction charges (Wheeling, Platform Fee, GST)
 * - DISCOM grid interchange accounting (Grid Banking Credit vs Grid Retail Debit)
 */
export function calculateDetailedReconciliation(
  input: DetailedReconciliationInput
): DetailedReconciliationResult {
  const {
    obligationId,
    contractedWh,
    actualSellerInjectionWh,
    actualBuyerConsumptionWh,
    energyPricePaiseKWh,
    scheduledInjectionWh = input.contractedWh,
    scheduledConsumptionWh = input.contractedWh,
    tariffSchedule = DEFAULT_DERC_TARIFF_SCHEDULE,
    shortfallPolicy = DEFAULT_SHORTFALL_POLICY,
    underDrawPolicy = DEFAULT_UNDER_DRAW_POLICY,
    buyerAddress = '0x0000000000000000000000000000000000000000',
    sellerAddress = '0x0000000000000000000000000000000000000000',
  } = input;

  if (contractedWh <= 0n) {
    throw new Error('Contracted volume must be strictly positive');
  }

  // 1. Asymmetric physical delivery calculations
  const sellerDeliveredToGrid = actualSellerInjectionWh < contractedWh ? actualSellerInjectionWh : contractedWh;
  const buyerDrawnFromGrid = actualBuyerConsumptionWh < contractedWh ? actualBuyerConsumptionWh : contractedWh;

  // Actual P2P delivered energy is the mutual intersection
  let deliveredEnergyWh = sellerDeliveredToGrid < buyerDrawnFromGrid ? sellerDeliveredToGrid : buyerDrawnFromGrid;
  if (deliveredEnergyWh < 0n) deliveredEnergyWh = 0n;

  // Seller Deviations
  const sellerShortfallWh = actualSellerInjectionWh < contractedWh ? contractedWh - actualSellerInjectionWh : 0n;
  const sellerSurplusWh = actualSellerInjectionWh > contractedWh ? actualSellerInjectionWh - contractedWh : 0n;

  // Buyer Deviations
  const buyerUnderDrawWh = actualBuyerConsumptionWh < contractedWh ? contractedWh - actualBuyerConsumptionWh : 0n;
  const buyerOverConsumptionWh = actualBuyerConsumptionWh > contractedWh ? actualBuyerConsumptionWh - contractedWh : 0n;

  // 2. Financial settlement components
  const grossEnergyCostPaise = (deliveredEnergyWh * energyPricePaiseKWh) / 1000n;

  // Seller Shortfall penalty
  let sellerShortfallPenaltyPaise = 0n;
  if (sellerShortfallWh > 0n) {
    const penaltyBaseRate = shortfallPolicy.referenceTariffPaiseKWh > 0n
      ? shortfallPolicy.referenceTariffPaiseKWh
      : energyPricePaiseKWh;
    sellerShortfallPenaltyPaise = (sellerShortfallWh * penaltyBaseRate * BigInt(shortfallPolicy.replacementPenaltyBps)) / 10000000n;
  }

  // Buyer Under-draw take-or-pay obligation
  // If seller delivered energy to grid up to contracted, but buyer failed to consume, buyer is liable under take-or-pay
  let buyerUnderDrawPenaltyPaise = 0n;
  if (buyerUnderDrawWh > 0n && sellerDeliveredToGrid > deliveredEnergyWh) {
    const unconsumedInjectedWh = sellerDeliveredToGrid - deliveredEnergyWh;
    const liableUnderDrawWh = (unconsumedInjectedWh * BigInt(underDrawPolicy.takeOrPayBps)) / 10000n;
    buyerUnderDrawPenaltyPaise = (liableUnderDrawWh * energyPricePaiseKWh) / 1000n;
  }

  // Regulatory transaction charges
  const totalWheelingChargesPaise = (deliveredEnergyWh * tariffSchedule.wheelingChargePaiseKWh) / 1000n;
  const totalPlatformFeesPaise = (deliveredEnergyWh * tariffSchedule.platformFeePaiseKWh) / 1000n;
  const regulatorySurchargePaise = (deliveredEnergyWh * tariffSchedule.regulatorySurchargePaiseKWh) / 1000n;

  // GST (18% on fees and wheeling services)
  const taxableServiceAmount = totalWheelingChargesPaise + totalPlatformFeesPaise;
  const totalTaxesPaise = (taxableServiceAmount * BigInt(tariffSchedule.taxGstBps)) / 10000n;

  // Detailed charge breakdown
  const charges: ChargeItem[] = [
    {
      chargeType: 'ENERGY_PRICE',
      payer: buyerAddress,
      recipient: sellerAddress,
      basis: 'PER_KWH',
      ratePaiseOrBps: energyPricePaiseKWh,
      amountPaise: grossEnergyCostPaise,
    },
    {
      chargeType: 'WHEELING_CHARGE',
      payer: buyerAddress,
      recipient: 'DISCOM',
      basis: 'PER_KWH',
      ratePaiseOrBps: tariffSchedule.wheelingChargePaiseKWh,
      amountPaise: totalWheelingChargesPaise,
    },
    {
      chargeType: 'TRANSACTION_FEE',
      payer: buyerAddress,
      recipient: 'PLATFORM',
      basis: 'PER_KWH',
      ratePaiseOrBps: tariffSchedule.platformFeePaiseKWh,
      amountPaise: totalPlatformFeesPaise,
    },
    {
      chargeType: 'TAX_GST',
      payer: buyerAddress,
      recipient: 'TAX_AUTHORITY',
      basis: 'PERCENTAGE',
      ratePaiseOrBps: BigInt(tariffSchedule.taxGstBps),
      amountPaise: totalTaxesPaise,
    },
  ];

  if (sellerShortfallPenaltyPaise > 0n) {
    charges.push({
      chargeType: 'PENALTY',
      payer: sellerAddress,
      recipient: buyerAddress,
      basis: 'PERCENTAGE',
      ratePaiseOrBps: BigInt(shortfallPolicy.replacementPenaltyBps),
      amountPaise: sellerShortfallPenaltyPaise,
    });
  }

  // Net cash flows
  // Seller gets: Energy cost + Buyer underdraw compensation - Shortfall penalty
  const rawSellerCredit = grossEnergyCostPaise + buyerUnderDrawPenaltyPaise;
  const netSellerReceivablePaise = rawSellerCredit >= sellerShortfallPenaltyPaise
    ? rawSellerCredit - sellerShortfallPenaltyPaise
    : 0n;

  // Buyer pays: Energy cost + Buyer underdraw compensation + Wheeling + Platform Fee + Taxes
  const netBuyerPayablePaise = grossEnergyCostPaise + buyerUnderDrawPenaltyPaise + totalWheelingChargesPaise + totalPlatformFeesPaise + totalTaxesPaise;

  // DISCOM Grid physical reconciliation units:
  // - discomCreditWh: Surplus green energy exported to grid by seller that DISCOM banks/absorbs
  const discomCreditWh = sellerSurplusWh;
  // - discomDebitWh: Shortfall drawn by buyer from the utility grid at standard retail tariff
  const discomDebitWh = sellerShortfallWh < buyerDrawnFromGrid ? sellerShortfallWh : 0n;

  let status: 'FULL_DELIVERY' | 'PARTIAL_DELIVERY' | 'SELLER_SHORTFALL' | 'BUYER_UNDERDRAW' = 'PARTIAL_DELIVERY';
  if (deliveredEnergyWh === contractedWh) {
    status = 'FULL_DELIVERY';
  } else if (sellerShortfallWh > 0n && buyerUnderDrawWh === 0n) {
    status = 'SELLER_SHORTFALL';
  } else if (buyerUnderDrawWh > 0n && sellerShortfallWh === 0n) {
    status = 'BUYER_UNDERDRAW';
  }

  // Cryptographic deterministic anchor
  const reconciliationHash = keccak256(
    encodePacked(
      ['string', 'uint64', 'uint64', 'uint64', 'uint64', 'uint64', 'uint64'],
      [
        obligationId,
        contractedWh,
        deliveredEnergyWh,
        sellerShortfallWh,
        buyerUnderDrawWh,
        netSellerReceivablePaise,
        netBuyerPayablePaise,
      ]
    )
  );

  return {
    obligationId,
    contractedWh,
    scheduledInjectionWh,
    scheduledConsumptionWh,
    actualSellerInjectionWh,
    actualBuyerConsumptionWh,
    matchedEnergyWh: contractedWh,
    deliveredEnergyWh,
    sellerShortfallWh,
    buyerUnderDrawWh,
    buyerOverConsumptionWh,
    sellerSurplusWh,
    energyPricePaiseKWh,
    charges,
    grossEnergyCostPaise,
    totalPlatformFeesPaise,
    totalWheelingChargesPaise,
    totalTaxesPaise,
    sellerShortfallPenaltyPaise,
    buyerUnderDrawPenaltyPaise,
    netSellerReceivablePaise,
    netBuyerPayablePaise,
    discomCreditWh,
    discomDebitWh,
    reconciliationHash,
    status,
  };
}

