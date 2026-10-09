import { z } from 'zod';
import { MarketDataProvider, MarketDataValue, MarketDataProviderStatus, MarketDataValueSchema } from './types.js';
import { MarketDataCache } from './cache.js';

const OpenMeteoHourlyResponseSchema = z.object({
  hourly: z.object({
    time: z.array(z.string()),
    shortwave_radiation: z.array(z.number()),
    direct_radiation: z.array(z.number().optional()),
    wind_speed_100m: z.array(z.number()),
  }),
});

export class OpenMeteoProvider implements MarketDataProvider {
  public readonly name = 'Open-Meteo';
  private irradianceCache = new MarketDataCache<MarketDataValue[]>(15 * 60 * 1000); // 15 min TTL
  private windCache = new MarketDataCache<MarketDataValue[]>(15 * 60 * 1000);
  private lastFetchTimestamp = 0;
  private isLastFetchHealthy = true;

  constructor(private readonly fetchTimeoutMs = 5000) {}

  public async getSolarIrradiance(lat: number, lon: number, from: number, to: number): Promise<MarketDataValue[]> {
    const cacheKey = `irr:${lat.toFixed(2)}:${lon.toFixed(2)}`;
    const cached = this.irradianceCache.get(cacheKey);

    if (cached && !cached.isStale) {
      return this.filterRange(cached.data, from, to);
    }

    try {
      const data = await this.fetchForecast(lat, lon);
      this.lastFetchTimestamp = Math.floor(Date.now() / 1000);
      this.isLastFetchHealthy = true;

      const interpolated = this.interpolateHourlyTo15Min(
        data.hourly.time,
        data.hourly.shortwave_radiation,
        'W/m²',
        'Open-Meteo.com'
      );

      this.irradianceCache.set(cacheKey, interpolated, this.lastFetchTimestamp);
      return this.filterRange(interpolated, from, to);
    } catch (err) {
      this.isLastFetchHealthy = false;
      if (cached) {
        // Return stale fallback
        const staleValues = cached.data.map((d) => ({ ...d, stale: true }));
        return this.filterRange(staleValues, from, to);
      }
      throw err;
    }
  }

  public async getWind(lat: number, lon: number, from: number, to: number): Promise<MarketDataValue[]> {
    const cacheKey = `wind:${lat.toFixed(2)}:${lon.toFixed(2)}`;
    const cached = this.windCache.get(cacheKey);

    if (cached && !cached.isStale) {
      return this.filterRange(cached.data, from, to);
    }

    try {
      const data = await this.fetchForecast(lat, lon);
      this.lastFetchTimestamp = Math.floor(Date.now() / 1000);
      this.isLastFetchHealthy = true;

      const interpolated = this.interpolateHourlyTo15Min(
        data.hourly.time,
        data.hourly.wind_speed_100m,
        'm/s',
        'Open-Meteo.com'
      );

      this.windCache.set(cacheKey, interpolated, this.lastFetchTimestamp);
      return this.filterRange(interpolated, from, to);
    } catch (err) {
      this.isLastFetchHealthy = false;
      if (cached) {
        const staleValues = cached.data.map((d) => ({ ...d, stale: true }));
        return this.filterRange(staleValues, from, to);
      }
      throw err;
    }
  }

  public async getReferencePrice(_zoneId: number, _intervalStart: number): Promise<MarketDataValue> {
    throw new Error('Open-Meteo is a meteorological provider and does not provide financial reference prices.');
  }

  public async getStatus(): Promise<MarketDataProviderStatus> {
    return {
      provider: this.name,
      priceProvider: 'None',
      weatherProvider: this.name,
      lastFetchTime: this.lastFetchTimestamp,
      healthy: this.isLastFetchHealthy,
      stale: Date.now() / 1000 - this.lastFetchTimestamp > 30 * 60,
    };
  }

  private async fetchForecast(lat: number, lon: number) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=shortwave_radiation,direct_radiation,wind_speed_100m&timezone=Asia/Kolkata&forecast_days=2`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.fetchTimeoutMs);

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
      const rawJson = await res.json();
      return OpenMeteoHourlyResponseSchema.parse(rawJson);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Linear interpolation from hourly values to 15-minute intervals (4 blocks per hour)
   */
  public interpolateHourlyTo15Min(
    times: string[],
    values: number[],
    unit: string,
    source: string
  ): MarketDataValue[] {
    const result: MarketDataValue[] = [];
    const nowSec = Math.floor(Date.now() / 1000);

    for (let i = 0; i < times.length - 1; i++) {
      const startTime = new Date(times[i]).getTime() / 1000;
      const v0 = Math.max(0, values[i]);
      const v1 = Math.max(0, values[i + 1]);

      for (let step = 0; step < 4; step++) {
        const intervalTime = startTime + step * 15 * 60;
        const fraction = step / 4;
        const interpolatedValue = Math.round((v0 + (v1 - v0) * fraction) * 10) / 10;

        const validated = MarketDataValueSchema.parse({
          value: interpolatedValue,
          unit,
          source,
          asOf: nowSec,
          stale: false,
        });

        result.push(validated);
      }
    }

    return result;
  }

  private filterRange(items: MarketDataValue[], from: number, to: number): MarketDataValue[] {
    if (from <= 0 && to <= 0) return items;
    return items.filter((item) => item.asOf >= from && item.asOf <= to);
  }
}
