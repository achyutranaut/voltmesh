import { describe, it, expect } from 'vitest';
import { intervalWh, clearSkyMaxWh, MarketDataValueSchema } from '../src/types.js';
import { MarketDataCache } from '../src/cache.js';
import { IexCsvProvider } from '../src/iex.js';
import { OpenMeteoProvider } from '../src/openmeteo.js';
import { MockProvider } from '../src/mock.js';

describe('Market Data Package Unit Tests', () => {
  describe('intervalWh calculation', () => {
    it('calculates 15-minute Wh accurately', () => {
      // 5 kWp system, GHI = 800 W/m², PR = 0.8:
      // 5 * 1000 * (800 / 1000) * 0.8 * 0.25 = 800 Wh
      const wh = intervalWh(800, 5, 0.8);
      expect(wh).toBe(800n);
    });

    it('returns 0 Wh at night or zero capacity', () => {
      expect(intervalWh(0, 5, 0.8)).toBe(0n);
      expect(intervalWh(-10, 5, 0.8)).toBe(0n);
      expect(intervalWh(500, 0, 0.8)).toBe(0n);
    });

    it('computes clear sky maximum', () => {
      // 5 kWp system, GHI = 1000 W/m², PR = 1.0 -> 5 * 1000 * 1.0 * 0.25 = 1250 Wh
      const maxWh = clearSkyMaxWh(5, 1000);
      expect(maxWh).toBe(1250n);
    });
  });

  describe('Zod Validation for MarketDataValue', () => {
    it('accepts valid finite non-negative numbers', () => {
      const valid = {
        value: 450.5,
        unit: 'paise/kWh',
        source: 'IEX',
        asOf: 1714560000,
        stale: false,
      };
      expect(() => MarketDataValueSchema.parse(valid)).not.toThrow();
    });

    it('rejects negative numbers, NaN, or non-finite numbers', () => {
      expect(() =>
        MarketDataValueSchema.parse({
          value: -10,
          unit: 'paise/kWh',
          source: 'IEX',
          asOf: 1714560000,
          stale: false,
        })
      ).toThrow();

      expect(() =>
        MarketDataValueSchema.parse({
          value: NaN,
          unit: 'paise/kWh',
          source: 'IEX',
          asOf: 1714560000,
          stale: false,
        })
      ).toThrow();

      expect(() =>
        MarketDataValueSchema.parse({
          value: Infinity,
          unit: 'paise/kWh',
          source: 'IEX',
          asOf: 1714560000,
          stale: false,
        })
      ).toThrow();
    });
  });

  describe('MarketDataCache with TTL and Stale Fallback', () => {
    it('returns fresh data within TTL and flags stale data after TTL', async () => {
      const cache = new MarketDataCache<number>(100); // 100ms TTL
      cache.set('key1', 42);

      const fresh = cache.get('key1');
      expect(fresh).not.toBeNull();
      expect(fresh?.data).toBe(42);
      expect(fresh?.isStale).toBe(false);

      // Wait 120ms to exceed TTL
      await new Promise((r) => setTimeout(r, 120));

      const stale = cache.get('key1');
      expect(stale).not.toBeNull();
      expect(stale?.data).toBe(42);
      expect(stale?.isStale).toBe(true);
    });
  });

  describe('IEX CSV Parsing and Unit Conversion', () => {
    it('parses CSV and converts Rs/kWh to paise/kWh (x100)', async () => {
      const provider = new IexCsvProvider();
      const sampleCsv = `Date,TimeBlock,MCP_INR_kWh,Volume_kWh
2026-05-01,1,4.52,15000
2026-05-01,2,4.80,12000
2026-05-01,48,5.15,25000
`;
      provider.parseCsvContent(sampleCsv);

      // Block 1: 4.52 Rs/kWh -> 452 paise/kWh
      // Interval at 00:05 UTC corresponds to block 1
      const price = await provider.getReferencePrice(1, 300); // 300s = 5m
      expect(price.value).toBe(452);
      expect(price.unit).toBe('paise/kWh');
      expect(price.source).toBe('IEX-DAM-CSV');
    });
  });

  describe('Open-Meteo Interpolation from Hourly to 15-Minute', () => {
    it('interpolates 2 hourly points into 4 15-minute points', () => {
      const provider = new OpenMeteoProvider();
      const times = ['2026-05-01T06:00', '2026-05-01T07:00'];
      const values = [0, 200]; // 0 to 200 W/m²

      const points = provider.interpolateHourlyTo15Min(times, values, 'W/m²', 'Open-Meteo.com');
      expect(points.length).toBe(4);
      expect(points[0].value).toBe(0);
      expect(points[1].value).toBe(50);
      expect(points[2].value).toBe(100);
      expect(points[3].value).toBe(150);
    });
  });

  describe('MockProvider', () => {
    it('returns valid diurnal price and irradiance without network', async () => {
      const mock = new MockProvider();
      const price = await mock.getReferencePrice(1, 1714560000);
      expect(price.value).toBeGreaterThanOrEqual(380);
      expect(price.value).toBeLessThanOrEqual(520);

      const irradiance = await mock.getSolarIrradiance(28.61, 77.21, 1714560000, 1714560000 + 3600);
      expect(irradiance.length).toBeGreaterThan(0);
      expect(irradiance[0].unit).toBe('W/m²');
    });
  });
});
