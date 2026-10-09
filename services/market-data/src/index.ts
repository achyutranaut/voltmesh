import { MarketDataProvider, MarketDataValue, MarketDataProviderStatus } from './types.js';
import { OpenMeteoProvider } from './openmeteo.js';
import { IexCsvProvider } from './iex.js';
import { MockProvider } from './mock.js';

export * from './types.js';
export * from './cache.js';
export * from './openmeteo.js';
export * from './iex.js';
export * from './mock.js';

export interface MarketDataConfig {
  weatherProviderType?: 'openmeteo' | 'mock';
  priceProviderType?: 'iexcsv' | 'mock';
  zoneLat?: number;
  zoneLon?: number;
  iexDataDir?: string;
}

export class CompositeMarketService {
  private weatherProvider: MarketDataProvider;
  private priceProvider: MarketDataProvider;
  private zoneLat: number;
  private zoneLon: number;

  constructor(config: MarketDataConfig = {}) {
    const weatherType = config.weatherProviderType || (process.env.MARKET_DATA_PROVIDER as any) || 'mock';
    const priceType = config.priceProviderType || (process.env.PRICE_PROVIDER as any) || 'mock';

    this.zoneLat = config.zoneLat ?? parseFloat(process.env.ZONE_LAT || '28.61');
    this.zoneLon = config.zoneLon ?? parseFloat(process.env.ZONE_LON || '77.21');

    this.weatherProvider = weatherType === 'openmeteo' ? new OpenMeteoProvider() : new MockProvider();
    this.priceProvider = priceType === 'iexcsv' ? new IexCsvProvider(config.iexDataDir) : new MockProvider();
  }

  public async getReferencePrice(zoneId: number, intervalStart: number): Promise<MarketDataValue> {
    return this.priceProvider.getReferencePrice(zoneId, intervalStart);
  }

  public async getSolarIrradiance(from: number, to: number, lat?: number, lon?: number): Promise<MarketDataValue[]> {
    return this.weatherProvider.getSolarIrradiance(lat ?? this.zoneLat, lon ?? this.zoneLon, from, to);
  }

  public async getWind(from: number, to: number, lat?: number, lon?: number): Promise<MarketDataValue[]> {
    return this.weatherProvider.getWind(lat ?? this.zoneLat, lon ?? this.zoneLon, from, to);
  }

  public async getStatus(): Promise<MarketDataProviderStatus> {
    const pStat = await this.priceProvider.getStatus();
    const wStat = await this.weatherProvider.getStatus();

    return {
      provider: 'CompositeMarketService',
      priceProvider: pStat.priceProvider,
      weatherProvider: wStat.weatherProvider,
      lastFetchTime: Math.max(pStat.lastFetchTime || 0, wStat.lastFetchTime || 0),
      healthy: pStat.healthy && wStat.healthy,
      stale: pStat.stale || wStat.stale,
    };
  }
}
