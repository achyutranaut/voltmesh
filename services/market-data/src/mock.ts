import { MarketDataProvider, MarketDataValue, MarketDataProviderStatus, MarketDataValueSchema } from './types.js';

export class MockProvider implements MarketDataProvider {
  public readonly name = 'MockProvider';
  private readonly nowSec = Math.floor(Date.now() / 1000);

  public async getReferencePrice(_zoneId: number, intervalStart: number): Promise<MarketDataValue> {
    // Deterministic diurnal price wave based on interval block (between 380 and 520 paise)
    const block = Math.floor((intervalStart % 86400) / 900);
    // Peak hours around block 36-44 and 72-80
    const wave = Math.sin((block / 96) * 2 * Math.PI - Math.PI / 2);
    const pricePaise = Math.round(450 + wave * 50);

    return MarketDataValueSchema.parse({
      value: pricePaise,
      unit: 'paise/kWh',
      source: 'MockMarketFeed',
      asOf: this.nowSec,
      stale: false,
    });
  }

  public async getSolarIrradiance(_lat: number, _lon: number, from: number, to: number): Promise<MarketDataValue[]> {
    const values: MarketDataValue[] = [];
    const step = 900; // 15 min
    const start = from > 0 ? from : this.nowSec - 86400;
    const end = to > 0 ? to : this.nowSec + 86400;

    for (let t = start; t <= end; t += step) {
      const minuteOfDay = Math.floor((t % 86400) / 60);
      // Sun between 06:00 (360m) and 18:30 (1110m)
      let ghi = 0;
      if (minuteOfDay >= 360 && minuteOfDay <= 1110) {
        const solarFraction = (minuteOfDay - 360) / (1110 - 360);
        ghi = Math.round(Math.sin(solarFraction * Math.PI) * 850);
      }

      values.push(
        MarketDataValueSchema.parse({
          value: ghi,
          unit: 'W/m²',
          source: 'MockWeatherFeed',
          asOf: t,
          stale: false,
        })
      );
    }

    return values;
  }

  public async getWind(_lat: number, _lon: number, from: number, to: number): Promise<MarketDataValue[]> {
    const values: MarketDataValue[] = [];
    const step = 900;
    const start = from > 0 ? from : this.nowSec;
    const end = to > 0 ? to : this.nowSec + 3600;

    for (let t = start; t <= end; t += step) {
      values.push(
        MarketDataValueSchema.parse({
          value: 4.5,
          unit: 'm/s',
          source: 'MockWeatherFeed',
          asOf: t,
          stale: false,
        })
      );
    }
    return values;
  }

  public async getStatus(): Promise<MarketDataProviderStatus> {
    return {
      provider: this.name,
      priceProvider: 'MockPrice',
      weatherProvider: 'MockWeather',
      lastFetchTime: this.nowSec,
      healthy: true,
      stale: false,
    };
  }
}
