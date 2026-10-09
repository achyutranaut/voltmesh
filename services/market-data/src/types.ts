import { z } from 'zod';

export const MarketDataValueSchema = z.object({
  value: z.number().finite().nonnegative(),
  unit: z.string().min(1),
  source: z.string().min(1),
  asOf: z.number().int().positive(),
  stale: z.boolean(),
});

export type MarketDataValue = z.infer<typeof MarketDataValueSchema>;

export interface MarketDataProviderStatus {
  provider: string;
  priceProvider: string;
  weatherProvider: string;
  lastFetchTime?: number;
  healthy: boolean;
  stale: boolean;
}

export interface MarketDataProvider {
  readonly name: string;
  getReferencePrice(zoneId: number, intervalStart: number): Promise<MarketDataValue>;
  getSolarIrradiance(lat: number, lon: number, from: number, to: number): Promise<MarketDataValue[]>;
  getWind(lat: number, lon: number, from: number, to: number): Promise<MarketDataValue[]>;
  getStatus(): Promise<MarketDataProviderStatus>;
}

/**
 * Pure solar generation calculation for 15-minute interval:
 * intervalWh = round(kWp * 1000 * (ghi / 1000) * pr * 0.25)
 * 0.25 represents 15 minutes = 0.25 hours
 */
export function intervalWh(ghiWm2: number, kWp: number, performanceRatio = 0.8): bigint {
  if (ghiWm2 <= 0 || kWp <= 0) return 0n;
  const rawWh = kWp * 1000 * (ghiWm2 / 1000) * performanceRatio * 0.25;
  return BigInt(Math.max(0, Math.round(rawWh)));
}

/**
 * Theoretical clear-sky maximum generation Wh for a 15-minute interval
 */
export function clearSkyMaxWh(kWp: number, ghiWm2: number): bigint {
  if (ghiWm2 <= 0 || kWp <= 0) return 0n;
  // Maximum possible without losses (pr = 1.0)
  const maxWh = kWp * 1000 * (ghiWm2 / 1000) * 1.0 * 0.25;
  return BigInt(Math.max(0, Math.round(maxWh)));
}
