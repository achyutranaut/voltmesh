import { describe, it, expect } from 'vitest';
import {
  clearMarket,
  calculateDetailedReconciliation,
  checkEnergyPositionReservation,
  calculateAvailableOfferLimit,
  DEFAULT_DERC_TARIFF_SCHEDULE,
  DEFAULT_UPERC_TARIFF_SCHEDULE,
  DEFAULT_SHORTFALL_POLICY,
  DEFAULT_UNDER_DRAW_POLICY,
} from '@energy-dex/clearing';
import { Order, OrderSide, EnergyPosition } from '@energy-dex/types';

describe('Real-World P2P Market Property Invariants (DERC / UPERC Guidelines)', () => {
  it('Property 1: Delivered Energy is strictly bounded by min(Contracted, Seller Injection, Buyer Consumption)', () => {
    const testCases = [
      { contracted: 10000n, seller: 10000n, buyer: 10000n, expected: 10000n },
      { contracted: 10000n, seller: 7000n,  buyer: 10000n, expected: 7000n },
      { contracted: 10000n, seller: 10000n, buyer: 6000n,  expected: 6000n },
      { contracted: 10000n, seller: 5000n,  buyer: 4000n,  expected: 4000n },
      { contracted: 10000n, seller: 15000n, buyer: 12000n, expected: 10000n }, // Capped at contracted
      { contracted: 10000n, seller: 0n,      buyer: 10000n, expected: 0n },
      { contracted: 10000n, seller: 10000n, buyer: 0n,      expected: 0n },
    ];

    for (const tc of testCases) {
      const res = calculateDetailedReconciliation({
        obligationId: 'test-obl',
        contractedWh: tc.contracted,
        actualSellerInjectionWh: tc.seller,
        actualBuyerConsumptionWh: tc.buyer,
        energyPricePaiseKWh: 450n,
      });

      expect(res.deliveredEnergyWh).toBe(tc.expected);
      expect(res.deliveredEnergyWh <= tc.contracted).toBe(true);
      expect(res.deliveredEnergyWh <= tc.seller).toBe(true);
      expect(res.deliveredEnergyWh <= tc.buyer).toBe(true);
    }
  });

  it('Property 2: Energy Position Invariant: Committed + Reserved <= Declared Available', () => {
    const pos: EnergyPosition = {
      participant: '0x1111111111111111111111111111111111111111',
      intervalIdx: 48,
      dateEpoch: 20000,
      installedSolarCapacityW: 10000n,
      forecastGenerationWh: 2500n,
      declaredAvailableWh: 2500n,
      committedWh: 1500n,
      reservedWh: 500n,
      deliveredWh: 0n,
      settledWh: 0n,
      source: 'SIMULATOR',
      timestamp: 1775000000,
    };

    // Attempting to reserve 500 Wh: 1500 + 500 + 500 = 2500 <= 2500 -> Valid
    const check1 = checkEnergyPositionReservation(pos, 500n);
    expect(check1.valid).toBe(true);

    // Attempting to reserve 600 Wh: 1500 + 500 + 600 = 2600 > 2500 -> Invalid
    const check2 = checkEnergyPositionReservation(pos, 600n);
    expect(check2.valid).toBe(false);
    expect(check2.reason).toContain('exceeds available position');
  });

  it('Property 3: Offer Limit is strictly bounded by min(declared, forecast, physical capacity, policy)', () => {
    // Declared 5000, Forecast 4000, Capacity 20kW (5000 Wh / 15-min)
    const limit1 = calculateAvailableOfferLimit(20000n, 4000n, 5000n);
    expect(limit1).toBe(4000n); // Bound by forecast

    // Declared 5000, Forecast 6000, Capacity 12kW (3000 Wh / 15-min)
    const limit2 = calculateAvailableOfferLimit(12000n, 6000n, 5000n);
    expect(limit2).toBe(3000n); // Bound by physical capacity

    // Declared 5000, Forecast 6000, Capacity 40kW (10000 Wh / 15-min), Policy 2000 Wh
    const limit3 = calculateAvailableOfferLimit(40000n, 6000n, 5000n, 2000n);
    expect(limit3).toBe(2000n); // Bound by policy cap
  });

  it('Property 4: Financial Conservation: Buyer Payable >= Seller Receivable (No free money generated)', () => {
    const randomScenarios = [
      { contracted: 8000n, seller: 8000n, buyer: 8000n, price: 500n },
      { contracted: 8000n, seller: 5000n, buyer: 8000n, price: 400n },
      { contracted: 8000n, seller: 8000n, buyer: 4000n, price: 600n },
      { contracted: 12000n, seller: 9000n, buyer: 7000n, price: 450n },
    ];

    for (const sc of randomScenarios) {
      const res = calculateDetailedReconciliation({
        obligationId: 'sc-obl',
        contractedWh: sc.contracted,
        actualSellerInjectionWh: sc.seller,
        actualBuyerConsumptionWh: sc.buyer,
        energyPricePaiseKWh: sc.price,
      });

      // Net buyer payment covers seller payment + platform fee + wheeling charge + taxes
      expect(res.netBuyerPayablePaise >= res.netSellerReceivablePaise).toBe(true);
      expect(res.netBuyerPayablePaise >= 0n).toBe(true);
      expect(res.netSellerReceivablePaise >= 0n).toBe(true);
      expect(res.totalPlatformFeesPaise >= 0n).toBe(true);
      expect(res.totalWheelingChargesPaise >= 0n).toBe(true);
      expect(res.totalTaxesPaise >= 0n).toBe(true);
    }
  });

  it('Property 5: Asymmetric Deviations: Shortfall and Under-Draw do not interfere', () => {
    // Case A: Pure Seller Shortfall
    const sellerShortfallRes = calculateDetailedReconciliation({
      obligationId: 'case-a',
      contractedWh: 10000n,
      actualSellerInjectionWh: 8000n,
      actualBuyerConsumptionWh: 10000n,
      energyPricePaiseKWh: 400n,
    });
    expect(sellerShortfallRes.sellerShortfallWh).toBe(2000n);
    expect(sellerShortfallRes.buyerUnderDrawWh).toBe(0n);
    expect(sellerShortfallRes.sellerShortfallPenaltyPaise).toBeGreaterThan(0n);
    expect(sellerShortfallRes.buyerUnderDrawPenaltyPaise).toBe(0n);
    expect(sellerShortfallRes.discomDebitWh).toBe(2000n); // Buyer drew 2000 Wh from DISCOM grid

    // Case B: Pure Buyer Under-Draw
    const buyerUnderDrawRes = calculateDetailedReconciliation({
      obligationId: 'case-b',
      contractedWh: 10000n,
      actualSellerInjectionWh: 10000n,
      actualBuyerConsumptionWh: 8000n,
      energyPricePaiseKWh: 400n,
    });
    expect(buyerUnderDrawRes.sellerShortfallWh).toBe(0n);
    expect(buyerUnderDrawRes.buyerUnderDrawWh).toBe(2000n);
    expect(buyerUnderDrawRes.sellerShortfallPenaltyPaise).toBe(0n);
    expect(buyerUnderDrawRes.buyerUnderDrawPenaltyPaise).toBeGreaterThan(0n); // Take-or-pay applied
  });

  it('Property 6: Deterministic Call Auction Volume and Price Bounds', () => {
    const orders: Order[] = [
      {
        orderId: 'b1',
        participant: '0x1111111111111111111111111111111111111111',
        zoneId: 1,
        intervalIdx: 48,
        side: OrderSide.BUY,
        quantityWh: 5000n,
        pricePaisePerKWh: 500n,
        nonce: 1n,
        expiry: 2000000000,
        signature: new Uint8Array(65),
        createdAt: 100,
      },
      {
        orderId: 'b2',
        participant: '0x2222222222222222222222222222222222222222',
        zoneId: 1,
        intervalIdx: 48,
        side: OrderSide.BUY,
        quantityWh: 3000n,
        pricePaisePerKWh: 450n,
        nonce: 2n,
        expiry: 2000000000,
        signature: new Uint8Array(65),
        createdAt: 101,
      },
      {
        orderId: 's1',
        participant: '0x3333333333333333333333333333333333333333',
        zoneId: 1,
        intervalIdx: 48,
        side: OrderSide.SELL,
        quantityWh: 4000n,
        pricePaisePerKWh: 400n,
        nonce: 3n,
        expiry: 2000000000,
        signature: new Uint8Array(65),
        createdAt: 102,
      },
      {
        orderId: 's2',
        participant: '0x4444444444444444444444444444444444444444',
        zoneId: 1,
        intervalIdx: 48,
        side: OrderSide.SELL,
        quantityWh: 4000n,
        pricePaisePerKWh: 480n,
        nonce: 4n,
        expiry: 2000000000,
        signature: new Uint8Array(65),
        createdAt: 103,
      },
    ];

    const res = clearMarket({
      zoneId: 1,
      intervalIdx: 48,
      orders,
      priceFloorPaiseKWh: 200n,
      priceCapPaiseKWh: 1200n,
      zoneCapacityWh: 10000000n,
      epochSeed: 'property-seed-1',
      gateClosureTimestamp: 1000000,
    });

    expect(res.clearedVolumeWh).toBeGreaterThan(0n);
    expect(res.clearingPricePaiseKWh).toBeGreaterThanOrEqual(400n);
    expect(res.clearingPricePaiseKWh).toBeLessThanOrEqual(500n);

    // Sum of obligations quantities must equal cleared volume
    const sumObligations = res.obligations.reduce((acc, o) => acc + o.quantityWh, 0n);
    expect(sumObligations).toBe(res.clearedVolumeWh);
  });

  it('Property 7: Exact Financial Conservation: Buyer Inflows strictly equal System Outflows', () => {
    const testCases = [
      { contracted: 10000n, seller: 10000n, buyer: 10000n, price: 450n },
      { contracted: 10000n, seller: 6000n,  buyer: 10000n, price: 400n }, // Shortfall
      { contracted: 10000n, seller: 10000n, buyer: 7000n,  price: 500n }, // Underdraw
      { contracted: 12000n, seller: 9000n,  buyer: 8000n,  price: 480n }, // Partial delivery
      { contracted: 5000n,  seller: 3000n,  buyer: 4000n,  price: 350n },
    ];

    for (const tc of testCases) {
      const res = calculateDetailedReconciliation({
        obligationId: 'prop-7-obl',
        contractedWh: tc.contracted,
        actualSellerInjectionWh: tc.seller,
        actualBuyerConsumptionWh: tc.buyer,
        energyPricePaiseKWh: tc.price,
      });

      // Conservation Identity: Buyer Net Payable = Seller Receivable + Wheeling + Platform Fee + Taxes + Shortfall Penalty
      const totalSystemOutflows = res.netSellerReceivablePaise +
        res.totalWheelingChargesPaise +
        res.totalPlatformFeesPaise +
        res.totalTaxesPaise +
        res.sellerShortfallPenaltyPaise;

      const totalBuyerInflows = res.netBuyerPayablePaise;
      expect(totalBuyerInflows).toBe(totalSystemOutflows);
    }
  });
});
