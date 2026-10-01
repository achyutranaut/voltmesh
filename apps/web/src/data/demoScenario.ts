import { Order, OrderSide, SourceType, ParticipantRole } from '@energy-dex/types';

export interface DemoZoneConfig {
  zoneId: number;
  zoneCode: string;
  discomName: string;
  substation: string;
  transformerKva: number;
  capacityLimitWh: bigint;
  priceFloorPaiseKWh: bigint;
  priceCapPaiseKWh: bigint;
  referenceTariffPaiseKWh: bigint; // Standard retail utility tariff (₹8.50/kWh)
}

export const DEMO_ZONE: DemoZoneConfig = {
  zoneId: 1,
  zoneCode: 'DL-TPDDL-Z1',
  discomName: 'Tata Power DDL (Delhi)',
  substation: 'Shalimar Bagh Feeder #4 (500 kVA)',
  transformerKva: 500,
  capacityLimitWh: 100000n, // 100 kWh per 15-min interval
  priceFloorPaiseKWh: 200n, // ₹2.00 / kWh
  priceCapPaiseKWh: 1200n,  // ₹12.00 / kWh
  referenceTariffPaiseKWh: 850n, // ₹8.50 / kWh retail tariff benchmark
};

export interface DemoDevice {
  deviceId: string;
  participantAddress: string;
  participantName: string;
  sourceType: SourceType;
  ratedCapacityW: bigint;
  baseEfficiency: number;
}

export const DEMO_DEVICES: DemoDevice[] = [
  {
    deviceId: 'meter-delhi-solar-001',
    participantAddress: '0x1111111111111111111111111111111111111101',
    participantName: 'Arun Verma (Rooftop 8kW)',
    sourceType: SourceType.SOLAR_PV,
    ratedCapacityW: 8000n,
    baseEfficiency: 0.98,
  },
  {
    deviceId: 'meter-delhi-solar-002',
    participantAddress: '0x1111111111111111111111111111111111111102',
    participantName: 'Sanjay Gupta (Rooftop 6kW)',
    sourceType: SourceType.SOLAR_PV,
    ratedCapacityW: 6000n,
    baseEfficiency: 0.95,
  },
  {
    deviceId: 'meter-delhi-solar-003',
    participantAddress: '0x1111111111111111111111111111111111111103',
    participantName: 'Priya Sharma (Rooftop 10kW)',
    sourceType: SourceType.SOLAR_PV,
    ratedCapacityW: 10000n,
    baseEfficiency: 0.99,
  },
  {
    deviceId: 'meter-delhi-solar-004',
    participantAddress: '0x1111111111111111111111111111111111111104',
    participantName: 'Sunil Malhotra (Rooftop 5kW - Partial Shade)',
    sourceType: SourceType.SOLAR_PV,
    ratedCapacityW: 5000n,
    baseEfficiency: 0.85,
  },
  {
    deviceId: 'meter-delhi-solar-005',
    participantAddress: '0x1111111111111111111111111111111111111105',
    participantName: 'GreenTech Society (Community Solar 25kW)',
    sourceType: SourceType.SOLAR_PV,
    ratedCapacityW: 25000n,
    baseEfficiency: 0.97,
  },
];

/**
 * Generates realistic realistic multi-order batch for Interval 48
 */
export function getDemoOrders(intervalIdx: number = 48): Order[] {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 7200;

  return [
    // --- SELLER ASKS (Solar Prosumers offering surplus) ---
    {
      orderId: 'ask-pro-01',
      participant: '0x1111111111111111111111111111111111111101',
      zoneId: 1,
      intervalIdx,
      side: OrderSide.SELL,
      quantityWh: 2500n, // 2.5 kWh
      pricePaisePerKWh: 340n, // ₹3.40/kWh
      nonce: 101n,
      expiry,
      signature: new Uint8Array(65),
      createdAt: now - 900,
    },
    {
      orderId: 'ask-pro-02',
      participant: '0x1111111111111111111111111111111111111102',
      zoneId: 1,
      intervalIdx,
      side: OrderSide.SELL,
      quantityWh: 1800n, // 1.8 kWh
      pricePaisePerKWh: 360n, // ₹3.60/kWh
      nonce: 102n,
      expiry,
      signature: new Uint8Array(65),
      createdAt: now - 850,
    },
    {
      orderId: 'ask-pro-03',
      participant: '0x1111111111111111111111111111111111111103',
      zoneId: 1,
      intervalIdx,
      side: OrderSide.SELL,
      quantityWh: 3200n, // 3.2 kWh
      pricePaisePerKWh: 380n, // ₹3.80/kWh
      nonce: 103n,
      expiry,
      signature: new Uint8Array(65),
      createdAt: now - 800,
    },
    {
      orderId: 'ask-pro-04',
      participant: '0x1111111111111111111111111111111111111104',
      zoneId: 1,
      intervalIdx,
      side: OrderSide.SELL,
      quantityWh: 1500n, // 1.5 kWh
      pricePaisePerKWh: 410n, // ₹4.10/kWh
      nonce: 104n,
      expiry,
      signature: new Uint8Array(65),
      createdAt: now - 750,
    },
    {
      orderId: 'ask-pro-05',
      participant: '0x1111111111111111111111111111111111111105',
      zoneId: 1,
      intervalIdx,
      side: OrderSide.SELL,
      quantityWh: 6000n, // 6.0 kWh
      pricePaisePerKWh: 430n, // ₹4.30/kWh
      nonce: 105n,
      expiry,
      signature: new Uint8Array(65),
      createdAt: now - 700,
    },
    {
      orderId: 'ask-pro-06',
      participant: '0x1111111111111111111111111111111111111106',
      zoneId: 1,
      intervalIdx,
      side: OrderSide.SELL,
      quantityWh: 2000n, // 2.0 kWh
      pricePaisePerKWh: 490n, // ₹4.90/kWh (Out of the money if cleared around 450)
      nonce: 106n,
      expiry,
      signature: new Uint8Array(65),
      createdAt: now - 650,
    },

    // --- BUYER BIDS (Consumers procuring clean energy) ---
    {
      orderId: 'bid-com-01',
      participant: '0x2222222222222222222222222222222222222201',
      zoneId: 1,
      intervalIdx,
      side: OrderSide.BUY,
      quantityWh: 4000n, // 4.0 kWh - Commercial EV Hub
      pricePaisePerKWh: 680n, // ₹6.80/kWh
      nonce: 201n,
      expiry,
      signature: new Uint8Array(65),
      createdAt: now - 880,
    },
    {
      orderId: 'bid-com-02',
      participant: '0x2222222222222222222222222222222222222202',
      zoneId: 1,
      intervalIdx,
      side: OrderSide.BUY,
      quantityWh: 3500n, // 3.5 kWh - Data Center HVAC
      pricePaisePerKWh: 600n, // ₹6.00/kWh
      nonce: 202n,
      expiry,
      signature: new Uint8Array(65),
      createdAt: now - 820,
    },
    {
      orderId: 'bid-res-01',
      participant: '0x2222222222222222222222222222222222222203',
      zoneId: 1,
      intervalIdx,
      side: OrderSide.BUY,
      quantityWh: 2500n, // 2.5 kWh - Residential Villa
      pricePaisePerKWh: 520n, // ₹5.20/kWh
      nonce: 203n,
      expiry,
      signature: new Uint8Array(65),
      createdAt: now - 780,
    },
    {
      orderId: 'bid-res-02',
      participant: '0x2222222222222222222222222222222222222204',
      zoneId: 1,
      intervalIdx,
      side: OrderSide.BUY,
      quantityWh: 2000n, // 2.0 kWh - Residential Apartment
      pricePaisePerKWh: 470n, // ₹4.70/kWh
      nonce: 204n,
      expiry,
      signature: new Uint8Array(65),
      createdAt: now - 740,
    },
    {
      orderId: 'bid-res-03',
      participant: '0x2222222222222222222222222222222222222205',
      zoneId: 1,
      intervalIdx,
      side: OrderSide.BUY,
      quantityWh: 2500n, // 2.5 kWh
      pricePaisePerKWh: 440n, // ₹4.40/kWh (Margin order)
      nonce: 205n,
      expiry,
      signature: new Uint8Array(65),
      createdAt: now - 710,
    },
    {
      orderId: 'bid-res-04',
      participant: '0x2222222222222222222222222222222222222206',
      zoneId: 1,
      intervalIdx,
      side: OrderSide.BUY,
      quantityWh: 1500n, // 1.5 kWh
      pricePaisePerKWh: 330n, // ₹3.30/kWh (Out of the money low bid)
      nonce: 206n,
      expiry,
      signature: new Uint8Array(65),
      createdAt: now - 690,
    },
  ];
}

/**
 * 24-Hour (96-interval) Solar Curve and Load Profile Generator
 */
export function generateDailyTelemetryProfile(): {
  interval: number;
  solarWh: number;
  forecastWh: number;
  loadWh: number;
  residualWh: number;
  anomalyScore: number;
}[] {
  const profile = [];

  for (let i = 0; i < 96; i++) {
    // Solar generation (interval 24 to 72, peak at 48)
    let solarWh = 0;
    let forecastWh = 0;

    if (i >= 24 && i <= 72) {
      const dist = Math.abs(i - 48);
      const factor = Math.max(0, 1 - (dist / 24) ** 2);
      // 8 kW array max Wh per 15 min = 2000 Wh
      solarWh = Math.round(2000 * factor);
      // Forecast has mild variance
      const noise = (Math.sin(i * 0.5) * 50) + (i === 44 ? -350 : 20); // cloud dip at 44
      forecastWh = Math.max(0, Math.round(solarWh + noise));
    }

    // Base consumption load (peaks in morning 32-38 and evening 76-88)
    let loadWh = 400; // 400 Wh base
    if (i >= 30 && i <= 40) {
      loadWh += 350; // Morning load
    } else if (i >= 74 && i <= 88) {
      loadWh += 550; // Evening peak load
    }

    const residual = solarWh - forecastWh;
    // Anomaly score: normalized residual
    const anomalyScore = Math.min(1, Math.abs(residual) / 600);

    profile.push({
      interval: i,
      solarWh,
      forecastWh,
      loadWh,
      residualWh: residual,
      anomalyScore: Number(anomalyScore.toFixed(3)),
    });
  }

  return profile;
}
